"use client";

import { useState, useEffect, useRef } from "react";
import { formatTimeBogota } from "@/lib/calendar/availability";
import { sendManualMessageAction } from "@/app/dashboard/actions";
import { ChevronDown, ChevronUp, Image as ImageIcon } from "lucide-react";

export interface MessageItem {
  id: string;
  conversation_id: string;
  wamid: string | null;
  direction: "in" | "out";
  sender: "contact" | "bot" | "human" | "system";
  type: string;
  body: string | null;
  transcript: string | null;
  storage_path: string | null;
  status: "sent" | "delivered" | "read" | "failed";
  created_at: string;
}

interface MessageThreadProps {
  conversationId: string;
  contactName: string;
  contactPhone: string;
  lastInboundAt: string | null;
  messages: MessageItem[];
  onMessageSent?: () => void;
}

export function MessageThread({
  conversationId,
  contactName,
  contactPhone,
  lastInboundAt,
  messages,
  onMessageSent,
}: MessageThreadProps) {
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedTranscripts, setExpandedTranscripts] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Calcular estado de la ventana de 24 horas
  const windowStatus = get24HourWindowStatus(lastInboundAt);

  // Auto-scroll al final en nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages.length]);

  function toggleTranscript(msgId: string) {
    setExpandedTranscripts((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!inputText.trim() || sending || !windowStatus.isOpen) return;

    setSending(true);
    try {
      const res = await sendManualMessageAction(
        conversationId,
        contactPhone,
        inputText.trim()
      );
      if (res?.success) {
        setInputText("");
        onMessageSent?.();
      } else if (res?.error) {
        alert(res.error);
      }
    } catch (err) {
      console.error("Error sending manual message:", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white min-w-0 border-r border-[#E5E5E5]">
      {/* Cabecera del chat */}
      <div className="h-14 px-5 border-b border-[#E5E5E5] flex items-center justify-between bg-white shrink-0">
        <div>
          <h2 className="text-[14px] font-semibold text-[#0A0A0A]">
            {contactName || contactPhone}
          </h2>
          <p className="text-[12px] text-[#525252]">{contactPhone}</p>
        </div>

        <div>
          {windowStatus.isOpen ? (
            <span className="text-[12px] font-medium px-2 py-0.5 rounded-[6px] bg-[#F0FDF4] text-[#15803D] border border-[#DCFCE7]">
              Ventana 24 h activa ({windowStatus.remainingFormatted})
            </span>
          ) : (
            <span className="text-[12px] font-medium px-2 py-0.5 rounded-[6px] bg-[#FEF2F2] text-[#B91C1C] border border-[#FEE2E2]">
              Ventana de 24 h cerrada
            </span>
          )}
        </div>
      </div>

      {/* Lista de mensajes */}
      <div
        ref={scrollContainerRef}
        className="flex-1 p-5 overflow-y-auto space-y-3 bg-white"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[13px] text-[#A3A3A3]">
            No hay mensajes en esta conversación.
          </div>
        ) : (
          messages.map((msg) => {
            const isOut = msg.direction === "out";
            const senderLabel =
              msg.sender === "bot"
                ? "Bot"
                : msg.sender === "human"
                ? "Asesor"
                : "Cliente";

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  isOut ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[70%] rounded-[6px] p-3 text-[13px] leading-relaxed border ${
                    isOut
                      ? "bg-white text-[#0A0A0A] border-[#E5E5E5]"
                      : "bg-[#FAFAFA] text-[#0A0A0A] border-[#E5E5E5]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1 text-[11px] font-medium text-[#A3A3A3]">
                    <span>{senderLabel}</span>
                    <span className="tabular-nums">
                      {formatTimeBogota(new Date(msg.created_at))}
                    </span>
                  </div>

                  {/* Mensaje de texto */}
                  {msg.body && <p className="whitespace-pre-wrap">{msg.body}</p>}

                  {/* Mensaje de audio */}
                  {msg.type === "audio" && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2 text-[12px] text-[#525252]">
                        <span>Nota de voz</span>
                      </div>

                      {msg.transcript && (
                        <div>
                          <button
                            type="button"
                            onClick={() => toggleTranscript(msg.id)}
                            className="flex items-center gap-1 text-[11px] font-medium text-[#525252] hover:text-[#0A0A0A]"
                          >
                            <span>
                              {expandedTranscripts[msg.id]
                                ? "Ocultar transcripción"
                                : "Ver transcripción"}
                            </span>
                            {expandedTranscripts[msg.id] ? (
                              <ChevronUp size={12} strokeWidth={1.5} />
                            ) : (
                              <ChevronDown size={12} strokeWidth={1.5} />
                            )}
                          </button>

                          {expandedTranscripts[msg.id] && (
                            <p className="mt-1 p-2 rounded-[6px] bg-white border border-[#E5E5E5] text-[12px] text-[#525252] italic">
                              &ldquo;{msg.transcript}&rdquo;
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mensaje de imagen */}
                  {msg.type === "image" && (
                    <div className="mt-2 flex items-center gap-2 p-2 rounded-[6px] bg-white border border-[#E5E5E5] text-[12px] text-[#525252]">
                      <ImageIcon size={14} strokeWidth={1.5} />
                      <span>Imagen recibida</span>
                    </div>
                  )}

                  {/* Estado para mensajes salientes */}
                  {isOut && (
                    <div className="mt-1 text-right text-[10px] text-[#A3A3A3]">
                      {msg.status === "read"
                        ? "Leído"
                        : msg.status === "delivered"
                        ? "Entregado"
                        : msg.status === "sent"
                        ? "Enviado"
                        : "Fallido"}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Caja de respuesta manual */}
      <div className="p-3 border-t border-[#E5E5E5] bg-white shrink-0">
        {windowStatus.isOpen ? (
          <form onSubmit={handleSend} className="space-y-1.5">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Escribe una respuesta manual..."
                className="flex-1 h-9 px-3 text-[13px] bg-white border border-[#E5E5E5] rounded-[6px] text-[#0A0A0A] placeholder-[#A3A3A3] focus:outline-none focus:border-[#0A0A0A]"
              />
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                className="px-4 h-9 bg-[#0A0A0A] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#262626] disabled:opacity-50 transition-colors shrink-0"
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
            <p className="text-[11px] text-[#A3A3A3]">
              Al enviar una respuesta manual, el bot se apagará automáticamente en este chat.
            </p>
          </form>
        ) : (
          <div className="p-2.5 rounded-[6px] bg-[#FAFAFA] border border-[#E5E5E5] text-[12px] text-[#525252] text-center">
            La ventana de 24 h está cerrada. Solo se pueden enviar plantillas aprobadas.
          </div>
        )}
      </div>
    </div>
  );
}

function get24HourWindowStatus(lastInboundAt: string | null) {
  if (!lastInboundAt) {
    return { isOpen: false, remainingFormatted: "Cerrada" };
  }

  const lastInboundMs = new Date(lastInboundAt).getTime();
  const nowMs = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  const elapsedMs = nowMs - lastInboundMs;

  if (elapsedMs >= windowMs) {
    return { isOpen: false, remainingFormatted: "Cerrada" };
  }

  const remainingMs = windowMs - elapsedMs;
  const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  return {
    isOpen: true,
    remainingFormatted: `${remainingHours}h ${remainingMinutes}m`,
  };
}
