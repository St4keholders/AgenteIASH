import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import React from "react";
import { ConversationsContainer } from "@/components/dashboard/conversaciones/ConversationsContainer";
import { PipelineContainer } from "@/components/dashboard/pipeline/PipelineContainer";
import { AgendaContainer } from "@/components/dashboard/agenda/AgendaContainer";
import { AgentBrainEditor } from "@/components/dashboard/agente/AgentBrainEditor";
import * as actions from "@/app/dashboard/actions";

// Mock Supabase client
const mockRemoveChannel = vi.fn();
const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() });
const mockChannel = vi.fn().mockReturnValue({
  on: vi.fn().mockReturnThis(),
  subscribe: mockSubscribe,
});

const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          maybeSingle: mockMaybeSingle,
        }),
      }),
    })),
  })),
  createBrowserClient: vi.fn(() => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        neq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    })),
  })),
}));

describe("Dashboard No Infinite Loop Verification", () => {
  let markConversationReadSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    markConversationReadSpy = vi
      .spyOn(actions, "markConversationReadAction")
      .mockResolvedValue({ success: true });
  });

  afterEach(() => {
    markConversationReadSpy.mockRestore();
  });

  it("ConversationsContainer on mount does NOT call markConversationReadAction", async () => {
    const mockConversations = [
      {
        id: "conv-1",
        contact_id: "contact-1",
        bot_enabled: true,
        status: "open",
        last_inbound_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        unread_count: 3,
        needs_human: false,
        contact: {
          id: "contact-1",
          wa_id: "+5799900000011",
          phone: "+5799900000011",
          name: "Test Contact",
          email: "test@example.com",
          company: "Test Co",
        },
        last_message: {
          body: "Hola",
          transcript: null,
          type: "text",
          created_at: new Date().toISOString(),
        },
      },
    ];

    render(<ConversationsContainer initialConversations={mockConversations} />);

    // Wait a brief tick to allow any pending useEffects to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // CRITICAL: On initial mount, no Server Action POST should be dispatched
    expect(markConversationReadSpy).toHaveBeenCalledTimes(0);
  });

  it("Selecting an unread conversation calls markConversationReadAction exactly ONCE", async () => {
    const mockConversations = [
      {
        id: "conv-1",
        contact_id: "contact-1",
        bot_enabled: true,
        status: "open",
        last_inbound_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        unread_count: 0,
        needs_human: false,
        contact: {
          id: "contact-1",
          wa_id: "+5799900000011",
          phone: "+5799900000011",
          name: "Read Contact",
          email: null,
          company: null,
        },
        last_message: null,
      },
      {
        id: "conv-2",
        contact_id: "contact-2",
        bot_enabled: true,
        status: "open",
        last_inbound_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        unread_count: 2,
        needs_human: false,
        contact: {
          id: "contact-2",
          wa_id: "+5799900000012",
          phone: "+5799900000012",
          name: "Unread Contact",
          email: null,
          company: null,
        },
        last_message: null,
      },
    ];

    const { getByText } = render(
      <ConversationsContainer initialConversations={mockConversations} />
    );

    expect(markConversationReadSpy).toHaveBeenCalledTimes(0);

    // User clicks the unread conversation
    const unreadItem = getByText("Unread Contact");
    await act(async () => {
      fireEvent.click(unreadItem);
    });

    // Should be called exactly once
    expect(markConversationReadSpy).toHaveBeenCalledTimes(1);
    expect(markConversationReadSpy).toHaveBeenCalledWith("conv-2");

    // Click it again: since unread_count is now 0 locally, should NOT call again
    await act(async () => {
      fireEvent.click(unreadItem);
    });
    expect(markConversationReadSpy).toHaveBeenCalledTimes(1);
  });

  it("Mounting Realtime in ConversationsContainer creates channel once and cleans up on unmount", async () => {
    const { unmount } = render(
      <ConversationsContainer initialConversations={[]} />
    );

    expect(mockChannel).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledTimes(1);

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it("PipelineContainer mounts without triggering Server Actions or loops", async () => {
    const moveLeadSpy = vi.spyOn(actions, "moveLeadStageAction");

    const { unmount } = render(
      <PipelineContainer initialStages={[]} initialLeads={[]} />
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(moveLeadSpy).toHaveBeenCalledTimes(0);
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it("AgendaContainer mounts without triggering Server Actions or loops", async () => {
    const attendanceSpy = vi.spyOn(actions, "markAppointmentAttendanceAction");

    const { unmount } = render(
      <AgendaContainer initialAppointments={[]} />
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(attendanceSpy).toHaveBeenCalledTimes(0);
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it("AgentBrainEditor mounts without triggering Server Actions or loops", async () => {
    const saveDraftSpy = vi.spyOn(actions, "saveAgentDraftAction");

    render(
      <AgentBrainEditor
        initialDraft={{
          identidad: {
            nombre: "Asistente Stakeholders",
            presentacion: "Soy el asistente virtual",
            trato: "tu",
            formalidad: "Profesional",
            longitud_maxima: "Breve",
            usar_emojis: "moderado",
            firma: "Equipo Stakeholders",
          },
          conocimiento: {
            descripcion_negocio: "Firma contable en Medellín",
            direccion_presencial: "El Poblado, Medellín",
            servicios: [],
            preguntas_frecuentes: [],
          },
          embudo: {
            etapas: [{ orden: 1, nombre: "Saludo", objetivo: "Dar la bienvenida" }],
          },
          reglas: {
            prohibiciones: ["No inventar precios"],
            escalamiento_humano: "Cuando pidan asesor",
            temas_ajenos: "Rechazar amablemente",
          },
          horarios_citas: {
            tipo_cita: "diagnostico",
            duracion_minutos: 30,
            hora_inicio_laboral: "07:00",
            hora_fin_laboral: "19:00",
            dias_laborales: [1, 2, 3, 4, 5],
            anticipacion_minima_horas: 2,
            maximo_dias_adelanto: 14,
            modalidades: ["virtual"],
            max_opciones_ofrecer_por_dia: 3,
            zona_horaria: "America/Bogota",
          },
        }}
        publishedVersion={1}
        draftVersion={2}
        history={[]}
      />
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(saveDraftSpy).toHaveBeenCalledTimes(0);
  });
});
