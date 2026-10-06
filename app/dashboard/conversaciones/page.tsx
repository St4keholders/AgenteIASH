import { createSessionClient } from "@/lib/supabase/server";
import { ConversationsContainer } from "@/components/dashboard/conversaciones/ConversationsContainer";
import { ConversationItem } from "@/components/dashboard/conversaciones/ConversationList";

export const dynamic = "force-dynamic";

export default async function ConversacionesPage() {
  const supabase = await createSessionClient();

  // Cargar conversaciones ordenadas por last_message_at
  const { data: convs } = await supabase
    .from("conversations")
    .select(`
      id,
      contact_id,
      bot_enabled,
      status,
      last_inbound_at,
      last_message_at,
      unread_count,
      needs_human,
      contacts (
        id,
        wa_id,
        phone,
        name,
        email,
        company
      )
    `)
    .order("last_message_at", { ascending: false });

  const initialConversations: ConversationItem[] = [];

  if (convs) {
    for (const c of convs) {
      // Obtener el último mensaje de cada conversación
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("body, transcript, type, created_at")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const contact = c.contacts as unknown as {
        id: string;
        wa_id: string;
        phone: string | null;
        name: string | null;
        email: string | null;
        company: string | null;
      };

      initialConversations.push({
        id: c.id,
        contact_id: c.contact_id,
        bot_enabled: c.bot_enabled,
        status: c.status,
        last_inbound_at: c.last_inbound_at,
        last_message_at: c.last_message_at,
        unread_count: c.unread_count,
        needs_human: c.needs_human,
        contact: {
          id: contact?.id || c.contact_id,
          wa_id: contact?.wa_id || "",
          phone: contact?.phone || null,
          name: contact?.name || null,
          email: contact?.email || null,
          company: contact?.company || null,
        },
        last_message: lastMsg || null,
      });
    }
  }

  return <ConversationsContainer initialConversations={initialConversations} />;
}
