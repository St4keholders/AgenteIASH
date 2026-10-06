import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { GlobalBotToggle } from "@/components/dashboard/GlobalBotToggle";
import { ConversationList } from "@/components/dashboard/conversaciones/ConversationList";
import { MessageThread } from "@/components/dashboard/conversaciones/MessageThread";
import { ContactDetails } from "@/components/dashboard/conversaciones/ContactDetails";
import { PipelineContainer } from "@/components/dashboard/pipeline/PipelineContainer";
import { AgendaContainer } from "@/components/dashboard/agenda/AgendaContainer";

describe("Dashboard Components (JSDOM)", () => {
  it("renders GlobalBotToggle with active status", () => {
    render(<GlobalBotToggle initialEnabled={true} />);
    expect(screen.getByText("Bot global:")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("renders ConversationList with conversation item and filter tabs", () => {
    const mockConversations = [
      {
        id: "conv-1",
        contact_id: "contact-1",
        bot_enabled: true,
        status: "open",
        last_inbound_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        unread_count: 2,
        needs_human: true,
        contact: {
          id: "contact-1",
          wa_id: "+573009998877",
          phone: "+573009998877",
          name: "Carlos Contador",
          email: "carlos@example.com",
          company: "Empresa SAS",
        },
        last_message: {
          body: "Hola necesito cita",
          transcript: null,
          type: "text",
          created_at: new Date().toISOString(),
        },
      },
    ];

    render(
      <ConversationList
        conversations={mockConversations}
        selectedId="conv-1"
        onSelect={() => {}}
        searchQuery=""
        onSearchChange={() => {}}
        filter="todas"
        onFilterChange={() => {}}
      />
    );

    expect(screen.getByText("Carlos Contador")).toBeInTheDocument();
    expect(screen.getByText("Hola necesito cita")).toBeInTheDocument();
    expect(screen.getAllByText("Humano").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders MessageThread with active 24h window and messages", () => {
    const mockMessages = [
      {
        id: "msg-1",
        conversation_id: "conv-1",
        wamid: "wamid-1",
        direction: "in" as const,
        sender: "contact" as const,
        type: "text",
        body: "Buenos días, quiero conocer sus planes.",
        transcript: null,
        storage_path: null,
        status: "delivered" as const,
        created_at: new Date().toISOString(),
      },
    ];

    render(
      <MessageThread
        conversationId="conv-1"
        contactName="Carlos Contador"
        contactPhone="+573009998877"
        lastInboundAt={new Date(Date.now() - 30 * 60 * 1000).toISOString()} // 30 min ago
        messages={mockMessages}
      />
    );

    expect(screen.getByText("Carlos Contador")).toBeInTheDocument();
    expect(screen.getByText("Buenos días, quiero conocer sus planes.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Escribe una respuesta manual...")).toBeInTheDocument();
  });

  it("renders ContactDetails with contact info and appointments", () => {
    render(
      <ContactDetails
        conversationId="conv-1"
        botEnabled={true}
        needsHuman={true}
        contact={{
          id: "contact-1",
          wa_id: "+573009998877",
          phone: "+573009998877",
          name: "Carlos Contador",
          email: "carlos@example.com",
          company: "Empresa SAS",
        }}
        lead={{
          id: "lead-1",
          stage_name: "Diagnóstico agendado",
          service_interest: "Contabilidad para empresas",
          temperature: "caliente",
          invoices_per_month: 80,
          suggested_plan: "Crecimiento",
          summary: "Interesado en cierre mensual e IVA",
        }}
        appointments={[
          {
            id: "app-1",
            service: "Contabilidad para empresas",
            start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            modality: "virtual",
            meet_link: "https://meet.google.com/abc-defg-hij",
            status: "scheduled",
          },
        ]}
      />
    );

    expect(screen.getByDisplayValue("Carlos Contador")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Empresa SAS")).toBeInTheDocument();
    expect(screen.getByText("Diagnóstico agendado")).toBeInTheDocument();
    expect(screen.getByText("caliente")).toBeInTheDocument();
    expect(screen.getByText("Meet")).toBeInTheDocument();
  });

  it("renders PipelineContainer with metrics, stages, and cards", () => {
    const mockStages = [
      { id: "s-1", key: "nuevo", name: "Nuevo", position: 1 },
      { id: "s-2", key: "calificado", name: "Calificado", position: 2 },
    ];

    const mockLeads = [
      {
        id: "l-1",
        contact_id: "c-1",
        stage_id: "s-1",
        service_interest: "Auditoría Contable",
        invoices_per_month: 50,
        suggested_plan: "Plan Básico",
        temperature: "tibio",
        summary: "Cliente interesado",
        owner: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        contact: {
          id: "c-1",
          wa_id: "+573110001122",
          name: "Daniela Directora",
          email: "daniela@directora.com",
          company: "Directora SAS",
        },
      },
    ];

    render(<PipelineContainer initialStages={mockStages} initialLeads={mockLeads} />);

    expect(screen.getByText("Nuevo")).toBeInTheDocument();
    expect(screen.getByText("Calificado")).toBeInTheDocument();
    expect(screen.getByText("Daniela Directora")).toBeInTheDocument();
    expect(screen.getByText("Auditoría Contable")).toBeInTheDocument();
    expect(screen.getByText("Leads nuevos (última semana)")).toBeInTheDocument();
    expect(screen.getByText("Tasa Nuevo → Diagnóstico")).toBeInTheDocument();
  });

  it("renders AgendaContainer with appointments list", () => {
    const mockAppointments = [
      {
        id: "a-1",
        contact_id: "c-1",
        conversation_id: "conv-1",
        start_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // Hoy en 2 horas
        end_at: new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString(),
        service: "Declaración de Renta",
        status: "scheduled",
        modality: "virtual",
        meet_link: "https://meet.google.com/test-meet-123",
        notes: null,
        contact: {
          id: "c-1",
          wa_id: "+573001234567",
          name: "Gabriel Gerente",
          email: "gabriel@gerente.com",
          company: "Comercializadora SAS",
        },
      },
    ];

    render(<AgendaContainer initialAppointments={mockAppointments} />);

    expect(screen.getByText("Agenda de Diagnósticos")).toBeInTheDocument();
    expect(screen.getByText("Gabriel Gerente")).toBeInTheDocument();
    expect(screen.getByText("Declaración de Renta")).toBeInTheDocument();
    expect(screen.getByText("Google Meet")).toBeInTheDocument();
  });
});
