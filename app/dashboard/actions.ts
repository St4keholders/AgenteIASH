"use server";

import type { Json, Database } from "@/lib/database.types";
import { createSessionClient, createAdminClient } from "@/lib/supabase/server";
import {
  sendWhatsAppText,
  sendWhatsAppTemplate,
  listApprovedTemplates,
  type WhatsAppTemplate,
} from "@/lib/whatsapp/client";
import { revalidatePath } from "next/cache";

function safeRevalidate(path: string, type?: "page" | "layout") {
  try {
    revalidatePath(path, type);
  } catch {
    // Ignorar fuera de request scope de Next.js (tests unitarios)
  }
}

export async function toggleGlobalBotAction(enabled: boolean) {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("settings")
    .upsert({
      key: "bot_global_enabled",
      value: enabled as unknown as Json,
    });

  if (error) {
    throw new Error(`Error updating global bot status: ${error.message}`);
  }

  safeRevalidate("/dashboard", "layout");
  return { success: true, enabled };
}

export async function toggleConversationBotAction(conversationId: string, enabled: boolean) {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("conversations")
    .update({ bot_enabled: enabled })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Error updating conversation bot status: ${error.message}`);
  }

  safeRevalidate("/dashboard/conversaciones");
  return { success: true, enabled };
}

export async function resolveHumanHandoffAction(conversationId: string) {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("conversations")
    .update({ needs_human: false })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Error resolving human handoff: ${error.message}`);
  }

  safeRevalidate("/dashboard/conversaciones");
  return { success: true };
}

export async function updateContactAction(
  contactId: string,
  data: { name: string; email: string; company: string }
) {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("contacts")
    .update({
      name: data.name || null,
      email: data.email || null,
      company: data.company || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);

  if (error) {
    throw new Error(`Error updating contact: ${error.message}`);
  }

  safeRevalidate("/dashboard/conversaciones");
  return { success: true };
}

export async function markConversationReadAction(conversationId: string) {
  const supabase = await createSessionClient();
  await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);

  return { success: true };
}

