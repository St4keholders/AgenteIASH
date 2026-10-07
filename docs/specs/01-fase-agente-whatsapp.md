# 01 · Fase 1: Agente de WhatsApp + citas en Google Calendar

Lee primero `00-contexto-general.md`. Modo autónomo: no pidas aprobación, construye y verifica hasta cumplir los criterios.

## Objetivo de esta fase

Que un cliente escriba al WhatsApp de Stakeholders y el agente:
1. Responda sobre los servicios usando la configuración publicada.
2. Entienda notas de voz.
3. Agende, reprograme y cancele la cita de diagnóstico en Google Calendar (con Meet si es virtual).
4. Guarde todo en Supabase (contactos, conversaciones, mensajes, citas, leads y ejecuciones del agente).

Esta fase **no** incluye interfaz de dashboard. Solo las páginas públicas necesarias para publicar la app de Meta.

## 1. Proyecto y base de datos

- Crea el proyecto Next.js (App Router, TypeScript, Tailwind).
- Crea **todas** las migraciones del modelo de datos descrito en `00` (aunque algunas tablas se usen en fases posteriores), con RLS, índices (por `wa_id`, `wamid`, `conversation_id`, `start_at`) y Realtime activado donde se indica.
- Crea un seed con:
  - La configuración inicial del agente (`agent_configs` versión 1, `published`) con identidad, tono, conocimiento del negocio, embudo, reglas, horarios y citas, según `00`.
  - Las etapas del pipeline.
  - `settings.bot_global_enabled = true`.
- Clientes de Supabase separados: uno de servidor (service role) y uno para el navegador (anon/publishable), aunque el segundo se use desde la fase 02.

## 2. Webhook de WhatsApp

Ruta: `app/api/webhooks/whatsapp/route.ts`

