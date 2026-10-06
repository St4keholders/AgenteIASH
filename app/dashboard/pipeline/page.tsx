import { createAdminClient } from "@/lib/supabase/server";
import { PipelineContainer } from "@/components/dashboard/pipeline/PipelineContainer";
import type { PipelineStageItem } from "@/components/dashboard/pipeline/KanbanColumn";
import type { PipelineLeadItem } from "@/components/dashboard/pipeline/LeadCard";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const supabase = createAdminClient();

  // 1. Obtener etapas del embudo ordenadas por posición
  const { data: stagesData } = await supabase
    .from("pipeline_stages")
    .select("id, key, name, position")
    .order("position", { ascending: true });

  const stages: PipelineStageItem[] = stagesData || [];

  // 2. Obtener leads con contacto
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

  // 3. Obtener citas activas para las tarjetas
  const { data: appointmentsData } = await supabase
    .from("appointments")
    .select("id, contact_id, start_at, service, status, modality, meet_link")
    .neq("status", "cancelled")
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true });

  // 4. Obtener conversaciones
  const { data: conversationsData } = await supabase
    .from("conversations")
    .select("id, contact_id, last_inbound_at, last_message_at, needs_human, bot_enabled");

  const initialLeads: PipelineLeadItem[] = (
    (leadsData || []) as unknown as Array<Omit<PipelineLeadItem, "nextAppointment" | "conversation">>
  ).map((l) => {
    const nextApp = appointmentsData?.find((a) => a.contact_id === l.contact_id) || null;
    const conv = conversationsData?.find((c) => c.contact_id === l.contact_id) || null;
    return {
      ...l,
      nextAppointment: nextApp,
      conversation: conv,
    };
  });

  return (
    <PipelineContainer
      initialStages={stages}
      initialLeads={initialLeads}
    />
  );
}
