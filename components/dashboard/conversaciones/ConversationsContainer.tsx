"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ConversationList,
  ConversationItem,
} from "./ConversationList";
import { MessageThread, MessageItem } from "./MessageThread";
import {
  ContactDetails,
  LeadDetailsData,
  AppointmentDetailsData,
} from "./ContactDetails";
import { markConversationReadAction } from "@/app/dashboard/actions";

interface ConversationsContainerProps {
  initialConversations: ConversationItem[];
}

export function ConversationsContainer({
  initialConversations,
}: ConversationsContainerProps) {
  const [conversations, setConversations] =
    useState<ConversationItem[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id || null
  );
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [lead, setLead] = useState<LeadDetailsData | null>(null);
  const [appointments, setAppointments] = useState<AppointmentDetailsData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<
    "todas" | "sin_leer" | "requieren_humano" | "bot_apagado"
  >("todas");

  const selectedConv = conversations.find((c) => c.id === selectedId);
  const selectedIdRef = useRef<string | null>(selectedId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Cargar mensajes, lead y citas de la conversación seleccionada bajo demanda
  const reloadCurrentConversation = useCallback(async (convId: string) => {
    const supabase = createClient();
    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    if (msgs) {
      setMessages(msgs as MessageItem[]);
    }

    const { data: convData } = await supabase
      .from("conversations")
      .select("contact_id")
      .eq("id", convId)
      .maybeSingle();

    if (convData?.contact_id) {
      const [{ data: leadData }, { data: appData }] = await Promise.all([
        supabase
          .from("leads")
          .select("id, service_interest, temperature, invoices_per_month, suggested_plan, summary, pipeline_stages(name)")
          .eq("contact_id", convData.contact_id)
          .maybeSingle(),
        supabase
          .from("appointments")
          .select("id, service, start_at, modality, meet_link, status")
          .eq("contact_id", convData.contact_id)
          .order("start_at", { ascending: false }),
      ]);

      if (leadData) {
        setLead({
          id: leadData.id,
          stage_name: (leadData.pipeline_stages as { name: string } | null)?.name || "Nuevo",
          service_interest: leadData.service_interest,
          temperature: leadData.temperature,
          invoices_per_month: leadData.invoices_per_month,
          suggested_plan: leadData.suggested_plan,
          summary: leadData.summary,
        });
      } else {
        setLead(null);
      }

      if (appData) {
        setAppointments(appData as AppointmentDetailsData[]);
      }
    }
  }, []);

  // Al cambiar la conversación seleccionada: solo lectura, sin Server Actions
  useEffect(() => {
    let isCancelled = false;
    if (!selectedId) {
      return;
    }

    async function fetchOnSelect(convId: string) {
      const supabase = createClient();
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (isCancelled) return;
      if (msgs) {
        setMessages(msgs as MessageItem[]);
      }

      const { data: convData } = await supabase
        .from("conversations")
        .select("contact_id")
        .eq("id", convId)
        .maybeSingle();

      if (isCancelled) return;
      if (convData?.contact_id) {
        const [{ data: leadData }, { data: appData }] = await Promise.all([
          supabase
            .from("leads")
            .select("id, service_interest, temperature, invoices_per_month, suggested_plan, summary, pipeline_stages(name)")
            .eq("contact_id", convData.contact_id)
            .maybeSingle(),
          supabase
            .from("appointments")
            .select("id, service, start_at, modality, meet_link, status")
            .eq("contact_id", convData.contact_id)
            .order("start_at", { ascending: false }),
        ]);

        if (isCancelled) return;
        if (leadData) {
          setLead({
            id: leadData.id,
            stage_name: (leadData.pipeline_stages as { name: string } | null)?.name || "Nuevo",
            service_interest: leadData.service_interest,
            temperature: leadData.temperature,
            invoices_per_month: leadData.invoices_per_month,
            suggested_plan: leadData.suggested_plan,
            summary: leadData.summary,
          });
        } else {
          setLead(null);
        }

        if (appData) {
          setAppointments(appData as AppointmentDetailsData[]);
        }
      } else {
        setLead(null);
        setAppointments([]);
      }
    }

    void fetchOnSelect(selectedId);

    return () => {
      isCancelled = true;
    };
  }, [selectedId]);

  // Selección manual por el usuario: marca como leído solo si tiene unread_count > 0
  const handleSelectConversation = useCallback((convId: string) => {
    setSelectedId(convId);
    setConversations((prev) => {
      const target = prev.find((c) => c.id === convId);
      if (target && (target.unread_count || 0) > 0) {
        void markConversationReadAction(convId);
        return prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c));
      }
      return prev;
    });
  }, []);

  // Suscripción Realtime creada UNA sola vez y limpiada al desmontar
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as MessageItem;

          // Si es de la conversación activa en pantalla, agregar al hilo
          if (newMsg.conversation_id === selectedIdRef.current) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }

          // Actualizar fila en la lista de conversaciones y subirla al principio
          setConversations((prev) => {
            const index = prev.findIndex((c) => c.id === newMsg.conversation_id);
            if (index === -1) return prev;

            const target = { ...prev[index] };
            target.last_message_at = newMsg.created_at;
            target.last_message = {
              body: newMsg.body,
              transcript: newMsg.transcript,
              type: newMsg.type,
              created_at: newMsg.created_at,
            };

            if (newMsg.conversation_id !== selectedIdRef.current && newMsg.direction === "in") {
              target.unread_count = (target.unread_count || 0) + 1;
            }

            const updated = [...prev];
            updated.splice(index, 1);
            return [target, ...updated];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        (payload) => {
          const updatedConv = payload.new as Partial<ConversationItem>;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === updatedConv.id ? { ...c, ...updatedConv } : c
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="flex-1 flex h-[calc(100vh-56px)] overflow-hidden bg-white">
      {/* Columna 1: Lista */}
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={handleSelectConversation}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filter={filter}
        onFilterChange={setFilter}
      />

      {/* Columna 2: Hilo de mensajes */}
      {selectedConv ? (
        <MessageThread
          conversationId={selectedConv.id}
          contactName={selectedConv.contact?.name || ""}
          contactPhone={selectedConv.contact?.phone || selectedConv.contact?.wa_id || ""}
          lastInboundAt={selectedConv.last_inbound_at}
          messages={messages}
          onMessageSent={() => reloadCurrentConversation(selectedConv.id)}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-[13px] text-[#A3A3A3] border-r border-[#E5E5E5]">
          Selecciona una conversación para ver los mensajes.
        </div>
      )}

      {/* Columna 3: Ficha del contacto */}
      {selectedConv && (
        <ContactDetails
          key={selectedConv.id}
          conversationId={selectedConv.id}
          botEnabled={selectedConv.bot_enabled}
          needsHuman={selectedConv.needs_human}
          contact={selectedConv.contact}
          lead={lead}
          appointments={appointments}
          onContactUpdated={() => reloadCurrentConversation(selectedConv.id)}
          onBotToggled={(newStatus) => {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === selectedConv.id ? { ...c, bot_enabled: newStatus } : c
              )
            );
          }}
          onHumanResolved={() => {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === selectedConv.id ? { ...c, needs_human: false } : c
              )
            );
          }}
        />
      )}
    </div>
  );
}
