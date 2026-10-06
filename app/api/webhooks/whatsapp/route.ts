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
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp?: string;
          type: string;
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

  // Comparación segura en tiempo constante
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

  // 2. Responder 200 de inmediato
  // 3. Procesar en segundo plano con after()
  try {
    after(async () => {
      try {
        await processWebhookPayload(payload);
      } catch (err) {
        console.error("Error processing webhook in background:", err);
      }
    });
  } catch {
    // Si se invoca fuera del servidor Next.js (ej: en tests unitarios), procesar en segundo plano
    void processWebhookPayload(payload).catch((err) => {
      console.error("Error processing webhook in background:", err);
    });
  }

  return new NextResponse("OK", { status: 200 });
}

async function processWebhookPayload(payload: WhatsAppWebhookPayload) {
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
        for (const st of val.statuses) {
          const wamid = st.id;
          const status = st.status;
          const errorMsg = st.errors ? JSON.stringify(st.errors) : null;

          await supabase
            .from("messages")
            .update({
              status,
              error: errorMsg,
            })
            .eq("wamid", wamid);
        }
      }

      // Mensajes entrantes
      if (val.messages && val.messages.length > 0) {
        const contactProfile = val.contacts?.[0];
        const profileName = contactProfile?.profile?.name || null;

        for (const msg of val.messages) {
          const from = msg.from;
          const wamid = msg.id;
          const msgType = msg.type;
          const timestamp = msg.timestamp
            ? new Date(Number(msg.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          // Identificar si es teléfono o BSUID
          const isPhone = /^\d+$/.test(from);
          const bsuid = !isPhone ? from : null;
          const phone = isPhone ? from : null;

          // 1. Upsert contacto
          const { data: contact } = await supabase
            .from("contacts")
            .upsert(
              {
                wa_id: from,
                phone,
                bsuid,
                name: profileName,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "wa_id" }
            )
            .select("id")
            .single();

          if (!contact) continue;

          // 2. Upsert conversación
          // Consultar primero si ya existe para no pisar campos
          const { data: existingConv } = await supabase
            .from("conversations")
            .select("id, unread_count, bot_enabled")
            .eq("contact_id", contact.id)
            .maybeSingle();

          let conversationId: string;

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
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({
                contact_id: contact.id,
                last_inbound_at: new Date().toISOString(),
                last_message_at: new Date().toISOString(),
                unread_count: 1,
                bot_enabled: true,
              })
              .select("id")
              .single();

            if (!newConv) continue;
            conversationId = newConv.id;
          }

          // 3. Crear lead en etapa "Nuevo" si no existe
          const { data: nuevoStage } = await supabase
            .from("pipeline_stages")
            .select("id")
            .eq("key", "nuevo")
            .single();

          if (nuevoStage) {
            const { data: existingLead } = await supabase
              .from("leads")
              .select("id")
              .eq("contact_id", contact.id)
              .maybeSingle();

            if (!existingLead) {
              const { data: insertedLead } = await supabase
                .from("leads")
                .insert({
                  contact_id: contact.id,
                  stage_id: nuevoStage.id,
                })
                .select("id")
                .single();

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

          // 4. Procesar cuerpo del mensaje según tipo
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
                console.error("Error downloading/transcribing audio:", audioErr);
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
                console.error("Error storing image:", imgErr);
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

          // 5. Deduplicación e inserción de mensaje
          const { data: insertedMsg, error: insertErr } = await supabase
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

          if (insertErr || !insertedMsg) {
            // Mensaje duplicado o ignorado
            continue;
          }

          // 6. Debounce y Bloqueo Atómico
          // Esperar MESSAGE_DEBOUNCE_MS
          const debounceMs = config.MESSAGE_DEBOUNCE_MS || 6000;
          await new Promise((resolve) => setTimeout(resolve, debounceMs));

          // Verificar si llegó un mensaje entrante más reciente en esta conversación
          const { data: newerMessages } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("direction", "in")
            .gt("created_at", insertedMsg.created_at)
            .limit(1);

          if (newerMessages && newerMessages.length > 0) {
            // El mensaje más reciente se encargará de ejecutar el agente
            continue;
          }

          // Verificar si el bot está habilitado globalmente y para esta conversación
          const { data: globalSetting } = await supabase
            .from("settings")
            .select("value")
            .eq("key", "bot_global_enabled")
            .single();

          const isGlobalEnabled = globalSetting ? Boolean(globalSetting.value) : true;

          const { data: convCurrent } = await supabase
            .from("conversations")
            .select("bot_enabled")
            .eq("id", conversationId)
            .single();

          if (!isGlobalEnabled || !convCurrent?.bot_enabled) {
            continue;
          }

          // Adquirir bloqueo atómico
          const { data: lockAcquired } = await supabase.rpc("acquire_conversation_lock", {
            p_conversation_id: conversationId,
            p_lock_duration_seconds: 60,
          });

          if (!lockAcquired) {
            continue;
          }

          try {
            // Ejecutar conversación del agente
            const result = await runAgentConversation(conversationId, contact.id);

            // Enviar respuesta por WhatsApp
            const sent = await sendWhatsAppText(from, result.reply);

            // Guardar mensaje saliente
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              wamid: sent.messageId,
              direction: "out",
              sender: "bot",
              type: "text",
              body: result.reply,
              status: "sent",
            });
          } finally {
            // Liberar bloqueo atómico
            await supabase.rpc("release_conversation_lock", {
              p_conversation_id: conversationId,
            });
          }
        }
      }
    }
  }
}
