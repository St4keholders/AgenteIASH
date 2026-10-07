"use client";

import { useMemo } from "react";
import { formatTimeBogota } from "@/lib/calendar/availability";

export interface ConversationItem {
  id: string;
  contact_id: string;
  bot_enabled: boolean;
  status: string;
  last_inbound_at: string | null;
  last_message_at: string | null;
  unread_count: number;
  needs_human: boolean;
  contact: {
    id: string;
    wa_id: string;
    phone: string | null;
    bsuid?: string | null;
    name: string | null;
    email: string | null;
    company: string | null;
  };
  last_message?: {
    body: string | null;
    transcript: string | null;
    type: string;
    created_at: string;
  } | null;
}

interface ConversationListProps {
  conversations: ConversationItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filter: "todas" | "sin_leer" | "requieren_humano" | "bot_apagado";
  onFilterChange: (f: "todas" | "sin_leer" | "requieren_humano" | "bot_apagado") => void;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
}: ConversationListProps) {
  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      // 1. Filtro por pestaña
      if (filter === "sin_leer" && (c.unread_count || 0) === 0) return false;
      if (filter === "requieren_humano" && !c.needs_human) return false;
      if (filter === "bot_apagado" && c.bot_enabled) return false;

      // 2. Filtro por buscador
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (c.contact?.name || "").toLowerCase();
        const phone = (c.contact?.phone || "").toLowerCase();
        const bsuid = (c.contact?.bsuid || "").toLowerCase();
        const waId = (c.contact?.wa_id || "").toLowerCase();
        const isBsuidOnly = !c.contact?.phone;
        const bsuidLabel = isBsuidOnly ? "usuario de whatsapp" : "";
        const lastMsg = (c.last_message?.body || c.last_message?.transcript || "").toLowerCase();
        return (
          name.includes(q) ||
          phone.includes(q) ||
          bsuid.includes(q) ||
          waId.includes(q) ||
          bsuidLabel.includes(q) ||
          lastMsg.includes(q)
        );
      }

      return true;
    });
  }, [conversations, filter, searchQuery]);

  return (
    <div className="w-[320px] border-r border-[#E5E5E5] flex flex-col h-full bg-white shrink-0">
      {/* Buscador y Filtros */}
      <div className="p-3 border-b border-[#E5E5E5] space-y-2 bg-white">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar conversación..."
          className="w-full h-8 px-2.5 text-[13px] bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#0A0A0A] focus:bg-white"
        />

        <div className="flex gap-1 overflow-x-auto text-[12px] scrollbar-none">
          {(
            [
              { id: "todas", label: "Todas" },
              { id: "sin_leer", label: "Sin leer" },
              { id: "requieren_humano", label: "Humano" },
              { id: "bot_apagado", label: "Bot apagado" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => onFilterChange(tab.id)}
              className={`px-2 py-1 rounded-[6px] font-medium whitespace-nowrap transition-colors ${
                filter === tab.id
                  ? "bg-[#0A0A0A] text-white"
                  : "text-[#525252] hover:bg-[#FAFAFA]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de filas */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#E5E5E5]">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-[#A3A3A3]">
            No hay conversaciones que coincidan.
          </div>
        ) : (
          filtered.map((c) => {
            const isSelected = c.id === selectedId;
            const isBsuidOnly =
              !c.contact?.phone &&
              Boolean(c.contact?.bsuid || (c.contact?.wa_id && !/^\+?\d+$/.test(c.contact.wa_id)));
            const displayName =
              c.contact?.name ||
              (isBsuidOnly ? "Usuario de WhatsApp" : (c.contact?.phone || c.contact?.wa_id));
            const lastMsgText =
              c.last_message?.transcript ||
              c.last_message?.body ||
              (c.last_message?.type === "audio" ? "Nota de voz" : "Sin mensajes");

            const timeStr = c.last_message_at
              ? formatTimeBogota(new Date(c.last_message_at))
              : "";

            return (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`p-3 cursor-pointer transition-colors text-left ${
                  isSelected
                    ? "bg-[#FAFAFA]"
                    : "hover:bg-[#FAFAFA]/60 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[13px] font-medium text-[#0A0A0A] truncate">
                    {displayName}
                  </span>
                  <span className="text-[11px] text-[#A3A3A3] shrink-0 tabular-nums">
                    {timeStr}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] text-[#525252] truncate flex-1">
                    {lastMsgText}
                  </p>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.needs_human && (
                      <span className="px-1.5 py-0.2 rounded-[6px] text-[10px] font-medium bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]">
                        Humano
                      </span>
                    )}

                    {!c.bot_enabled && (
                      <span className="px-1.5 py-0.2 rounded-[6px] text-[10px] font-medium bg-[#FAFAFA] text-[#525252] border border-[#E5E5E5]">
                        Bot off
                      </span>
                    )}

                    {c.unread_count > 0 && (
                      <span className="h-4 min-w-[16px] px-1 rounded-full bg-[#0A0A0A] text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
