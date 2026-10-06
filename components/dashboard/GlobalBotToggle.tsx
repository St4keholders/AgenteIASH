"use client";

import { useState } from "react";
import { toggleGlobalBotAction } from "@/app/dashboard/actions";

interface GlobalBotToggleProps {
  initialEnabled: boolean;
}

export function GlobalBotToggle({ initialEnabled }: GlobalBotToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleToggleClick() {
    if (enabled) {
      // Pedir confirmación al apagarlo
      setShowConfirm(true);
    } else {
      await updateStatus(true);
    }
  }

  async function updateStatus(newStatus: boolean) {
    setLoading(true);
    try {
      await toggleGlobalBotAction(newStatus);
      setEnabled(newStatus);
    } catch (err) {
      console.error("Error toggling global bot:", err);
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-medium text-[#525252]">
          Bot global:
        </span>
        <button
          type="button"
          onClick={handleToggleClick}
          disabled={loading}
          aria-pressed={enabled}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
            enabled ? "bg-[#0A0A0A]" : "bg-[#E5E5E5]"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-4" : "translate-x-1"
            }`}
          />
        </button>
        <span
          className={`text-[12px] font-medium px-2 py-0.5 rounded-[6px] ${
            enabled
              ? "text-[#15803D] bg-[#F0FDF4]"
              : "text-[#B91C1C] bg-[#FEF2F2]"
          }`}
        >
          {enabled ? "Activo" : "Pausado"}
        </span>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-[400px] p-6 bg-white border border-[#E5E5E5] rounded-[6px] shadow-sm">
            <h3 className="text-[16px] font-semibold text-[#0A0A0A]">
              ¿Pausar el bot de forma global?
            </h3>
            <p className="text-[13px] text-[#525252] mt-2 leading-relaxed">
              Al desactivarlo, el bot dejará de responder automáticamente a todas las
              conversaciones entrantes de WhatsApp. Los mensajes se guardarán pero
              requerirán atención humana.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 text-[13px] font-medium text-[#525252] hover:bg-[#FAFAFA] rounded-[6px] border border-[#E5E5E5]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => updateStatus(false)}
                className="px-3 py-1.5 text-[13px] font-medium text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-[6px]"
              >
                Confirmar y pausar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
