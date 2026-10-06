import { createAdminClient } from "@/lib/supabase/server";
import {
  validateSlot,
  getAvailableSlotsForDay,
  formatTimeBogota,
  formatDateBogota,
  BusyInterval,
  DEFAULT_AVAILABILITY_CONFIG,
} from "@/lib/calendar/availability";
import {
  getCalendarBusyIntervals,
  createCalendarEvent,
  rescheduleCalendarEvent,
  cancelCalendarEvent,
} from "@/lib/google/calendar";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { Json } from "@/lib/database.types";

export const AGENT_TOOLS_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Consulta horarios libres de 30 minutos para citas de diagnóstico gratuito en una fecha específica (YYYY-MM-DD).",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Fecha a consultar en formato YYYY-MM-DD (hora de Colombia).",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description:
        "Agenda una cita de diagnóstico de 30 minutos en Google Calendar y base de datos tras confirmación del cliente.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre completo del cliente." },
          email: {
            type: "string",
            description: "Correo electrónico del cliente (obligatorio si la modalidad es virtual para el enlace de Meet).",
          },
          modality: {
            type: "string",
            enum: ["virtual", "presencial"],
            description: "Modalidad de la cita: virtual (Google Meet) o presencial (Medellín).",
          },
          service: {
            type: "string",
            description: "Servicio de interés (ej: Contabilidad para empresas, Renta, Nómina, etc.).",
          },
          start_iso: {
            type: "string",
            description: "Fecha y hora de inicio en formato ISO 8601 (ej: 2026-10-07T10:00:00-05:00).",
          },
          notes: {
            type: "string",
            description: "Notas o detalles adicionales conversados con el cliente.",
          },
        },
        required: ["name", "modality", "service", "start_iso"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description: "Reprograma una cita existente a una nueva fecha y hora.",
      parameters: {
        type: "object",
        properties: {
          appointment_id: {
            type: "string",
            description: "ID de la cita en base de datos (UUID).",
          },
          new_start_iso: {
            type: "string",
            description: "Nueva fecha y hora de inicio en formato ISO 8601.",
          },
        },
        required: ["appointment_id", "new_start_iso"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description: "Cancela una cita existente.",
      parameters: {
        type: "object",
        properties: {
          appointment_id: {
            type: "string",
            description: "ID de la cita en base de datos (UUID).",
          },
          reason: {
            type: "string",
            description: "Motivo de la cancelación.",
          },
        },
        required: ["appointment_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_appointments",
      description: "Lista las citas activas o futuras del contacto actual.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead",
      description:
        "Actualiza los datos del lead y contacto (nombre, correo, empresa, número de facturas, plan sugerido, resumen).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          company: { type: "string" },
          service_interest: { type: "string" },
          invoices_per_month: { type: "number" },
          suggested_plan: { type: "string" },
          temperature: { type: "string", enum: ["caliente", "tibio", "frío"] },
          summary: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_human",
      description:
        "Solicita la intervención de un asesor humano cuando el cliente lo pide, está molesto o el caso es complejo.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Razón por la cual se transfiere a un humano." },
        },
        required: ["reason"],
      },
    },
  },
];

export interface ToolExecutionContext {
  contactId: string;
  conversationId: string;
  supabase?: ReturnType<typeof createAdminClient>;
  dryRun?: boolean;
}

/**
 * Ejecuta una herramienta del agente en el servidor.
 */
