"use client";

import { useState } from "react";

interface PromptPreviewModalProps {
  prompt: string;
  onClose: () => void;
}

export function PromptPreviewModal({ prompt, onClose }: PromptPreviewModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-[#E5E5E5] rounded-[6px] w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5E5]">
          <div>
            <h3 className="text-[14px] font-semibold text-[#0A0A0A]">
              Vista previa del System Prompt
            </h3>
            <p className="text-[12px] text-[#525252] mt-0.5">
              System prompt final generado a partir del borrador actual (hora de Colombia inyectada).
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[13px] text-[#525252] hover:text-[#0A0A0A] px-2 py-1 border border-[#E5E5E5] rounded-[6px]"
          >
            Cerrar
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto">
          <pre className="text-[12px] leading-relaxed text-[#0A0A0A] bg-[#FAFAFA] p-4 rounded-[6px] border border-[#E5E5E5] whitespace-pre-wrap break-words select-text">
            {prompt}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#E5E5E5] bg-[#FAFAFA]">
          <span className="text-[12px] text-[#525252]">
            {prompt.length} caracteres
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-[13px] font-medium text-[#0A0A0A] bg-white border border-[#E5E5E5] rounded-[6px] hover:bg-[#F5F5F5]"
            >
              {copied ? "Copiado al portapapeles" : "Copiar prompt"}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[13px] font-medium text-white bg-[#0A0A0A] rounded-[6px] hover:bg-[#262626]"
            >
              Aceptar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
