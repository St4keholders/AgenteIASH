"use server";

import type { Json, Database } from "@/lib/database.types";
import { createSessionClient, createAdminClient } from "@/lib/supabase/server";
import {
  sendToContact,
  listApprovedTemplates,
  type WhatsAppTemplate,
} from "@/lib/whatsapp/client";
import {
  AgentConfigZodSchema,
  type AgentConfigData,
  buildSystemPrompt,
} from "@/lib/agent/prompt";
import {
  runAgentSimulation,
  type SimulationMessage,
  type AgentRunResult,
} from "@/lib/agent/runner";
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
  data: {
    name?: string | null;
    username?: string | null;
    phone?: string | null;
    email?: string | null;
    company?: string | null;
  }
) {
  const supabase = await createSessionClient();
  const updatePayload: Database["public"]["Tables"]["contacts"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (data.name !== undefined) updatePayload.name = data.name || null;
  if (data.username !== undefined) updatePayload.username = data.username || null;
  if (data.phone !== undefined) updatePayload.phone = data.phone || null;
  if (data.email !== undefined) updatePayload.email = data.email || null;
  if (data.company !== undefined) updatePayload.company = data.company || null;

  const { error } = await supabase
    .from("contacts")
    .update(updatePayload)
    .eq("id", contactId);

  if (error) {
    throw new Error(`Error updating contact: ${error.message}`);
  }

  safeRevalidate("/dashboard/conversaciones");
  safeRevalidate("/dashboard/contactos");
  safeRevalidate("/dashboard/pipeline");
  return { success: true };
}

export async function mergeContactsAction(
  primaryContactId: string,
  secondaryContactId: string
) {
  if (!primaryContactId || !secondaryContactId) {
    return { error: "Se requieren ambos IDs de contacto para la fusión." };
  }
  if (primaryContactId === secondaryContactId) {
    return { error: "No se puede fusionar un contacto consigo mismo." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("merge_contacts", {
    p_primary_contact_id: primaryContactId,
    p_secondary_contact_id: secondaryContactId,
  });

  if (error) {
    return { error: `Error fusionando contactos: ${error.message}` };
  }

  safeRevalidate("/dashboard/contactos");
  safeRevalidate("/dashboard/conversaciones");
  safeRevalidate("/dashboard/pipeline");
  return { success: true, mergedContactId: data };
}

export async function markConversationReadAction(conversationId: string) {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Error marcando conversación como leída: ${error.message}`);
  }

  return { success: true };
}

export async function sendManualMessageAction(
  conversationId: string,
  text: string
) {
  if (!text.trim()) {
    return { error: "El mensaje no puede estar vacío." };
  }

  const supabase = await createSessionClient();

  // 1. Validar conversación y ventana de 24 horas
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, contact_id, last_inbound_at")
    .eq("id", conversationId)
    .single();

  if (convErr || !conv) {
    return { error: `Conversación no encontrada: ${convErr?.message || conversationId}` };
  }

  if (!conv.last_inbound_at) {
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

  // 2. Enviar mensaje por WhatsApp usando el identificador canónico contact_id
  const sent = await sendToContact(conv.contact_id, text);

  // 3. Guardar en base de datos con sender = human
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    wamid: sent.messageId,
    direction: "out",
    sender: "human",
    type: "text",
    body: text,
    status: "sent",
  });

  if (msgErr) {
    throw new Error(`Error guardando mensaje manual: ${msgErr.message}`);
  }

  // 4. Apagar automáticamente el bot en esta conversación
  const { error: updateErr } = await supabase
    .from("conversations")
    .update({
      bot_enabled: false,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (updateErr) {
    throw new Error(`Error actualizando conversación: ${updateErr.message}`);
  }

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

  // 1. Obtener o crear conversación única del contacto
  const { data: existingConv, error: convErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .maybeSingle();

  if (convErr) {
    return { error: `Error buscando conversación: ${convErr.message}` };
  }

  let conversation = existingConv;

  if (!conversation) {
    const { data: newConv, error: newConvErr } = await supabase
      .from("conversations")
      .insert({ contact_id: contactId })
      .select("id")
      .single();

    if (newConvErr || !newConv) {
      return { error: `No se pudo crear conversación: ${newConvErr?.message || "error desconocido"}` };
    }
    conversation = newConv;
  }

  // 2. Preparar componentes de plantilla
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

  // 3. Enviar mediante WhatsApp Cloud API usando sendToContact (discrimina to / recipient)
  const sent = await sendToContact(contactId, {
    templateName,
    languageCode,
    components,
  });

  const previewBody = `[Plantilla: ${templateName}] ${variables.join(" | ")}`.trim();

  // 4. Guardar en messages
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    wamid: sent.messageId,
    direction: "out",
    sender: "human",
    type: "text",
    body: previewBody,
    status: "sent",
  });

  if (msgErr) {
    throw new Error(`Error guardando mensaje de plantilla: ${msgErr.message}`);
  }

  // 5. Actualizar conversación (apagar bot y actualizar timestamp)
  const { error: updateErr } = await supabase
    .from("conversations")
    .update({
      bot_enabled: false,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);

  if (updateErr) {
    throw new Error(`Error actualizando conversación: ${updateErr.message}`);
  }

  // 6. Registrar evento en el lead si existe
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("contact_id", contactId)
    .maybeSingle();

  if (lead) {
    const { error: eventErr } = await supabase.from("lead_events").insert({
      lead_id: lead.id,
      type: "template_sent",
      actor: "human",
      payload: {
        template_name: templateName,
        category,
        variables,
      } as unknown as Json,
    });
    if (eventErr) {
      console.error("Error registrando evento de plantilla:", eventErr);
    }
  }

  safeRevalidate("/dashboard/pipeline");
  safeRevalidate("/dashboard/conversaciones");
  return { success: true, messageId: sent.messageId };
}

export async function getTemplatesAction(): Promise<WhatsAppTemplate[]> {
  return listApprovedTemplates();
}

export async function saveAgentDraftAction(data: AgentConfigData) {
  const parsed = AgentConfigZodSchema.safeParse(data);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Validación de configuración fallida: ${errorDetails}`);
  }

  const supabase = createAdminClient();

  // Buscar si ya existe un borrador
  const { data: existingDraft } = await supabase
    .from("agent_configs")
    .select("id, version")
    .eq("status", "draft")
    .limit(1)
    .maybeSingle();

  if (existingDraft) {
    const { error: updateErr } = await supabase
      .from("agent_configs")
      .update({
        data: parsed.data as unknown as Json,
        created_at: new Date().toISOString(),
      })
      .eq("id", existingDraft.id);

    if (updateErr) {
      throw new Error(`Error actualizando borrador: ${updateErr.message}`);
    }

    safeRevalidate("/dashboard/agente");
    return { success: true, version: existingDraft.version };
  }

  // Si no existe borrador, obtener la versión máxima
  const { data: allConfigs } = await supabase
    .from("agent_configs")
    .select("version")
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = (allConfigs?.[0]?.version ?? 0) + 1;

  const { error: insertErr } = await supabase.from("agent_configs").insert({
    version: nextVersion,
    status: "draft",
    data: parsed.data as unknown as Json,
    created_by: "Admin",
  });

  if (insertErr) {
    throw new Error(`Error creando borrador: ${insertErr.message}`);
  }

  safeRevalidate("/dashboard/agente");
  return { success: true, version: nextVersion };
}

export async function publishAgentConfigAction(data: AgentConfigData) {
  const parsed = AgentConfigZodSchema.safeParse(data);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Validación de configuración fallida: ${errorDetails}`);
  }

  const supabase = createAdminClient();

  // 1. Archivar cualquier versión publicada actual
  const { error: archiveErr } = await supabase
    .from("agent_configs")
    .update({ status: "archived" })
    .eq("status", "published");

  if (archiveErr) {
    throw new Error(`Error archivando configuración activa: ${archiveErr.message}`);
  }

  // 2. Eliminar o archivar borradores existentes
  const { error: deleteErr } = await supabase
    .from("agent_configs")
    .delete()
    .eq("status", "draft");

  if (deleteErr) {
    throw new Error(`Error limpiando borradores: ${deleteErr.message}`);
  }

  // 3. Determinar nueva versión
  const { data: maxRow } = await supabase
    .from("agent_configs")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const newVersion = (maxRow?.version ?? 0) + 1;

  // 4. Insertar versión publicada
  const { error: insertErr } = await supabase.from("agent_configs").insert({
    version: newVersion,
    status: "published",
    data: parsed.data as unknown as Json,
    created_by: "Admin",
    published_at: new Date().toISOString(),
  });

  if (insertErr) {
    throw new Error(`Error al publicar configuración: ${insertErr.message}`);
  }

  safeRevalidate("/dashboard/agente");
  return { success: true, version: newVersion };
}

export async function getAgentVersionHistoryAction() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agent_configs")
    .select("id, version, status, created_by, created_at, published_at, data")
    .order("version", { ascending: false });

  if (error) {
    throw new Error(`Error obteniendo historial: ${error.message}`);
  }

  return data ?? [];
}

export async function restoreAgentVersionAction(versionId: string) {
  const supabase = createAdminClient();
  const { data: targetRow, error } = await supabase
    .from("agent_configs")
    .select("id, version, data")
    .eq("id", versionId)
    .single();

  if (error || !targetRow) {
    throw new Error(`No se encontró la versión para restaurar: ${error?.message}`);
  }

  const parsed = AgentConfigZodSchema.safeParse(targetRow.data);
  if (!parsed.success) {
    throw new Error("La versión a restaurar contiene datos inválidos según el esquema actual.");
  }

  // Guardar como borrador activo
  await saveAgentDraftAction(parsed.data);

  safeRevalidate("/dashboard/agente");
  return { success: true, restoredVersion: targetRow.version, data: parsed.data };
}

export async function simulateAgentTurnAction(
  messages: SimulationMessage[],
  draftConfig: AgentConfigData
): Promise<AgentRunResult> {
  const parsed = AgentConfigZodSchema.safeParse(draftConfig);
  if (!parsed.success) {
    return {
      reply: "Error de configuración: Hay campos requeridos inválidos en el borrador.",
      toolCallsExecuted: [],
      latencyMs: 0,
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
    };
  }

  return runAgentSimulation(messages, parsed.data);
}

export async function getSystemPromptPreviewAction(config: AgentConfigData): Promise<string> {
  const parsed = AgentConfigZodSchema.safeParse(config);
  if (!parsed.success) {
    return "Error: La configuración actual contiene errores de validación y no se puede generar la vista previa.";
  }

  return buildSystemPrompt(parsed.data, new Date());
}