export async function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<Record<string, unknown>> {
  const supabase = context.supabase || createAdminClient();

  switch (toolName) {
    case "check_availability": {
      const dateStr = String(args.date || "");
      const startOfDay = new Date(`${dateStr}T00:00:00Z`);
      const endOfDay = new Date(`${dateStr}T23:59:59Z`);

      // 1. Obtener citas ocupadas de Google Calendar
      const googleBusy = await getCalendarBusyIntervals(startOfDay, endOfDay);

      // 2. Obtener citas ocupadas de la base de datos
      const { data: dbAppointments } = await supabase
        .from("appointments")
        .select("start_at, end_at")
        .neq("status", "cancelled")
        .gte("start_at", `${dateStr}T00:00:00-05:00`)
        .lte("start_at", `${dateStr}T23:59:59-05:00`);

      const allBusy: BusyInterval[] = [...googleBusy];
      if (dbAppointments) {
        for (const app of dbAppointments) {
          allBusy.push({
            start: new Date(app.start_at),
            end: new Date(app.end_at),
          });
        }
      }

      const availableSlots = getAvailableSlotsForDay(dateStr, allBusy, 4);

      if (availableSlots.length === 0) {
        return {
          available: false,
          date: dateStr,
          message: `No hay horarios disponibles para el día ${dateStr}. Puede ser fin de semana, festivo o estar ocupado. Sugiere consultar otro día.`,
        };
      }

      return {
        available: true,
        date: dateStr,
        slots: availableSlots.map((s) => ({
          time: s.timeFormatted,
          iso_start: s.start,
        })),
        message: `Horarios libres para ${dateStr}: ${availableSlots.map((s) => s.timeFormatted).join(", ")}.`,
      };
    }

    case "book_appointment": {
      const slotStart = new Date(String(args.start_iso || ""));
      if (isNaN(slotStart.getTime())) {
        return { error: "Fecha y hora de inicio inválida." };
      }

      // Validar disponibilidad
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
      const googleBusy = await getCalendarBusyIntervals(slotStart, slotEnd);

      const { data: dbOverlaps } = await supabase
        .from("appointments")
        .select("id")
        .neq("status", "cancelled")
        .lt("start_at", slotEnd.toISOString())
        .gt("end_at", slotStart.toISOString());

      const allBusy = [...googleBusy];
      if (dbOverlaps && dbOverlaps.length > 0) {
        allBusy.push({ start: slotStart, end: slotEnd });
      }

      const validation = validateSlot(slotStart, allBusy, DEFAULT_AVAILABILITY_CONFIG);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.reason,
          message: `No se pudo agendar: ${validation.reason}. Por favor ofrece otro horario.`,
        };
      }

      // Actualizar datos del contacto
      const contactUpdates: { name?: string; email?: string; updated_at: string } = {
        updated_at: new Date().toISOString(),
      };
      if (typeof args.name === "string") contactUpdates.name = args.name;
      if (typeof args.email === "string") contactUpdates.email = args.email;
      await supabase.from("contacts").update(contactUpdates).eq("id", context.contactId);

      const modality = args.modality === "presencial" ? "presencial" : "virtual";
      const clientName = String(args.name || "Cliente");
      const serviceName = String(args.service || "Diagnóstico Gratuito");
      const clientEmail = typeof args.email === "string" ? args.email : undefined;
      const notes = typeof args.notes === "string" ? args.notes : null;

      // Crear evento en Google Calendar
      const calEvent = await createCalendarEvent({
        summary: `Diagnóstico Gratuito - ${clientName} (${serviceName})`,
        description: `Cita de diagnóstico para ${clientName}.\nServicio: ${serviceName}\nModalidad: ${modality}\nNotas: ${notes || "Ninguna"}`,
        start: slotStart,
        end: slotEnd,
        modality,
        attendeeEmail: clientEmail,
        forceReal: false,
      });

      // Insertar en appointments
      const { data: newApp, error: appErr } = await supabase
        .from("appointments")
        .insert({
          contact_id: context.contactId,
          conversation_id: context.conversationId,
          google_event_id: calEvent.id,
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString(),
          modality,
          service: serviceName,
          meet_link: calEvent.meetLink || null,
          status: "scheduled",
          notes,
        })
        .select("id")
        .single();

      if (appErr || !newApp) {
        return { error: `Error guardando la cita en base de datos: ${appErr?.message}` };
      }

      // Mover lead a etapa "Diagnóstico agendado"
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("key", "diagnostico_agendado")
        .single();

      if (stage) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id, stage_id")
          .eq("contact_id", context.contactId)
          .single();

        if (lead) {
          await supabase
            .from("leads")
            .update({ stage_id: stage.id, updated_at: new Date().toISOString() })
            .eq("id", lead.id);

          await supabase.from("lead_events").insert({
            lead_id: lead.id,
            type: "stage_change",
            from_stage_id: lead.stage_id,
            to_stage_id: stage.id,
            actor: "bot",
            payload: { reason: "Cita agendada", appointment_id: newApp.id },
          });
        }
      }

      return {
        success: true,
        appointment_id: newApp.id,
        start_formatted: `${formatDateBogota(slotStart)}, ${formatTimeBogota(slotStart)}`,
        modality: args.modality,
        meet_link: calEvent.meetLink,
        message: `Cita agendada con éxito para el ${formatDateBogota(slotStart)} a las ${formatTimeBogota(slotStart)} (${args.modality}). ${calEvent.meetLink ? `Enlace de Google Meet: ${calEvent.meetLink}` : ""}`,
      };
    }

    case "reschedule_appointment": {
      const { data: app } = await supabase
        .from("appointments")
        .select("id, google_event_id")
        .eq("id", String(args.appointment_id || ""))
        .single();

      if (!app) {
        return { error: "No se encontró la cita especificada." };
      }

      const newStart = new Date(String(args.new_start_iso || ""));
      const newEnd = new Date(newStart.getTime() + 30 * 60 * 1000);

      const validation = validateSlot(newStart, [], DEFAULT_AVAILABILITY_CONFIG);
      if (!validation.valid) {
        return { success: false, error: validation.reason };
      }

      if (app.google_event_id) {
        await rescheduleCalendarEvent(app.google_event_id, newStart, newEnd);
      }

      await supabase
        .from("appointments")
        .update({
          start_at: newStart.toISOString(),
          end_at: newEnd.toISOString(),
          status: "rescheduled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", app.id);

      return {
        success: true,
        new_start_formatted: `${formatDateBogota(newStart)}, ${formatTimeBogota(newStart)}`,
        message: `Cita reprogramada con éxito para el ${formatDateBogota(newStart)} a las ${formatTimeBogota(newStart)}.`,
      };
    }

    case "cancel_appointment": {
      const { data: app } = await supabase
        .from("appointments")
        .select("id, google_event_id, contact_id")
        .eq("id", String(args.appointment_id || ""))
        .single();

      if (!app) {
        return { error: "No se encontró la cita especificada." };
      }

      if (app.google_event_id) {
        await cancelCalendarEvent(app.google_event_id);
      }

      await supabase
        .from("appointments")
        .update({
          status: "cancelled",
          notes: args.reason ? `Cancelada: ${args.reason}` : "Cancelada por el cliente",
          updated_at: new Date().toISOString(),
        })
        .eq("id", app.id);

      // Si el lead estaba en 'diagnostico_agendado', moverlo a 'calificado'
      const { data: calificadoStage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("key", "calificado")
        .single();

      if (calificadoStage) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id, stage_id")
          .eq("contact_id", app.contact_id)
          .single();

        if (lead) {
          await supabase
            .from("leads")
            .update({ stage_id: calificadoStage.id, updated_at: new Date().toISOString() })
            .eq("id", lead.id);

          await supabase.from("lead_events").insert({
            lead_id: lead.id,
            type: "stage_change",
            from_stage_id: lead.stage_id,
            to_stage_id: calificadoStage.id,
            actor: "bot",
            payload: { reason: "Cita cancelada", appointment_id: app.id },
          });
        }
      }

      return {
        success: true,
        message: "Cita cancelada correctamente en el calendario y base de datos.",
      };
    }

    case "list_my_appointments": {
      const { data: appointments } = await supabase
        .from("appointments")
        .select("id, start_at, modality, service, meet_link, status")
        .eq("contact_id", context.contactId)
        .neq("status", "cancelled")
        .gte("start_at", new Date().toISOString())
        .order("start_at", { ascending: true });

      if (!appointments || appointments.length === 0) {
        return {
          has_appointments: false,
          message: "No tienes citas agendadas activas para fechas futuras.",
        };
      }

      return {
        has_appointments: true,
        appointments: appointments.map((a) => ({
          id: a.id,
          service: a.service,
          start: `${formatDateBogota(new Date(a.start_at))}, ${formatTimeBogota(new Date(a.start_at))}`,
          modality: a.modality,
          meet_link: a.meet_link,
          status: a.status,
        })),
      };
    }

    case "update_lead": {
      // 1. Actualizar contacto si aplica
      const contactUpdates: { name?: string; email?: string; company?: string; updated_at?: string } = {};
      if (typeof args.name === "string") contactUpdates.name = args.name;
      if (typeof args.email === "string") contactUpdates.email = args.email;
      if (typeof args.company === "string") contactUpdates.company = args.company;
      if (Object.keys(contactUpdates).length > 0) {
        contactUpdates.updated_at = new Date().toISOString();
        await supabase.from("contacts").update(contactUpdates).eq("id", context.contactId);
      }

      // 2. Actualizar lead
      const { data: lead } = await supabase
        .from("leads")
        .select("id, stage_id")
        .eq("contact_id", context.contactId)
        .single();

      if (lead) {
        const leadUpdates: {
          updated_at: string;
          service_interest?: string;
          invoices_per_month?: number;
          suggested_plan?: string;
          temperature?: "caliente" | "tibio" | "frío";
          summary?: string;
          stage_id?: string;
        } = { updated_at: new Date().toISOString() };
        if (typeof args.service_interest === "string") leadUpdates.service_interest = args.service_interest;
        if (typeof args.invoices_per_month === "number") leadUpdates.invoices_per_month = args.invoices_per_month;
        if (typeof args.suggested_plan === "string") leadUpdates.suggested_plan = args.suggested_plan;
        if (args.temperature === "caliente" || args.temperature === "tibio" || args.temperature === "frío") {
          leadUpdates.temperature = args.temperature;
        }
        if (typeof args.summary === "string") leadUpdates.summary = args.summary;

        // Si se descubrió el servicio y estaba en 'nuevo', avanzar a 'calificado'
        if (args.service_interest) {
          const { data: stages } = await supabase.from("pipeline_stages").select("id, key");
          const nuevoStage = stages?.find((s) => s.key === "nuevo");
          const calificadoStage = stages?.find((s) => s.key === "calificado");
          if (nuevoStage && calificadoStage && lead.stage_id === nuevoStage.id) {
            leadUpdates.stage_id = calificadoStage.id;
          }
        }

        await supabase.from("leads").update(leadUpdates).eq("id", lead.id);

        if (leadUpdates.stage_id && leadUpdates.stage_id !== lead.stage_id) {
          await supabase.from("lead_events").insert({
            lead_id: lead.id,
            type: "stage_change",
            from_stage_id: lead.stage_id,
            to_stage_id: leadUpdates.stage_id,
            actor: "bot",
            payload: { reason: "Interés de servicio identificado", service_interest: args.service_interest } as unknown as Json,
          });
        }

        await supabase.from("lead_events").insert({
          lead_id: lead.id,
          type: "lead_updated",
          actor: "bot",
          payload: args as unknown as Json,
        });
      }

      return { success: true, message: "Datos del lead actualizados con éxito." };
    }

    case "request_human": {
      await supabase
        .from("conversations")
        .update({
          needs_human: true,
          bot_enabled: false,
        })
        .eq("id", context.conversationId);

      return {
        escalated: true,
        message: "Se ha solicitado un asesor humano. El bot ha quedado desactivado para este chat.",
      };
    }

    default:
      return { error: `Herramienta desconocida: ${toolName}` };
  }
}
