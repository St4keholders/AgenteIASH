import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createAdminClient } from "@/lib/supabase/server";
import { executeAgentTool, ToolExecutionContext } from "@/lib/agent/tools";

interface AvailabilityResult {
  available: boolean;
  slots?: Array<{ time: string; iso_start: string }>;
}

interface BookingResult {
  success: boolean;
  appointment_id?: string;
}

interface GenericSuccessResult {
  success: boolean;
}

interface RequestHumanResult {
  escalated: boolean;
}

describe("Agent Tool Calling Flow (check -> book -> reschedule -> cancel)", () => {
  const supabase = createAdminClient();
  const testWaId = "TEST-agent-flow-99";
  let contactId: string;
  let conversationId: string;
  let createdAppointmentId: string;

  beforeAll(async () => {
    // 1. Crear contacto de prueba
    const { data: contact } = await supabase
      .from("contacts")
      .upsert(
        {
          wa_id: testWaId,
          name: "Usuario de Prueba Flujo",
          email: "usuario.test@example.com",
        },
        { onConflict: "wa_id" }
      )
      .select("id")
      .single();

    contactId = contact!.id;

    // 2. Crear conversación de prueba
    const { data: conv } = await supabase
      .from("conversations")
      .insert({
        contact_id: contactId,
        bot_enabled: true,
      })
      .select("id")
      .single();

    conversationId = conv!.id;

    // 3. Crear lead en etapa "Nuevo"
    const { data: nuevoStage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("key", "nuevo")
      .single();

    await supabase.from("leads").upsert(
      {
        contact_id: contactId,
        stage_id: nuevoStage!.id,
      },
      { onConflict: "contact_id" }
    );
  });

  afterAll(async () => {
    // Limpieza total de datos de prueba
    if (contactId) {
      await supabase.from("contacts").delete().eq("id", contactId);
    }
  });

  it("1. check_availability returns free slots for a valid business day", async () => {
    const context: ToolExecutionContext = { contactId, conversationId, supabase };
    const result = (await executeAgentTool(
      "check_availability",
      { date: "2026-10-07" },
      context
    )) as unknown as AvailabilityResult;

    expect(result.available).toBe(true);
    expect(result.slots).toBeDefined();
    expect(result.slots!.length).toBeGreaterThan(0);
  });

  it("2. book_appointment schedules the appointment and moves lead to 'Diagnóstico agendado'", async () => {
    const context: ToolExecutionContext = { contactId, conversationId, supabase };
    const result = (await executeAgentTool(
      "book_appointment",
      {
        name: "Usuario de Prueba Flujo",
        email: "usuario.test@example.com",
        modality: "virtual",
        service: "Contabilidad para empresas",
        start_iso: "2026-10-07T10:00:00-05:00",
      },
      context
    )) as unknown as BookingResult;

    expect(result.success).toBe(true);
    expect(result.appointment_id).toBeDefined();
    createdAppointmentId = result.appointment_id!;

    // Verificar cita en Supabase
    const { data: app } = await supabase
      .from("appointments")
      .select("id, status, modality, meet_link")
      .eq("id", createdAppointmentId)
      .single();

    expect(app).toBeDefined();
    expect(app?.status).toBe("scheduled");
    expect(app?.modality).toBe("virtual");

    // Verificar lead en 'diagnostico_agendado'
    const { data: lead } = await supabase
      .from("leads")
      .select("stage_id, pipeline_stages(key)")
      .eq("contact_id", contactId)
      .single();

    expect((lead?.pipeline_stages as { key: string } | null)?.key).toBe("diagnostico_agendado");
  });

  it("3. reschedule_appointment changes start time to a new valid slot", async () => {
    const context: ToolExecutionContext = { contactId, conversationId, supabase };
    const result = (await executeAgentTool(
      "reschedule_appointment",
      {
        appointment_id: createdAppointmentId,
        new_start_iso: "2026-10-07T14:30:00-05:00",
      },
      context
    )) as unknown as GenericSuccessResult;

    expect(result.success).toBe(true);

    const { data: app } = await supabase
      .from("appointments")
      .select("status, start_at")
      .eq("id", createdAppointmentId)
      .single();

    expect(app?.status).toBe("rescheduled");
    expect(new Date(app!.start_at).toISOString()).toContain("2026-10-07");
  });

  it("4. cancel_appointment cancels appointment and moves lead back to 'Calificado'", async () => {
    const context: ToolExecutionContext = { contactId, conversationId, supabase };
    const result = (await executeAgentTool(
      "cancel_appointment",
      {
        appointment_id: createdAppointmentId,
        reason: "Prueba automatizada de cancelación",
      },
      context
    )) as unknown as GenericSuccessResult;

    expect(result.success).toBe(true);

    const { data: app } = await supabase
      .from("appointments")
      .select("status")
      .eq("id", createdAppointmentId)
      .single();

    expect(app?.status).toBe("cancelled");

    // Verificar que el lead vuelve a 'calificado'
    const { data: lead } = await supabase
      .from("leads")
      .select("stage_id, pipeline_stages(key)")
      .eq("contact_id", contactId)
      .single();

    expect((lead?.pipeline_stages as { key: string } | null)?.key).toBe("calificado");
  });

  it("5. request_human disables bot and flags conversation for human", async () => {
    const context: ToolExecutionContext = { contactId, conversationId, supabase };
    const result = (await executeAgentTool(
      "request_human",
      { reason: "Cliente solicita hablar con una persona" },
      context
    )) as unknown as RequestHumanResult;

    expect(result.escalated).toBe(true);

    const { data: conv } = await supabase
      .from("conversations")
      .select("bot_enabled, needs_human")
      .eq("id", conversationId)
      .single();

    expect(conv?.bot_enabled).toBe(false);
    expect(conv?.needs_human).toBe(true);
  });
});
