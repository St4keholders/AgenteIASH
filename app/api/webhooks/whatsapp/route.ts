import { NextRequest, NextResponse, after } from "next/server";
import crypto from "crypto";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWhatsAppText, downloadWhatsAppMedia } from "@/lib/whatsapp/client";
import { transcribeAudio } from "@/lib/openai/transcribe";
import { runAgentConversation } from "@/lib/agent/runner";

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
          profile?: { name?: string };
          wa_id?: string;
          user_id?: string;
        }>;
        messages?: Array<{
          from: string;
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
          errors?: Array<unknown>;
        }>;
      };
    }>;
  }>;
}

function logEvent(event: Record<string, unknown>) {
  console.log(JSON.stringify(event));
}

function logError(errorData: {
  step: string;
  wamid?: string | null;
  conversation_id?: string | null;
  error: string;
}) {
  console.error(JSON.stringify({ evt: "webhook_error", ...errorData }));
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

  // 1. Validar firma HMAC SHA-256
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
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  } catch {
    // Fuera del scope de Vercel/Next (ej: tests unitarios directos)
    void processWebhookPayload(payload, { mockOpenAI: isMockOpenAI }).catch((err: unknown) => {
      logError({
        step: "test_background",
        error: err instanceof Error ? err.message : String(err),
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

      // Actualización de estados de mensajes salientes (sent, delivered, read, failed)
      if (val.statuses && val.statuses.length > 0) {
        const validStatuses = ["sent", "delivered", "read", "failed"];
        for (const st of val.statuses) {
          const wamid = st.id;
          const status = st.status;
          const errorMsg = st.errors ? JSON.stringify(st.errors) : null;

          if (validStatuses.includes(status)) {
            try {
              await supabase
                .from("messages")
                .update({
                  status,
                  error: errorMsg,
                })
                .eq("wamid", wamid);
            } catch (statusErr: unknown) {
              logError({
                step: "status_update",
                wamid,
                error: statusErr instanceof Error ? statusErr.message : String(statusErr),
              });
            }
          }
        }
      }

      // Mensajes entrantes
      if (val.messages && val.messages.length > 0) {
        const conversationsToProcess = new Map<
          string,
          { contactId: string; from: string; latestInsertedCreatedAt: string }
        >();

        for (const msg of val.messages) {
          const from = msg.from;
          const wamid = msg.id;
          const msgType = msg.type;
          const timestamp = msg.timestamp
            ? new Date(Number(msg.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          logEvent({
            evt: "webhook_received",
            wamid,
            wa_id: from,
          });

          // Obtener perfil correspondiente a este remitente
          const matchingContact =
            val.contacts?.find((c) => c.wa_id === from) || val.contacts?.[0];
          const rawProfileName = matchingContact?.profile?.name?.trim();
          const profileName = rawProfileName && rawProfileName.length > 0 ? rawProfileName : null;

          // Identificar si es teléfono numérico o BSUID/username
          const isNumeric = /^\d+$/.test(from);
          const phone = isNumeric ? from : null;
          const bsuid = !isNumeric
            ? from
            : (msg.user_id as string | undefined) ||
              matchingContact?.user_id ||
              null;

          let contactId: string;
          try {
            // 1. Upsert seguro de contacto: preservar campos existentes
            const { data: existingContact } = await supabase
              .from("contacts")
              .select("id, name, phone, bsuid")
              .eq("wa_id", from)
              .maybeSingle();

            if (existingContact) {
              contactId = existingContact.id;
              const updatePayload: {
                updated_at: string;
                name?: string | null;
                phone?: string | null;
                bsuid?: string | null;
              } = {
                updated_at: new Date().toISOString(),
              };
              if (profileName && !existingContact.name) {
                updatePayload.name = profileName;
              }
              if (phone && !existingContact.phone) {
                updatePayload.phone = phone;
              }
              if (bsuid && !existingContact.bsuid) {
                updatePayload.bsuid = bsuid;
              }
              await supabase.from("contacts").update(updatePayload).eq("id", contactId);
            } else {
              const { data: newContact, error: insertContactErr } = await supabase
                .from("contacts")
                .insert({
                  wa_id: from,
                  phone,
                  bsuid,
                  name: profileName,
                  updated_at: new Date().toISOString(),
                })
                .select("id")
                .maybeSingle();

              if (insertContactErr || !newContact) {
                // Posible carrera concurrente: buscar contacto creado en paralelo
                const { data: parallelContact } = await supabase
                  .from("contacts")
                  .select("id")
                  .eq("wa_id", from)
                  .maybeSingle();

                if (!parallelContact) {
                  throw insertContactErr || new Error("Failed to insert contact");
                }
                contactId = parallelContact.id;
              } else {
                contactId = newContact.id;
              }
            }
          } catch (cErr: unknown) {
            logError({
              step: "contact_upsert",
              wamid,
              error: cErr instanceof Error ? cErr.message : String(cErr),
            });
            continue;
          }

          let conversationId: string;
          try {
            // 2. Obtener o crear conversación asociada al contacto
            const { data: existingConv } = await supabase
              .from("conversations")
              .select("id, unread_count, bot_enabled")
              .eq("contact_id", contactId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (existingConv) {
              conversationId = existingConv.id;
              await supabase
                .from("conversations")
                .update({
                  last_inbound_at: new Date().toISOString(),
                  last_message_at: new Date().toISOString(),
                  unread_count: (existingConv.unread_count || 0) + 1,
                })
                .eq("id", conversationId);
            } else {
              const { data: newConv, error: newConvErr } = await supabase
                .from("conversations")
                .insert({
                  contact_id: contactId,
                  last_inbound_at: new Date().toISOString(),
                  last_message_at: new Date().toISOString(),
                  unread_count: 1,
                  bot_enabled: true,
                })
                .select("id")
                .maybeSingle();

              if (newConvErr || !newConv) {
                const { data: parallelConv } = await supabase
                  .from("conversations")
                  .select("id")
                  .eq("contact_id", contactId)
                  .maybeSingle();

                if (!parallelConv) {
                  throw newConvErr || new Error("Failed to insert conversation");
                }
                conversationId = parallelConv.id;
              } else {
                conversationId = newConv.id;
              }
            }
          } catch (convErr: unknown) {
            logError({
              step: "conversation_upsert",
              wamid,
              error: convErr instanceof Error ? convErr.message : String(convErr),
            });
            continue;
          }

          // 3. Crear lead en etapa "nuevo" si no existe
          try {
            const { data: nuevoStage } = await supabase
              .from("pipeline_stages")
              .select("id")
              .eq("key", "nuevo")
              .maybeSingle();

            if (nuevoStage) {
              const { data: existingLead } = await supabase
                .from("leads")
                .select("id")
                .eq("contact_id", contactId)
                .maybeSingle();

              if (!existingLead) {
                const { data: insertedLead } = await supabase
                  .from("leads")
                  .insert({
                    contact_id: contactId,
                    stage_id: nuevoStage.id,
                  })
                  .select("id")
                  .maybeSingle();

                if (insertedLead) {
                  await supabase.from("lead_events").insert({
                    lead_id: insertedLead.id,
                    type: "lead_created",
                    to_stage_id: nuevoStage.id,
                    actor: "bot",
                  });
                }
              }
            }
          } catch (leadErr: unknown) {
            // Error no bloqueante para el flujo de mensajería
            logError({
              step: "lead_event",
              wamid,
              conversation_id: conversationId,
              error: leadErr instanceof Error ? leadErr.message : String(leadErr),
            });
          }

          // 4. Procesar multimedia o cuerpo según tipo
          let textBody: string | null = null;
          let mediaId: string | null = null;
          let storagePath: string | null = null;
          let transcript: string | null = null;
          let normalizedType: "text" | "audio" | "image" | "document" | "other" = "other";

          if (msgType === "text") {
            normalizedType = "text";
            textBody = msg.text?.body || "";
          } else if (msgType === "audio") {
            normalizedType = "audio";
            mediaId = msg.audio?.id || null;
            if (mediaId) {
              try {
                const downloaded = await downloadWhatsAppMedia(mediaId);
                const fileExt = downloaded.mimeType.includes("ogg") ? "ogg" : "mp3";
                storagePath = `${conversationId}/${Date.now()}-${mediaId}.${fileExt}`;

                await supabase.storage
                  .from("media")
                  .upload(storagePath, downloaded.buffer, {
                    contentType: downloaded.mimeType,
                    upsert: true,
                  });

                transcript = await transcribeAudio(downloaded.buffer, `audio.${fileExt}`);
              } catch (audioErr) {
                logError({
                  step: "audio_transcription",
                  wamid,
                  conversation_id: conversationId,
                  error: audioErr instanceof Error ? audioErr.message : String(audioErr),
                });
              }
            }
          } else if (msgType === "image") {
            normalizedType = "image";
            mediaId = msg.image?.id || null;
            textBody = msg.image?.caption || null;
            if (mediaId) {
              try {
                const downloaded = await downloadWhatsAppMedia(mediaId);
                storagePath = `${conversationId}/${Date.now()}-${mediaId}.jpg`;
                await supabase.storage
                  .from("media")
                  .upload(storagePath, downloaded.buffer, {
                    contentType: downloaded.mimeType,
                    upsert: true,
                  });
              } catch (imgErr) {
                logError({
                  step: "image_download",
                  wamid,
                  conversation_id: conversationId,
                  error: imgErr instanceof Error ? imgErr.message : String(imgErr),
                });
              }
            }
          } else if (msgType === "interactive") {
            normalizedType = "text";
            textBody =
              msg.interactive?.button_reply?.title ||
              msg.interactive?.list_reply?.title ||
              "";
          } else {
            normalizedType = "other";
            textBody = `[Archivo o mensaje tipo ${msgType}]`;
          }

          // 5. Inserción de mensaje con deduplicación por wamid
          let insertedMsg: { id: string; created_at: string } | null = null;
          try {
            const { data, error: insertErr } = await supabase
              .from("messages")
              .insert({
                conversation_id: conversationId,
                wamid,
                direction: "in",
                sender: "contact",
                type: normalizedType,
                body: textBody,
                transcript,
                media_id: mediaId,
                storage_path: storagePath,
                status: "delivered",
                raw: msg,
                created_at: timestamp,
              })
              .select("id, created_at")
              .maybeSingle();

            if (insertErr || !data) {
              if (insertErr?.code === "23505") {
                // Deduplicación normal por reintento de webhook de Meta
                continue;
              }
              throw insertErr || new Error("Failed to insert message");
            }
            insertedMsg = data;
          } catch (mErr: unknown) {
            logError({
              step: "message_insert",
              wamid,
              conversation_id: conversationId,
              error: mErr instanceof Error ? mErr.message : String(mErr),
            });
            continue;
          }

          logEvent({
            evt: "message_stored",
            wamid,
            conversation_id: conversationId,
          });

          // Registrar conversación afectada
          conversationsToProcess.set(conversationId, {
            contactId,
            from,
            latestInsertedCreatedAt: insertedMsg.created_at,
          });
        }

        // Procesar concurrentemente cada conversación afectada
        await Promise.all(
          Array.from(conversationsToProcess.entries()).map(
            async ([conversationId, { contactId, from, latestInsertedCreatedAt }]) => {
              // Debounce estricto por conversation_id
              const debounceMs = from.startsWith("TEST-") ? 150 : (config.MESSAGE_DEBOUNCE_MS || 3000);
              await new Promise((resolve) => setTimeout(resolve, debounceMs));

              // Verificar si llegó un mensaje entrante más reciente en esta conversación
              const { data: newerInbound } = await supabase
                .from("messages")
                .select("id")
                .eq("conversation_id", conversationId)
                .eq("direction", "in")
                .gt("created_at", latestInsertedCreatedAt)
                .limit(1);

              if (newerInbound && newerInbound.length > 0) {
                return;
              }

              // Verificar si ya existe una respuesta posterior del bot para esta conversación
              const { data: latestMsg } = await supabase
                .from("messages")
                .select("direction, sender, created_at")
                .eq("conversation_id", conversationId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (
                latestMsg &&
                latestMsg.direction === "out" &&
                latestMsg.sender === "bot" &&
                new Date(latestMsg.created_at) >= new Date(latestInsertedCreatedAt)
              ) {
                return;
              }

              // Verificar estado del bot global y para esta conversación
              const { data: globalSetting } = await supabase
                .from("settings")
                .select("value")
                .eq("key", "bot_global_enabled")
                .maybeSingle();

              const isGlobalEnabled = globalSetting ? Boolean(globalSetting.value) : true;

              const { data: convCurrent } = await supabase
                .from("conversations")
                .select("bot_enabled")
                .eq("id", conversationId)
                .maybeSingle();

              if (!isGlobalEnabled || !convCurrent?.bot_enabled) {
                return;
              }

              // Adquisición de bloqueo atómico por conversation_id (120 segundos de expiración automática)
              const { data: lockAcquired } = await supabase.rpc("acquire_conversation_lock", {
                p_conversation_id: conversationId,
                p_lock_duration_seconds: 120,
              });

              if (!lockAcquired) {
                return;
              }

              // Bucle de catch-up bajo el bloqueo
              try {
                let hasPendingMessages = true;
                let round = 0;
                const maxRounds = 5;

                while (hasPendingMessages && round < maxRounds) {
                  round++;
                  const roundStartTimestamp = new Date().toISOString();

                  let replyText: string;
                  try {
                    const result = await runAgentConversation(
                      conversationId,
                      contactId,
                      undefined,
                      undefined,
                      options
                    );
                    replyText = result.reply;
                  } catch (agentErr: unknown) {
                    logError({
                      step: "agent_runner",
                      conversation_id: conversationId,
                      error: agentErr instanceof Error ? agentErr.message : String(agentErr),
                    });
                    replyText =
                      "Hola, en este momento experimentamos una alta demanda técnica. Ya registré tu solicitud y un asesor de nuestro equipo te atenderá a la brevedad.";
                  }

                  let replyMessageId: string | null = null;
                  try {
                    const sent = await sendWhatsAppText(from, replyText);
                    replyMessageId = sent.messageId;
                  } catch (sendErr: unknown) {
                    logError({
                      step: "whatsapp_send",
                      conversation_id: conversationId,
                      error: sendErr instanceof Error ? sendErr.message : String(sendErr),
                    });
                  }

                  await supabase.from("messages").insert({
                    conversation_id: conversationId,
                    wamid: replyMessageId,
                    direction: "out",
                    sender: "bot",
                    type: "text",
                    body: replyText,
                    status: replyMessageId ? "sent" : "failed",
                  });

                  if (replyMessageId) {
                    logEvent({
                      evt: "reply_sent",
                      wamid: replyMessageId,
                      conversation_id: conversationId,
                    });
                  }

                  await new Promise((resolve) => setTimeout(resolve, from.startsWith("TEST-") ? 100 : 1500));

                  const { data: pendingInbound } = await supabase
                    .from("messages")
                    .select("id")
                    .eq("conversation_id", conversationId)
                    .eq("direction", "in")
                    .gte("created_at", roundStartTimestamp)
                    .limit(1);

                  hasPendingMessages = Boolean(pendingInbound && pendingInbound.length > 0);
                }
              } finally {
                await supabase.rpc("release_conversation_lock", {
                  p_conversation_id: conversationId,
                });
              }
            }
          )
        );
      }
    }
  }
}
