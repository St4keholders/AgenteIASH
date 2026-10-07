import { describe, it, expect, afterAll, vi } from "vitest";
import { POST } from "@/app/api/webhooks/whatsapp/route";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { sendToContact } from "@/lib/whatsapp/client";
import { runAgentConversation } from "@/lib/agent/runner";

describe("PASO 7: Meta Identities Synthetic Test Suite (a through j)", () => {
  const config = getConfig();
  const supabase = createAdminClient();
  const trackedContactIds = new Set<string>();

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

  async function cleanupTestData() {
    // Wait for in-flight background processing to settle
    await new Promise((r) => setTimeout(r, 1500));
    if (trackedContactIds.size === 0) return;
    const ids = Array.from(trackedContactIds);

    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .in("contact_id", ids);

    if (convs && convs.length > 0) {
      const convIds = convs.map((c) => c.id);
      await supabase.from("messages").delete().in("conversation_id", convIds);
      await supabase.from("conversations").delete().in("id", convIds);
    }

    await supabase.from("appointments").delete().in("contact_id", ids);

    const { data: leads } = await supabase
      .from("leads")
      .select("id")
      .in("contact_id", ids);

    if (leads && leads.length > 0) {
      const leadIds = leads.map((l) => l.id);
      await supabase.from("lead_events").delete().in("lead_id", leadIds);
      await supabase.from("leads").delete().in("id", leadIds);
    }

    await supabase.from("contacts").delete().in("id", ids);
  }

  afterAll(async () => {
    await cleanupTestData();
  });

  async function waitForContact(
    filter: { bsuid?: string; phone?: string; id?: string },
    timeoutMs = 8000
  ) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      let q = supabase
        .from("contacts")
        .select("id, name, username, phone, bsuid, wa_id");

      if (filter.id) q = q.eq("id", filter.id);
      if (filter.bsuid) q = q.eq("bsuid", filter.bsuid);
      if (filter.phone) q = q.eq("phone", filter.phone);

      const { data } = await q.maybeSingle();
      if (data) {
        trackedContactIds.add(data.id);
        return data;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }

  async function waitForConversation(contactId: string, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data } = await supabase
        .from("conversations")
        .select("id, contact_id, summary, last_processed_inbound_at")
        .eq("contact_id", contactId)
        .maybeSingle();

      if (data) return data;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }

  async function waitForMessage(wamid: string, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, wamid, direction, body, status, received_at")
        .eq("wamid", wamid)
        .maybeSingle();

      if (data) return data;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }

  // =========================================================================
  // a) Usuario sin username: from + from_user_id, contacts con wa_id + user_id
  // =========================================================================
  it("a) processes user without username (from + from_user_id, contacts wa_id + user_id)", async () => {
    const phone = "579991100001";
    const bsuid = "CO.TEST11000001";
    const wamid = `wamid.TEST_A_${Date.now()}`;

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
                    profile: { name: "Usuario Sin Username" },
                    wa_id: phone,
                    user_id: bsuid,
                  },
                ],
                messages: [
                  {
                    from: phone,
                    from_user_id: bsuid,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Hola, prueba caso a" },
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

    const contact = await waitForContact({ bsuid, phone });
    expect(contact).not.toBeNull();
    expect(contact?.name).toBe("Usuario Sin Username");
    expect(contact?.phone).toBe(phone);
    expect(contact?.bsuid).toBe(bsuid);
    expect(contact?.username).toBeNull();

    const conv = await waitForConversation(contact!.id);
    expect(conv).not.toBeNull();

    const msg = await waitForMessage(wamid);
    expect(msg).not.toBeNull();
    expect(msg?.conversation_id).toBe(conv!.id);
    expect(msg?.received_at).toBeDefined();
  }, 15000);

  // =========================================================================
  // b) Usuario con username y teléfono
  // =========================================================================
  it("b) processes user with username and phone", async () => {
    const phone = "579991100002";
    const bsuid = "CO.TEST11000002";
    const username = "juan_perez_meta";
    const wamid = `wamid.TEST_B_${Date.now()}`;

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
                    profile: { name: "Juan Pérez", username },
                    wa_id: phone,
                    user_id: bsuid,
                  },
                ],
                messages: [
                  {
                    from: phone,
                    from_user_id: bsuid,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Hola, prueba caso b" },
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

    const contact = await waitForContact({ bsuid, phone });
    expect(contact).not.toBeNull();
    expect(contact?.username).toBe(username);
    expect(contact?.phone).toBe(phone);
    expect(contact?.bsuid).toBe(bsuid);
  }, 15000);

  // =========================================================================
  // c) Usuario con username SIN teléfono: sin from ni wa_id
  // =========================================================================
  it("c) processes user with username WITHOUT phone (no from, no wa_id)", async () => {
    const bsuid = "CO.TEST11000003";
    const username = "usuario_sin_tel";
    const wamid = `wamid.TEST_C_${Date.now()}`;

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
                    profile: { name: "Usuario Solo BSUID", username },
                    user_id: bsuid,
                  },
                ],
                messages: [
                  {
                    from_user_id: bsuid,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Hola, prueba caso c sin teléfono" },
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

    const contact = await waitForContact({ bsuid });
    expect(contact).not.toBeNull();
    expect(contact?.phone).toBeNull();
    expect(contact?.bsuid).toBe(bsuid);
    expect(contact?.username).toBe(username);
  }, 15000);

  // =========================================================================
  // d) La misma persona alternando b y c: un solo contacto y una sola conversación
  // =========================================================================
  it("d) handles same person alternating between phone+bsuid and bsuid-only", async () => {
    const phone = "579991100004";
    const bsuid = "CO.TEST11000004";
    const username = "persona_alterna";
    const wamid1 = `wamid.TEST_D1_${Date.now()}`;
    const wamid2 = `wamid.TEST_D2_${Date.now()}`;

    // Mensaje 1: llega con teléfono + BSUID
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
                    profile: { name: "Persona Alterna", username },
                    wa_id: phone,
                    user_id: bsuid,
                  },
                ],
                messages: [
                  {
                    from: phone,
                    from_user_id: bsuid,
                    id: wamid1,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Primer mensaje con teléfono" },
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

    const contact1 = await waitForContact({ bsuid });
    expect(contact1).not.toBeNull();

    // Mensaje 2: misma persona llega SOLO con BSUID (sin from, sin wa_id)
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
                    profile: { name: "Persona Alterna", username },
                    user_id: bsuid,
                  },
                ],
                messages: [
                  {
                    from_user_id: bsuid,
                    id: wamid2,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Segundo mensaje solo con BSUID" },
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

    const m1 = await waitForMessage(wamid1);
    const m2 = await waitForMessage(wamid2);
    expect(m1).not.toBeNull();
    expect(m2).not.toBeNull();

    // Deben pertenecer a la misma y única conversación
    expect(m1?.conversation_id).toBe(m2?.conversation_id);

    // Debe existir exactamente 1 conversación para el contacto
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contact1!.id);
    expect(convs?.length).toBe(1);
  }, 20000);

  // =========================================================================
  // e) Contacto existente solo con teléfono que luego llega con BSUID: se fusiona
  // =========================================================================
  it("e) merges existing phone-only contact when arriving later with BSUID", async () => {
    const phone = "579991100005";
    const bsuid = "CO.TEST11000005";
    const wamid = `wamid.TEST_E_${Date.now()}`;

    // 1. Crear previamente el contacto solo con teléfono
    const { data: initialContact, error: initErr } = await supabase
      .from("contacts")
      .insert({
        phone,
        name: "Cliente Inicial Solo Teléfono",
      })
      .select("id")
      .single();

    expect(initErr).toBeNull();
    expect(initialContact).not.toBeNull();
    trackedContactIds.add(initialContact!.id);

    // 2. Llega mensaje con ambos (teléfono y BSUID)
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
                    profile: { name: "Cliente Actualizado", username: "usuario_fusion" },
                    wa_id: phone,
                    user_id: bsuid,
                  },
                ],
                messages: [
                  {
                    from: phone,
                    from_user_id: bsuid,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Mensaje que vincula BSUID" },
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

    const mergedContact = await waitForContact({ phone, bsuid });
    expect(mergedContact).not.toBeNull();
    expect(mergedContact?.id).toBe(initialContact!.id);
    expect(mergedContact?.bsuid).toBe(bsuid);
    expect(mergedContact?.username).toBe("usuario_fusion");

    // Verificar que no se creó un contacto duplicado
    const { count } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .or(`phone.eq.${phone},bsuid.eq.${bsuid}`);
    expect(count).toBe(1);
  }, 20000);

  // =========================================================================
  // f) 5 mensajes en paralelo de un BSUID nuevo: 1 contacto, 5 mensajes guardados
  // =========================================================================
  it("f) handles 5 parallel messages of a new BSUID: 1 contact, 5 messages stored", async () => {
    const bsuid = "CO.TEST11000006";
    const nowUnix = Math.floor(Date.now() / 1000);
    const wamids = Array.from({ length: 5 }, (_, i) => `wamid.TEST_F_PAR_${Date.now()}_${i}`);

    const payloads = wamids.map((wamid, i) => ({
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
                    profile: { name: "Usuario Paralelo", username: "parallel_bsuid" },
                    user_id: bsuid,
                  },
                ],
                messages: [
                  {
                    from_user_id: bsuid,
                    id: wamid,
                    timestamp: String(nowUnix + i),
                    type: "text",
                    text: { body: `Mensaje paralelo ${i + 1}` },
                  },
                ],
              },
            },
          ],
        },
      ],
    }));

    // Disparar las 5 solicitudes en paralelo
    const responses = await Promise.all(payloads.map((p) => POST(makeSignedRequest(p))));
    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const contact = await waitForContact({ bsuid });
    expect(contact).not.toBeNull();

    // Esperar a que los 5 mensajes estén guardados
    for (const wamid of wamids) {
      const msg = await waitForMessage(wamid, 12000);
      expect(msg).not.toBeNull();
    }

    // Verificar que solo exista 1 contacto para este BSUID
    const { count: contactCount } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("bsuid", bsuid);
    expect(contactCount).toBe(1);

    // Verificar que solo exista 1 conversación para el contacto
    const { count: convCount } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contact!.id);
    expect(convCount).toBe(1);
  }, 25000);

  // =========================================================================
  // g) Contacto con teléfono y contacto solo-BSUID en el mismo segundo:
  //    verifica el body del fetch ("to" para teléfono, "recipient" para BSUID)
  // =========================================================================
  it("g) sends to phone using 'to' and to BSUID using 'recipient' in fetch body", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    const phone = "579991100007";
    const bsuid = "CO.TEST11000007";

    // 1. Crear los 2 contactos
    const { data: cPhone } = await supabase
      .from("contacts")
      .insert({ phone, name: "Contacto Teléfono G" })
      .select("id")
      .single();
    const { data: cBsuid } = await supabase
      .from("contacts")
      .insert({ bsuid, name: "Contacto BSUID G" })
      .select("id")
      .single();

    trackedContactIds.add(cPhone!.id);
    trackedContactIds.add(cBsuid!.id);

    fetchSpy.mockClear();

    // 2. Enviar respuesta a ambos en el mismo segundo
    await Promise.all([
      sendToContact(cPhone!.id, "Respuesta a teléfono"),
      sendToContact(cBsuid!.id, "Respuesta a BSUID"),
    ]);

    // 3. Inspeccionar llamadas a fetch
    const calls = fetchSpy.mock.calls;
    const bodies = calls.map((c) => {
      try {
        return JSON.parse(c[1]?.body as string);
      } catch {
        return null;
      }
    }).filter(Boolean);

    const phoneCall = bodies.find((b) => b.to === phone);
    const bsuidCall = bodies.find((b) => b.recipient === bsuid);

    expect(phoneCall).toBeDefined();
    expect(phoneCall.to).toBe(phone);
    expect(phoneCall.recipient).toBeUndefined();

    expect(bsuidCall).toBeDefined();
    expect(bsuidCall.recipient).toBe(bsuid);
    expect(bsuidCall.to).toBeUndefined();

    fetchSpy.mockRestore();
  }, 15000);

  // =========================================================================
  // h) Respuesta manual y plantilla hacia un contacto solo-BSUID usan "recipient"
  // =========================================================================
  it("h) manual reply and template to BSUID-only contact use 'recipient'", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const bsuid = "CO.TEST11000008";

    const { data: contact } = await supabase
      .from("contacts")
      .insert({ bsuid, name: "Contacto Solo BSUID H" })
      .select("id")
      .single();

    trackedContactIds.add(contact!.id);
    // Esperar a que eventos previos en segundo plano terminen
    await new Promise((r) => setTimeout(r, 1200));
    fetchSpy.mockClear();

    // 1. Mensaje manual de texto
    await sendToContact(contact!.id, "Mensaje manual de prueba");

    // 2. Mensaje de plantilla
    await sendToContact(contact!.id, {
      type: "template",
      templateName: "confirmacion_cita",
      languageCode: "es",
    });

    const calls = fetchSpy.mock.calls;
    const bodies = calls.map((c) => {
      try {
        return JSON.parse(c[1]?.body as string);
      } catch {
        return null;
      }
    }).filter(Boolean);

    const manualBody = bodies.find((b) => b.recipient === bsuid && b.type === "text");
    const templateBody = bodies.find((b) => b.recipient === bsuid && b.type === "template");

    expect(manualBody).toBeDefined();
    expect(manualBody?.recipient).toBe(bsuid);
    expect(manualBody?.to).toBeUndefined();

    expect(templateBody).toBeDefined();
    expect(templateBody?.recipient).toBe(bsuid);
    expect(templateBody?.to).toBeUndefined();

    fetchSpy.mockRestore();
  }, 15000);

  // =========================================================================
  // i) Status con recipient_user_id actualiza el mensaje correcto
  // =========================================================================
  it("i) status webhook with recipient_user_id updates correct message", async () => {
    const bsuid = "CO.TEST11000009";
    const wamidOut = `wamid.OUT_${Date.now()}`;

    const { data: contact } = await supabase
      .from("contacts")
      .insert({ bsuid, name: "Contacto Status I" })
      .select("id")
      .single();

    trackedContactIds.add(contact!.id);

    const { data: conv } = await supabase
      .from("conversations")
      .insert({ contact_id: contact!.id, bot_enabled: true })
      .select("id")
      .single();

    await supabase.from("messages").insert({
      conversation_id: conv!.id,
      wamid: wamidOut,
      direction: "out",
      sender: "bot",
      type: "text",
      body: "Mensaje saliente de prueba",
      status: "sent",
    });

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
                    id: wamidOut,
                    status: "delivered",
                    recipient_user_id: bsuid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
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

    const start = Date.now();
    let updatedStatus: string | null = null;
    while (Date.now() - start < 8000) {
      const { data: msg } = await supabase
        .from("messages")
        .select("status")
        .eq("wamid", wamidOut)
        .maybeSingle();

      if (msg?.status === "delivered") {
        updatedStatus = msg.status;
        break;
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    expect(updatedStatus).toBe("delivered");
  }, 15000);

  // =========================================================================
  // j) Memoria: conversación de 60 mensajes donde el nombre se dio en el mensaje 2:
  //    en el turno 60 la ficha tiene el nombre y el historial incluye los últimos
  //    40 mensajes, no los primeros.
  // =========================================================================
  it("j) memory level 10: 60-message conversation loads last 40 and includes client sheet with name", async () => {
    const phone = "579991100010";
    const bsuid = "CO.TEST11000010";
    const clientName = "Carlos Andrés Montoya";

    // 1. Crear contacto y conversación
    const { data: contact } = await supabase
      .from("contacts")
      .insert({
        phone,
        bsuid,
        name: clientName,
        company: "Montoya SAS",
      })
      .select("id")
      .single();

    trackedContactIds.add(contact!.id);

    const { data: conv } = await supabase
      .from("conversations")
      .insert({ contact_id: contact!.id, bot_enabled: true })
      .select("id")
      .single();

    // 2. Crear lead asociado para alimentar la ficha del cliente
    await supabase.from("leads").insert({
      contact_id: contact!.id,
      service_interest: "Contabilidad Integral",
      invoices_per_month: 45,
      suggested_plan: "Plan Pro",
      temperature: "caliente",
      summary: "Interesado en cierre de balance anual",
    });

    // 3. Insertar 60 mensajes con timestamps secuenciales
    const now = Date.now();
    const messagesToInsert = [];
    for (let i = 1; i <= 60; i++) {
      const createdAt = new Date(now - (60 - i) * 60000).toISOString();
      const isUser = i % 2 === 1;
      let bodyText = `Mensaje número ${i} de la conversación`;
      if (i === 2) {
        bodyText = `Mucho gusto, mi nombre es ${clientName} de Montoya SAS`;
      }

      messagesToInsert.push({
        conversation_id: conv!.id,
        wamid: `wamid.MEM_60_${i}_${Date.now()}`,
        direction: isUser ? "in" : "out",
        sender: isUser ? "contact" : "bot",
        type: "text",
        body: bodyText,
        created_at: createdAt,
        received_at: createdAt,
        status: "delivered",
      });
    }

    const { error: batchErr } = await supabase.from("messages").insert(messagesToInsert);
    expect(batchErr).toBeNull();

    // 4. Ejecutar el runner del agente
    const runResult = await runAgentConversation(conv!.id, contact!.id, new Date(), undefined, {
      mockOpenAI: true,
    });

    expect(runResult.reply).toBeDefined();

    // 5. Verificar que la consulta a la BD traiga los últimos 40 mensajes y NO los primeros 20
    const { data: loadedMessages } = await supabase
      .from("messages")
      .select("body, created_at")
      .eq("conversation_id", conv!.id)
      .order("created_at", { ascending: false })
      .limit(40);

    expect(loadedMessages).toBeDefined();
    expect(loadedMessages?.length).toBe(40);

    // Los mensajes cargados deben ser del 21 al 60 (los más recientes)
    const loadedBodies = loadedMessages!.map((m) => m.body);
    expect(loadedBodies).toContain("Mensaje número 60 de la conversación");
    expect(loadedBodies).toContain("Mensaje número 21 de la conversación");
    // NO debe contener los primeros 20 mensajes
    expect(loadedBodies).not.toContain("Mensaje número 1 de la conversación");
    expect(loadedBodies).not.toContain("Mucho gusto, mi nombre es Carlos Andrés Montoya de Montoya SAS");

    // Y la ficha del cliente en la BD tiene el nombre garantizado para el system prompt
    const { data: verifiedContact } = await supabase
      .from("contacts")
      .select("name, company")
      .eq("id", contact!.id)
      .single();
    expect(verifiedContact?.name).toBe(clientName);
    expect(verifiedContact?.company).toBe("Montoya SAS");
  }, 25000);
});
