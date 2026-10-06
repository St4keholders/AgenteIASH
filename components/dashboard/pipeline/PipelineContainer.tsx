"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { KanbanColumn, type PipelineStageItem } from "./KanbanColumn";
import { type PipelineLeadItem } from "./LeadCard";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import { ContactModal } from "./ContactModal";
import { moveLeadStageAction } from "@/app/dashboard/actions";
import { createBrowserClient } from "@/lib/supabase/client";
import { Search, TrendingUp, Users, CalendarCheck2 } from "lucide-react";

interface PipelineContainerProps {
  initialStages: PipelineStageItem[];
  initialLeads: PipelineLeadItem[];
}

export function PipelineContainer({
  initialStages,
  initialLeads,
}: PipelineContainerProps) {
  const [stages] = useState<PipelineStageItem[]>(initialStages);
  const [leads, setLeads] = useState<PipelineLeadItem[]>(initialLeads);
  const [selectedLead, setSelectedLead] = useState<PipelineLeadItem | null>(null);
  const [contactLead, setContactLead] = useState<PipelineLeadItem | null>(null);
  const [, startTransition] = useTransition();

  // Filtros
  const [search, setSearch] = useState("");
  const [selectedService, setSelectedService] = useState("all");
  const [selectedTemp, setSelectedTemp] = useState("all");
  const [hasAppointmentThisWeek, setHasAppointmentThisWeek] = useState(false);

  // Sensores de DnD Kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Carga y Realtime de Leads
  const refreshLeads = async () => {
    const supabase = createBrowserClient();
    const { data: leadsData } = await supabase
      .from("leads")
      .select(`
        id,
        contact_id,
        stage_id,
        service_interest,
        invoices_per_month,
        suggested_plan,
        temperature,
        summary,
        owner,
        created_at,
        updated_at,
        contact:contacts (
          id,
          wa_id,
          name,
          email,
          company
        )
      `)
      .order("updated_at", { ascending: false });

    if (!leadsData) return;

    // Obtener citas activas y conversaciones para enriquecer las tarjetas
    const { data: appData } = await supabase
      .from("appointments")
      .select("id, contact_id, start_at, service, status, modality, meet_link")
      .neq("status", "cancelled")
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true });

    const { data: convData } = await supabase
      .from("conversations")
      .select("id, contact_id, last_inbound_at, last_message_at, needs_human, bot_enabled");

    const enriched: PipelineLeadItem[] = (
      leadsData as unknown as Array<Omit<PipelineLeadItem, "nextAppointment" | "conversation">>
    ).map((l) => {
      const nextApp = appData?.find((a) => a.contact_id === l.contact_id) || null;
      const conv = convData?.find((c) => c.contact_id === l.contact_id) || null;
      return {
        ...l,
        nextAppointment: nextApp,
        conversation: conv,
      };
    });

    setLeads(enriched);
  };

  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel("pipeline-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => {
          refreshLeads();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => {
          refreshLeads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Manejo de Drag and Drop
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const leadId = String(active.id);
    const targetStageId = String(over.id);

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage_id === targetStageId) return;

    // Actualización optimista inmediata en la UI
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage_id: targetStageId } : l))
    );

    startTransition(async () => {
      try {
        await moveLeadStageAction(leadId, targetStageId);
      } catch (err) {
        console.error("Error moving lead stage:", err);
        refreshLeads();
      }
    });
  }

  // Filtrado de leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Búsqueda por nombre o teléfono
      if (search.trim()) {
        const query = search.toLowerCase();
        const nameMatch = lead.contact.name?.toLowerCase().includes(query);
        const phoneMatch = lead.contact.wa_id.includes(query);
        const companyMatch = lead.contact.company?.toLowerCase().includes(query);
        if (!nameMatch && !phoneMatch && !companyMatch) return false;
      }

      // Filtro por servicio
      if (selectedService !== "all") {
        if (
          !lead.service_interest ||
          !lead.service_interest.toLowerCase().includes(selectedService.toLowerCase())
        ) {
          return false;
        }
      }

      // Filtro por temperatura
      if (selectedTemp !== "all") {
        if (lead.temperature !== selectedTemp) return false;
      }

      // Filtro "Con cita esta semana"
      if (hasAppointmentThisWeek) {
        if (!lead.nextAppointment) return false;
        const appDate = new Date(lead.nextAppointment.start_at);
        const now = new Date();
        const diffDays = (appDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < 0 || diffDays > 7) return false;
      }

      return true;
    });
  }, [leads, search, selectedService, selectedTemp, hasAppointmentThisWeek]);

  // Métricas de la franja superior
  const metrics = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const leadsNewThisWeek = leads.filter(
      (l) => new Date(l.created_at) >= oneWeekAgo
    ).length;

    // Diagnósticos agendados
    const diagStage = stages.find((s) => s.key === "diagnostico_agendado");
    const diagLeads = leads.filter(
      (l) => l.stage_id === diagStage?.id || !!l.nextAppointment
    ).length;

    // Tasa de conversión
    const totalLeads = leads.length;
    const conversionRate = totalLeads > 0 ? Math.round((diagLeads / totalLeads) * 100) : 0;

    return {
      newThisWeek: leadsNewThisWeek,
      scheduled: diagLeads,
      conversionRate,
    };
  }, [leads, stages]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* 1. Franja Superior de Métricas */}
      <div className="p-4 border-b border-[#E5E5E5] bg-white grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-[6px] border border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-[#525252]">Leads nuevos (última semana)</p>
            <p className="text-[18px] font-semibold text-[#0A0A0A] tabular-nums mt-0.5">
              {metrics.newThisWeek}
            </p>
          </div>
          <Users className="w-5 h-5 text-[#525252]" />
        </div>

        <div className="p-3 rounded-[6px] border border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-[#525252]">Diagnósticos agendados</p>
            <p className="text-[18px] font-semibold text-[#0A0A0A] tabular-nums mt-0.5">
              {metrics.scheduled}
            </p>
          </div>
          <CalendarCheck2 className="w-5 h-5 text-[#525252]" />
        </div>

        <div className="p-3 rounded-[6px] border border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-[#525252]">Tasa Nuevo → Diagnóstico</p>
            <p className="text-[18px] font-semibold text-[#0A0A0A] tabular-nums mt-0.5">
              {metrics.conversionRate}%
            </p>
          </div>
          <TrendingUp className="w-5 h-5 text-[#525252]" />
        </div>
      </div>

      {/* 2. Barra de Filtros */}
      <div className="p-3 border-b border-[#E5E5E5] bg-white flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#A3A3A3]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="w-full h-8 pl-8 pr-3 text-[12px] bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#0A0A0A] focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="h-8 px-2 bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
          >
            <option value="all">Todos los servicios</option>
            <option value="renta">Declaración de Renta</option>
            <option value="tributaria">Asesoría Tributaria</option>
            <option value="outsourcing">Outsourcing Contable</option>
            <option value="auditoria">Revisoría Fiscal / Auditoría</option>
          </select>

          <select
            value={selectedTemp}
            onChange={(e) => setSelectedTemp(e.target.value)}
            className="h-8 px-2 bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
          >
            <option value="all">Todas las temperaturas</option>
            <option value="caliente">Caliente</option>
            <option value="tibio">Tibio</option>
            <option value="frío">Frío</option>
          </select>

          <button
            type="button"
            onClick={() => setHasAppointmentThisWeek(!hasAppointmentThisWeek)}
            className={`h-8 px-2.5 rounded-[6px] border text-[12px] font-medium transition-colors ${
              hasAppointmentThisWeek
                ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                : "bg-white text-[#525252] border-[#E5E5E5] hover:bg-[#FAFAFA]"
            }`}
          >
            Cita esta semana
          </button>
        </div>
      </div>

      {/* 3. Tablero Kanban con Columnas */}
      <div className="flex-1 overflow-x-auto p-4 bg-white">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full items-start">
            {stages.map((stage) => {
              const stageLeads = filteredLeads.filter(
                (lead) => lead.stage_id === stage.id
              );
              return (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  leads={stageLeads}
                  onLeadClick={(lead) => setSelectedLead(lead)}
                  onContactClick={(lead) => setContactLead(lead)}
                />
              );
            })}
          </div>
        </DndContext>
      </div>

      {/* 4. Slide-over de Detalle del Lead */}
      <LeadDetailDrawer
        key={selectedLead?.id || "none"}
        lead={selectedLead}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onContactClick={(lead) => setContactLead(lead)}
        onLeadUpdated={refreshLeads}
      />

      {/* 5. Modal de Contacto Directo (24h / Plantillas) */}
      <ContactModal
        key={contactLead?.id || "none"}
        lead={contactLead}
        isOpen={!!contactLead}
        onClose={() => setContactLead(null)}
        onSuccess={refreshLeads}
      />
    </div>
  );
}
