import OpenAI from "openai";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { getPublishedConfig, buildSystemPrompt, AgentConfigData } from "@/lib/agent/prompt";
import { AGENT_TOOLS_DEFINITIONS, executeAgentTool } from "@/lib/agent/tools";
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import type { Json } from "@/lib/database.types";

export interface AgentRunResult {
  reply: string;
  toolCallsExecuted: Array<{ tool: string; args: Record<string, unknown>; result: Record<string, unknown> }>;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
  error?: string;
}

export async function runAgentConversation(
  conversationId: string,
  contactId: string,
  now = new Date(),
  customConfig?: AgentConfigData // for Phase 04 draft testing
): Promise<AgentRunResult> {
  const startTime = Date.now();
  const config = getConfig();
  const supabase = createAdminClient();
  const openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  let configVersion = 1;
  let systemPrompt = "";

  try {
    if (customConfig) {
      systemPrompt = buildSystemPrompt(customConfig, now);
      configVersion = 999;
    } else {
      const published = await getPublishedConfig(supabase);
      configVersion = published.version;
      systemPrompt = buildSystemPrompt(published.data, now);
    }
  } catch (err: unknown) {
    console.error("Error reading agent config:", err);
    // Fallback prompt if config loading fails
    systemPrompt = "Eres el asistente virtual de Stakeholders Contadores Públicos en Medellín, Colombia.";
  }

  // Cargar últimos 30 mensajes
  const { data: dbMessages } = await supabase
    .from("messages")
    .select("sender, direction, body, transcript, type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(30);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  if (dbMessages && dbMessages.length > 0) {
    for (const msg of dbMessages) {
      const content = msg.transcript || msg.body;
      if (!content) continue;

      if (msg.direction === "in" || msg.sender === "contact") {
        messages.push({ role: "user", content });
      } else if (msg.direction === "out" && msg.sender === "bot") {
        messages.push({ role: "assistant", content });
      }
    }
  }

  const executedTools: Array<{ tool: string; args: Record<string, unknown>; result: Record<string, unknown> }> = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let finalReply = "";
  let loopCount = 0;
  const maxLoops = 5;

  try {
    while (loopCount < maxLoops) {
      loopCount++;

      const completion = await openai.chat.completions.create({
        model: config.OPENAI_MODEL,
        messages,
        tools: AGENT_TOOLS_DEFINITIONS,
        tool_choice: "auto",
        temperature: 0.2,
      });

      if (completion.usage) {
        totalTokensIn += completion.usage.prompt_tokens || 0;
        totalTokensOut += completion.usage.completion_tokens || 0;
      }

      const responseMessage = completion.choices[0]?.message;
      if (!responseMessage) break;

      messages.push(responseMessage);

      // Si el modelo solicitó llamar herramientas
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.type !== "function") continue;
          const fn = toolCall.function;
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(fn.arguments);
          } catch {
            parsedArgs = {};
          }

          const toolResult = await executeAgentTool(
            fn.name,
            parsedArgs,
            { contactId, conversationId, supabase }
          );

          executedTools.push({
            tool: fn.name,
            args: parsedArgs,
            result: toolResult,
          });

          const toolMessage: ChatCompletionToolMessageParam = {
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          };
          messages.push(toolMessage);
        }
      } else {
        // Respuesta final de texto
        finalReply = responseMessage.content || "";
        break;
      }
    }

    if (!finalReply) {
      finalReply = "Con gusto. ¿En qué más te puedo colaborar el día de hoy?";
    }

    const latencyMs = Date.now() - startTime;

    // Registrar ejecución en agent_runs
    await supabase.from("agent_runs").insert({
      conversation_id: conversationId,
      config_version: configVersion,
      input: { message_count: messages.length },
      output: finalReply,
      tool_calls: executedTools as unknown as Json,
      tokens_in: totalTokensIn,
      tokens_out: totalTokensOut,
      latency_ms: latencyMs,
    });

    return {
      reply: finalReply,
      toolCallsExecuted: executedTools,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      latencyMs,
    };
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;
    console.error("Agent execution error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const fallbackReply =
      "Hola, experimenté una breve interrupción en mi sistema. Ya tomé nota de tu consulta y un asesor del equipo se comunicará contigo lo antes posible.";

    await supabase.from("agent_runs").insert({
      conversation_id: conversationId,
      config_version: configVersion,
      input: { message_count: messages.length },
      output: fallbackReply,
      tool_calls: executedTools as unknown as Json,
      error: errorMessage,
      latency_ms: latencyMs,
    });

    return {
      reply: fallbackReply,
      toolCallsExecuted: executedTools,
      latencyMs,
      error: errorMessage,
    };
  }
}
