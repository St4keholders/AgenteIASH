import { createAdminClient } from "@/lib/supabase/server";
import { AgendaContainer, type AgendaAppointmentItem } from "@/components/dashboard/agenda/AgendaContainer";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const supabase = createAdminClient();

  const { data: appointmentsData } = await supabase
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

  const initialAppointments = (appointmentsData || []) as unknown as AgendaAppointmentItem[];

  return <AgendaContainer initialAppointments={initialAppointments} />;
}
