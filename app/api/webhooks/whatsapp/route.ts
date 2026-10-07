import { NextRequest, NextResponse, after } from "next/server";
import crypto from "crypto";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { sendToContact, downloadWhatsAppMedia } from "@/lib/whatsapp/client";
import { transcribeAudio } from "@/lib/openai/transcribe";
import { runAgentConversation } from "@/lib/agent/runner";
import { formatError } from "@/lib/utils/format-error";
import type { Json } from "@/lib/database.types";

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{
          profile?: { name?: string; username?: string };
          wa_id?: string;
          user_id?: string;
        }>;
        messages?: Array<{
          from?: string;
          from_user_id?: string;
          id: string;
          timestamp?: string;
          type: string;
          user_id?: string;
          text?: { body?: string };
          audio?: { id?: string; mime_type?: string };
          image?: { id?: string; mime_type?: string; caption?: string };
          interactive?: {
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp?: string;
          recipient_id?: string;
          recipient_user_id?: string;
          errors?: Array<unknown>;
        }>;
      };
    }>;
  }>;
}

function getCommitSha(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    "local"
  );
}

function logEvent(event: {
  evt: string;
  step?: string;
  contact_id?: string | null;
  conversation_id?: string | null;
  wamid?: string | null;
}) {
  console.log(
    JSON.stringify({
      evt: event.evt,
      commit: getCommitSha(),
      step: event.step || null,
      contact_id: event.contact_id || null,
      conversation_id: event.conversation_id || null,
      wamid: event.wamid || null,
    })
  );
}

function logError(errorData: {
  step: string;
  contact_id?: string | null;
  conversation_id?: string | null;
  wamid?: string | null;
  error: unknown;
}) {
  console.error(
    JSON.stringify({
      evt: "webhook_error",
      commit: getCommitSha(),
      step: errorData.step,
      contact_id: errorData.contact_id || null,
      conversation_id: errorData.conversation_id || null,
      wamid: errorData.wamid || null,
      error: formatError(errorData.error),
    })
  );
}

