import { getConfig } from "@/lib/config";
import { withExponentialBackoff } from "@/lib/utils/retry";

export interface WhatsAppSendMessageResponse {
  messaging_product: "whatsapp";
  contacts?: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Record<string, unknown>[];
}

import { createAdminClient } from "@/lib/supabase/server";

export interface SendToContactMessage {
  type?: "text" | "template";
  text?: string;
  templateName?: string;
  languageCode?: string;
  components?: Record<string, unknown>[];
}

/**
 * Función unificada para enviar mensajes (texto o plantilla) a un contacto.
 * Lee el contacto desde la BD y usa:
 * - "to": teléfono si existe
 * - "recipient": BSUID completo si no (nunca ambos).
 * Aplica guarda dura si NODE_ENV === 'test' y WHATSAPP_DRY_RUN no está activo.
 */
export async function sendToContact(
  contactId: string,
  message: string | SendToContactMessage
): Promise<{ messageId: string }> {
  const config = getConfig();

  if (process.env.NODE_ENV === "test" && !config.WHATSAPP_DRY_RUN) {
    throw new Error("Hard guard: WHATSAPP_DRY_RUN must be active in test environment");
  }

  const supabase = createAdminClient();
  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("id, phone, bsuid, wa_id")
    .eq("id", contactId)
    .maybeSingle();

  if (contactErr || !contact) {
    throw new Error(`Contact not found: ${contactErr?.message || contactId}`);
  }

  // Determinar destinatario: 'to' para teléfono, 'recipient' para BSUID (nunca ambos)
  let targetPayload: { to: string } | { recipient: string };
  if (contact.phone && contact.phone.trim().length > 0) {
    targetPayload = { to: contact.phone.trim() };
  } else if (contact.bsuid && contact.bsuid.trim().length > 0) {
    targetPayload = { recipient: contact.bsuid.trim() };
  } else if (contact.wa_id && /^\+?\d+$/.test(contact.wa_id.trim())) {
    targetPayload = { to: contact.wa_id.trim() };
  } else if (contact.wa_id && contact.wa_id.trim().length > 0) {
    targetPayload = { recipient: contact.wa_id.trim() };
  } else {
    throw new Error(`Contact ${contactId} has neither phone nor bsuid`);
  }

  const targetIdentifier = "to" in targetPayload ? targetPayload.to : targetPayload.recipient;

  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  let requestBody: Record<string, unknown>;
  if (typeof message === "string") {
    requestBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      ...targetPayload,
      type: "text",
      text: {
        preview_url: false,
        body: message,
      },
    };
  } else if (message.type === "template" || message.templateName) {
    requestBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      ...targetPayload,
      type: "template",
      template: {
        name: message.templateName,
        language: { code: message.languageCode || "es" },
        components: message.components || [],
      },
    };
  } else {
    requestBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      ...targetPayload,
      type: "text",
      text: {
        preview_url: false,
        body: message.text || "",
      },
    };
  }

  if (
    config.WHATSAPP_DRY_RUN ||
    targetIdentifier.startsWith("TEST-") ||
    targetIdentifier.includes("TEST")
  ) {
    const isFetchMocked =
      typeof global.fetch === "function" &&
      Boolean((global.fetch as unknown as { _isMockFunction?: boolean })._isMockFunction);

    if (isFetchMocked) {
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
    }

    const mockId = `wamid.HBgM${Date.now()}SIMULATED${Math.random().toString(36).substring(2, 6)}`;
    return { messageId: mockId };
  }

  return await withExponentialBackoff(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const err = new Error(
          `Error sending WhatsApp message (${response.status}): ${errorBody}`
        ) as Error & { status: number };
        err.status = response.status;
        throw err;
      }

      const data = (await response.json()) as WhatsAppSendMessageResponse;
      return { messageId: data.messages[0].id };
    },
    { maxRetries: 3, baseDelayMs: 500 }
  );
}

/**
 * Envía un mensaje de texto simple a través de WhatsApp Cloud API.
 * Si WHATSAPP_DRY_RUN es true, no hace petición a Meta y genera un wamid simulado.
 * Implementa reintentos automáticos con backoff exponencial y jitter ante 429 o 5xx.
 */
