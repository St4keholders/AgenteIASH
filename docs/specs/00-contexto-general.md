# 00 · Contexto general del proyecto (leer siempre primero)

Este archivo es la fuente de verdad compartida por todas las fases. Cada fase (01, 02, 03, 04) se apoya en él. Si algo de una fase contradice este archivo, decide con criterio técnico y registra la decisión en `PROGRESS.md`.

## Reglas de trabajo para el agente de código (modo autónomo)

1. **Trabajas en modo autónomo, en bucle, sin pedir aprobación.** No presentes planes para aprobar ni hagas preguntas a mitad de la ejecución. Planea, construye, verifica, corrige y avanza hasta terminar las cuatro fases.
2. **Nunca escribas secretos en el código, en git ni en la salida de la terminal.** Los secretos viven en `.env` (debe estar en `.gitignore`). Crea `.env.example` sin valores. Antes de cada commit, verifica que ningún secreto se cuele.
3. TypeScript estricto. Sin `any` salvo justificación.
4. Si necesitas una librería que no está en este documento, elige una madura y mantenida, y registra la decisión en `PROGRESS.md`.
5. Al terminar cada fase: registra en `PROGRESS.md` lo que hiciste, cómo se verificó y qué quedó pendiente.
6. **No abras ningún navegador** (ni visible ni headless). Todo se verifica con scripts, tests y peticiones HTTP desde la terminal.

## Qué estamos construyendo

Un agente de IA de atención al cliente para **WhatsApp (API oficial de Meta, Cloud API)** para la empresa **Stakeholders**, con:

- Respuestas sobre los servicios del negocio.
- Agendamiento, reprogramación y cancelación de la **cita de diagnóstico** (30 min) en Google Calendar.
- Comprensión de notas de voz.
- Un dashboard web con: conversaciones en tiempo real, pipeline de leads y un editor del "cerebro" del agente.

Es una **demo** desplegada en Vercel (plan Hobby). Debe quedar lista para pasar a producción sin rehacer nada.

## Stack (obligatorio)

| Pieza | Tecnología |
|---|---|
| Framework | **Next.js** (versión estable más reciente, **App Router**, TypeScript) |
| Hosting | **Vercel** (funciones con Fluid compute; usar `after()` de Next.js para trabajo en segundo plano) |
| Base de datos, auth y realtime | **Supabase** (Postgres + Auth + Realtime + Storage) |
| LLM | **OpenAI** (SDK oficial, tool calling). El modelo se lee de `OPENAI_MODEL`, nunca fijo en el código |
| Transcripción de audio | **OpenAI** (modelo en `OPENAI_TRANSCRIBE_MODEL`) |
| Calendario | **Google Calendar API** con **OAuth 2.0** (client ID + secret + refresh token) de la cuenta `stakeholdersadm@gmail.com` |
| WhatsApp | **Meta WhatsApp Cloud API** vía Graph API (versión en `GRAPH_API_VERSION`) |
| Estilos | Tailwind CSS |

## Variables de entorno (archivo `.env` en la raíz)

**Las provee el usuario (ya están en `.env`; si tienen otros nombres, renómbralas a estos sin cambiar ni mostrar los valores):**
```
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
META_APP_ID=
META_APP_SECRET=                # para validar X-Hub-Signature-256
WHATSAPP_VERIFY_TOKEN=
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SUPABASE_SERVICE_ROLE_KEY=      # "service role" o "secret key" del panel de Supabase
GOOGLE_REFRESH_TOKEN=           # puede no estar todavía (ver "Credenciales faltantes")
```

