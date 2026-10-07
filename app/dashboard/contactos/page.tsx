import { createSessionClient } from "@/lib/supabase/server";
import { ContactsContainer, ContactRowItem } from "@/components/dashboard/contactos/ContactsContainer";

export const dynamic = "force-dynamic";

export default async function ContactosPage() {
  const supabase = await createSessionClient();

  // 1. Obtener contactos ordenados por última actualización
  const { data: contacts, error: contactsErr } = await supabase
    .from("contacts")
    .select(`
      id,
      name,
      username,
      phone,
      bsuid,
      wa_id,
      email,
      company,
      created_at,
      updated_at
    `)
    .order("updated_at", { ascending: false });

  if (contactsErr) {
    console.error("Error cargando contactos:", contactsErr);
  }

  const contactList = contacts || [];

  // 2. Obtener conversaciones por contact_id
  const { data: convs, error: convsErr } = await supabase
    .from("conversations")
    .select("id, contact_id, last_message_at, status");

  if (convsErr) {
    console.error("Error cargando conversaciones:", convsErr);
  }

  // Mapeo de conversaciones por contacto
  const convByContact = new Map<string, Array<{ id: string; last_message_at: string | null }>>();
  (convs || []).forEach((c) => {
    const list = convByContact.get(c.contact_id) || [];
    list.push(c);
    convByContact.set(c.contact_id, list);
  });

  // 3. Obtener leads por contact_id
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, contact_id, stage_id, pipeline_stages(name)");

  if (leadsErr) {
    console.error("Error cargando leads:", leadsErr);
  }

  const leadByContact = new Map<string, { id: string; stage_name: string | null }>();
  (leads || []).forEach((l) => {
    leadByContact.set(l.contact_id, {
      id: l.id,
      stage_name: (l.pipeline_stages as { name: string } | null)?.name || null,
    });
  });

  // 4. Obtener el último mensaje de cada conversación
  const convIds = (convs || []).map((c) => c.id);
  const lastMsgByConv = new Map<string, { body: string | null; transcript: string | null; created_at: string }>();

  if (convIds.length > 0) {
    // Obtenemos los mensajes más recientes
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, body, transcript, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false });

    if (msgs) {
      for (const m of msgs) {
        if (!lastMsgByConv.has(m.conversation_id)) {
          lastMsgByConv.set(m.conversation_id, {
            body: m.body,
            transcript: m.transcript,
            created_at: m.created_at,
          });
        }
      }
    }
  }

  // 5. Construir los items finales
  const initialContacts: ContactRowItem[] = contactList.map((c) => {
    const userConvs = convByContact.get(c.id) || [];
    const lead = leadByContact.get(c.id);

    // Seleccionar conversación principal (la de mayor last_message_at o primera)
    const primaryConv = userConvs[0] || null;
    const lastMsg = primaryConv ? lastMsgByConv.get(primaryConv.id) || null : null;

    return {
      id: c.id,
      name: c.name,
      username: c.username,
      phone: c.phone,
      bsuid: c.bsuid,
      wa_id: c.wa_id,
      email: c.email,
      company: c.company,
      created_at: c.created_at,
      updated_at: c.updated_at,
      conversation_count: userConvs.length,
      conversation_id: primaryConv?.id || null,
      lead_id: lead?.id || null,
      lead_stage: lead?.stage_name || null,
      last_message: lastMsg,
    };
  });

  return <ContactsContainer initialContacts={initialContacts} />;
}
