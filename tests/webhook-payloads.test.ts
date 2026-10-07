import { describe, it, expect, afterAll, vi } from "vitest";
import { POST } from "@/app/api/webhooks/whatsapp/route";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";

describe("Webhook Payloads & International Senders (BUG 2 Verification)", () => {
  const config = getConfig();
  const supabase = createAdminClient();

  const testWaIds = [
    "TEST-573001234567",     // Colombia (57)
    "TEST-525512345678",     // México standard (52)
    "TEST-5215512345678",    // México con prefijo móvil (521)
    "TEST-541112345678",     // Argentina standard (54)
    "TEST-5491112345678",    // Argentina con prefijo móvil (549)
    "TEST-12025550123",      // Estados Unidos (1)
    "TEST-bsuid-username-x", // BSUID / Username no numérico
    "TEST-nocontacts-99",    // Payload con contacts[] vacío
    "TEST-emoji-user-88",    // Nombre con emojis
    "TEST-noname-user-77",   // Nombre ausente
    "TEST-multi-user-1",     // Varios mensajes en un payload
    "TEST-multi-user-2",
  ];

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

  async function waitForContact(waId: string, timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data } = await supabase
        .from("contacts")
        .select("wa_id, name, phone, bsuid")
        .eq("wa_id", waId)
        .maybeSingle();

      if (data) return data;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }

  async function waitForMessage(wamid: string, expectedStatus?: string, timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data } = await supabase
        .from("messages")
        .select("wamid, body, status")
        .eq("wamid", wamid)
        .maybeSingle();

      if (data && (!expectedStatus || data.status === expectedStatus)) return data;
      await new Promise((r) => setTimeout(r, 150));
    }
    const { data: fallback } = await supabase
      .from("messages")
      .select("wamid, body, status")
      .eq("wamid", wamid)
      .maybeSingle();
    return fallback;
  }

  afterAll(async () => {
    // Limpieza estricta de todos los datos TEST-
    for (const waId of testWaIds) {
      const { data: c } = await supabase
        .from("contacts")
        .select("id")
        .eq("wa_id", waId)
        .maybeSingle();

      if (c) {
        await supabase.from("contacts").delete().eq("id", c.id);
      }
    }
  });

  it("processes Colombia number (57) preserving exact wa_id", async () => {
    const waId = "TEST-573001234567";
    const wamid = `wamid.TEST_CO_${Date.now()}`;
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: "Cliente Colombia" }, wa_id: waId }],
                messages: [
                  {
                    from: waId,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Hola desde Colombia" },
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

    const contact = await waitForContact(waId);

    expect(contact).not.toBeNull();
    expect(contact?.wa_id).toBe(waId);
    expect(contact?.name).toBe("Cliente Colombia");
  });

  it("processes Mexico standard (52) and Mexico mobile prefix (521) without modifying wa_id", async () => {
    const waId52 = "TEST-525512345678";
    const waId521 = "TEST-5215512345678";
    const wamid1 = `wamid.TEST_MX1_${Date.now()}`;
    const wamid2 = `wamid.TEST_MX2_${Date.now()}`;

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
                  { profile: { name: "Cliente CDMX" }, wa_id: waId52 },
                  { profile: { name: "Cliente Celular MX" }, wa_id: waId521 },
                ],
                messages: [
                  {
                    from: waId52,
                    id: wamid1,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Consulta 52" },
                  },
                  {
                    from: waId521,
                    id: wamid2,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Consulta 521" },
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

    const [c52, c521] = await Promise.all([
      waitForContact(waId52),
      waitForContact(waId521),
    ]);

    expect(c52?.wa_id).toBe(waId52);
    expect(c521?.wa_id).toBe(waId521);
  }, 15000);

  it("processes Argentina standard (54) and Argentina mobile prefix (549) without stripping digits", async () => {
    const waId54 = "TEST-541112345678";
    const waId549 = "TEST-5491112345678";
    const wamid1 = `wamid.TEST_AR1_${Date.now()}`;
    const wamid2 = `wamid.TEST_AR2_${Date.now()}`;

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
                  { profile: { name: "Cliente Fijo AR" }, wa_id: waId54 },
                  { profile: { name: "Cliente Celular AR" }, wa_id: waId549 },
                ],
                messages: [
                  {
                    from: waId54,
                    id: wamid1,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Consulta 54" },
                  },
                  {
                    from: waId549,
                    id: wamid2,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Consulta 549" },
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

    const [c54, c549] = await Promise.all([
      waitForContact(waId54),
      waitForContact(waId549),
    ]);

    expect(c54?.wa_id).toBe(waId54);
    expect(c549?.wa_id).toBe(waId549);
  }, 15000);

  it("processes US number (1) correctly", async () => {
    const waId = "TEST-12025550123";
    const wamid = `wamid.TEST_US_${Date.now()}`;
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: "John Doe" }, wa_id: waId }],
                messages: [
                  {
                    from: waId,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Hello from US" },
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

    const contact = await waitForContact(waId);

    expect(contact?.wa_id).toBe(waId);
    expect(contact?.name).toBe("John Doe");
  });

  it("processes BSUID / alphanumeric username with phone null and bsuid populated", async () => {
    const bsuid = "TEST-bsuid-username-x";
    const wamid = `wamid.TEST_BSUID_${Date.now()}`;
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: "Usuario Meta BSUID" }, wa_id: bsuid, user_id: "usr_998877" }],
                messages: [
                  {
                    from: bsuid,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Mensaje desde cuenta Meta" },
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

    const contact = await waitForContact(bsuid);

    expect(contact).not.toBeNull();
    expect(contact?.wa_id).toBe(bsuid);
    expect(contact?.phone).toBeNull();
    expect(contact?.bsuid).toBe(bsuid);
  });

  it("processes payload with empty contacts[] array gracefully", async () => {
    const waId = "TEST-nocontacts-99";
    const wamid = `wamid.TEST_NOCONT_${Date.now()}`;
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                contacts: [], // Vacío
                messages: [
                  {
                    from: waId,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Sin array de contactos" },
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

    const contact = await waitForContact(waId);

    expect(contact?.wa_id).toBe(waId);
    expect(contact?.name).toBeNull();
  });

  it("processes profile.name containing 4-byte emojis and special characters", async () => {
    const waId = "TEST-emoji-user-88";
    const emojiName = "María ✨🚀☕💼🎉";
    const wamid = `wamid.TEST_EMOJI_${Date.now()}`;
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: emojiName }, wa_id: waId }],
                messages: [
                  {
                    from: waId,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Hola con emojis" },
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

    const contact = await waitForContact(waId);

    expect(contact?.name).toBe(emojiName);
  });

  it("handles status updates mixed with messages in the same payload", async () => {
    const waId = "TEST-multi-user-1";
    const wamidMsg = `wamid.TEST_MIX_${Date.now()}`;
    const wamidStatus = `wamid.PREV_SENT_${Date.now()}`;

    // Insert dummy outgoing message to receive status update
    const { data: conv } = await supabase
      .from("conversations")
      .insert({
        contact_id: (await supabase.from("contacts").upsert({ wa_id: waId }).select("id").single()).data!.id,
        bot_enabled: true,
      })
      .select("id")
      .single();

    if (conv) {
      await supabase.from("messages").insert({
        conversation_id: conv.id,
        wamid: wamidStatus,
        direction: "out",
        sender: "bot",
        type: "text",
        body: "Hola previo",
        status: "sent",
      });
    }

    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                statuses: [
                  {
                    id: wamidStatus,
                    status: "delivered",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                  },
                ],
                contacts: [{ profile: { name: "Usuario Mix" }, wa_id: waId }],
                messages: [
                  {
                    from: waId,
                    id: wamidMsg,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Mensaje entrante con status simultáneo" },
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

    const [updatedMsg, inMsg] = await Promise.all([
      waitForMessage(wamidStatus, "delivered"),
      waitForMessage(wamidMsg),
    ]);

    expect(updatedMsg?.status).toBe("delivered");
    expect(inMsg?.body).toBe("Mensaje entrante con status simultáneo");
  });

  it("verifies single-line structured JSON logs are emitted on processing", async () => {
    const consoleLogSpy = vi.spyOn(console, "log");
    const waId = "TEST-multi-user-2";
    const wamid = `wamid.TEST_LOG_${Date.now()}`;

    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: "Log User" }, wa_id: waId }],
                messages: [
                  {
                    from: waId,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Probando logs estructurados" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await POST(makeSignedRequest(payload));

    let webhookReceived: Record<string, unknown> | undefined;
    let messageStored: Record<string, unknown> | undefined;
    const start = Date.now();

    while (Date.now() - start < 6000) {
      const loggedJsonCalls = consoleLogSpy.mock.calls
        .map((c) => {
          try {
            return JSON.parse(c[0]);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      webhookReceived = loggedJsonCalls.find(
        (e) => e.evt === "webhook_received" && e.wamid === wamid
      );
      messageStored = loggedJsonCalls.find(
        (e) => e.evt === "message_stored" && e.wamid === wamid
      );

      if (webhookReceived && messageStored) break;
      await new Promise((r) => setTimeout(r, 150));
    }

    expect(webhookReceived).toBeDefined();
    expect(messageStored).toBeDefined();
    expect(webhookReceived?.wamid).toBe(wamid);

    // Verificar que no se filtran secretos ni el cuerpo del mensaje en estos logs
    const rawLogged = JSON.stringify(consoleLogSpy.mock.calls);
    expect(rawLogged).not.toContain("Probando logs estructurados");
    expect(rawLogged).not.toContain(config.WHATSAPP_TOKEN);
    expect(rawLogged).not.toContain(config.META_APP_SECRET);

    consoleLogSpy.mockRestore();
  });
});