**Las obtiene el agente con el MCP de Supabase y las escribe en `.env`:**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # o "publishable key"
```

**Opcionales, con valor por defecto en `lib/config.ts`:**
| Variable | Default |
|---|---|
| `GRAPH_API_VERSION` | `v25.0` |
| `OPENAI_MODEL` | un modelo actual de OpenAI con tool calling y entrada de imágenes (confirmado contra la API de modelos) |
| `OPENAI_TRANSCRIBE_MODEL` | un modelo actual de transcripción de OpenAI |
| `GOOGLE_CALENDAR_ID` | `primary` |
| `GOOGLE_BUSY_CALENDAR_IDS` | igual a `GOOGLE_CALENDAR_ID` |
| `APP_TIMEZONE` | `America/Bogota` |
| `MESSAGE_DEBOUNCE_MS` | `6000` |
| `WHATSAPP_DRY_RUN` | `false` (en pruebas siempre `true`: no envía a Meta, guarda el saliente con `wamid` simulado) |
| `CALENDAR_DRY_RUN` | `false` (en pruebas de flujo `true`: simula escrituras; la lectura de disponibilidad sí es real) |

Validar el entorno con Zod al arrancar y fallar nombrando la variable faltante, sin mostrar valores.

### Credenciales faltantes

Si falta una credencial, **no te detengas**: construye todo lo que dependa de ella con su modo simulado, deja sus pruebas reales marcadas como `PENDIENTE (credencial: NOMBRE)` en `PROGRESS.md` y continúa.

## Reglas de negocio de las citas

- Tipo de cita: **Diagnóstico gratuito**, duración **30 minutos**.
- Horario: **lunes a viernes, 7:00 a 19:00**, hora de Bogotá (America/Bogota, UTC−5). La última cita empieza a las 18:30.
- Excluir **festivos de Colombia**.
- Anticipación mínima: **2 horas**. Máximo **30 días** hacia adelante.
- No se permiten citas superpuestas ni en el pasado.
- Modalidades:
  - **Virtual (Google Meet):** el evento se crea con enlace de Meet y el cliente como invitado (se le pide el correo).
  - **Presencial (Medellín):** la dirección se lee de la configuración del agente (`direccion_presencial`). Si está vacía, el agente dice que el equipo confirmará la dirección.
- Todos estos valores viven en la configuración del agente (tabla `agent_configs`), no en el código, para poder cambiarlos desde el dashboard en la fase 04.

## Conocimiento del negocio (semilla inicial de la configuración)

Esta información debe cargarse como configuración inicial del agente (seed). No se escribe dentro del código del prompt.

**Stakeholders** es una firma de contadores públicos en Medellín, Colombia, que funciona como el área contable externa de las empresas. También atiende a personas naturales. Trabaja de forma presencial en Medellín o virtual en todo Colombia. Más de 10 empresas activas y más de 5 años de experiencia profesional. Todo servicio empieza con un **diagnóstico gratuito de 30 minutos**.

Líneas de servicio:

1. **Contabilidad para empresas.** Contador y auxiliar asignados, reunión semanal, cierre mensual, impuestos (IVA, retención en la fuente, ICA, exógena) y estados financieros (NIIF para pymes). Proceso: diagnóstico gratis → propuesta → inicio de operación → reunión semanal → cierre mensual → reporte. Planes mensuales según facturas de venta emitidas por mes:
   - Arranque: hasta 30 facturas → $750.000 COP
   - Crecimiento: 31 a 100 → $1.000.000 COP
   - Consolidación: 101 a 500 → $1.500.000 COP
   - Escala: más de 500 → $2.000.000 COP (incluye automatizaciones con IA y software a la medida)
   Si el cliente no sabe qué plan le corresponde, se define en el diagnóstico.
2. **Nómina electrónica.** Liquidación de nómina, transmisión de nómina electrónica a la DIAN, seguridad social (PILA), prestaciones sociales, ingresos y retiros, y certificados. También manejan empleadas domésticas. El precio se cotiza según el número de personas y la frecuencia de pago.
3. **Renta persona natural.** Ayudan a saber si la persona debe declarar y hasta qué fecha. Topes de referencia publicados en la web: patrimonio bruto superior a $224.095.500 (4.500 UVT), o ingresos, consumos con tarjeta de crédito, consignaciones o compras superiores a $69.718.600 (1.400 UVT). Son cifras orientativas que siempre debe validar un contador.
4. **Servicio personalizado.** Constitución de empresas (SAS, Cámara de Comercio, RUT, facturación electrónica), respuesta a requerimientos y sanciones de la DIAN, devoluciones de saldos a favor, planeación tributaria, declaraciones atrasadas, revisoría y auditoría. Se revisa el caso y se entrega una propuesta con alcance, tiempos y honorarios.
5. **Nexo (ecosistema inteligente de ventas).** Producto de Stakeholders con tres componentes que se instalan juntos: punto de venta virtual (web), asistente virtual con IA (web, WhatsApp, Instagram) y panel de métricas. Proceso: diagnóstico de 30 min gratis → instalación en 7 días → operación mensual. El precio se define en el diagnóstico.

## Modelo de datos (diseñarlo completo desde la fase 01)

Migraciones SQL en `supabase/migrations/`. Activar **RLS en todas las tablas**: el servidor usa la service role key; el dashboard (usuarios autenticados) tiene acceso de lectura y escritura. Activar **Realtime** en `messages`, `conversations` y `leads`.

- `contacts`: id, wa_id (único; puede ser teléfono o BSUID), phone (nullable), bsuid (nullable), name, email, company, created_at, updated_at
- `conversations`: id, contact_id, bot_enabled (default true), status (open/closed), last_inbound_at (para la ventana de 24 h), last_message_at, unread_count, needs_human (bool), processing_lock_until, created_at
- `messages`: id, conversation_id, wamid (único), direction (in/out), sender (contact/bot/human/system), type (text/audio/image/document/other), body, transcript, media_id, storage_path, status (sent/delivered/read/failed), error, raw (jsonb), created_at
- `appointments`: id, contact_id, conversation_id, google_event_id, start_at, end_at, modality (virtual/presencial), service, meet_link, status (scheduled/rescheduled/cancelled/attended/no_show), notes, created_at, updated_at
- `pipeline_stages`: id, key, name, position, is_won, is_lost. Semilla: Nuevo → Calificado → Diagnóstico agendado → Asistió → Propuesta → Cliente (ganado) / Perdido (perdido)
- `leads`: id, contact_id (único), stage_id, service_interest, temperature (caliente/tibio/frío), invoices_per_month, suggested_plan, summary, owner, created_at, updated_at
- `lead_events`: id, lead_id, type, from_stage_id, to_stage_id, actor (bot/human), payload (jsonb), created_at
- `agent_configs`: id, version, status (draft/published), data (jsonb: identidad, tono, conocimiento, embudo, reglas, horarios, citas, direccion_presencial), created_by, created_at, published_at. Solo una versión publicada a la vez.
- `agent_runs`: id, conversation_id, config_version, input (jsonb), output, tool_calls (jsonb), tokens_in, tokens_out, latency_ms, error, created_at (para depurar y para métricas futuras)
- `settings`: key, value (jsonb). Ejemplo: `bot_global_enabled`.

## Restricciones técnicas importantes

- **Webhook de Meta:** responder `200` de inmediato; el procesamiento va en `after()`. Validar la firma `X-Hub-Signature-256` con `META_APP_SECRET` sobre el body crudo.
- **Idempotencia:** Meta reintenta webhooks. Deduplicar por `wamid` (insert con conflicto → ignorar).
- **Identificadores de usuario:** desde 2026 el campo `from`/`wa_id` puede traer un BSUID en vez de un teléfono (usuarios con username). Guardar el identificador tal cual llega y usar también `user_id` si viene. No asumir que siempre es un número telefónico.
- **Ventana de 24 h:** solo se puede enviar texto libre si el cliente escribió en las últimas 24 h (`last_inbound_at`). Fuera de ella, solo plantillas aprobadas.
- **Política de Meta:** el agente es de negocio (atención, ventas, citas de Stakeholders). Si el usuario pide cosas ajenas al negocio, redirige con amabilidad. Nunca actuar como asistente de propósito general.
- **Formato WhatsApp:** nada de Markdown con encabezados ni tablas; usar `*negrita*` con moderación; mensajes cortos.
- **Zona horaria:** todo cálculo de fechas en `APP_TIMEZONE`. Guardar en base de datos en UTC (timestamptz).

## Sistema de diseño del dashboard (aplica a fases 02, 03, 04)

Estilo **neutro, sobrio y profesional, principalmente blanco**. Debe parecer una herramienta interna de una firma contable, no una plantilla genérica de SaaS.

- **Una sola familia tipográfica:** Geist Sans (con `next/font`). Pesos permitidos: 400, 500 y 600. Tamaños: 12, 13, 14, 16 y 20 px. Sin tipografías decorativas ni mezcla de familias. Números tabulares (`tabular-nums`) en tablas y horas.
- **Colores:**
  - Fondo `#FFFFFF`; superficies secundarias `#FAFAFA`
  - Bordes `#E5E5E5` (1 px)
  - Texto principal `#0A0A0A`, secundario `#525252`, terciario `#A3A3A3`
  - Acento único: negro `#0A0A0A` (botones primarios en negro con texto blanco)
  - Estados (solo en badges pequeños, con fondo muy tenue): verde `#15803D`, ámbar `#B45309`, rojo `#B91C1C`
- **Sin** degradados, sombras marcadas (solo sombra muy sutil en popovers y diálogos), emojis en la interfaz, ilustraciones ni colores llamativos.
- Bordes redondeados de 6 px. Íconos `lucide-react` de 16 px con trazo 1.5.
- Densidad media-alta: tablas y listas compactas, espaciado múltiplo de 4 px.
- Solo modo claro.
- Interfaz en español (Colombia). Fechas en formato `lun 6 oct, 3:30 p. m.`.
- Navegación lateral fija con: Conversaciones, Pipeline, Agenda, Configuración del agente.
- Si usas componentes de shadcn/ui, reestilízalos a este sistema; no dejes el aspecto por defecto.
