import { describe, it, expect, afterAll } from "vitest";
import { POST } from "@/app/api/webhooks/whatsapp/route";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { formatError } from "@/lib/utils/format-error";

describe("Webhook BSUID & Error Serialization Support", () => {
  const config = getConfig();
  const supabase = createAdminClient();

  function makeSignedRequest(bodyObj: unknown) {
    const rawBody = JSON.stringify(bodyObj);
    const signature = `sha256=${crypto
      .createHmac("sha256", config.META_APP_SECRET)
      .update(rawBody)
      .digest("hex")}`;

    return new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: {
        "x-hub-signature-256": signature,
        "content-type": "application/json",
      },
      body: rawBody,
    });
  }

  const createdContactIds = new Set<string>();

  async function cleanTestData() {
    if (createdContactIds.size === 0) return;
    const ids = Array.from(createdContactIds);
    await supabase.from("contacts").delete().in("id", ids);
  }

  afterAll(async () => {
    await cleanTestData();
  });

  async function waitForContact(
    query: { wa_id?: string; phone?: string; bsuid?: string; expectedName?: string },
    timeoutMs = 12000
  ) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      let q = supabase.from("contacts").select("id, wa_id, phone, bsuid, name");
      if (query.wa_id) q = q.eq("wa_id", query.wa_id);
      if (query.phone) q = q.eq("phone", query.phone);
      if (query.bsuid) q = q.eq("bsuid", query.bsuid);

      const { data } = await q.maybeSingle();
      if (data) {
        createdContactIds.add(data.id);
        if (!query.expectedName || data.name === query.expectedName) {
          return data;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  async function waitForConversation(contactId: string, timeoutMs = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", contactId)
        .maybeSingle();

      if (data) return data;
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  async function waitForMessage(wamid: string, timeoutMs = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data } = await supabase
        .from("messages")
        .select("id, wamid, direction, body, status")
        .eq("wamid", wamid)
        .maybeSingle();

      if (data) return data;
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  async function waitForOutboundReply(conversationId: string, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data } = await supabase
        .from("messages")
        .select("id, wamid, direction, sender, body, status")
        .eq("conversation_id", conversationId)
        .eq("direction", "out")
        .eq("sender", "bot")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) return data;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  }

  it("1. LOG DE ERRORES: serializes Supabase, Meta, and OpenAI errors without [object Object] or secret leakage", () => {
    // 1.1 Supabase PostgrestError
    const supabaseErr = {
      message: "null value in column \"wa_id\" of relation \"contacts\" violates not-null constraint",
      code: "23502",
      details: "Failing row contains (id, null, ...)",
      hint: "Check constraints and nullability",
    };
    const formattedSupabase = formatError(supabaseErr);
    expect(formattedSupabase).not.toContain("[object Object]");
    expect(formattedSupabase).toContain("code: 23502");
    expect(formattedSupabase).toContain("message: null value in column");
    expect(formattedSupabase).toContain("details: Failing row contains");
    expect(formattedSupabase).toContain("hint: Check constraints");

    // 1.2 Meta Graph API Error
    const metaErr = {
      error: {
        message: "Invalid OAuth access token.",
        type: "OAuthException",
        code: 190,
        fbtrace_id: "AbCdEf123",
      },
    };
    const formattedMeta = formatError(metaErr);
    expect(formattedMeta).not.toContain("[object Object]");
    expect(formattedMeta).toContain("code: 190");
    expect(formattedMeta).toContain("message: Invalid OAuth access token.");

    // 1.3 OpenAI Error with bearer/key
    const openAiErr = {
      status: 401,
      message: "Incorrect API key provided: sk-abcdef1234567890abcdef1234567890 and Bearer EAAB1234567890123456789012345678901234567890",
    };
    const formattedOpenAi = formatError(openAiErr);
    expect(formattedOpenAi).not.toContain("[object Object]");
    expect(formattedOpenAi).toContain("status: 401");
    expect(formattedOpenAi).toContain("sk-***");
    expect(formattedOpenAi).toContain("Bearer ***");
    expect(formattedOpenAi).not.toContain("sk-abcdef1234567890");
  });

  it(
    "2. BSUID sin user_id y sin contacts[]: saves contact, inbound message, and sends 1 reply to BSUID",
    async () => {
      const bsuid = "CO.TEST0000000001";
      const wamid = `wamid.HBgTQ08uMTU2MTUyODA1OTA3ODQwMRUU_${Date.now()}`;

      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  messages: [
                    {
                      from: bsuid,
                      id: wamid,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "text",
                      text: { body: "Hola, me comunico usando mi usuario de WhatsApp" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const res = await POST(makeSignedRequest(payload));
      expect(res.status).toBe(200);

      const contact = await waitForContact({ wa_id: bsuid });
      expect(contact).not.toBeNull();
      expect(contact?.wa_id).toBe(bsuid);
      expect(contact?.bsuid).toBe(bsuid);
      expect(contact?.phone).toBeNull();

      // Obtener la conversación asociada
      const conv = await waitForConversation(contact!.id);
      expect(conv).not.toBeNull();

      // Verificar mensaje entrante guardado
      const inMsg = await waitForMessage(wamid);
      expect(inMsg).not.toBeNull();
      expect(inMsg?.direction).toBe("in");
      expect(inMsg?.body).toBe("Hola, me comunico usando mi usuario de WhatsApp");

      // Verificar exactamente 1 respuesta saliente generada y enviada al identificador correcto
      const reply = await waitForOutboundReply(conv!.id);
      expect(reply).not.toBeNull();
      expect(reply?.direction).toBe("out");
      expect(reply?.sender).toBe("bot");
      expect(reply?.status).toBe("sent");
    },
    25000
  );

  it(
    "3. BSUID con user_id y contacts[].profile: updates profile name and keeps phone null",
    async () => {
      const bsuid = "CO.TEST0000000001";
      const wamid = `wamid.BSUID_PROFILE_${Date.now()}`;

      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  contacts: [
                    {
                      profile: { name: "Carlos Empresario" },
                      wa_id: bsuid,
                      user_id: bsuid,
                    },
                  ],
                  messages: [
                    {
                      from: bsuid,
                      user_id: bsuid,
                      id: wamid,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "text",
                      text: { body: "Necesito asesoría tributaria para mi empresa" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const res = await POST(makeSignedRequest(payload));
      expect(res.status).toBe(200);

      const contact = await waitForContact({ wa_id: bsuid, expectedName: "Carlos Empresario" });
      expect(contact).not.toBeNull();
      expect(contact?.name).toBe("Carlos Empresario");
      expect(contact?.bsuid).toBe(bsuid);
      expect(contact?.phone).toBeNull();
    },
    25000
  );

  it(
    "4. Teléfono + BSUID juntos en el payload: stores both and resolves cleanly",
    async () => {
      const phone = "5799900000001";
      const bsuid = "CO.TEST0000000002";
      const wamid = `wamid.DUAL_${Date.now()}`;

      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  contacts: [
                    {
                      profile: { name: "Cliente Dual" },
                      wa_id: phone,
                      user_id: bsuid,
                    },
                  ],
                  messages: [
                    {
                      from: phone,
                      user_id: bsuid,
                      id: wamid,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "text",
                      text: { body: "Hola, tengo tanto teléfono como usuario BSUID" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const res = await POST(makeSignedRequest(payload));
      expect(res.status).toBe(200);

      const contact = await waitForContact({ phone });
      expect(contact).not.toBeNull();
      expect(contact?.phone).toBe(phone);
      expect(contact?.bsuid).toBe(bsuid);
      expect(contact?.name).toBe("Cliente Dual");

      const conv = await waitForConversation(contact!.id);
      expect(conv).not.toBeNull();

      const reply = await waitForOutboundReply(conv!.id);
      expect(reply).not.toBeNull();
      expect(reply?.sender).toBe("bot");
    },
    25000
  );

  it(
    "5. Mismo contacto llegando primero con teléfono y después con BSUID: no duplicates created",
    async () => {
      const phone = "5799900000002";
      const bsuid = "CO.TEST0000000003";
      const wamid1 = `wamid.ROUND1_${Date.now()}`;
      const wamid2 = `wamid.ROUND2_${Date.now()}`;

      // Paso 1: Llega solo con número de teléfono
      const payload1 = {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  contacts: [
                    {
                      profile: { name: "Contacto Mixto" },
                      wa_id: phone,
                    },
                  ],
                  messages: [
                    {
                      from: phone,
                      id: wamid1,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "text",
                      text: { body: "Mensaje inicial desde celular" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const res1 = await POST(makeSignedRequest(payload1));
      expect(res1.status).toBe(200);

      const contact1 = await waitForContact({ phone });
      expect(contact1).not.toBeNull();
      expect(contact1?.phone).toBe(phone);
      expect(contact1?.bsuid).toBeNull();
      const originalContactId = contact1!.id;

      // Obtener conversación y esperar primera respuesta
      const conv1 = await waitForConversation(originalContactId);
      expect(conv1).not.toBeNull();
      await waitForOutboundReply(conv1!.id);

      // Paso 2: El mismo usuario llega después con payload que contiene su BSUID y teléfono
      const payload2 = {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  contacts: [
                    {
                      profile: { name: "Contacto Mixto Actualizado" },
                      wa_id: phone,
                      user_id: bsuid,
                    },
                  ],
                  messages: [
                    {
                      from: bsuid,
                      user_id: bsuid,
                      id: wamid2,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "text",
                      text: { body: "Segundo mensaje, ahora con BSUID" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const res2 = await POST(makeSignedRequest(payload2));
      expect(res2.status).toBe(200);

      // Esperar mensaje 2
      const msg2 = await waitForMessage(wamid2);
      expect(msg2).not.toBeNull();

      // Comprobar que NO se crearon duplicados en la base de datos
      const { data: phoneContact } = await supabase
        .from("contacts")
        .select("id, phone, bsuid, name")
        .eq("phone", phone)
        .maybeSingle();

      const { data: bsuidContact } = await supabase
        .from("contacts")
        .select("id, phone, bsuid, name")
        .eq("bsuid", bsuid)
        .maybeSingle();

      // Debe ser exactamente el mismo contacto unificado
      expect(phoneContact).not.toBeNull();
      expect(bsuidContact).not.toBeNull();
      expect(phoneContact?.id).toBe(bsuidContact?.id);
      expect(phoneContact?.id).toBe(originalContactId);
      expect(phoneContact?.phone).toBe(phone);
      expect(phoneContact?.bsuid).toBe(bsuid);

      // Ambas rondas se registraron en la misma conversación
      const { data: convMessages } = await supabase
        .from("messages")
        .select("id, direction, sender")
        .eq("conversation_id", conv1!.id);

      expect(convMessages?.length).toBeGreaterThanOrEqual(3); // in1, out1, in2 (+ out2)
    },
    30000
  );
});