- **GET:** verificación de Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`) contra `WHATSAPP_VERIFY_TOKEN`.
- **POST:**
  1. Leer el body crudo y validar `X-Hub-Signature-256`. Si falla → 401.
  2. Responder `200` de inmediato.
  3. En `after()`:
     - **Mensajes entrantes:** upsert de contacto (nombre del perfil si viene), upsert de conversación, insertar el mensaje (dedupe por `wamid`), actualizar `last_inbound_at`, crear el lead en etapa "Nuevo" si no existe.
     - **Statuses** (sent/delivered/read/failed): actualizar `messages.status` y `error`.
     - Disparar el procesamiento con **debounce** (ver punto 3).

Tipos de mensaje:
- `text` → body.
- `audio` → descargar el media con la Graph API (`/{media_id}` y luego la URL con el token), guardar en Supabase Storage (bucket privado `media`), transcribir con OpenAI y guardar en `messages.transcript`. El agente recibe la transcripción.
- `image` → guardar en Storage; si el modelo configurado acepta imágenes, pasarla al agente; si no, el agente pide que lo describa en texto.
- `interactive` (respuestas de botones o listas) → tratar el título como texto.
- Otros (stickers, ubicación, documentos, contactos) → guardar y que el agente responda con amabilidad que por ahora solo procesa texto, audios e imágenes.

## 3. Procesamiento con debounce y bloqueo

Para juntar mensajes cortados ("hola" + "quiero una cita" + "para mañana"):

1. Después de guardar un mensaje entrante, esperar `MESSAGE_DEBOUNCE_MS`.
2. Si llegó otro mensaje entrante más nuevo en esa conversación, terminar (el más nuevo se encarga).
3. Tomar un bloqueo atómico con una función SQL (RPC) sobre `conversations.processing_lock_until` para que dos ejecuciones no respondan a la vez.
4. Reunir todos los mensajes entrantes sin responder desde la última respuesta, ejecutar el agente, enviar la respuesta y liberar el bloqueo.
5. Si `bot_enabled = false` en la conversación o `bot_global_enabled = false`, no responder (solo guardar).

Respetar el límite de duración de funciones de Vercel Hobby (300 s). El flujo normal debe tardar segundos.

## 4. El agente

Módulo `lib/agent/` con:

- **Constructor del system prompt** a partir de la configuración **publicada** en `agent_configs` (nada de prompt fijo en el código). Siempre inyectar la **fecha, día de la semana y hora actuales en Bogotá**, para que entienda "mañana", "el jueves" o "la próxima semana".
- **Historial:** últimos N mensajes de la conversación (configurable; empezar con 30).
- **Herramientas (tool calling):**
  - `check_availability(date | date_range)` → horarios libres de 30 min según las reglas de `00` y la disponibilidad real (freebusy de Google sobre `GOOGLE_BUSY_CALENDAR_IDS`). Ofrecer máximo 3 o 4 opciones por día.
  - `book_appointment(name, email?, modality, service, start_iso, notes?)` → valida reglas, crea el evento y guarda en `appointments`. Si es virtual, crea el enlace de Meet (`conferenceData.createRequest`) e invita al correo del cliente (`sendUpdates: "all"`). Mueve el lead a "Diagnóstico agendado".
  - `reschedule_appointment(appointment_id, new_start_iso)` → valida y actualiza el evento.
  - `cancel_appointment(appointment_id, reason?)` → cancela el evento y marca `cancelled`.
  - `list_my_appointments()` → citas futuras del contacto actual.
  - `update_lead(fields)` → guarda nombre, correo, empresa, servicio de interés, facturas por mes, plan sugerido, temperatura y un resumen corto. Registra un `lead_event`.
  - `request_human(reason)` → `needs_human = true`, `bot_enabled = false` en la conversación, y envía al cliente un mensaje de que un asesor le escribirá.
- Las herramientas **validan todo en el servidor** (horario, festivos, superposición, anticipación); el modelo nunca decide solo si un horario es válido.
- Guardar cada ejecución en `agent_runs`.
- Si OpenAI o Google fallan: registrar el error y responder un mensaje breve de disculpa, sin dejar al cliente sin respuesta.

**Comportamiento esperado (semilla de configuración):**
- Español de Colombia, trato de "tú", cercano y profesional, mensajes breves.
- Se presenta como el asistente virtual de Stakeholders. Si le preguntan, admite que es una IA.
- Embudo: saludar → entender la necesidad → calificar (en contabilidad, preguntar cuántas facturas emite y sugerir plan) → proponer el diagnóstico gratuito → agendar.
- Antes de agendar, confirma nombre, servicio, modalidad, fecha y hora (y correo si es virtual) y pide confirmación explícita.
- No da asesoría tributaria definitiva por chat: da información orientativa y la lleva al diagnóstico.
- Si el cliente pide hablar con una persona, está molesto o el caso es complejo → `request_human`.
- Temas ajenos a Stakeholders → redirige con amabilidad al negocio.

## 5. Cliente de Google Calendar (OAuth)

- `lib/google/calendar.ts` usando el refresh token para obtener access tokens.
- Script local `scripts/google-auth.ts` que abre el flujo de consentimiento de OAuth con el alcance de Google Calendar, recibe el código en un redirect local y **escribe el refresh token directamente en `.env`** sin imprimirlo. Documenta en el README qué redirect URI se debe registrar en Google Cloud. Si `GOOGLE_REFRESH_TOKEN` ya existe en `.env`, el script no es necesario.
- Documenta en el README: la pantalla de consentimiento de Google debe estar **"En producción"**, porque en "En pruebas" el refresh token caduca a los 7 días.

## 6. Cliente de WhatsApp

`lib/whatsapp/` con funciones para: enviar texto, marcar como leído, descargar media, y (preparado para la fase 03) enviar plantillas y listar plantillas aprobadas del WABA. Guardar cada mensaje saliente en `messages` con su `wamid` y `sender = bot`.

## 7. Páginas públicas para publicar la app de Meta

Con el sistema de diseño de `00` (blanco, una tipografía):
- `/privacidad`: política de privacidad (qué datos se recogen por WhatsApp, para qué, con quién se comparten: Meta, OpenAI, Google, Supabase; cómo solicitar su eliminación). Responsable: Stakeholders, Medellín, Colombia.
- `/eliminacion-de-datos`: instrucciones para solicitar la eliminación de datos.
- `/`: página mínima con el nombre del proyecto (sin exponer datos).

## 8. Documentación y despliegue

Un `README.md` con:
- Cómo correr en local y cómo aplicar las migraciones en Supabase.
- Cómo obtener el refresh token de Google.
- Pasos de despliegue: repositorio privado en GitHub → importar en Vercel → variables de entorno → deploy.
- Configurar en Meta: URL del webhook `https://<proyecto>.vercel.app/api/webhooks/whatsapp`, verify token, suscripción al campo `messages` y publicar la app con la URL de `/privacidad`.

## Criterios de aceptación

- [ ] Meta verifica el webhook correctamente.
- [ ] Mensaje "hola" → respuesta en pocos segundos; varios mensajes seguidos → una sola respuesta.
- [ ] Una nota de voz se transcribe y se responde con sentido.
- [ ] "Quiero agendar para mañana" → ofrece horarios reales libres → agenda → aparece en Google Calendar con Meet (virtual) y en `appointments`.
- [ ] "Muévela para el jueves a las 3" → se reprograma en Calendar y en la base de datos.
- [ ] "Cancélala" → se cancela en ambos.
- [ ] No se puede agendar fuera de L–V 7:00–19:00, en festivos, en el pasado ni encima de otra cita.
- [ ] Pedir un asesor → el bot se apaga en esa conversación.
- [ ] Reintentos de Meta no duplican mensajes ni respuestas.
- [ ] Ningún secreto en el repositorio.