export async function sendManualMessageAction(
  conversationId: string,
  contactPhone: string,
  text: string
) {
  if (!text.trim()) {
    return { error: "El mensaje no puede estar vacío." };
  }

  const supabase = await createSessionClient();

  // 1. Validar ventana de 24 horas
  const { data: conv } = await supabase
    .from("conversations")
    .select("last_inbound_at")
    .eq("id", conversationId)
    .single();

  if (!conv || !conv.last_inbound_at) {
    return { error: "No hay registro de interacción entrante para este contacto." };
  }

  const lastInboundMs = new Date(conv.last_inbound_at).getTime();
  const nowMs = Date.now();
  const diffHours = (nowMs - lastInboundMs) / (1000 * 60 * 60);

  if (diffHours >= 24) {
    return {
      error:
        "La ventana de 24 h está cerrada. Fuera de la ventana solo se pueden enviar plantillas aprobadas.",
    };
  }

  // 2. Enviar mensaje por WhatsApp
  const sent = await sendWhatsAppText(contactPhone, text);

  // 3. Guardar en base de datos con sender = human
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    wamid: sent.messageId,
    direction: "out",
    sender: "human",
    type: "text",
    body: text,
    status: "sent",
  });

  // 4. Apagar automáticamente el bot en esta conversación
  await supabase
    .from("conversations")
    .update({
      bot_enabled: false,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  safeRevalidate("/dashboard/conversaciones");
  return { success: true, messageId: sent.messageId };
}

export async function getMediaSignedUrl(storagePath: string): Promise<string | null> {
  // Las URLs firmadas usan el cliente admin para garantizar lectura segura de Storage
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("media")
    .createSignedUrl(storagePath, 60 * 60); // 1 hora de validez

  if (error || !data) return null;
  return data.signedUrl;
}

export async function moveLeadStageAction(leadId: string, toStageId: string) {
  const supabase = await createSessionClient();

  const { data: currentLead, error: leadError } = await supabase
    .from("leads")
    .select("id, stage_id")
    .eq("id", leadId)
    .single();

  if (leadError || !currentLead) {
    throw new Error(`Lead no encontrado: ${leadError?.message || leadId}`);
  }

  const oldStageId = currentLead.stage_id;
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      stage_id: toStageId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (updateError) {
    throw new Error(`Error actualizando etapa del lead: ${updateError.message}`);
  }

  // Registrar evento de auditoría
  await supabase.from("lead_events").insert({
    lead_id: leadId,
    type: "stage_change",
    from_stage_id: oldStageId,
    to_stage_id: toStageId,
    actor: "human",
    payload: { note: "Movimiento manual en el tablero Kanban" } as unknown as Json,
  });

  safeRevalidate("/dashboard/pipeline");
  return { success: true };
}

export async function updateLeadDetailsAction(
  leadId: string,
  data: {
    service_interest?: string | null;
    invoices_per_month?: number | null;
    suggested_plan?: string | null;
    temperature?: "caliente" | "tibio" | "frío" | null;
    summary?: string | null;
    owner?: string | null;
  }
) {
  const supabase = await createSessionClient();

  const updates: Database["public"]["Tables"]["leads"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (data.service_interest !== undefined) updates.service_interest = data.service_interest;
  if (data.invoices_per_month !== undefined) updates.invoices_per_month = data.invoices_per_month;
  if (data.suggested_plan !== undefined) updates.suggested_plan = data.suggested_plan;
  if (data.temperature !== undefined) updates.temperature = data.temperature;
  if (data.summary !== undefined) updates.summary = data.summary;
  if (data.owner !== undefined) updates.owner = data.owner;

  const { error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", leadId);

  if (error) {
    throw new Error(`Error actualizando datos del lead: ${error.message}`);
  }

  await supabase.from("lead_events").insert({
    lead_id: leadId,
    type: "lead_updated",
    actor: "human",
    payload: data as unknown as Json,
  });

  safeRevalidate("/dashboard/pipeline");
  return { success: true };
}

export async function markAppointmentAttendanceAction(
  appointmentId: string,
  status: "attended" | "no_show"
) {
  const supabase = await createSessionClient();

  // 1. Actualizar estado de la cita
  const { data: appointment, error: appError } = await supabase
    .from("appointments")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId)
    .select("id, contact_id")
    .single();

  if (appError || !appointment) {
    throw new Error(`Error actualizando cita: ${appError?.message || appointmentId}`);
  }

  // 2. Buscar lead asociado al contacto
  const { data: lead } = await supabase
    .from("leads")
    .select("id, stage_id")
    .eq("contact_id", appointment.contact_id)
    .single();

  if (lead) {
    if (status === "attended") {
      // Mover lead a etapa "asistio"
      const { data: stages } = await supabase
        .from("pipeline_stages")
        .select("id, key");
      const asistioStage = stages?.find((s) => s.key === "asistio");

      if (asistioStage && lead.stage_id !== asistioStage.id) {
        await supabase
          .from("leads")
          .update({
            stage_id: asistioStage.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id);

        await supabase.from("lead_events").insert({
          lead_id: lead.id,
          type: "stage_change",
          from_stage_id: lead.stage_id,
          to_stage_id: asistioStage.id,
          actor: "human",
          payload: { appointment_id: appointmentId, reason: "Asistencia confirmada a la cita" } as unknown as Json,
        });
      }
    } else {
      // Registrar evento de inasistencia
      await supabase.from("lead_events").insert({
        lead_id: lead.id,
        type: "appointment_missed",
        actor: "human",
        payload: { appointment_id: appointmentId, status: "no_show" } as unknown as Json,
      });
    }
  }

  safeRevalidate("/dashboard/agenda");
  safeRevalidate("/dashboard/pipeline");
  return { success: true };
}

export async function sendTemplateMessageAction(
  contactId: string,
  templateName: string,
  languageCode: string,
  variables: string[],
  category: string
) {
  const supabase = await createSessionClient();

  // 1. Obtener contacto y teléfono
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, wa_id, name")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return { error: `Contacto no encontrado: ${contactError?.message || contactId}` };
  }

  // 2. Obtener o crear conversación
  let { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .single();

  if (!conversation) {
    const { data: newConv } = await supabase
      .from("conversations")
      .insert({ contact_id: contactId })
      .select("id")
      .single();
    conversation = newConv;
  }

  if (!conversation) {
    return { error: "No se pudo obtener o crear la conversación para este contacto." };
  }

  // 3. Preparar componentes de plantilla
  const components: Record<string, unknown>[] = [];
  if (variables.length > 0) {
    components.push({
      type: "body",
      parameters: variables.map((v) => ({
        type: "text",
        text: v,
      })),
    });
  }

  // 4. Enviar mediante WhatsApp Cloud API
  const sent = await sendWhatsAppTemplate(
    contact.wa_id,
    templateName,
    languageCode,
    components
  );

  const previewBody = `[Plantilla: ${templateName}] ${variables.join(" | ")}`.trim();

  // 5. Guardar en messages
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    wamid: sent.messageId,
    direction: "out",
    sender: "human",
    type: "text",
    body: previewBody,
    status: "sent",
  });

  // 6. Actualizar conversación (apagar bot y actualizar timestamp)
  await supabase
    .from("conversations")
    .update({
      bot_enabled: false,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);

  // 7. Registrar evento en el lead si existe
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("contact_id", contactId)
    .single();

  if (lead) {
    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      type: "template_sent",
      actor: "human",
      payload: {
        template_name: templateName,
        category,
        variables,
      } as unknown as Json,
    });
  }

  safeRevalidate("/dashboard/pipeline");
  safeRevalidate("/dashboard/conversaciones");
  return { success: true, messageId: sent.messageId };
}

export async function getTemplatesAction(): Promise<WhatsAppTemplate[]> {
  return listApprovedTemplates();
}
