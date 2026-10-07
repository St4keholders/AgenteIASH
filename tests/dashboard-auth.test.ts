import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "@/lib/supabase/server";
import {
  toggleGlobalBotAction,
  toggleConversationBotAction,
  resolveHumanHandoffAction,
  updateContactAction,
  sendManualMessageAction,
} from "@/app/dashboard/actions";

describe("Dashboard Auth, Server Actions & 24h Window", () => {
  const supabase = createAdminClient();
  const testEmail = `TEST-admin-${Date.now()}@example.com`;
  const testPassword = "TestPassword123!";
  const testWaId = `TEST-user-${Date.now()}`;
  let testUserId = "";
  let contactId = "";
  let conversationId = "";

  beforeAll(async () => {
    // 1. Crear usuario de prueba en Supabase Auth
    const { data: userRes, error: userErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (userErr || !userRes.user) {
      throw new Error(`Failed to create test user: ${userErr?.message}`);
    }
    testUserId = userRes.user.id;

    // 2. Crear contacto y conversación de prueba
    const { data: contact } = await supabase
      .from("contacts")
      .insert({
        wa_id: testWaId,
        phone: "+5799900000011",
        name: "Test Contact Dashboard",
      })
      .select("id")
      .single();

    contactId = contact!.id;

    const { data: conv } = await supabase
      .from("conversations")
      .insert({
        contact_id: contactId,
        bot_enabled: true,
        needs_human: true,
        last_inbound_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 horas atrás (ventana cerrada)
      })
      .select("id")
      .single();

    conversationId = conv!.id;
  });

  afterAll(async () => {
    // Limpieza
    if (contactId) {
      await supabase.from("contacts").delete().eq("id", contactId);
    }
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId);
    }
  });

  it("verifies credentials of created test user", async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    expect(error).toBeNull();
    expect(data.user).toBeDefined();
    expect(data.user?.email?.toLowerCase()).toBe(testEmail.toLowerCase());
  });

  it("rejects login with invalid password", async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: "WrongPassword123!",
    });
    expect(error).not.toBeNull();
  });

  it("toggles global bot active state", async () => {
    const res = await toggleGlobalBotAction(false);
    expect(res.success).toBe(true);
    expect(res.enabled).toBe(false);

    const { data: setting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "bot_global_enabled")
      .single();

    expect(setting?.value).toBe(false);

    // Restaurar a true
    await toggleGlobalBotAction(true);
  });

  it("toggles conversation bot status", async () => {
    const res = await toggleConversationBotAction(conversationId, false);
    expect(res.success).toBe(true);

    const { data: conv } = await supabase
      .from("conversations")
      .select("bot_enabled")
      .eq("id", conversationId)
      .single();

    expect(conv?.bot_enabled).toBe(false);

    // Encender de nuevo
    await toggleConversationBotAction(conversationId, true);
  });

  it("resolves human handoff", async () => {
    const res = await resolveHumanHandoffAction(conversationId);
    expect(res.success).toBe(true);

    const { data: conv } = await supabase
      .from("conversations")
      .select("needs_human")
      .eq("id", conversationId)
      .single();

    expect(conv?.needs_human).toBe(false);
  });

  it("updates contact details", async () => {
    const res = await updateContactAction(contactId, {
      name: "Nombre Actualizado",
      email: "actualizado@example.com",
      company: "Empresa SAS",
    });
    expect(res.success).toBe(true);

    const { data: contact } = await supabase
      .from("contacts")
      .select("name, email, company")
      .eq("id", contactId)
      .single();

    expect(contact?.name).toBe("Nombre Actualizado");
    expect(contact?.email).toBe("actualizado@example.com");
    expect(contact?.company).toBe("Empresa SAS");
  });

  it("rejects manual text message if 24h window is expired", async () => {
    // conversation last_inbound_at is 25 hours ago
    const res = await sendManualMessageAction(
      conversationId,
      "Hola cliente"
    );
    expect(res.error).toContain("La ventana de 24 h está cerrada");
  });

  it("allows manual message when 24h window is open and turns bot OFF in that chat", async () => {
    // Abrir ventana actualizando last_inbound_at a hace 1 hora
    await supabase
      .from("conversations")
      .update({
        last_inbound_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        bot_enabled: true,
      })
      .eq("id", conversationId);

    const res = await sendManualMessageAction(
      conversationId,
      "Hola, respuesta de asesor humano"
    );

    expect(res.success).toBe(true);

    // Verificar que el bot se apagó en esa conversación
    const { data: conv } = await supabase
      .from("conversations")
      .select("bot_enabled")
      .eq("id", conversationId)
      .single();

    expect(conv?.bot_enabled).toBe(false);

    // Verificar mensaje guardado con sender = human
    const { data: msg } = await supabase
      .from("messages")
      .select("sender, body, direction")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    expect(msg?.sender).toBe("human");
    expect(msg?.direction).toBe("out");
    expect(msg?.body).toBe("Hola, respuesta de asesor humano");
  });
});
