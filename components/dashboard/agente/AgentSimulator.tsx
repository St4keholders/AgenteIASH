"use client";

import { useState } from "react";
import type { AgentConfigData } from "@/lib/agent/prompt";
import type { SimulationMessage } from "@/lib/agent/runner";
import { simulateAgentTurnAction } from "@/app/dashboard/actions";

interface ToolCallItem {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallItem[];
  latencyMs?: number;
}

interface AgentSimulatorProps {
  draftConfig: AgentConfigData;
}

export function AgentSimulator({ draftConfig }: AgentSimulatorProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [openToolsMsgId, setOpenToolsMsgId] = useState<string | null>(null);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputValue.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: text,
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputValue("");
    setIsLoading(true);

    try {
      const payloadMessages: SimulationMessage[] = newHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await simulateAgentTurnAction(payloadMessages, draftConfig);

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: "assistant",
        content: res.reply,
        toolCalls: res.toolCallsExecuted,
        latencyMs: res.latencyMs,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "Error al simular la respuesta del agente. Verifica la conexión y configuración.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setOpenToolsMsgId(null);
    setInputValue("");
  };

  return (
    <div className="flex flex-col h-full bg-white border border-[#E5E5E5] rounded-[6px] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E5E5] bg-[#FAFAFA]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#0A0A0A]">
              Probador del Agente
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-[4px] bg-[#E0E7FF] text-[#3730A3]">
              Simulación
            </span>
          </div>
          <p className="text-[11px] text-[#525252] mt-0.5">
            Ejecuta el borrador actual sin escribir en Google Calendar ni leads.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="text-[12px] font-medium text-[#525252] hover:text-[#0A0A0A] px-2.5 py-1 border border-[#E5E5E5] rounded-[6px] bg-white hover:bg-[#F5F5F5]"
        >
          Reiniciar prueba
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#FAFAFA]/50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#525252]">
            <p className="text-[13px] font-medium text-[#0A0A0A]">
              Inicia una conversación de prueba
            </p>
            <p className="text-[12px] mt-1 max-w-xs">
              Escribe un saludo, pregunta por tarifas de contabilidad o pide una cita para ver cómo responde el borrador.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-[6px] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    isUser
                      ? "bg-[#0A0A0A] text-white"
                      : "bg-white text-[#0A0A0A] border border-[#E5E5E5]"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {!isUser && msg.latencyMs !== undefined && (
                    <div className="text-[10px] text-[#737373] mt-1 text-right tabular-nums">
                      {msg.latencyMs} ms
                    </div>
                  )}
                </div>

                {/* Herramientas ejecutadas en este turno */}
                {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mt-1.5 w-full max-w-[85%]">
                    <button
                      onClick={() =>
                        setOpenToolsMsgId(
                          openToolsMsgId === msg.id ? null : msg.id
                        )
                      }
                      className="text-[11px] font-medium text-[#2563EB] hover:underline flex items-center gap-1"
                    >
                      <span>
                        {openToolsMsgId === msg.id ? "Ocultar" : "Ver"} herramientas llamadas ({msg.toolCalls.length})
                      </span>
                    </button>

                    {openToolsMsgId === msg.id && (
                      <div className="mt-1.5 p-2.5 bg-white border border-[#E5E5E5] rounded-[6px] text-[11px] space-y-2">
                        {msg.toolCalls.map((tc, idx) => (
                          <div key={idx} className="border-b border-[#F0F0F0] pb-2 last:border-0 last:pb-0">
                            <div className="font-semibold text-[#0A0A0A]">
                              Herramienta: {tc.tool}
                            </div>
                            <div className="text-[#525252] mt-0.5">
                              Argumentos: {JSON.stringify(tc.args)}
                            </div>
                            <div className="text-[#166534] mt-0.5">
                              Resultado: {JSON.stringify(tc.result)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-[12px] text-[#525252] p-2 bg-white border border-[#E5E5E5] rounded-[6px] max-w-xs">
            <div className="w-2 h-2 rounded-full bg-[#0A0A0A] animate-pulse" />
            <span>El asistente está respondiendo...</span>
          </div>
        )}
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSend}
        className="p-3 border-t border-[#E5E5E5] bg-white flex items-center gap-2"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Escribe un mensaje de prueba..."
          disabled={isLoading}
          className="flex-1 px-3 py-2 text-[13px] text-[#0A0A0A] bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#0A0A0A]"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading}
          className="px-3.5 py-2 text-[13px] font-medium text-white bg-[#0A0A0A] rounded-[6px] hover:bg-[#262626] disabled:opacity-50 transition-colors"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
