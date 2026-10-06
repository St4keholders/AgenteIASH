"use server";

import type { Json } from "@/lib/database.types";
import { createSessionClient, createAdminClient } from "@/lib/supabase/server";
import { sendWhatsAppText } from "@/lib/whatsapp/client";
import { revalidatePath } from "next/cache";

function safeRevalidate(path: string, type?: "page" | "layout") {
  try {
    revalidatePath(path, type);
  } catch {
    // Ignorar fuera de request scope de Next.js (tests unitarios)
  }
}

export async function toggleGlobalBotAction(enabled: boolean) {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("settings")
    .upsert({
      key: "bot_global_enabled",
      value: enabled as unknown as Json,
    });

  if (error) {
    throw new Error(`Error updating global bot status: ${error.message}`);
  }

  safeRevalidate("/dashboard", "layout");
  return { success: true, enabled };
}

export async function toggleConversationBotAction(conversationId: string, enabled: boolean) {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("conversations")
    .update({ bot_enabled: enabled })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Error updating conversation bot status: ${error.message}`);
  }

  safeRevalidate("/dashboard/conversaciones");
  return { success: true, enabled };
}

export async function resolveHumanHandoffAction(conversationId: string) {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("conversations")
    .update({ needs_human: false })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Error resolving human handoff: ${error.message}`);
  }

  safeRevalidate("/dashboard/conversaciones");
  return { success: true };
}

export async function updateContactAction(
  contactId: string,
  data: { name: string; email: string; company: string }
) {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("contacts")
    .update({
      name: data.name || null,
      email: data.email || null,
      company: data.company || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);

  if (error) {
    throw new Error(`Error updating contact: ${error.message}`);
  }

  safeRevalidate("/dashboard/conversaciones");
  return { success: true };
}

export async function markConversationReadAction(conversationId: string) {
  const supabase = await createSessionClient();
  await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);

  return { success: true };
}

export async function sendManualMessageAction(
  conversationId: string,
  contactPhone: string,
  text: string
) {
  if (!text.trim()) {
    return { error: "El mensaje no puede estar vacío." };
  }

  const supabase = await createSessionClient();

  // 1. Validar ventana de 24 horas
  const { data: conv } = await supabase
    .from("conversations")
    .select("last_inbound_at")
    .eq("id", conversationId)
    .single();

  if (!conv || !conv.last_inbound_at) {
    return { error: "No hay registro de interacción entrante para este contacto." };
  }

  const lastInboundMs = new Date(conv.last_inbound_at).getTime();
  const nowMs = Date.now();
  const diffHours = (nowMs - lastInboundMs) / (1000 * 60 * 60);

  if (diffHours >= 24) {
    return {
      error:
        "La ventana de 24 h está cerrada. Fuera de la ventana solo se pueden enviar plantillas aprobadas.",
    };
  }

  // 2. Enviar mensaje por WhatsApp
  const sent = await sendWhatsAppText(contactPhone, text);

  // 3. Guardar en base de datos con sender = human
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    wamid: sent.messageId,
    direction: "out",
    sender: "human",
    type: "text",
    body: text,
    status: "sent",
  });

  // 4. Apagar automáticamente el bot en esta conversación
  await supabase
    .from("conversations")
    .update({
      bot_enabled: false,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  safeRevalidate("/dashboard/conversaciones");
  return { success: true, messageId: sent.messageId };
}

export async function getMediaSignedUrl(storagePath: string): Promise<string | null> {
  // Las URLs firmadas usan el cliente admin para garantizar lectura segura de Storage
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("media")
    .createSignedUrl(storagePath, 60 * 60); // 1 hora de validez

  if (error || !data) return null;
  return data.signedUrl;
}