export async function GET(req: NextRequest) {
  const config = getConfig();
  const searchParams = req.nextUrl.searchParams;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === config.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const config = getConfig();
  const rawBody = await req.text();

  // 1. Validar firma HMAC SHA-256 en tiempo constante
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) {
    return new NextResponse("Missing signature header", { status: 401 });
  }

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", config.META_APP_SECRET)
    .update(rawBody)
    .digest("hex")}`;

  let isSignatureValid = false;
  try {
    isSignatureValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    isSignatureValid = false;
  }

  if (!isSignatureValid) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const mockHeader = req.headers.get("x-mock-openai");
  const isMockOpenAI =
    mockHeader === "true" ||
    (mockHeader !== "false" && process.env.MOCK_OPENAI === "true");

  // 2. Responder 200 de inmediato
  // 3. Procesar en segundo plano con after()
  try {
    after(async () => {
      try {
        await processWebhookPayload(payload, { mockOpenAI: isMockOpenAI });
      } catch (err: unknown) {
        logError({
          step: "after_background",
          error: err,
        });
      }
    });
  } catch {
    // Fuera del scope de Next / Vercel (ej: tests unitarios directos)
    void processWebhookPayload(payload, { mockOpenAI: isMockOpenAI }).catch((err: unknown) => {
      logError({
        step: "test_background",
        error: err,
      });
    });
  }

  return new NextResponse("OK", { status: 200 });
}

async function processWebhookPayload(
  payload: WhatsAppWebhookPayload,
  options?: { mockOpenAI?: boolean }
) {
  const config = getConfig();
  const supabase = createAdminClient();

  const entries = payload.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const val = change.value;
      if (!val) continue;

      // 1. Actualización de estados de mensajes salientes (sent, delivered, read, failed)
      if (val.statuses && val.statuses.length > 0) {
        const validStatuses = ["sent", "delivered", "read", "failed"];
        for (const st of val.statuses) {
          const wamid = st.id;
          const status = st.status;
          const errorMsg = st.errors ? JSON.stringify(st.errors) : null;

          if (validStatuses.includes(status)) {
            const { error: statusUpdateErr } = await supabase
              .from("messages")
              .update({
                status,
                error: errorMsg,
              })
              .eq("wamid", wamid);

            if (statusUpdateErr) {
              logError({
                step: "status_update",
                wamid,
                error: statusUpdateErr,
              });
            } else {
              logEvent({
                evt: "status_updated",
                step: "status",
                wamid,
              });
            }
          }
        }
      }

      // 2. Procesamiento de mensajes entrantes
      if (val.messages && val.messages.length > 0) {
        const conversationsToProcess = new Map<string, { contactId: string }>();

        for (const msg of val.messages) {
          const wamid = msg.id;
          logEvent({
            evt: "webhook_received",
            step: "receive",
            wamid,
          });
          const msgType = msg.type;
          const sentAt = msg.timestamp
            ? new Date(Number(msg.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          // En Meta: BSUID y teléfono
          const isPhoneStr = (s?: string | null) => {
            if (!s) return false;
            const clean = s.trim();
            return (
              /^\+?\d{6,16}$/.test(clean.replace(/[\s-]/g, "")) ||
              (clean.startsWith("TEST-") && /\d{6,16}$/.test(clean.replace(/[\s-]/g, "")))
            );
          };

          const fromStr = msg.from?.trim() || "";
          const waIdStr = val.contacts?.[0]?.wa_id?.trim() || "";

          let phone: string | null = null;
          if (isPhoneStr(fromStr)) {
            phone = fromStr;
          } else if (isPhoneStr(waIdStr)) {
            phone = waIdStr;
          }

          let effectiveBsuid: string | null = null;
          if (msg.from_user_id) {
            effectiveBsuid = msg.from_user_id.trim();
          } else if (fromStr && !isPhoneStr(fromStr)) {
            effectiveBsuid = fromStr;
          } else if (val.contacts?.[0]?.user_id) {
            effectiveBsuid = val.contacts[0].user_id.trim();
          } else if (msg.user_id) {
            effectiveBsuid = msg.user_id.trim();
          }

          if (!effectiveBsuid && !phone) {
            logError({
              step: "missing_identifiers",
              wamid,
              error: "Payload lacks both bsuid and phone identifiers",
            });
            continue;
          }

          const rawName = val.contacts?.[0]?.profile?.name?.trim();
          const name = rawName && rawName.length > 0 ? rawName : null;

          const rawUsername = val.contacts?.[0]?.profile?.username?.trim();
          const username = rawUsername && rawUsername.length > 0 ? rawUsername : null;

          // Extraer cuerpo o multimedia
          let body: string | null = null;
          let mediaId: string | null = null;

          if (msgType === "text" && msg.text?.body) {
            body = msg.text.body;
          } else if (msgType === "audio" && msg.audio?.id) {
            mediaId = msg.audio.id;
            try {
              const { buffer } = await downloadWhatsAppMedia(mediaId);
              body = await transcribeAudio(buffer);
            } catch (transcribeErr: unknown) {
              logError({
                step: "audio_transcription",
                wamid,
                error: transcribeErr,
              });
              body = "[Nota de voz no transcrita]";
            }
          } else if (msgType === "interactive") {
            body =
              msg.interactive?.button_reply?.title ||
              msg.interactive?.list_reply?.title ||
              "[Respuesta interactiva]";
          } else {
            body = `[Mensaje de tipo ${msgType}]`;
          }

          // Ingesta atómica mediante RPC en Postgres
          const { data: ingestResult, error: ingestError } = await supabase.rpc(
            "ingest_inbound_message",
            {
              p_wamid: wamid,
              p_bsuid: effectiveBsuid,
              p_phone: phone,
              p_name: name,
              p_username: username,
              p_type: msgType,
              p_body: body,
              p_media_id: mediaId,
              p_raw: msg as unknown as Json,
              p_sent_at: sentAt,
            }
          );

          if (ingestError || !ingestResult || ingestResult.length === 0) {
            logError({
              step: "ingest_rpc",
              wamid,
              error: ingestError || "No result from ingest_inbound_message",
            });
            continue;
          }

          const row = ingestResult[0];
          const contactId = row.contact_id;
          const conversationId = row.conversation_id;
          const isNew = row.is_new_message;

          logEvent({
            evt: isNew ? "message_stored" : "message_duplicate_ignored",
            step: "ingest",
            contact_id: contactId,
            conversation_id: conversationId,
            wamid,
          });

          conversationsToProcess.set(conversationId, { contactId });
        }

        // 3. Procesar concurrentemente cada conversación afectada
        await Promise.all(
          Array.from(conversationsToProcess.entries()).map(
            async ([conversationId, { contactId }]) => {
              // Debounce configurable (150ms en test / synthetic, o MESSAGE_DEBOUNCE_MS)
              const debounceMs =
                process.env.NODE_ENV === "test"
                  ? 150
                  : config.MESSAGE_DEBOUNCE_MS || 3000;
              await new Promise((resolve) => setTimeout(resolve, debounceMs));

              let keepProcessing = true;
              let rounds = 0;
              const maxRounds = 5;

              while (keepProcessing && rounds < maxRounds) {
                rounds++;

                // Verificar si el bot está habilitado globalmente y en esta conversación
                const [{ data: globalSetting, error: globalErr }, { data: convCurrent, error: convErr }] =
                  await Promise.all([
                    supabase
                      .from("settings")
                      .select("value")
                      .eq("key", "bot_global_enabled")
                      .maybeSingle(),
                    supabase
                      .from("conversations")
                      .select("id, contact_id, bot_enabled, last_processed_inbound_at")
                      .eq("id", conversationId)
                      .single(),
                  ]);

                if (globalErr) {
                  logError({
                    step: "load_global_setting",
                    conversation_id: conversationId,
                    contact_id: contactId,
                    error: globalErr,
                  });
                }

                if (convErr || !convCurrent) {
                  logError({
                    step: "load_conversation",
                    conversation_id: conversationId,
                    contact_id: contactId,
                    error: convErr || "Conversation not found",
                  });
                  return;
                }

                const isGlobalEnabled = globalSetting ? Boolean(globalSetting.value) : true;
                if (!isGlobalEnabled || !convCurrent.bot_enabled) {
                  return;
                }

                // Adquisición de bloqueo atómico por conversation_id (120 s)
                const { data: lockAcquired, error: lockErr } = await supabase.rpc(
                  "acquire_conversation_lock",
                  {
                    p_conversation_id: conversationId,
                    p_lock_duration_seconds: 120,
                  }
                );

                if (lockErr) {
                  logError({
                    step: "acquire_lock",
                    conversation_id: conversationId,
                    contact_id: contactId,
                    error: lockErr,
                  });
                  return;
                }

                if (!lockAcquired) {
                  return;
                }

                let latestReceivedAt: string | null = null;
                try {
                  // Consultar mensajes entrantes pendientes (con received_at > last_processed_inbound_at)
                  let pendingQuery = supabase
                    .from("messages")
                    .select("id, received_at, body, transcript, type")
                    .eq("conversation_id", conversationId)
                    .eq("direction", "in")
                    .order("received_at", { ascending: true });

                  if (convCurrent.last_processed_inbound_at) {
                    pendingQuery = pendingQuery.gt(
                      "received_at",
                      convCurrent.last_processed_inbound_at
                    );
                  }

                  const { data: pendingInbound, error: pendingErr } = await pendingQuery;
                  if (pendingErr) {
                    logError({
                      step: "query_pending_messages",
                      conversation_id: conversationId,
                      contact_id: contactId,
                      error: pendingErr,
                    });
                    return;
                  }

                  if (!pendingInbound || pendingInbound.length === 0) {
                    return;
                  }

                  latestReceivedAt =
                    pendingInbound[pendingInbound.length - 1].received_at;

                  // PASO 2: Verificar que conversation.contact_id coincida con contactId
                  if (convCurrent.contact_id !== contactId) {
                    logError({
                      step: "contact_mismatch",
                      conversation_id: conversationId,
                      contact_id: contactId,
                      error: `conversation.contact_id (${convCurrent.contact_id}) does not match contactId (${contactId})`,
                    });
                    return;
                  }

                  // Ejecutar agente de IA para responder a los mensajes
                  let replyText: string;
                  try {
                    const agentRes = await runAgentConversation(
                      conversationId,
                      contactId,
                      undefined,
                      undefined,
                      options
                    );
                    replyText = agentRes.reply;
                  } catch (agentErr: unknown) {
                    logError({
                      step: "agent_runner",
                      conversation_id: conversationId,
                      contact_id: contactId,
                      error: agentErr,
                    });
                    replyText =
                      "Hola, en este momento experimentamos una alta demanda técnica. Ya registré tu solicitud y un asesor de nuestro equipo te atenderá a la brevedad.";
                  }

                  // PASO 2: Enviar mediante sendToContact (to para celular, recipient para BSUID)
                  let replyMessageId: string | null = null;
                  try {
                    const sent = await sendToContact(contactId, replyText);
                    replyMessageId = sent.messageId;
                  } catch (sendErr: unknown) {
                    logError({
                      step: "whatsapp_send",
                      conversation_id: conversationId,
                      contact_id: contactId,
                      error: sendErr,
                    });
                  }

                  const { error: insertOutErr } = await supabase.from("messages").insert({
                    conversation_id: conversationId,
                    wamid: replyMessageId,
                    direction: "out",
                    sender: "bot",
                    type: "text",
                    body: replyText,
                    status: replyMessageId ? "sent" : "failed",
                  });

                  if (insertOutErr) {
                    logError({
                      step: "outbound_message_insert",
                      conversation_id: conversationId,
                      contact_id: contactId,
                      wamid: replyMessageId,
                      error: insertOutErr,
                    });
                  }

                  // Actualizar conversations.last_processed_inbound_at
                  const { error: updateConvErr } = await supabase
                    .from("conversations")
                    .update({
                      last_processed_inbound_at: latestReceivedAt,
                      last_message_at: new Date().toISOString(),
                    })
                    .eq("id", conversationId);

                  if (updateConvErr) {
                    logError({
                      step: "update_conversation_processed",
                      conversation_id: conversationId,
                      contact_id: contactId,
                      error: updateConvErr,
                    });
                  }

                  if (replyMessageId) {
                    logEvent({
                      evt: "reply_sent",
                      step: "reply",
                      wamid: replyMessageId,
                      contact_id: contactId,
                      conversation_id: conversationId,
                    });
                  }
                } finally {
                  // Liberar el bloqueo atómico
                  const { error: releaseErr } = await supabase.rpc(
                    "release_conversation_lock",
                    {
                      p_conversation_id: conversationId,
                    }
                  );
                  if (releaseErr) {
                    logError({
                      step: "release_lock",
                      conversation_id: conversationId,
                      contact_id: contactId,
                      error: releaseErr,
                    });
                  }
                }

                // PASO 4: Después de liberar el bloqueo, revisar si quedaron entrantes sin procesar
                if (latestReceivedAt) {
                  const { data: remainingInbound, error: remainErr } = await supabase
                    .from("messages")
                    .select("id")
                    .eq("conversation_id", conversationId)
                    .eq("direction", "in")
                    .gt("received_at", latestReceivedAt)
                    .limit(1);

                  if (!remainErr && remainingInbound && remainingInbound.length > 0) {
                    keepProcessing = true;
                  } else {
                    keepProcessing = false;
                  }
                } else {
                  keepProcessing = false;
                }
              }
            }
          )
        );
      }
    }
  }
}
