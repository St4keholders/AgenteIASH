"use client";

import { useState, useEffect } from "react";
import { X, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import type { PipelineLeadItem } from "./LeadCard";
import {
  updateContactAction,
  updateLeadDetailsAction,
  markAppointmentAttendanceAction,
} from "@/app/dashboard/actions";
import { createBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";

interface LeadDetailDrawerProps {
  lead: PipelineLeadItem | null;
  isOpen: boolean;
  onClose: () => void;
  onContactClick: (lead: PipelineLeadItem) => void;
  onLeadUpdated?: () => void;
}

interface LeadEventItem {
  id: string;
  type: string;
  actor: string;
  created_at: string;
  payload: Record<string, unknown> | null;
}

interface AppointmentItem {
  id: string;
  start_at: string;
  service: string;
  status: string;
  modality: string;
  meet_link: string | null;
}

export function LeadDetailDrawer({
  lead,
  isOpen,
  onClose,
  onContactClick,
  onLeadUpdated,
}: LeadDetailDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states inicializados con props del lead
  const [name, setName] = useState(lead?.contact.name || "");
  const [email, setEmail] = useState(lead?.contact.email || "");
  const [company, setCompany] = useState(lead?.contact.company || "");
  const [serviceInterest, setServiceInterest] = useState(lead?.service_interest || "");
  const [invoices, setInvoices] = useState<string>(
    lead?.invoices_per_month ? String(lead.invoices_per_month) : ""
  );
  const [suggestedPlan, setSuggestedPlan] = useState(lead?.suggested_plan || "");
  const [temperature, setTemperature] = useState<string>(lead?.temperature || "");
  const [owner, setOwner] = useState(lead?.owner || "");
  const [summary, setSummary] = useState(lead?.summary || "");

  // History and appointments
  const [events, setEvents] = useState<LeadEventItem[]>([]);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);

  useEffect(() => {
    if (!isOpen || !lead) return;

    // Cargar historial y citas
    const supabase = createBrowserClient();

    supabase
      .from("lead_events")
      .select("id, type, actor, created_at, payload")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setEvents(data as LeadEventItem[]);
      });

    supabase
      .from("appointments")
      .select("id, start_at, service, status, modality, meet_link")
      .eq("contact_id", lead.contact.id)
      .order("start_at", { ascending: false })
      .then(({ data }) => {
        if (data) setAppointments(data as AppointmentItem[]);
      });
  }, [isOpen, lead]);

  if (!isOpen || !lead) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!lead) return;
    setLoading(true);
    setSuccessMsg(null);

    try {
      await updateContactAction(lead.contact.id, {
        name,
        email,
        company,
      });

      await updateLeadDetailsAction(lead.id, {
        service_interest: serviceInterest || null,
        invoices_per_month: invoices ? parseInt(invoices, 10) : null,
        suggested_plan: suggestedPlan || null,
        temperature: (temperature as "caliente" | "tibio" | "frío") || null,
        owner: owner || null,
        summary: summary || null,
      });

      setSuccessMsg("Cambios guardados con éxito.");
      onLeadUpdated?.();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAttendance(appointmentId: string, status: "attended" | "no_show") {
    await markAppointmentAttendanceAction(appointmentId, status);
    setAppointments((prev) =>
      prev.map((a) => (a.id === appointmentId ? { ...a, status } : a))
    );
    onLeadUpdated?.();
  }

  const formatEventTitle = (ev: LeadEventItem) => {
    switch (ev.type) {
      case "stage_change":
        return "Cambio de etapa";
      case "lead_updated":
        return "Datos actualizados";
      case "appointment_created":
        return "Cita agendada";
      case "appointment_missed":
        return "Inasistencia registrada";
      case "template_sent":
        return "Plantilla enviada";
      default:
        return ev.type;
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
      <div className="w-full max-w-[460px] bg-white h-full border-l border-[#E5E5E5] flex flex-col shadow-none">
        {/* Encabezado */}
        <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between bg-white shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-[#0A0A0A]">
              Detalle del Lead
            </h2>
            <p className="text-[12px] text-[#525252]">
              {lead.contact.wa_id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onContactClick(lead)}
              className="px-2.5 py-1 rounded-[6px] bg-[#0A0A0A] text-white text-[12px] font-medium hover:bg-[#262626] transition-colors"
            >
              Contactar
            </button>
            {lead.conversation && (
              <Link
                href={`/dashboard/conversaciones?c=${lead.conversation.id}`}
                className="p-1.5 rounded-[6px] hover:bg-[#FAFAFA] text-[#525252] border border-[#E5E5E5]"
                title="Abrir conversación"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-[6px] hover:bg-[#FAFAFA] text-[#525252]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Contenido con scroll */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {successMsg && (
            <div className="p-2.5 rounded-[6px] bg-[#F0FDF4] border border-[#BBF7D0] text-[12px] text-[#15803D]">
              {successMsg}
            </div>
          )}

          {/* Formulario de Datos */}
          <form onSubmit={handleSave} className="space-y-4">
            <h3 className="text-[13px] font-semibold text-[#0A0A0A] border-b border-[#E5E5E5] pb-1">
              Información de Contacto
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#525252] mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-8 px-2.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#525252] mb-1">
                  Empresa
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full h-8 px-2.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-[#525252] mb-1">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-8 px-2.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>
            </div>

            <h3 className="text-[13px] font-semibold text-[#0A0A0A] border-b border-[#E5E5E5] pb-1 pt-2">
              Datos del Diagnóstico y Calificación
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#525252] mb-1">
                  Servicio de interés
                </label>
                <input
                  type="text"
                  value={serviceInterest}
                  onChange={(e) => setServiceInterest(e.target.value)}
                  className="w-full h-8 px-2.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#525252] mb-1">
                  Facturas por mes
                </label>
                <input
                  type="number"
                  value={invoices}
                  onChange={(e) => setInvoices(e.target.value)}
                  className="w-full h-8 px-2.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#525252] mb-1">
                  Plan sugerido
                </label>
                <input
                  type="text"
                  value={suggestedPlan}
                  onChange={(e) => setSuggestedPlan(e.target.value)}
                  className="w-full h-8 px-2.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#525252] mb-1">
                  Temperatura
                </label>
                <select
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="w-full h-8 px-2 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
                >
                  <option value="">Sin definir</option>
                  <option value="caliente">Caliente</option>
                  <option value="tibio">Tibio</option>
                  <option value="frío">Frío</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-[#525252] mb-1">
                  Responsable (Owner)
                </label>
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="Ej: Laura Contador"
                  className="w-full h-8 px-2.5 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-[#525252] mb-1">
                  Resumen y notas internas
                </label>
                <textarea
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Observaciones de la conversación..."
                  className="w-full p-2 text-[12px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-8 bg-[#0A0A0A] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#262626] transition-colors disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>

          {/* Sección de Citas */}
          <div className="space-y-3">
            <h3 className="text-[13px] font-semibold text-[#0A0A0A] border-b border-[#E5E5E5] pb-1">
              Citas y Diagnósticos
            </h3>

            {appointments.length === 0 ? (
              <p className="text-[12px] text-[#A3A3A3]">No hay citas registradas para este contacto.</p>
            ) : (
              appointments.map((app) => (
                <div
                  key={app.id}
                  className="p-3 rounded-[6px] border border-[#E5E5E5] bg-[#FAFAFA] space-y-2 text-[12px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0A0A0A]">
                      {new Date(app.start_at).toLocaleString("es-CO", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-[6px] text-[10px] font-medium bg-white text-[#525252] border border-[#E5E5E5]">
                      {app.status}
                    </span>
                  </div>

                  <p className="text-[#525252]">Servicio: {app.service}</p>
                  {app.meet_link && (
                    <a
                      href={app.meet_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0A0A0A] underline block truncate text-[11px]"
                    >
                      Enlace Google Meet
                    </a>
                  )}

                  {app.status === "scheduled" && (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleAttendance(app.id, "attended")}
                        className="flex-1 py-1 px-2 rounded-[6px] bg-white border border-[#E5E5E5] text-[11px] font-medium text-[#15803D] hover:bg-[#F0FDF4] transition-colors flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Asistió
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAttendance(app.id, "no_show")}
                        className="flex-1 py-1 px-2 rounded-[6px] bg-white border border-[#E5E5E5] text-[11px] font-medium text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        No asistió
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Historial de eventos */}
          <div className="space-y-3">
            <h3 className="text-[13px] font-semibold text-[#0A0A0A] border-b border-[#E5E5E5] pb-1">
              Historial de Actividad
            </h3>

            {events.length === 0 ? (
              <p className="text-[12px] text-[#A3A3A3]">Sin historial disponible.</p>
            ) : (
              <div className="space-y-2">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-2 rounded-[6px] bg-[#FAFAFA] border border-[#E5E5E5] text-[11px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#0A0A0A]">
                        {formatEventTitle(ev)}
                      </span>
                      <span className="text-[#A3A3A3]">
                        {new Date(ev.created_at).toLocaleTimeString("es-CO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-[#525252]">
                      Actor: <span className="font-medium">{ev.actor}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
