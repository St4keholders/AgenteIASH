"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { LeadCard, type PipelineLeadItem } from "./LeadCard";

export interface PipelineStageItem {
  id: string;
  key: string;
  name: string;
  position: number;
}

interface KanbanColumnProps {
  stage: PipelineStageItem;
  leads: PipelineLeadItem[];
  onLeadClick: (lead: PipelineLeadItem) => void;
  onContactClick: (lead: PipelineLeadItem) => void;
}

export function KanbanColumn({
  stage,
  leads,
  onLeadClick,
  onContactClick,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { stage },
  });

  return (
    <div
      ref={setNodeRef}
      className={`w-[280px] shrink-0 flex flex-col rounded-[6px] border transition-colors bg-[#FAFAFA] ${
        isOver ? "border-[#0A0A0A] bg-white" : "border-[#E5E5E5]"
      }`}
    >
      {/* Encabezado de Columna */}
      <div className="p-3 border-b border-[#E5E5E5] flex items-center justify-between bg-white rounded-t-[6px]">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-[#0A0A0A]">
            {stage.name}
          </h3>
          <span className="px-1.5 py-0.5 rounded-[6px] text-[11px] font-medium bg-[#FAFAFA] text-[#525252] border border-[#E5E5E5] tabular-nums">
            {leads.length}
          </span>
        </div>
      </div>

      {/* Contenedor de Tarjetas */}
      <div className="p-2 flex-1 overflow-y-auto space-y-2 min-h-[150px]">
        {leads.length === 0 ? (
          <div className="h-24 border border-dashed border-[#E5E5E5] rounded-[6px] flex items-center justify-center text-[12px] text-[#A3A3A3]">
            Sin leads
          </div>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={onLeadClick}
              onContactClick={onContactClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
