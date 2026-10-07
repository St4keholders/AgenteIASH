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
    const res = await fetch(`${APP_URL}/api/webhooks/whatsapp`, {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    return res.status === 200 || res.status === 400 || res.status === 401 || res.status === 403;
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

  const maxWait = 30000;
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

// Construir payload con 1 o más mensajes
function buildWhatsAppPayload(
  fromWaId: string,
  messagesList: string[],
  profileName = "Usuario Test Carga"
) {
  const nowUnix = Math.floor(Date.now() / 1000);
  const msgs = messagesList.map((text, idx) => ({
    from: fromWaId,
    id: `wamid.LOAD_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: String(nowUnix + idx),
    text: { body: text },
    type: "text",
  }));

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
              contacts: [
                {
                  profile: { name: profileName },
                  wa_id: fromWaId,
                },
              ],
              messages: msgs,
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

// Limpiar contactos de prueba en Supabase
async function cleanupTestData(prefix: string) {
  console.log(`🧹 Limpiando datos de prueba con prefijo ${prefix}...`);
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id")
    .like("wa_id", `${prefix}%`);

  if (contacts && contacts.length > 0) {
    const contactIds = contacts.map((c) => c.id);
    await supabase.from("contacts").delete().in("id", contactIds);
  }
}

// Ejecutar una prueba de carga
interface LoadTestConfig {
  testName: string;
  prefix: string;
  contactCount: number;
  mockOpenAI: boolean;
  timeoutSeconds: number;
}

interface TestResults {
  totalContacts: number;
  totalInboundSent: number;
  totalInboundStored: number;
  totalBotReplies: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  hangingLocks: number;
  success: boolean;
}

async function runLoadTest(cfg: LoadTestConfig): Promise<TestResults> {
  console.log(`\n======================================================`);
  console.log(`⚡ INICIANDO: ${cfg.testName}`);
  console.log(`   Contactos: ${cfg.contactCount} | Mock OpenAI: ${cfg.mockOpenAI}`);
  console.log(`======================================================`);

  // 1. Limpieza inicial
  await cleanupTestData(cfg.prefix);

  // 2. Preparar contactos y mensajes
  const contactTasks: Array<{
    waId: string;
    messages: string[];
    name: string;
  }> = [];

  let totalInboundSent = 0;

  for (let i = 1; i <= cfg.contactCount; i++) {
    const waId = `${cfg.prefix}-${String(i).padStart(3, "0")}`;
    const name = `Cliente Carga ${i}`;

    let messages: string[];
    if (i <= Math.floor(cfg.contactCount * 0.1)) {
      // 10% envían 3 mensajes
      messages = [
        "Hola buenas tardes",
        "¿Manejan contabilidad para empresas SAS?",
        "¿Tienen citas virtuales disponibles esta semana?",
      ];
    } else if (i <= Math.floor(cfg.contactCount * 0.3)) {
      // 20% envían 2 mensajes
      messages = [
        "Buenos días",
        "Quisiera consultar el valor de una declaración de renta",
      ];
    } else {
      // 70% envían 1 mensaje
      messages = ["Hola, deseo información sobre sus servicios tributarios"];
    }

    contactTasks.push({ waId, messages, name });
    totalInboundSent += messages.length;
  }

  console.log(
    `📤 Enviando ${contactTasks.length} webhooks concurrentes (${totalInboundSent} mensajes entrantes en total)...`
  );

  const startTimes = new Map<string, number>();

  // 3. Disparar webhooks simultáneos
  const sendPromises = contactTasks.map(async (task) => {
    startTimes.set(task.waId, Date.now());
    const payload = buildWhatsAppPayload(task.waId, task.messages, task.name);
    const bodyStr = JSON.stringify(payload);
    const sig = signPayload(bodyStr, metaAppSecret);

    const res = await fetch(`${APP_URL}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sig,
        "x-mock-openai": String(cfg.mockOpenAI),
      },
      body: bodyStr,
    });

    if (!res.ok) {
      throw new Error(`Webhook falló para ${task.waId}: status ${res.status}`);
    }
  });

  const dispatchStart = Date.now();
  await Promise.all(sendPromises);
  const dispatchElapsed = Date.now() - dispatchStart;
  console.log(`✅ Todos los webhooks despachados en ${dispatchElapsed}ms. Monitoreando respuestas en Supabase...`);

  // 4. Esperar y monitorear procesamiento de respuestas
  const latencies: number[] = [];
  const answeredWaIds = new Set<string>();
  const deadline = Date.now() + cfg.timeoutSeconds * 1000;

  while (Date.now() < deadline && answeredWaIds.size < cfg.contactCount) {
    await new Promise((r) => setTimeout(r, 800));

    // Consultar mensajes salientes del bot para los contactos de prueba
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, wa_id")
      .like("wa_id", `${cfg.prefix}%`);

    if (!contacts || contacts.length === 0) continue;

    const contactIds = contacts.map((c) => c.id);
    const contactMap = new Map(contacts.map((c) => [c.id, c.wa_id]));

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
        if (!contactId) continue;
        const waId = contactMap.get(contactId);
        if (waId && !answeredWaIds.has(waId)) {
          answeredWaIds.add(waId);
          const t0 = startTimes.get(waId) || dispatchStart;
          latencies.push(Date.now() - t0);
        }
      }
    }

    process.stdout.write(
      `\r⏳ Progreso: ${answeredWaIds.size}/${cfg.contactCount} conversaciones respondidas...`
    );
  }

  process.stdout.write("\n");

  // Pequeña pausa final para asegurar que todas las transacciones concluyan
  await new Promise((r) => setTimeout(r, 1500));

  // 5. Verificaciones en Supabase
  const { data: finalContacts } = await supabase
    .from("contacts")
    .select("id, wa_id")
    .like("wa_id", `${cfg.prefix}%`);

  const contactIds = (finalContacts || []).map((c) => c.id);

  const { data: finalConvs } = await supabase
    .from("conversations")
    .select("id, processing_lock_until")
    .in("contact_id", contactIds);

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

  // Revisar si quedaron bloqueos colgados
  const now = new Date();
  const hangingLocks = (finalConvs || []).filter((cv) => {
    if (!cv.processing_lock_until) return false;
    return new Date(cv.processing_lock_until) > now;
  }).length;

  // Estadísticas de latencia
  latencies.sort((a, b) => a - b);
  const avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((acc, v) => acc + v, 0) / latencies.length)
      : 0;
  const p95Index = Math.min(
    Math.floor(latencies.length * 0.95),
    latencies.length - 1
  );
  const p95Latency = latencies.length > 0 ? latencies[p95Index] : 0;

  // Verificación de duplicados por conversación
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

  const success =
    (finalContacts?.length || 0) === cfg.contactCount &&
    (inboundMsgs?.length || 0) === totalInboundSent &&
    (outMsgs?.length || 0) === cfg.contactCount &&
    !hasDuplicatesOrMisses &&
    hangingLocks === 0;

  console.log(`\n--- RESULTADOS: ${cfg.testName} ---`);
  console.log(`Contactos guardados: ${finalContacts?.length}/${cfg.contactCount}`);
  console.log(`Mensajes entrantes guardados: ${inboundMsgs?.length}/${totalInboundSent}`);
  console.log(`Respuestas del bot: ${outMsgs?.length}/${cfg.contactCount} (exactamente 1 por conv: ${!hasDuplicatesOrMisses})`);
  console.log(`Bloqueos colgados: ${hangingLocks}`);
  console.log(`Latencia promedio: ${avgLatency} ms`);
  console.log(`Latencia p95: ${p95Latency} ms`);
  console.log(`Estado: ${success ? "✅ APROBADO" : "❌ FALLIDO"}`);

  // 6. Limpieza final
  await cleanupTestData(cfg.prefix);

  return {
    totalContacts: finalContacts?.length || 0,
    totalInboundSent,
    totalInboundStored: inboundMsgs?.length || 0,
    totalBotReplies: outMsgs?.length || 0,
    avgLatencyMs: avgLatency,
    p95LatencyMs: p95Latency,
    hangingLocks,
    success,
  };
}

