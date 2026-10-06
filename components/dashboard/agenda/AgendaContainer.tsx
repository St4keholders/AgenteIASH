"use client";

import { useState, useEffect } from "react";
import { markAppointmentAttendanceAction } from "@/app/dashboard/actions";
import { createBrowserClient } from "@/lib/supabase/client";
import { Calendar, Video, CheckCircle2, XCircle, MessageSquare, ExternalLink } from "lucide-react";
import Link from "next/link";

export interface AgendaAppointmentItem {
  id: string;
  contact_id: string;
  conversation_id: string | null;
  start_at: string;
  end_at: string;
  service: string;
  status: string;
  modality: string;
  meet_link: string | null;
  notes: string | null;
  contact: {
    id: string;
    wa_id: string;
    name: string | null;
    email: string | null;
    company: string | null;
  };
}

interface AgendaContainerProps {
  initialAppointments: AgendaAppointmentItem[];
}

export function AgendaContainer({ initialAppointments }: AgendaContainerProps) {
  const [appointments, setAppointments] = useState<AgendaAppointmentItem[]>(initialAppointments);
  const [filter, setFilter] = useState<"all" | "scheduled" | "attended">("all");

  const refreshAppointments = async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("appointments")
      .select(`
        id,
        contact_id,
        conversation_id,
        start_at,
        end_at,
        service,
        status,
        modality,
        meet_link,
        notes,
        contact:contacts (
          id,
          wa_id,
          name,
          email,
          company
        )
      `)
      .order("start_at", { ascending: true });

    if (data) {
      setAppointments(data as unknown as AgendaAppointmentItem[]);
    }
  };

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("agenda-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => {
          refreshAppointments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleAttendance(appointmentId: string, status: "attended" | "no_show") {
    // Actualización optimista
    setAppointments((prev) =>
      prev.map((a) => (a.id === appointmentId ? { ...a, status } : a))
    );

    try {
      await markAppointmentAttendanceAction(appointmentId, status);
    } catch (err) {
      console.error(err);
      refreshAppointments();
    }
  }

  // Agrupación por días (Hoy, Mañana, Esta Semana, Próximas / Pasadas)
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const endOfTomorrow = new Date(startOfTomorrow.getTime() + 24 * 60 * 60 * 1000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

  const filtered = appointments.filter((app) => {
    if (filter === "all") return true;
    if (filter === "scheduled") return app.status === "scheduled";
    if (filter === "attended") return app.status === "attended";
    return true;
  });

  const groups = {
    hoy: [] as AgendaAppointmentItem[],
    manana: [] as AgendaAppointmentItem[],
    estaSemana: [] as AgendaAppointmentItem[],
    otras: [] as AgendaAppointmentItem[],
  };

  for (const app of filtered) {
    const d = new Date(app.start_at);
    if (d >= startOfToday && d < startOfTomorrow) {
      groups.hoy.push(app);
    } else if (d >= startOfTomorrow && d < endOfTomorrow) {
      groups.manana.push(app);
    } else if (d >= endOfTomorrow && d < endOfWeek) {
      groups.estaSemana.push(app);
    } else {
      groups.otras.push(app);
    }
  }

  const renderSection = (title: string, items: AgendaAppointmentItem[]) => {
    if (items.length === 0) return null;

    return (
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#E5E5E5]">
          <h3 className="text-[14px] font-semibold text-[#0A0A0A]">
            {title}
          </h3>
          <span className="px-2 py-0.5 rounded-[6px] text-[11px] font-medium bg-[#FAFAFA] text-[#525252] border border-[#E5E5E5] tabular-nums">
            {items.length} {items.length === 1 ? "cita" : "citas"}
          </span>
        </div>

        <div className="space-y-2">
          {items.map((app) => {
            const startDate = new Date(app.start_at);
            const timeStr = startDate.toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const dateStr = startDate.toLocaleDateString("es-CO", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });

            return (
              <div
                key={app.id}
                className="p-4 bg-white border border-[#E5E5E5] rounded-[6px] hover:border-[#0A0A0A] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Info hora y cliente */}
                <div className="flex items-start gap-4">
                  <div className="w-16 text-center shrink-0 py-1 bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px]">
                    <span className="text-[14px] font-bold text-[#0A0A0A] block tabular-nums">
                      {timeStr}
                    </span>
                    <span className="text-[10px] text-[#525252] capitalize block">
                      {dateStr}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-[14px] font-medium text-[#0A0A0A]">
                        {app.contact.name || app.contact.wa_id}
                      </h4>
                      <span className="text-[12px] text-[#A3A3A3]">
                        {app.contact.wa_id}
                      </span>
                    </div>

                    <p className="text-[13px] text-[#525252]">
                      Servicio: <span className="text-[#0A0A0A] font-medium">{app.service}</span>
                    </p>

                    <div className="flex items-center gap-3 text-[12px]">
                      {app.modality === "virtual" || app.meet_link ? (
                        <div className="flex items-center gap-1 text-[#0A0A0A]">
                          <Video className="w-3.5 h-3.5 text-[#525252]" />
                          {app.meet_link ? (
                            <a
                              href={app.meet_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline text-[12px] hover:text-[#525252] flex items-center gap-0.5"
                            >
                              Google Meet
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span>Virtual (Google Meet)</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#525252]">Presencial</span>
                      )}

                      <span
                        className={`px-1.5 py-0.5 rounded-[6px] text-[10px] font-medium border ${
                          app.status === "attended"
                            ? "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]"
                            : app.status === "no_show"
                            ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FCA5A5]"
                            : app.status === "cancelled"
                            ? "bg-[#F4F4F5] text-[#71717A] border-[#E4E4E7]"
                            : "bg-[#FAFAFA] text-[#0A0A0A] border-[#E5E5E5]"
                        }`}
                      >
                        {app.status === "scheduled" && "Agendada"}
                        {app.status === "attended" && "Asistió"}
                        {app.status === "no_show" && "No asistió"}
                        {app.status === "cancelled" && "Cancelada"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  {app.status === "scheduled" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleAttendance(app.id, "attended")}
                        className="px-2.5 py-1 text-[12px] font-medium text-[#15803D] bg-white border border-[#BBF7D0] hover:bg-[#F0FDF4] rounded-[6px] transition-colors flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Asistió
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAttendance(app.id, "no_show")}
                        className="px-2.5 py-1 text-[12px] font-medium text-[#B91C1C] bg-white border border-[#FCA5A5] hover:bg-[#FEF2F2] rounded-[6px] transition-colors flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        No asistió
                      </button>
                    </>
                  )}

                  {app.conversation_id && (
                    <Link
                      href={`/dashboard/conversaciones?c=${app.conversation_id}`}
                      className="px-2.5 py-1 text-[12px] font-medium text-[#0A0A0A] bg-[#FAFAFA] border border-[#E5E5E5] hover:bg-[#E5E5E5] rounded-[6px] transition-colors flex items-center gap-1"
                      title="Ver conversación"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Chat
                    </Link>
                  )}

                  <Link
                    href={`/dashboard/pipeline`}
                    className="px-2.5 py-1 text-[12px] font-medium text-[#525252] bg-white border border-[#E5E5E5] hover:bg-[#FAFAFA] rounded-[6px] transition-colors"
                    title="Ver en Pipeline"
                  >
                    Lead
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Encabezado y filtros */}
      <div className="p-4 border-b border-[#E5E5E5] bg-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[#0A0A0A]">
            Agenda de Diagnósticos
          </h2>
          <p className="text-[12px] text-[#525252]">
            Gestión y asistencia de reuniones programadas con clientes.
          </p>
        </div>

        <div className="flex gap-1 text-[12px]">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
              filter === "all"
                ? "bg-[#0A0A0A] text-white"
                : "text-[#525252] hover:bg-[#FAFAFA] border border-[#E5E5E5]"
            }`}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setFilter("scheduled")}
            className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
              filter === "scheduled"
                ? "bg-[#0A0A0A] text-white"
                : "text-[#525252] hover:bg-[#FAFAFA] border border-[#E5E5E5]"
            }`}
          >
            Pendientes
          </button>
          <button
            type="button"
            onClick={() => setFilter("attended")}
            className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
              filter === "attended"
                ? "bg-[#0A0A0A] text-white"
                : "text-[#525252] hover:bg-[#FAFAFA] border border-[#E5E5E5]"
            }`}
          >
            Asistidas
          </button>
        </div>
      </div>

      {/* Contenido con Scroll */}
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl w-full mx-auto">
        {filtered.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-[#E5E5E5] rounded-[6px]">
            <Calendar className="w-8 h-8 text-[#A3A3A3] mx-auto mb-2" />
            <h3 className="text-[14px] font-medium text-[#0A0A0A]">
              No hay citas programadas
            </h3>
            <p className="text-[12px] text-[#525252] mt-1">
              Las citas agendadas por el agente o el equipo aparecerán organizadas aquí.
            </p>
          </div>
        ) : (
          <>
            {renderSection("Hoy", groups.hoy)}
            {renderSection("Mañana", groups.manana)}
            {renderSection("Esta Semana", groups.estaSemana)}
            {renderSection("Otras Fechas", groups.otras)}
          </>
        )}
      </div>
    </div>
  );
}
