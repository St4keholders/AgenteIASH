import OpenAI from "openai";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { getPublishedConfig, buildSystemPrompt, AgentConfigData } from "@/lib/agent/prompt";
import { AGENT_TOOLS_DEFINITIONS, executeAgentTool } from "@/lib/agent/tools";
import { withExponentialBackoff } from "@/lib/utils/retry";
import { formatError } from "@/lib/utils/format-error";
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

let mockCallCounter = 0;
async function mockChatCompletion(): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  mockCallCounter++;
  // Latencia aleatoria de 1 a 4 s (1000 a 4000 ms)
  const delayMs = Math.floor(1000 + Math.random() * 3000);
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  // Algunos 429 forzados (~14% de las llamadas iniciales para ejercitar backoff)
  if (mockCallCounter % 7 === 0) {
    const rateLimitError = Object.assign(
      new Error("Rate limit 429 reached (mocked OpenAI error)"),
      { status: 429, statusCode: 429 }
    );
    throw rateLimitError;
  }

  return {
    id: `chatcmpl-mock-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: "gpt-4o-mini",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        logprobs: null,
        message: {
          role: "assistant",
          content:
            "Hola, un gusto saludarte. Soy el asesor virtual de Stakeholders Contadores Públicos. ¿En qué podemos orientarte el día de hoy?",
          refusal: null,
        },
      },
    ],
    usage: {
      prompt_tokens: 150,
      completion_tokens: 35,
      total_tokens: 185,
    },
  };
}

export async function runAgentConversation(
  conversationId: string,
  contactId: string,
  now = new Date(),
  customConfig?: AgentConfigData, // for Phase 04 draft testing
  options?: { mockOpenAI?: boolean }
): Promise<AgentRunResult> {
  const startTime = Date.now();
  const config = getConfig();
  const supabase = createAdminClient();
  const isBrowserEnv = typeof window !== "undefined";
  const openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    dangerouslyAllowBrowser: process.env.NODE_ENV === "test" && isBrowserEnv,
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
    console.error("Error reading agent config:", formatError(err));
    // Fallback prompt if config loading fails
    systemPrompt = "Eres el asistente virtual de Stakeholders Contadores Públicos en Medellín, Colombia.";
  }

  // 1. Cargar Ficha del cliente (contacto, lead, citas, conversación)
  const [{ data: contact }, { data: lead }, { data: appointments }, { data: convData }, { count: totalMessagesCount }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id, name, username, company, email, phone, bsuid")
        .eq("id", contactId)
        .maybeSingle(),
      supabase
        .from("leads")
        .select("id, service_interest, temperature, invoices_per_month, suggested_plan, summary, pipeline_stages(name)")
        .eq("contact_id", contactId)
        .maybeSingle(),
      supabase
        .from("appointments")
        .select("id, service, start_at, modality, status")
        .eq("contact_id", contactId)
        .order("start_at", { ascending: true }),
      supabase
        .from("conversations")
        .select("summary")
        .eq("id", conversationId)
        .maybeSingle(),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId),
    ]);

  const appointmentsList =
    appointments && appointments.length > 0
      ? appointments
          .map(
            (a) =>
              `  - [ID: ${a.id}] ${a.service} | ${a.start_at} | ${a.modality} | Estado: ${a.status}`
          )
          .join("\n")
      : "  - Ninguna cita registrada.";

  const clientSheet = `
==================================================
FICHA DEL CLIENTE (FUENTE ÚNICA DE VERDAD):
- Nombre: ${contact?.name || "No registrado"}
- Username: ${contact?.username ? "@" + contact.username : "No registrado"}
- Empresa: ${contact?.company || "No registrada"}
- Correo: ${contact?.email || "No registrado"}
- Teléfono / ID: ${contact?.phone || contact?.bsuid || "No registrado"}
- Etapa del lead: ${(lead?.pipeline_stages as { name: string } | null)?.name || "Nuevo"}
- Servicio de interés: ${lead?.service_interest || "No especificado"}
- Facturas por mes: ${lead?.invoices_per_month ?? "No especificado"}
- Plan sugerido: ${lead?.suggested_plan || "No especificado"}
- Temperatura: ${lead?.temperature || "No evaluada"}
- Resumen del lead: ${lead?.summary || "Sin resumen previo"}
- Citas (próximas y pasadas):
${appointmentsList}
==================================================
INSTRUCCIÓN ESTRICTA SOBRE LA FICHA:
NUNCA vuelvas a pedir al usuario un dato que ya se encuentre en esta Ficha del cliente. Utilízalo directamente para responder y contextualizar.
==================================================
`;

  // 2. Resumen acumulado si la conversación supera 40 mensajes
  let cumulativeSummary = convData?.summary || "";
  const useMock = options?.mockOpenAI ?? (process.env.MOCK_OPENAI === "true");

  if ((totalMessagesCount || 0) > 40 && !useMock && !config.OPENAI_API_KEY.startsWith("mock-")) {
    try {
      const { data: olderMessages } = await supabase
        .from("messages")
        .select("sender, body, transcript")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit((totalMessagesCount || 0) - 20);

      if (olderMessages && olderMessages.length > 0) {
        const conversationText = olderMessages
          .map((m) => `${m.sender}: ${m.transcript || m.body}`)
          .join("\n");

        const summaryCompletion = await openai.chat.completions.create({
          model: config.OPENAI_MODEL,
          messages: [
            {
              role: "system",
              content:
                "Sintetiza de forma muy concisa los temas tratados, necesidades del cliente y acuerdos de esta conversación contable:",
            },
            { role: "user", content: conversationText },
          ],
          temperature: 0.2,
          max_tokens: 250,
        });

        const generatedSummary = summaryCompletion.choices[0]?.message?.content?.trim();
        if (generatedSummary) {
          cumulativeSummary = generatedSummary;
          await supabase
            .from("conversations")
            .update({ summary: generatedSummary })
            .eq("id", conversationId);
        }
      }
    } catch (sumErr) {
      console.warn("Could not generate cumulative conversation summary:", sumErr);
    }
  }

  const summaryBlock = cumulativeSummary
    ? `
==================================================
RESUMEN ACUMULADO DE CONVERSACIONES ANTERIORES:
${cumulativeSummary}
==================================================
`
    : "";

  // 3. Cargar últimos 40 mensajes (orden descendente, limit 40, luego invertir a cronológico)
  const { data: dbMessages } = await supabase
    .from("messages")
    .select("sender, direction, body, transcript, type, created_at, received_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(40);

  const chronologicalMessages = (dbMessages || []).slice().reverse();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: `${systemPrompt}\n${clientSheet}${summaryBlock}` },
  ];

  for (const msg of chronologicalMessages) {
    const content = msg.transcript || msg.body;
    if (!content) continue;

    if (msg.direction === "in" || msg.sender === "contact") {
      messages.push({ role: "user", content });
    } else if (msg.direction === "out" && msg.sender === "bot") {
      messages.push({ role: "assistant", content });
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

      const completion = await withExponentialBackoff<OpenAI.Chat.Completions.ChatCompletion>(
        () => {
          if (useMock) {
            return mockChatCompletion();
          }
          return openai.chat.completions.create({
            model: config.OPENAI_MODEL,
            messages,
            tools: AGENT_TOOLS_DEFINITIONS,
            tool_choice: "auto",
            temperature: 0.2,
          });
        },
        { maxRetries: 3, baseDelayMs: 600 }
      );

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
    console.error("Agent execution error:", formatError(error));

    const errorMessage = formatError(error);
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

export interface SimulationMessage {
  role: "user" | "assistant";
  content: string;
}

export async function runAgentSimulation(
  simMessages: SimulationMessage[],
  draftConfig: AgentConfigData,
  now = new Date()
): Promise<AgentRunResult> {
  const startTime = Date.now();
  const config = getConfig();
  const supabase = createAdminClient();
  const isBrowserEnv = typeof window !== "undefined";
  const openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    dangerouslyAllowBrowser: process.env.NODE_ENV === "test" && isBrowserEnv,
  });

  const systemPrompt = buildSystemPrompt(draftConfig, now);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...simMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const executedTools: Array<{ tool: string; args: Record<string, unknown>; result: Record<string, unknown> }> = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let finalReply = "";
  let loopCount = 0;
  const maxLoops = 5;

  try {
    while (loopCount < maxLoops) {
      loopCount++;

      const completion = await withExponentialBackoff(
        () =>
          openai.chat.completions.create({
            model: config.OPENAI_MODEL,
            messages,
            tools: AGENT_TOOLS_DEFINITIONS,
            tool_choice: "auto",
            temperature: 0.2,
          }),
        { maxRetries: 3, baseDelayMs: 600 }
      );

      if (completion.usage) {
        totalTokensIn += completion.usage.prompt_tokens || 0;
        totalTokensOut += completion.usage.completion_tokens || 0;
      }

      const responseMessage = completion.choices[0]?.message;
      if (!responseMessage) break;

      messages.push(responseMessage);

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
            {
              contactId: "SIMULATED-CONTACT",
              conversationId: "SIMULATED-CONVERSATION",
              supabase,
              dryRun: true,
              agentConfig: draftConfig,
            }
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
        finalReply = responseMessage.content || "";
        break;
      }
    }

    if (!finalReply) {
      finalReply = "Entendido. ¿En qué más puedo colaborarle?";
    }

    const latencyMs = Date.now() - startTime;
    return {
      reply: finalReply,
      toolCallsExecuted: executedTools,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      latencyMs,
    };
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Error desconocido en simulación";
    return {
      reply: "Disculpe, ocurrió un error en la simulación del asistente.",
      toolCallsExecuted: executedTools,
      latencyMs,
      error: errorMessage,
    };
  }
}