// Flujo principal
async function main() {
  console.log("======================================================");
  console.log("🚀 EJECUTANDO BATERÍA DE PRUEBAS DE CARGA Y CONCURRENCIA");
  console.log("======================================================");

  try {
    await startServerIfNeeded();

    // 1. Prueba de Carga Masiva: 100 contactos simultáneos con OpenAI simulado
    const test100 = await runLoadTest({
      testName: "Prueba de Carga Masiva (100 Contactos Simultáneos + OpenAI Simulado + 429 Retries)",
      prefix: "TEST-load-user",
      contactCount: 100,
      mockOpenAI: true,
      timeoutSeconds: 90,
    });

    if (!test100.success) {
      throw new Error("❌ La prueba de carga de 100 contactos no superó todos los criterios de aceptación.");
    }

    // 2. Prueba Pequeña con OpenAI Real: 10 contactos simultáneos
    const test10 = await runLoadTest({
      testName: "Prueba Concurrente con OpenAI Real (10 Contactos Simultáneos)",
      prefix: "TEST-real-user",
      contactCount: 10,
      mockOpenAI: false,
      timeoutSeconds: 60,
    });

    if (!test10.success) {
      throw new Error("❌ La prueba con OpenAI real de 10 contactos no superó todos los criterios de aceptación.");
    }

    console.log("\n======================================================");
    console.log("🎉 TODAS LAS PRUEBAS DE CARGA PASARON EXITOSAMENTE");
    console.log("======================================================");
    console.log(`100 Contactos (Mock) -> Promedio: ${test100.avgLatencyMs}ms | p95: ${test100.p95LatencyMs}ms`);
    console.log(`10 Contactos (Real)  -> Promedio: ${test10.avgLatencyMs}ms | p95: ${test10.p95LatencyMs}ms`);

    cleanupServer();
    process.exit(0);
  } catch (err: unknown) {
    console.error("❌ Error en la prueba de carga:", err);
    cleanupServer();
    process.exit(1);
  }
}

void main();