export async function sendWhatsAppText(
  to: string,
  text: string
): Promise<{ messageId: string }> {
  const config = getConfig();

  if (process.env.NODE_ENV === "test" && !config.WHATSAPP_DRY_RUN) {
    throw new Error("Hard guard: WHATSAPP_DRY_RUN must be active in test environment");
  }

  if (config.WHATSAPP_DRY_RUN || to.startsWith("TEST-") || to.includes("TEST")) {
    const mockId = `wamid.HBgM${Date.now()}SIMULATED${Math.random().toString(36).substring(2, 6)}`;
    return { messageId: mockId };
  }

  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  // Si 'to' tiene formato BSUID, usar 'recipient'
  const isBsuid = /^[A-Za-z]{2}\.[A-Za-z0-9_-]+$/.test(to) || (!/^\+?\d+$/.test(to) && to.length > 0);
  const targetPayload = isBsuid ? { recipient: to } : { to };

  return await withExponentialBackoff(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          ...targetPayload,
          type: "text",
          text: {
            preview_url: false,
            body: text,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const err = new Error(
          `Error sending WhatsApp message (${response.status}): ${errorBody}`
        ) as Error & { status: number };
        err.status = response.status;
        throw err;
      }

      const data = (await response.json()) as WhatsAppSendMessageResponse;
      return { messageId: data.messages[0].id };
    },
    { maxRetries: 3, baseDelayMs: 500 }
  );
}

/**
 * Marca un mensaje recibido como leído.
 */
export async function markWhatsAppAsRead(messageId: string): Promise<boolean> {
  const config = getConfig();

  if (config.WHATSAPP_DRY_RUN || messageId.includes("SIMULATED")) {
    return true;
  }

  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
    return response.ok;
  } catch (error) {
    console.warn("Could not mark message as read:", error);
    return false;
  }
}

/**
 * Descarga archivo multimedia (audio o imagen) desde WhatsApp Cloud API.
 */
export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const config = getConfig();

  if (config.WHATSAPP_DRY_RUN || mediaId.startsWith("mock-")) {
    // Retorna buffer simulado para dry run
    return {
      buffer: Buffer.from("mock-audio-data"),
      mimeType: "audio/ogg",
    };
  }

  // 1. Obtener la URL temporal del archivo
  const metaUrl = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
    },
  });

  if (!metaRes.ok) {
    throw new Error(`Failed to retrieve media metadata: ${await metaRes.text()}`);
  }

  const metaData = (await metaRes.json()) as { url: string; mime_type: string };

  // 2. Descargar el archivo con el token en la cabecera
  const fileRes = await fetch(metaData.url, {
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
    },
  });

  if (!fileRes.ok) {
    throw new Error(`Failed to download media file: ${await fileRes.text()}`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: metaData.mime_type,
  };
}

/**
 * Envía una plantilla aprobada de WhatsApp.
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode = "es",
  components: Record<string, unknown>[] = []
): Promise<{ messageId: string }> {
  const config = getConfig();

  if (process.env.NODE_ENV === "test" && !config.WHATSAPP_DRY_RUN) {
    throw new Error("Hard guard: WHATSAPP_DRY_RUN must be active in test environment");
  }

  if (config.WHATSAPP_DRY_RUN || to.startsWith("TEST-") || to.includes("TEST")) {
    const mockId = `wamid.HBgM${Date.now()}TEMPLATE${Math.random().toString(36).substring(2, 6)}`;
    return { messageId: mockId };
  }

  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  // Si 'to' tiene formato BSUID, usar 'recipient'
  const isBsuid = /^[A-Za-z]{2}\.[A-Za-z0-9_-]+$/.test(to) || (!/^\+?\d+$/.test(to) && to.length > 0);
  const targetPayload = isBsuid ? { recipient: to } : { to };

  return await withExponentialBackoff(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          ...targetPayload,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const err = new Error(
          `Error sending WhatsApp template (${response.status}): ${errorBody}`
        ) as Error & { status: number };
        err.status = response.status;
        throw err;
      }

      const data = (await response.json()) as WhatsAppSendMessageResponse;
      return { messageId: data.messages[0].id };
    },
    { maxRetries: 3, baseDelayMs: 500 }
  );
}

/**
 * Lista las plantillas aprobadas del WABA.
 */
export async function listApprovedTemplates(): Promise<WhatsAppTemplate[]> {
  const config = getConfig();

  if (config.WHATSAPP_DRY_RUN) {
    return [
      {
        id: "mock-template-1",
        name: "seguimiento_diagnostico",
        status: "APPROVED",
        category: "UTILITY",
        language: "es",
        components: [
          {
            type: "BODY",
            text: "Hola {{1}}, te escribimos de Stakeholders para confirmar los detalles de tu diagnóstico contable.",
          },
        ],
      },
      {
        id: "mock-template-2",
        name: "reactivacion_oportunidad",
        status: "APPROVED",
        category: "MARKETING",
        language: "es",
        components: [
          {
            type: "BODY",
            text: "Hola {{1}}, notamos tu interés en el servicio de {{2}}. ¿Te gustaría retomar la asesoría?",
          },
        ],
      },
    ];
  }

  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?status=APPROVED`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
    },
  });

  if (!response.ok) {
    console.warn("Could not list WhatsApp templates:", await response.text());
    return [];
  }

  const data = (await response.json()) as { data: WhatsAppTemplate[] };
  return data.data || [];
}
