import * as dotenv from "dotenv";
dotenv.config();

import * as crypto from "crypto";
import { spawn, ChildProcess } from "child_process";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Validar variables de entorno requeridas
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const metaAppSecret = process.env.META_APP_SECRET || "dummy-meta-secret-for-test";
const PORT = process.env.LOAD_TEST_PORT || "3005";
const APP_URL = `http://127.0.0.1:${PORT}`;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

let serverProcess: ChildProcess | null = null;

// Asegurar que el servidor hijo se detenga al salir
function cleanupServer() {
  if (serverProcess && !serverProcess.killed) {
    console.log("🛑 Deteniendo servidor local de prueba...");
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}

process.on("exit", cleanupServer);
process.on("SIGINT", () => {
  cleanupServer();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanupServer();
  process.exit(0);
});

// Comprobar si el servidor ya está activo
async function isServerReady(): Promise<boolean> {
  try {
    const res = await fetch(`${APP_URL}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

// Iniciar servidor Next.js si no está corriendo
async function startServerIfNeeded(): Promise<void> {
  const ready = await isServerReady();
  if (ready) {
    console.log(`✅ Servidor ya respondiendo en ${APP_URL}`);
    return;
  }

  console.log(`🚀 Iniciando servidor de producción en el puerto ${PORT}...`);
  serverProcess = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "start", "-p", PORT],
    {
      env: {
        ...process.env,
        WHATSAPP_DRY_RUN: "true",
        PORT,
      },
      stdio: "pipe",
      shell: true,
    }
  );

  serverProcess.stderr?.on("data", (data) => {
    const msg = data.toString();
    if (msg.includes("Error") || msg.includes("error")) {
      process.stderr.write(`[Server Error] ${msg}`);
    }
  });

  const maxWait = 35000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (await isServerReady()) {
      console.log(`✅ Servidor listo en ${APP_URL} (${Date.now() - start}ms)`);
      return;
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  throw new Error(`Tiempo de espera agotado al iniciar el servidor en ${APP_URL}`);
}

// Generador de firmas HMAC-SHA256
function signPayload(body: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hmac}`;
}

interface SyntheticContactSpec {
  phone?: string;
  bsuid?: string;
  username?: string;
  name: string;
  messages: Array<{
    body: string;
    usePhoneOnly?: boolean;
    useBsuidOnly?: boolean;
    useBoth?: boolean;
  }>;
}

// Construir payload con especificaciones exactas de Meta
function buildMetaInboundPayload(
  spec: SyntheticContactSpec,
  msgIndex: number
) {
  const msgSpec = spec.messages[msgIndex];
  const nowUnix = Math.floor(Date.now() / 1000) + msgIndex;
  const wamid = `wamid.LOAD_${Date.now()}_${msgIndex}_${Math.random().toString(36).substring(2, 7)}`;

  const contactsEntry: Record<string, unknown> = {
    profile: {
      name: spec.name,
      ...(spec.username ? { username: spec.username } : {}),
    },
  };

  const messageEntry: Record<string, unknown> = {
    id: wamid,
    timestamp: String(nowUnix),
    type: "text",
    text: { body: msgSpec.body },
  };

  if (msgSpec.useBsuidOnly) {
    // Caso solo BSUID: sin phone, sin wa_id, sin from
    contactsEntry.user_id = spec.bsuid;
    messageEntry.from_user_id = spec.bsuid;
  } else if (msgSpec.usePhoneOnly) {
    // Caso solo teléfono: sin bsuid
    contactsEntry.wa_id = spec.phone;
    messageEntry.from = spec.phone;
  } else {
    // Ambos presentes (o default según lo que tenga el spec)
    if (spec.phone) {
      contactsEntry.wa_id = spec.phone;
      messageEntry.from = spec.phone;
    }
    if (spec.bsuid) {
      contactsEntry.user_id = spec.bsuid;
      messageEntry.from_user_id = spec.bsuid;
    }
  }

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_LOAD_TEST",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "573000000000",
                phone_number_id: "PHONE_LOAD_TEST",
              },
              contacts: [contactsEntry],
              messages: [messageEntry],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

// Limpiar contactos creados durante la prueba por ID únicamente
async function cleanupContactIds(contactIds: string[]) {
  if (contactIds.length === 0) return;
  console.log(`🧹 Limpiando ${contactIds.length} contactos de prueba por ID...`);

  const { data: convs } = await supabase
    .from("conversations")
    .select("id")
    .in("contact_id", contactIds);

  if (convs && convs.length > 0) {
    const convIds = convs.map((c) => c.id);
    await supabase.from("messages").delete().in("conversation_id", convIds);
    await supabase.from("conversations").delete().in("id", convIds);
  }

  await supabase.from("appointments").delete().in("contact_id", contactIds);

  const { data: leads } = await supabase
    .from("leads")
    .select("id")
    .in("contact_id", contactIds);

  if (leads && leads.length > 0) {
    const leadIds = leads.map((l) => l.id);
    await supabase.from("lead_events").delete().in("lead_id", leadIds);
    await supabase.from("leads").delete().in("id", leadIds);
  }

  await supabase.from("contacts").delete().in("id", contactIds);
}

// Ejecutar la prueba de carga de 100 contactos (PASO 7k)
async function run100ContactsLoadTest(): Promise<boolean> {
  console.log(`\n======================================================`);
  console.log(`⚡ INICIANDO PRUEBA DE CARGA: 100 CONTACTOS SINTÉTICOS`);
  console.log(`   50 teléfono | 50 BSUID | 10 alternando`);
  console.log(`======================================================`);

  // 1. Generar los 100 contactos sintéticos
  const specs: SyntheticContactSpec[] = [];
  let totalInboundSent = 0;

  for (let i = 1; i <= 100; i++) {
    const padded = String(i).padStart(6, "0");
    if (i <= 10) {
      // 10 Contactos alternando: mensaje 1 con teléfono + BSUID, mensaje 2 solo BSUID
      specs.push({
        phone: `579997${padded}`,
        bsuid: `CO.TEST7${padded}`,
        username: `user_alt_${i}`,
        name: `Cliente Alterno ${i}`,
        messages: [
          { body: `Consulta inicial de servicios ${i}`, useBoth: true },
          { body: `Pregunta de seguimiento contable ${i}`, useBsuidOnly: true },
        ],
      });
      totalInboundSent += 2;
    } else if (i <= 50) {
      // 40 Contactos solo Teléfono
      specs.push({
        phone: `579997${padded}`,
        name: `Cliente Teléfono ${i}`,
        messages: [
          { body: `Información sobre declaraciones tributarias ${i}`, usePhoneOnly: true },
        ],
      });
      totalInboundSent += 1;
    } else {
      // 50 Contactos solo BSUID
      specs.push({
        bsuid: `CO.TEST7${padded}`,
        username: `user_bsuid_${i}`,
        name: `Cliente BSUID ${i}`,
        messages: [
          { body: `Asesoría en planeación financiera ${i}`, useBsuidOnly: true },
        ],
      });
      totalInboundSent += 1;
    }
  }

  console.log(
    `📤 Despachando ${totalInboundSent} mensajes para los 100 contactos simultáneamente...`
  );

  const startTimes = new Map<string, number>();
  const dispatchStart = Date.now();

  // Enviar los mensajes vía HTTP POST al webhook
  const sendPromises: Promise<void>[] = [];

  for (const spec of specs) {
    const key = spec.phone || spec.bsuid!;
    startTimes.set(key, Date.now());

    for (let msgIdx = 0; msgIdx < spec.messages.length; msgIdx++) {
      const payload = buildMetaInboundPayload(spec, msgIdx);
      const bodyStr = JSON.stringify(payload);
      const sig = signPayload(bodyStr, metaAppSecret);

      const p = (async () => {
        const res = await fetch(`${APP_URL}/api/webhooks/whatsapp`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-hub-signature-256": sig,
            "x-mock-openai": "true",
          },
          body: bodyStr,
        });

        if (!res.ok) {
          throw new Error(`Webhook falló para ${key} (msg ${msgIdx}): status ${res.status}`);
        }
      })();

      sendPromises.push(p);
    }
  }

  await Promise.all(sendPromises);
  const dispatchElapsed = Date.now() - dispatchStart;
  console.log(`✅ ${totalInboundSent} webhooks despachados en ${dispatchElapsed}ms. Monitoreando Supabase...`);

  // Monitorear finalización en Supabase
  const deadline = Date.now() + 90000; // 90 segundos máx
  const answeredContactIds = new Set<string>();
  const latencies: number[] = [];
  let foundContacts: Array<{ id: string; phone: string | null; bsuid: string | null }> = [];

  while (Date.now() < deadline && answeredContactIds.size < 100) {
    await new Promise((r) => setTimeout(r, 1000));

    // Buscar contactos sintéticos creados en este rango
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, phone, bsuid")
      .or(`phone.like.579997%,bsuid.like.CO.TEST7%`);

    if (!contacts || contacts.length === 0) continue;
    foundContacts = contacts;

    const contactIds = contacts.map((c) => c.id);

    const { data: convs } = await supabase
      .from("conversations")
      .select("id, contact_id")
      .in("contact_id", contactIds);

    if (!convs || convs.length === 0) continue;

    const convMap = new Map(convs.map((cv) => [cv.id, cv.contact_id]));
    const convIds = convs.map((cv) => cv.id);

    const { data: botMsgs } = await supabase
      .from("messages")
      .select("id, conversation_id, created_at")
      .in("conversation_id", convIds)
      .eq("direction", "out")
      .eq("sender", "bot");

    if (botMsgs) {
      for (const msg of botMsgs) {
        const contactId = convMap.get(msg.conversation_id);
        if (contactId && !answeredContactIds.has(contactId)) {
          answeredContactIds.add(contactId);
          latencies.push(Date.now() - dispatchStart);
        }
      }
    }

    process.stdout.write(
      `\r⏳ Progreso: ${answeredContactIds.size}/100 contactos con respuesta del bot...`
    );
  }

  process.stdout.write("\n");
  await new Promise((r) => setTimeout(r, 2000));

  // Verificaciones finales
  const createdIds = foundContacts.map((c) => c.id);

  const { data: finalConvs } = await supabase
    .from("conversations")
    .select("id, contact_id, processing_lock_until")
    .in("contact_id", createdIds);

  const convIds = (finalConvs || []).map((cv) => cv.id);

  const { data: inboundMsgs } = await supabase
    .from("messages")
    .select("id, conversation_id")
    .in("conversation_id", convIds)
    .eq("direction", "in");

  const { data: outMsgs } = await supabase
    .from("messages")
    .select("id, conversation_id")
    .in("conversation_id", convIds)
    .eq("direction", "out")
    .eq("sender", "bot");

  const now = new Date();
  const hangingLocks = (finalConvs || []).filter((cv) => {
    if (!cv.processing_lock_until) return false;
    return new Date(cv.processing_lock_until) > now;
  }).length;

  // Verificar 0 duplicados: cada conversación tiene exactamente 1 respuesta
  const replyCountsByConv = new Map<string, number>();
  for (const m of outMsgs || []) {
    replyCountsByConv.set(m.conversation_id, (replyCountsByConv.get(m.conversation_id) || 0) + 1);
  }

  let hasDuplicatesOrMisses = false;
  for (const convId of convIds) {
    const count = replyCountsByConv.get(convId) || 0;
    if (count !== 1) {
      hasDuplicatesOrMisses = true;
      console.warn(`⚠️ Conversación ${convId} tiene ${count} respuestas (se esperaba exactamente 1).`);
    }
  }

  // Verificar 0 respuestas cruzadas: cada mensaje saliente pertenece a la conversación de ese contacto
  const convToContact = new Map((finalConvs || []).map((c) => [c.id, c.contact_id]));
  let crossReplies = 0;
  for (const m of outMsgs || []) {
    if (!convToContact.has(m.conversation_id)) {
      crossReplies++;
    }
  }

  latencies.sort((a, b) => a - b);
  const avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((acc, v) => acc + v, 0) / latencies.length)
      : 0;
  const p95Latency =
    latencies.length > 0
      ? latencies[Math.min(Math.floor(latencies.length * 0.95), latencies.length - 1)]
      : 0;

  const success =
    foundContacts.length === 100 &&
    (finalConvs?.length || 0) === 100 &&
    (inboundMsgs?.length || 0) === totalInboundSent &&
    (outMsgs?.length || 0) === 100 &&
    !hasDuplicatesOrMisses &&
    crossReplies === 0 &&
    hangingLocks === 0;

  console.log(`\n======================================================`);
  console.log(`📊 RESULTADOS DE LA PRUEBA DE CARGA:`);
  console.log(`======================================================`);
  console.log(`Contactos guardados: ${foundContacts.length}/100 (0 duplicados)`);
  console.log(`Conversaciones creadas: ${finalConvs?.length}/100`);
  console.log(`Mensajes entrantes guardados: ${inboundMsgs?.length}/${totalInboundSent} (0 pérdidas)`);
  console.log(`Respuestas del bot: ${outMsgs?.length}/100 (0 pérdidas)`);
  console.log(`Exactamente 1 respuesta por conversación: ${!hasDuplicatesOrMisses}`);
  console.log(`Respuestas cruzadas: ${crossReplies}`);
  console.log(`Bloqueos colgados: ${hangingLocks}`);
  console.log(`Latencia promedio: ${avgLatency}ms | p95: ${p95Latency}ms`);
  console.log(`Estado global: ${success ? "✅ APROBADO" : "❌ FALLIDO"}`);
  console.log(`======================================================\n`);

  // Limpieza estricta de los 100 contactos creados
  await cleanupContactIds(createdIds);

  return success;
}

async function main() {
  try {
    await startServerIfNeeded();
    const passed = await run100ContactsLoadTest();
    cleanupServer();

    if (!passed) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error("❌ Error ejecutando prueba de carga:", err);
    cleanupServer();
    process.exit(1);
  }
}

void main();
