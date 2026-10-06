/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "@/lib/supabase/server";
import {
  moveLeadStageAction,
  updateLeadDetailsAction,
  markAppointmentAttendanceAction,
  sendTemplateMessageAction,
  getTemplatesAction,
} from "@/app/dashboard/actions";

describe("Phase 03: Pipeline de Leads, Templates & Agenda", () => {
  const supabase = createAdminClient();
  const testWaId = `TEST-lead-${Date.now()}`;
  let testContactId: string;
  let testLeadId: string;
  let testConversationId: string;
  let testAppointmentId: string;
  let nuevoStageId: string;
  let calificadoStageId: string;
  let asistioStageId: string;

  beforeAll(async () => {
    // 1. Obtener etapas
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, key")
      .order("position", { ascending: true });

    nuevoStageId = stages?.find((s) => s.key === "nuevo")?.id || "";
    calificadoStageId = stages?.find((s) => s.key === "calificado")?.id || "";
    asistioStageId = stages?.find((s) => s.key === "asistio")?.id || "";

    // 2. Crear contacto de prueba
    const { data: contact } = await supabase
      .from("contacts")
      .insert({
        wa_id: testWaId,
        name: "Carlos Test Pipeline",
        email: "carlos.test@example.com",
        company: "Test SAS",
      })
      .select("id")
      .single();

    testContactId = contact!.id;

    // 3. Crear conversación con ventana de 24h cerrada (hace 48 horas)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: conv } = await supabase
      .from("conversations")
      .insert({
        contact_id: testContactId,
        bot_enabled: true,
        last_inbound_at: twoDaysAgo,
        last_message_at: twoDaysAgo,
      })
      .select("id")
      .single();

    testConversationId = conv!.id;

    // 4. Crear lead en etapa "nuevo"
    const { data: lead } = await supabase
      .from("leads")
      .insert({
        contact_id: testContactId,
        stage_id: nuevoStageId,
        service_interest: "Declaración de Renta",
        temperature: "tibio",
      })
      .select("id")
      .single();

    testLeadId = lead!.id;

    // 5. Crear cita para el contacto
    const { data: app } = await supabase
      .from("appointments")
      .insert({
        contact_id: testContactId,
        conversation_id: testConversationId,
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        end_at: new Date(Date.now() + 24.5 * 60 * 60 * 1000).toISOString(),
        service: "Diagnóstico Tributario",
        modality: "virtual",
        meet_link: "https://meet.google.com/test-pipeline-link",
        status: "scheduled",
      })
      .select("id")
      .single();

    testAppointmentId = app!.id;
  });

  afterAll(async () => {
    // Limpieza integral de datos TEST-
    if (testAppointmentId) {
      await supabase.from("appointments").delete().eq("id", testAppointmentId);
    }
    if (testLeadId) {
      await supabase.from("lead_events").delete().eq("lead_id", testLeadId);
      await supabase.from("leads").delete().eq("id", testLeadId);
    }
    if (testConversationId) {
      await supabase.from("messages").delete().eq("conversation_id", testConversationId);
      await supabase.from("conversations").delete().eq("id", testConversationId);
    }
    if (testContactId) {
      await supabase.from("contacts").delete().eq("id", testContactId);
    }
  });

  it("moves lead between stages manually and records stage_change in lead_events", async () => {
    const res = await moveLeadStageAction(testLeadId, calificadoStageId);
    expect(res.success).toBe(true);

    // Verificar en la DB
    const { data: updatedLead } = await supabase
      .from("leads")
      .select("stage_id")
      .eq("id", testLeadId)
      .single();

    expect(updatedLead?.stage_id).toBe(calificadoStageId);

    // Verificar historial
    const { data: events } = await supabase
      .from("lead_events")
      .select("type, actor, from_stage_id, to_stage_id")
      .eq("lead_id", testLeadId)
      .eq("type", "stage_change")
      .order("created_at", { ascending: false });

    expect(events && events.length > 0).toBe(true);
    expect(events![0].actor).toBe("human");
    expect(events![0].from_stage_id).toBe(nuevoStageId);
    expect(events![0].to_stage_id).toBe(calificadoStageId);
  });

  it("updates lead details and records lead_updated in lead_events", async () => {
    const res = await updateLeadDetailsAction(testLeadId, {
      temperature: "caliente",
      invoices_per_month: 250,
      suggested_plan: "Plan PYME Plus",
      owner: "Andrés Contador",
    });
    expect(res.success).toBe(true);

    const { data: updatedLead } = await supabase
      .from("leads")
      .select("temperature, invoices_per_month, suggested_plan, owner")
      .eq("id", testLeadId)
      .single();

    expect(updatedLead?.temperature).toBe("caliente");
    expect(updatedLead?.invoices_per_month).toBe(250);
    expect(updatedLead?.suggested_plan).toBe("Plan PYME Plus");
    expect(updatedLead?.owner).toBe("Andrés Contador");
  });

  it("lists approved WABA templates with categories", async () => {
    const templates = await getTemplatesAction();
    expect(templates.length).toBeGreaterThanOrEqual(1);

    const utility = templates.find((t) => t.category === "UTILITY");
    expect(utility).toBeDefined();
    expect(utility?.status).toBe("APPROVED");
  });

  it("sends WABA template outside 24h window, disables bot and logs lead event", async () => {
    const res = await sendTemplateMessageAction(
      testContactId,
      "seguimiento_diagnostico",
      "es",
      ["Carlos"],
      "UTILITY"
    );

    expect(res.success).toBe(true);
    expect(res.messageId).toBeDefined();

    // 1. Verificar mensaje guardado en messages
    const { data: msgs } = await supabase
      .from("messages")
      .select("type, sender, body")
      .eq("conversation_id", testConversationId)
      .eq("sender", "human");

    expect(msgs && msgs.length > 0).toBe(true);
    expect(msgs![0].sender).toBe("human");
    expect(msgs![0].body).toContain("seguimiento_diagnostico");

    // 2. Verificar que el bot quedó apagado en la conversación
    const { data: conv } = await supabase
      .from("conversations")
      .select("bot_enabled")
      .eq("id", testConversationId)
      .single();

    expect(conv?.bot_enabled).toBe(false);

    // 3. Verificar evento registrado
    const { data: events } = await supabase
      .from("lead_events")
      .select("type, actor, payload")
      .eq("lead_id", testLeadId)
      .eq("type", "template_sent");

    expect(events && events.length > 0).toBe(true);
    expect(events![0].actor).toBe("human");
  });

  it("marks appointment attendance as 'attended', updates appointment and moves lead to 'Asistió'", async () => {
    const res = await markAppointmentAttendanceAction(testAppointmentId, "attended");
    expect(res.success).toBe(true);

    // 1. Cita actualizada a attended
    const { data: app } = await supabase
      .from("appointments")
      .select("status")
      .eq("id", testAppointmentId)
      .single();

    expect(app?.status).toBe("attended");

    // 2. Lead movido a etapa asistio
    const { data: lead } = await supabase
      .from("leads")
      .select("stage_id")
      .eq("id", testLeadId)
      .single();

    expect(lead?.stage_id).toBe(asistioStageId);

    // 3. Evento stage_change en lead_events
    const { data: events } = await supabase
      .from("lead_events")
      .select("type, to_stage_id")
      .eq("lead_id", testLeadId)
      .eq("to_stage_id", asistioStageId);

    expect(events && events.length > 0).toBe(true);
  });
});
