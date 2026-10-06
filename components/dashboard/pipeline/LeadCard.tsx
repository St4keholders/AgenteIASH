"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, Clock, MessageSquare } from "lucide-react";

export interface PipelineLeadItem {
  id: string;
  contact_id: string;
  stage_id: string | null;
  service_interest: string | null;
  invoices_per_month: number | null;
  suggested_plan: string | null;
  temperature: string | null;
  summary: string | null;
  owner: string | null;
  created_at: string;
  updated_at: string;
  contact: {
    id: string;
    wa_id: string;
    name: string | null;
    email: string | null;
    company: string | null;
  };
  conversation?: {
    id: string;
    last_inbound_at: string | null;
    last_message_at: string | null;
    needs_human: boolean;
    bot_enabled: boolean;
  } | null;
  nextAppointment?: {
    id: string;
    start_at: string;
    service: string;
    status: string;
    modality: string;
    meet_link: string | null;
  } | null;
}

interface LeadCardProps {
  lead: PipelineLeadItem;
  onClick: (lead: PipelineLeadItem) => void;
  onContactClick: (lead: PipelineLeadItem) => void;
}

export function LeadCard({ lead, onClick, onContactClick }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const displayName = lead.contact.name || lead.contact.wa_id;

  // Temperatura discreta
  const tempBadge = () => {
    if (lead.temperature === "caliente") {
      return (
        <span className="px-1.5 py-0.5 rounded-[6px] text-[10px] font-medium bg-[#FEF2F2] text-[#B91C1C] border border-[#FCA5A5]">
          Caliente
        </span>
      );
    }
    if (lead.temperature === "tibio") {
      return (
        <span className="px-1.5 py-0.5 rounded-[6px] text-[10px] font-medium bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]">
          Tibio
        </span>
      );
    }
    if (lead.temperature === "frío") {
      return (
        <span className="px-1.5 py-0.5 rounded-[6px] text-[10px] font-medium bg-[#F4F4F5] text-[#525252] border border-[#E4E4E7]">
          Frío
        </span>
      );
    }
    return null;
  };

  // Formato de última interacción (puro)
  const formatTimeSince = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  };

  const timeAgo = formatTimeSince(lead.conversation?.last_inbound_at || lead.conversation?.last_message_at);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="p-3 bg-white border border-[#E5E5E5] rounded-[6px] hover:border-[#0A0A0A] transition-colors cursor-pointer select-none space-y-2 group"
      onClick={() => onClick(lead)}
    >
      <div className="flex items-start justify-between gap-1">
        <div {...attributes} {...listeners} className="flex-1 cursor-grab active:cursor-grabbing">
          <h4 className="text-[13px] font-medium text-[#0A0A0A] truncate">
            {displayName}
          </h4>
          {lead.contact.company && (
            <p className="text-[11px] text-[#525252] truncate">
              {lead.contact.company}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {tempBadge()}
        </div>
      </div>

      {lead.service_interest && (
        <p className="text-[12px] text-[#525252] line-clamp-1">
          {lead.service_interest}
        </p>
      )}

      {lead.nextAppointment && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#0A0A0A] bg-[#FAFAFA] px-2 py-1 rounded-[6px] border border-[#E5E5E5]">
          <Calendar className="w-3.5 h-3.5 text-[#525252] shrink-0" />
          <span className="truncate">
            {new Date(lead.nextAppointment.start_at).toLocaleDateString("es-CO", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-[#F5F5F5] text-[11px] text-[#A3A3A3]">
        <div className="flex items-center gap-1">
          {timeAgo && (
            <span className="flex items-center gap-1" title="Última interacción">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onContactClick(lead);
          }}
          className="px-2 py-0.5 text-[11px] font-medium text-[#0A0A0A] bg-[#FAFAFA] hover:bg-[#E5E5E5] rounded-[6px] border border-[#E5E5E5] transition-colors flex items-center gap-1"
        >
          <MessageSquare className="w-3 h-3" />
          Contactar
        </button>
      </div>
    </div>
  );
}
