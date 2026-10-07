"use client";

import { useState, useEffect } from "react";
import { X, AlertCircle, Send, Check } from "lucide-react";
import type { PipelineLeadItem } from "./LeadCard";
import {
  sendManualMessageAction,
  sendTemplateMessageAction,
  getTemplatesAction,
} from "@/app/dashboard/actions";
import type { WhatsAppTemplate } from "@/lib/whatsapp/client";

interface ContactModalProps {
  lead: PipelineLeadItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ContactModal({ lead, isOpen, onClose, onSuccess }: ContactModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Modo libre
  const [freeText, setFreeText] = useState("");

  // Modo plantilla
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [variables, setVariables] = useState<string[]>([]);
  const [is24hOpen, setIs24hOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !lead) return;

    const lastInbound = lead.conversation?.last_inbound_at;
    const open = lastInbound
      ? Date.now() - new Date(lastInbound).getTime() < 24 * 60 * 60 * 1000
      : false;

    void Promise.resolve().then(() => {
      setIs24hOpen(open);
    });

    if (!open) {
      void getTemplatesAction().then((tpls) => {
        setTemplates(tpls);
        if (tpls.length > 0) {
          setSelectedTemplate(tpls[0]);
          setVariables([lead.contact.name || "cliente"]);
        }
      });
    }
  }, [isOpen, lead]);

  if (!isOpen || !lead) return null;

  async function handleSendFree() {
    if (!lead || !lead.conversation) return;
    if (!freeText.trim()) {
      setError("El mensaje no puede estar vacío.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await sendManualMessageAction(
      lead.conversation.id,
      freeText.trim()
    );

    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1000);
    }
  }

  async function handleSendTemplate() {
    if (!lead || !selectedTemplate) return;

    setLoading(true);
    setError(null);

    const res = await sendTemplateMessageAction(
      lead.contact.id,
      selectedTemplate.name,
      selectedTemplate.language,
      variables,
      selectedTemplate.category
    );

    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1000);
    }
  }

  // Preview de plantilla con variables reemplazadas
  const renderTemplatePreview = () => {
    if (!selectedTemplate) return "";
    const bodyComponent = selectedTemplate.components.find((c) => c.type === "BODY") as {
      text?: string;
    };
    let text = bodyComponent?.text || "";
    variables.forEach((v, idx) => {
      text = text.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, "g"), v || `[Variable ${idx + 1}]`);
    });
    return text;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[480px] bg-white rounded-[6px] border border-[#E5E5E5] overflow-hidden flex flex-col">
        {/* Encabezado */}
        <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-[#0A0A0A]">
              Contactar a{" "}
              {lead.contact.name ||
                (!lead.contact.phone &&
                Boolean(
                  lead.contact.bsuid ||
                    (lead.contact.wa_id && !/^\+?\d+$/.test(lead.contact.wa_id))
                )
                  ? "Usuario de WhatsApp"
                  : lead.contact.wa_id)}
            </h3>
            <p className="text-[12px] text-[#525252]">
              {lead.contact.phone ||
                (lead.contact.name
                  ? `Usuario de WhatsApp (${lead.contact.name})`
                  : "Usuario de WhatsApp")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-[6px] hover:bg-[#FAFAFA] text-[#525252]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-[6px] bg-[#FEF2F2] border border-[#FCA5A5] text-[12px] text-[#B91C1C]">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-[6px] bg-[#F0FDF4] border border-[#BBF7D0] text-[12px] text-[#15803D] flex items-center gap-2">
              <Check className="w-4 h-4" />
              Mensaje enviado correctamente.
            </div>
          )}

          {is24hOpen ? (
            /* Ventana de 24 horas abierta: Mensaje libre */
            <div className="space-y-3">
              <div className="p-2.5 rounded-[6px] bg-[#FAFAFA] border border-[#E5E5E5] text-[12px] text-[#525252] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#0A0A0A] shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-[#0A0A0A]">Ventana de 24 h activa.</span> Puedes enviar un mensaje libre. Al enviarlo, el agente se apagará en esta conversación para transferir la atención al equipo humano.
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#0A0A0A] mb-1">
                  Mensaje
                </label>
                <textarea
                  rows={4}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Escribe tu mensaje para el cliente..."
                  className="w-full p-2.5 text-[13px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-[6px] border border-[#E5E5E5] text-[12px] font-medium text-[#525252] hover:bg-[#FAFAFA]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={loading || !freeText.trim()}
                  onClick={handleSendFree}
                  className="px-3 py-1.5 rounded-[6px] bg-[#0A0A0A] text-white text-[12px] font-medium hover:bg-[#262626] disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {loading ? "Enviando..." : "Enviar mensaje"}
                </button>
              </div>
            </div>
          ) : (
            /* Ventana de 24 horas cerrada: Plantillas WABA */
            <div className="space-y-3">
              <div className="p-2.5 rounded-[6px] bg-[#FFFBEB] border border-[#FDE68A] text-[12px] text-[#B45309] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Ventana de 24 h cerrada.</span> Meta prohíbe mensajes de texto libre fuera de la ventana. Debes utilizar una plantilla verificada (con costo por conversación de Meta).
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#0A0A0A] mb-1">
                  Plantilla aprobada
                </label>
                <select
                  value={selectedTemplate?.name || ""}
                  onChange={(e) => {
                    const found = templates.find((t) => t.name === e.target.value);
                    if (found) {
                      setSelectedTemplate(found);
                      setVariables([lead.contact.name || "cliente"]);
                    }
                  }}
                  className="w-full h-8 px-2.5 text-[13px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.name}>
                      {tpl.name} ({tpl.category})
                    </option>
                  ))}
                </select>
              </div>

              {selectedTemplate && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-[#525252]">Categoría:</span>
                    <span className="px-1.5 py-0.5 rounded-[6px] text-[10px] font-medium bg-[#FAFAFA] text-[#0A0A0A] border border-[#E5E5E5]">
                      {selectedTemplate.category}
                    </span>
                    <span className="text-[11px] text-[#A3A3A3]">
                      (Tarifa {selectedTemplate.category === "MARKETING" ? "Marketing" : "Utilidad"})
                    </span>
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-[#0A0A0A] mb-1">
                      Nombre del cliente (Variable 1)
                    </label>
                    <input
                      type="text"
                      value={variables[0] || ""}
                      onChange={(e) => {
                        const copy = [...variables];
                        copy[0] = e.target.value;
                        setVariables(copy);
                      }}
                      className="w-full h-8 px-2.5 text-[13px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-[#0A0A0A] mb-1">
                      Previsualización del mensaje
                    </label>
                    <div className="p-3 rounded-[6px] bg-[#FAFAFA] border border-[#E5E5E5] text-[12px] text-[#0A0A0A] whitespace-pre-wrap">
                      {renderTemplatePreview()}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-[6px] border border-[#E5E5E5] text-[12px] font-medium text-[#525252] hover:bg-[#FAFAFA]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={loading || !selectedTemplate}
                  onClick={handleSendTemplate}
                  className="px-3 py-1.5 rounded-[6px] bg-[#0A0A0A] text-white text-[12px] font-medium hover:bg-[#262626] disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {loading ? "Enviando..." : "Enviar plantilla"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
