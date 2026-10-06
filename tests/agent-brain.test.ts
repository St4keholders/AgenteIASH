import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "@/lib/supabase/server";
import {
  AgentConfigZodSchema,
  buildSystemPrompt,
  getPublishedConfig,
  getDraftConfig,
  type AgentConfigData,
} from "@/lib/agent/prompt";
import { executeAgentTool } from "@/lib/agent/tools";
import {
  saveAgentDraftAction,
  publishAgentConfigAction,
  restoreAgentVersionAction,
  getAgentVersionHistoryAction,
} from "@/app/dashboard/actions";

describe("Agent Brain Editor & Configuration (Phase 04)", () => {
  const supabase = createAdminClient();
  let basePublished: AgentConfigData;
  let originalPublishedVersion: number;

  beforeAll(async () => {
    const published = await getPublishedConfig(supabase);
    basePublished = published.data;
    originalPublishedVersion = published.version;
  });

  afterAll(async () => {
    // Restaurar la configuración publicada original al terminar
    await publishAgentConfigAction(basePublished);
    // Limpiar borradores residuales de prueba
    await supabase.from("agent_configs").delete().eq("status", "draft");
  });

  it("validates AgentConfig with Zod schema correctly", () => {
    const valid = AgentConfigZodSchema.safeParse(basePublished);
    expect(valid.success).toBe(true);

    const invalid = AgentConfigZodSchema.safeParse({
      ...basePublished,
      identidad: {
        ...basePublished.identidad,
        nombre: "", // min 1 requerido
        trato: "vosotros", // trato inválido
      },
    });
    expect(invalid.success).toBe(false);
  });

  it("modifies tone to 'usted' in draft without altering published config", async () => {
    const draftData: AgentConfigData = {
      ...basePublished,
      identidad: {
        ...basePublished.identidad,
        trato: "usted",
      },
    };

    // Guardar borrador
    await saveAgentDraftAction(draftData);

    const draft = await getDraftConfig(supabase);
    expect(draft).not.toBeNull();
    expect(draft?.data.identidad.trato).toBe("usted");

    // Verificar que la configuración publicada sigue en 'tu'
    const published = await getPublishedConfig(supabase);
    expect(published.data.identidad.trato).toBe("tu");

    // Verificar prompts generados
    const draftPrompt = buildSystemPrompt(draftData);
    expect(draftPrompt).toContain('Trátalo de "usted"');

    const publishedPrompt = buildSystemPrompt(published.data);
    expect(publishedPrompt).toContain('Trátalo de "tu"');
  });

  it("publishes draft and immediately updates published config", async () => {
    const draftData: AgentConfigData = {
      ...basePublished,
      identidad: {
        ...basePublished.identidad,
        nombre: "Sara Asesora Senior",
        trato: "usted",
      },
    };

    const res = await publishAgentConfigAction(draftData);
    expect(res.success).toBe(true);
    expect(res.version).toBeGreaterThan(originalPublishedVersion);

    // Inmediatamente getPublishedConfig debe traer la nueva versión y el nuevo tono
    const newlyPublished = await getPublishedConfig(supabase);
    expect(newlyPublished.version).toBe(res.version);
    expect(newlyPublished.data.identidad.nombre).toBe("Sara Asesora Senior");
    expect(newlyPublished.data.identidad.trato).toBe("usted");
  });

  it("adds a FAQ to knowledge base and injects it into system prompt", () => {
    const updatedConfig: AgentConfigData = {
      ...basePublished,
      conocimiento: {
        ...basePublished.conocimiento,
        preguntas_frecuentes: [
          ...(basePublished.conocimiento.preguntas_frecuentes || []),
          {
            pregunta: "¿Atienden casos en Envigado e Itagüí?",
            respuesta: "Sí, tenemos sede en El Poblado y atendemos todo el Valle de Aburrá presencialmente y todo Colombia de forma virtual.",
          },
        ],
      },
    };

    const prompt = buildSystemPrompt(updatedConfig);
    expect(prompt).toContain("¿Atienden casos en Envigado e Itagüí?");
    expect(prompt).toContain("Valle de Aburrá");
  });

  it("enforces custom business hours in check_availability tool", async () => {
    // Configurar horario restringido de 09:00 a 11:00
    const customConfig: AgentConfigData = {
      ...basePublished,
      horarios_citas: {
        ...basePublished.horarios_citas,
        hora_inicio_laboral: "09:00",
        hora_fin_laboral: "11:00",
        max_opciones_ofrecer_por_dia: 4,
      },
    };

    // Miércoles 7 de octubre de 2026 (día laboral ordinario)
    const result = (await executeAgentTool(
      "check_availability",
      { date: "2026-10-07" },
      {
        contactId: "TEST-sim-contact",
        conversationId: "TEST-sim-conv",
        supabase,
        dryRun: true,
        agentConfig: customConfig,
      }
    )) as { available: boolean; slots?: Array<{ time: string; iso_start: string }> };

    expect(result.available).toBe(true);
    expect(result.slots).toBeDefined();

    // Todos los slots deben estar entre las 09:00 y las 11:00
    for (const slot of result.slots || []) {
      const match = slot.time.match(/(\d+):(\d+)\s*(a\.\s*m\.|p\.\s*m\.)/i);
      expect(match).not.toBeNull();
      // No debe haber citas a las 7 AM ni a las 2 PM
      expect(slot.time).not.toContain("7:00");
      expect(slot.time).not.toContain("8:00");
      expect(slot.time).not.toContain("2:00");
    }
  });

  it("simulator dryRun guard prevents creating real appointments or DB records", async () => {
    const simContactId = "a0000000-0000-0000-0000-000000000099";
    const initialAppointments = await supabase
      .from("appointments")
      .select("id")
      .eq("contact_id", simContactId);

    const initialCount = initialAppointments.data?.length || 0;

    const simResult = (await executeAgentTool(
      "book_appointment",
      {
        name: "Cliente Simulado",
        email: "sim@test.com",
        modality: "virtual",
        service: "Contabilidad para empresas",
        start_iso: "2026-10-08T15:00:00-05:00",
      },
      {
        contactId: simContactId,
        conversationId: "a0000000-0000-0000-0000-000000000098",
        supabase,
        dryRun: true,
      }
    )) as { success: boolean; simulated?: boolean; message?: string };

    expect(simResult.success).toBe(true);
    expect(simResult.simulated).toBe(true);
    expect(simResult.message).toContain("[SIMULACIÓN]");

    // Confirmar que no se insertó ninguna fila en appointments
    const afterAppointments = await supabase
      .from("appointments")
      .select("id")
      .eq("contact_id", simContactId);

    expect(afterAppointments.data?.length).toBe(initialCount);
  });

  it("restores a previous version into active draft", async () => {
    // 1. Obtener historial
    const history = await getAgentVersionHistoryAction();
    expect(history.length).toBeGreaterThan(0);

    const targetVersion = history[history.length - 1]; // primera versión creada
    expect(targetVersion).toBeDefined();

    // 2. Restaurar
    const restoreRes = await restoreAgentVersionAction(targetVersion.id);
    expect(restoreRes.success).toBe(true);
    expect(restoreRes.restoredVersion).toBe(targetVersion.version);

    // 3. Confirmar que el borrador ahora tiene los datos de la versión restaurada
    const currentDraft = await getDraftConfig(supabase);
    expect(currentDraft).not.toBeNull();
    expect(currentDraft?.data.identidad.nombre).toBe(
      (targetVersion.data as AgentConfigData).identidad.nombre
    );
  });
});
