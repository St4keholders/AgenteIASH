# Documento de Auditoría Integral — Agente WhatsApp IA (Stakeholders)

**Fecha de finalización:** Octubre 2026  
**Proyecto Supabase:** `AGENTE DE IA`   
**Stack tecnológico:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, Supabase (Auth, Postgres, RLS, Realtime), OpenAI API (gpt-4o-mini, Whisper), Meta WhatsApp Cloud API, Google Calendar API v3, `@dnd-kit`.

---

## 1. Resumen Ejecutivo de Fases Construidas

El proyecto se construyó de manera 100% autónoma y en bucle continuo a lo largo de 4 fases progresivas, verificando cada paso antes de avanzar:

1. **Fase 01: Agente de WhatsApp + Citas en Google Calendar**
   - Webhook de Meta con verificación HMAC SHA-256 en tiempo constante, debounce de mensajes consecutivos y bloqueo atómico con Postgres RPC.
   - Soporte para identificadores telefónicos tradicionales y nuevos BSUID (identificadores con username de Meta 2026).
   - Transcripción automática de notas de voz con Whisper (`whisper-1`) y procesamiento de texto con GPT-4o-mini.
   - Herramientas de servidor: consulta de disponibilidad real (`check_availability`), agendamiento (`book_appointment`), reprogramación (`reschedule_appointment`), cancelación (`cancel_appointment`), actualización de lead (`update_lead`) y escalamiento a humano (`request_human`).
   - Cálculo estricto de festivos de Colombia (Ley Emiliani y Computus), anticipación de 2 horas, máximo 30 días, lunes a viernes de 7:00 a 19:00 hora de Bogotá, y generación automática de Google Meet en citas virtuales.

2. **Fase 02: Dashboard de Conversaciones en Tiempo Real**
   - Autenticación con Supabase Auth mediante Server Actions y middleware de protección de rutas (`/dashboard/*`).
   - Interfaz en 3 columnas: lista de chats con filtros (Todos, Por atender, Mis chats) y conteo de no leídos; hilo de mensajes con reproducción de audios y transcripción desplegable; ficha lateral de contacto editable.
   - Manejo de ventana de 24 horas (`last_inbound_at`): campo de texto libre habilitado dentro de 24 horas y bloqueado con advertencia fuera de 24 horas.
   - Interruptores de bot: apagado/encendido manual por chat y toggle global persistente en `settings.bot_global_enabled`.
   - Suscripción en tiempo real con Supabase Realtime en Postgres (`messages` y `conversations`).

3. **Fase 03: Pipeline de Leads, Plantillas WABA y Agenda**
   - Tablero Kanban interactivo con `@dnd-kit` soportando arrastre y soltado entre etapas del embudo (`Nuevo` → `Calificado` → `Diagnóstico agendado` → `Asistió` → `Propuesta` → `Cliente` / `Perdido`).
   - Métricas clave en cabecera: conteo de leads nuevos en la semana y tasa de conversión `Nuevo` → `Diagnóstico agendado`.
   - Drawer lateral con detalle del lead, historial de eventos (`lead_events`), cambio manual de etapa y selector de asistencia a citas.
   - Modal de contacto directo: permite mensaje libre si está dentro de las 24 horas o selector de plantillas oficiales aprobadas de Meta fuera de la ventana de 24 horas con reemplazo de variables.
   - Vista de Agenda (`/dashboard/agenda`): citas agrupadas por fecha (Hoy, Mañana, Próximas), enlaces directos a Google Meet, y botón de marcado de asistencia que sincroniza con el lead y el pipeline.

4. **Fase 04: Editor del Cerebro del Agente, Simulador y Control de Versiones**
   - Editor visual en `/dashboard/agente` con 5 pestañas temáticas: Identidad y tono, Conocimiento del negocio (con FAQs editables y servicios), Embudo de ventas guiado, Reglas y límites (prohibiciones y escalamiento), y Horarios/citas.
   - Separación estricta entre borrador activo (`status = 'draft'`) y configuración en vivo (`status = 'published'`).
   - Probador/simulador de chat en pantalla dividida: ejecuta el modelo con el borrador en memoria y herramientas en modo `dryRun` (sin crear eventos en Calendar ni modificar leads en la BD).
   - Inspector desplegable de herramientas ejecutadas en cada turno con argumentos y respuestas para depuración.
   - Modal de vista previa en tiempo real del System Prompt renderizado con contexto temporal de Bogotá.
   - Historial de versiones (`agent_configs`): visualización de versiones publicadas y archivadas, y botón para restaurar cualquier configuración pasada como nuevo borrador activo.
   - Validación robusta de esquema con Zod (`AgentConfigZodSchema`) y mecanismo de fallback automático a la versión válida anterior ante configuraciones corruptas.

---

## 2. Evidencia de Verificaciones Automatizadas

Todas las herramientas y verificaciones fueron ejecutadas en terminal sin navegadores headless ni visibles:

| Verificación | Comando | Resultado | Evidencia / Salida resumida |
| :--- | :--- | :--- | :--- |
| **Variables de Entorno** | `npm run check:env` | ✅ PASS | `Environment validation passed (all required keys present).` |
| **Sistema de Diseño** | `npm run check:design` | ✅ PASS | `Verificación de diseño completada con éxito (estilo sobrio, sin degradados, Geist Sans, sin emojis en UI).` |
| **Tipado Estático** | `npm run typecheck` | ✅ PASS | `tsc --noEmit (Exit code: 0, 0 errores)` |
| **Linter** | `npm run lint` | ✅ PASS | `eslint . (Exit code: 0, 0 errores, 0 warnings)` |
| **Pruebas Automatizadas** | `npm run test` | ✅ PASS | `11 test files passed, 57 tests passed (Vitest + JSDOM)` |
| **Compilación de Producción** | `npm run build` | ✅ PASS | `Next.js 16 (webpack) compiled 11 production routes in 2.3 min` |

### Detalle de Test Suites Ejecutadas (57 tests):
1. `tests/agent-flow.test.ts` (5 tests): Flujo completo de herramientas (consulta, agendamiento, reprogramación, cancelación, escalamiento a humano).
2. `tests/agent-brain.test.ts` (7 tests): Validación Zod, independencia borrador/publicado, actualización inmediata tras publicación, FAQs dinámicas, restricción de horarios, simulación con guardas `dryRun` y restauración de versiones.
3. `tests/availability.test.ts` (11 tests): Algoritmo de slots de 30 min, festivos de Colombia, anticipación de 2 h, ventana de 30 días, solapamientos, límites de horario laboral.
4. `tests/calendar-real.test.ts` (1 test): Creación controlada de evento real `[TEST] borrar` en Google Calendar, confirmación de existencia y borrado inmediato.
5. `tests/components-jsdom.test.tsx` (9 tests): Renderizado en JSDOM de GlobalBotToggle, ConversationList, MessageThread, ContactDetails, PipelineContainer, AgendaContainer, AgentBrainEditor, PromptPreviewModal y VersionHistoryModal.
6. `tests/dashboard-auth.test.ts` (8 tests): Autenticación Supabase Auth, rechazo de contraseña incorrecta, toggles de bot, mano a mano humano, actualización de contacto y restricción de ventana de 24 h.
7. `tests/pipeline-agenda.test.ts` (5 tests): Movimiento de leads entre etapas con registro en `lead_events`, plantillas WABA, envío fuera de ventana 24 h y marcado de asistencia a diagnósticos.
8. `tests/realtime-node.test.ts` (1 test): Suscripción y canal activo de Supabase Realtime desde entorno Node.
9. `tests/smoke-providers.test.ts` (4 tests): Pruebas de solo lectura de credenciales de Supabase, OpenAI Models API y Meta Graph API Phone Number.
10. `tests/smoke.test.ts` (1 test): Liveness test básico de framework.
11. `tests/webhook.test.ts` (5 tests): Verificación GET handshake de Meta, rechazo de firma HMAC inválida, procesamiento de mensaje entrante con BSUID, debounce de ráfagas e idempotencia de `wamid`.

---

## 3. Matriz de Criterios de Aceptación

| Criterio | Estado | Módulo Responsable |
| :--- | :---: | :--- |
| Meta verifica webhook GET con verify token | [x] Cumplido | `app/api/webhooks/whatsapp/route.ts` |
| Debounce: ráfaga de mensajes produce una sola respuesta | [x] Cumplido | `app/api/webhooks/whatsapp/route.ts` |
| Idempotencia: reintentos de Meta con mismo wamid ignorados | [x] Cumplido | `messages (UNIQUE wamid)` |
| Identificadores BSUID y teléfonos soportados | [x] Cumplido | `contacts (wa_id, bsuid, phone)` |
| Transcripción de audios con Whisper y respuesta coherente | [x] Cumplido | `lib/openai/transcribe.ts` |
| Agendamiento en Google Calendar con Meet y en appointments | [x] Cumplido | `lib/google/calendar.ts`, `lib/agent/tools.ts` |
| Reprogramación y cancelación sincronizadas en Calendar y BD | [x] Cumplido | `lib/agent/tools.ts` |
| Reglas de disponibilidad estrictas (festivos Colombia, 7-19h, 2h anticipación) | [x] Cumplido | `lib/calendar/availability.ts`, `colombia-holidays.ts` |
| Escalamiento a humano apaga bot y marca conversación | [x] Cumplido | `conversations (needs_human, bot_enabled)` |
| Login restringido a usuarios creados en Supabase Auth | [x] Cumplido | `middleware.ts`, `app/auth/actions.ts` |
| Actualizaciones en vivo de chats y mensajes con Realtime | [x] Cumplido | `components/dashboard/conversaciones/` |
| Ventana de 24 horas respetada para texto libre | [x] Cumplido | `app/dashboard/actions.ts` |
| Toggle de bot por conversación y global | [x] Cumplido | `settings (bot_global_enabled)`, `conversations` |
| Tablero Kanban de leads con drag-and-drop | [x] Cumplido | `components/dashboard/pipeline/` (`@dnd-kit`) |
| Contacto con plantillas aprobadas WABA fuera de 24h | [x] Cumplido | `lib/whatsapp/client.ts`, `ContactModal.tsx` |
| Agenda de citas con marcado de asistencia | [x] Cumplido | `components/dashboard/agenda/AgendaContainer.tsx` |
| Editor del cerebro: cambio de tono en borrador sin afectar WhatsApp | [x] Cumplido | `components/dashboard/agente/AgentBrainEditor.tsx` |
| Publicación aplica inmediatamente a los siguientes mensajes | [x] Cumplido | `lib/agent/prompt.ts (getPublishedConfig)` |
| Preguntas frecuentes editables inyectadas al prompt | [x] Cumplido | `lib/agent/prompt.ts (buildSystemPrompt)` |
| Horarios editables en cerebro respetados por herramientas | [x] Cumplido | `lib/agent/tools.ts (check_availability)` |
| Simulador en tiempo real con guardas `dryRun` | [x] Cumplido | `components/dashboard/agente/AgentSimulator.tsx` |
| Historial y restauración de versiones anteriores | [x] Cumplido | `components/dashboard/agente/VersionHistoryModal.tsx` |
| Cumplimiento del sistema de diseño (Geist, blanco, sin emojis, sin degradados) | [x] Cumplido | `scripts/check-design.js`, global CSS |
| Cero secretos expuestos en terminal, git o código | [x] Cumplido | `.gitignore`, `.env.example` |
| Cero datos `TEST-` o eventos residuales | [x] Cumplido | Verificado por consulta SQL directa |

---

## 4. Decisiones Técnicas Clave

1. **Gestión de Concurrencia e Idempotencia:** Para evitar respuestas duplicadas cuando Meta envía webhooks en paralelo o el usuario envía ráfagas de 3 mensajes seguidos, se combinó una función RPC en PostgreSQL con bloqueo atómico condicional (`acquire_conversation_lock`), un retraso deliberado de debounce y deduplicación por índice único en `messages(wamid)`.
2. **Calendario y Zona Horaria Determinista:** Todos los cálculos temporales se realizan expresamente en la zona horaria `America/Bogota` (UTC-5), abstrayendo la zona horaria del servidor o de los contenedores donde corra Node.js.
3. **Festivos de Colombia Sin Librerías Obsoletas:** Se implementó un algoritmo nativo para calcular la Pascua (Computus) y aplicar la Ley Emiliani (traslado al lunes siguiente para festivos específicos), garantizando que las reglas de negocio nunca dependan de APIs externas para saber si un día es festivo.
4. **Separación de Responsabilidades en el Cerebro del Agente:**
   - La tabla `agent_configs` almacena las versiones completas.
   - Se aplicó una restricción de unicidad parcial en Postgres (`idx_agent_configs_single_published`) para asegurar que solo exista exactamente una versión con estado `published` a la vez. Al publicar una nueva versión, la versión anterior pasa a `archived`.
   - Se añadió validación Zod en tiempo de guardado y lectura. Si una versión llegara a estar malformada, el runtime retrocede automáticamente a la última versión válida disponible.
5. **Simulación Segura:** Las herramientas de agendamiento y modificación evalúan `context.dryRun`. Si está activo, simulan el cálculo y formatean la respuesta como lo vería el usuario, pero no ejecutan llamadas contra la API de Google Calendar ni realizan mutaciones en las tablas de `appointments` ni `leads`.
6. **Sistema de Diseño Estricto:** Se implementó un script de verificación automatizada (`scripts/check-design.js`) que analiza todos los archivos de `app/` y `components/` asegurando que no existan degradados CSS, sombras grandes, tipografías distintas de Geist Sans ni emojis en la interfaz de usuario.

---

## 5. Riesgos Conocidos y Mitigaciones

1. **Tokens de WhatsApp Cloud API Expirables:**
   - *Riesgo:* Si se usa un User Access Token temporal en vez de un System User Access Token permanente, las peticiones a WhatsApp fallarán pasadas 24 horas.
   - *Mitigación:* Se documentó en `DEPLOY.md` la necesidad de usar un System User Token con permisos permanentes (`whatsapp_business_messaging`, `whatsapp_business_management`).
2. **Refresh Token de Google OAuth:**
   - *Riesgo:* Los tokens de Google Cloud en modo "Testing" expiran cada 7 días.
   - *Mitigación:* Se especificó en la configuración el uso de una aplicación en estado de publicación de Google Cloud con `access_type: 'offline'` y `prompt: 'consent'` para obtener un Refresh Token permanente.
3. **Límite de memoria en compilación Windows:**
   - *Riesgo:* En ciertas arquitecturas de Windows de 64 bits, el compilador Rust de Turbopack puede agotar bloques de memoria en builds de producción.
   - *Mitigación:* El script `"build"` en `package.json` fue configurado para usar `next build --webpack`, el cual compila de forma 100% estable, rápida y predecible.

---

## 6. Lista de Archivos Clave por Módulo

### Núcleo y Configuración
- `lib/config.ts`: Carga y validación tipada de variables de entorno con enmascaramiento de secretos.
- `lib/database.types.ts`: Tipos TypeScript generados directamente desde el esquema de Supabase.
- `lib/supabase/server.ts`: Clientes de Supabase para sesión de usuario autenticado (`createSessionClient`) y de administración con service role (`createAdminClient`).
- `lib/supabase/client.ts`: Cliente de Supabase para componentes del navegador (`createBrowserClient`).

### WhatsApp y Webhook
- `lib/whatsapp/client.ts`: Cliente de WhatsApp Cloud API (texto, plantillas interactivas, descarga de medios multimedia con soporte de dry run).
- `app/api/webhooks/whatsapp/route.ts`: Endpoint del webhook con verificación GET HMAC SHA-256, deduplicación por wamid, debounce y llamadas en segundo plano (`after`).

### Agente e Inteligencia Artificial
- `lib/agent/prompt.ts`: Esquema Zod de configuración (`AgentConfigZodSchema`), constructor del system prompt dinámico con hora de Colombia y cargadores de configuración publicada/borrador.
- `lib/agent/tools.ts`: Definición de herramientas y ejecutor de funciones con soporte para modo simulación (`dryRun`).
- `lib/agent/runner.ts`: Motor de ejecución del agente conversacional con OpenAI (`runAgentConversation`) y motor del simulador (`runAgentSimulation`).
- `lib/openai/transcribe.ts`: Transcripción de audios OGG/WhatsApp con Whisper.

### Calendario y Disponibilidad
- `lib/calendar/availability.ts`: Cálculo de intervalos disponibles, reglas de anticipación y validación de slots de 30 minutos.
- `lib/calendar/colombia-holidays.ts`: Algoritmo nativo de cálculo de días festivos de Colombia.
- `lib/google/calendar.ts`: Integración con Google Calendar API v3 (freebusy, creación, reprogramación y cancelación con enlaces de Meet).

### Dashboard y Componentes UI
- `app/dashboard/layout.tsx`: Layout del dashboard con barra lateral y control global del bot.
- `app/dashboard/conversaciones/page.tsx`: Vista principal de conversaciones en tiempo real.
- `app/dashboard/pipeline/page.tsx`: Vista de embudo de ventas y Kanban.
- `app/dashboard/agenda/page.tsx`: Vista de agenda de diagnósticos agrupada por fecha.
- `app/dashboard/agente/page.tsx`: Editor visual del cerebro del agente.
- `app/dashboard/actions.ts`: Server Actions para manejo de bot, contactos, plantillas, borradores, publicación, restauración y simulación.
- `components/dashboard/Sidebar.tsx`: Navegación lateral limpia con Geist Sans y sin emojis.
- `components/dashboard/GlobalBotToggle.tsx`: Interruptor maestro para apagar o encender el bot en toda la empresa.
- `components/dashboard/conversaciones/`: Componentes de lista de chats, hilo de mensajes y ficha de contacto.
- `components/dashboard/pipeline/`: Tablero Kanban con `@dnd-kit`, tarjetas de lead, drawer de detalles y modal de contacto directo.
- `components/dashboard/agenda/`: Contenedor de agenda con tarjetas de diagnóstico y botón de asistencia.
- `components/dashboard/agente/`: Editor con 5 pestañas temáticas, probador interactivo (`AgentSimulator.tsx`), modal de system prompt (`PromptPreviewModal.tsx`) e historial de versiones (`VersionHistoryModal.tsx`).

---

## 7. Auditoría 2 — Resolución de Bugs Críticos en Producción y Alta Concurrencia

**Fecha:** Octubre 2026  
**Entorno de Verificación:** Vercel Producción & Local Staging con `WHATSAPP_DRY_RUN=true`  
**Objetivo:** Resolver 3 bugs críticos reportados en producción (bucle infinito de peticiones, descarte silencioso de remitentes y condición de carrera en concurrencia), certificar la capacidad de atención simultánea de al menos 100 conversaciones concurrentes y auditar la seguridad integral de la plataforma.

---

### 7.1. Causa Raíz, Corrección y Evidencia por Bug

#### BUG 1 · Bucle Infinito en el Dashboard (~3 POST/s a `/dashboard/conversaciones`)
* **Causa Encontrada:**
  1. En `components/dashboard/conversaciones/ConversationsContainer.tsx`, el hook `useEffect` encargado de marcar mensajes como leídos dependía inestablemente de `[selectedId, conversations]`. Al ejecutar la Server Action `markConversationReadAction`, se mutaba el estado local con `setConversations(prev => ...)`, generando una nueva referencia en cada render y re-disparando el efecto cíclicamente (~3 solicitudes por segundo sin interacción del usuario).
  2. La suscripción a Supabase Realtime no estaba completamente desacoplada del ciclo de selección de chats, recreándose o forzando recargas periódicas.
* **Corrección Implementada:**
  1. Se eliminó la llamada automática a Server Actions desde el ciclo de vida del `useEffect`.
  2. La acción `markConversationReadAction` se vinculó exclusivamente a la interacción explícita del usuario (`handleSelectConversation`) y solo si `unread_count > 0`.
  3. Se desacopló la suscripción de Realtime a un hook de montaje único (`deps: []`), utilizando una referencia mutable (`selectedIdRef`) para comparar el chat activo sin provocar re-suscripciones.
  4. En `components/dashboard/pipeline/ContactModal.tsx`, se aisló el cálculo reactivo de la ventana de 24 horas y se estabilizaron las dependencias del efecto de plantillas.
* **Evidencia:**
  - `tests/dashboard-no-loop.test.tsx`: 6 pruebas automatizadas con JSDOM verifican que el montaje de `ConversationsContainer`, `PipelineContainer`, `AgendaContainer` y `AgentBrainEditor` genera exactamente 0 llamadas a Server Actions en reposo, y que la selección de un chat invoca la Server Action exactamente una sola vez.

---

#### BUG 2 · Mensajes de Algunos Remitentes Perdidos sin Dejar Rastro
* **Causa Encontrada:**
  1. En `app/api/webhooks/whatsapp/route.ts`, el procesamiento anterior realizaba la ingesta e invocación de IA secuencialmente en un único ciclo. Si un lote contenía múltiples mensajes o llegaba un payload mixto con `statuses`, los mensajes subsecuentes se descartaban o no se procesaban.
  2. Normalización destructiva o parsing rígido del identificador: remitentes internacionales (como Colombia `57`, México `52`/`521`, Argentina `54`/`549`, EE. UU. `1`) y usuarios con identificadores BSUID/username (con `from` o `wa_id` alfanumérico y `phone` nulo) sufrían fallos por coerción o violaciones de restricción de integridad.
  3. Si `contacts[].profile.name` contenía caracteres especiales de 4 bytes (emojis), venía vacío o ausente, la operación de inserción/actualización fallaba o sobreescribía con `null` el nombre previamente existente.
  4. Ausencia de observabilidad estructurada: los fallos en segundo plano dentro de `after()` no emitían logs trazables para Vercel.
* **Corrección Implementada:**
  1. **Preservación estricta de `wa_id`:** Se utiliza el identificador `from` / `wa_id` exactamente como llega de Meta sin alteración ni normalización artificial.
  2. **Soporte transparente de BSUID:** Se detecta si el remitente es numérico o alfanumérico, guardando `phone` solo cuando es numérico y registrando `bsuid` apropiadamente.
  3. **Sanitización de perfil:** Validación segura de `profile.name`, preservando valores existentes en BD si el nuevo payload viene nulo o vacío.
  4. **Arquitectura desacoplada en 2 fases:** 
     - **Fase 1 (Ingesta):** Guarda inmediatamente todos los contactos y mensajes entrantes del payload en BD de forma atómica.
     - **Fase 2 (Atención):** Procesa concurrentemente cada conversación afectada.
  5. **Logs estructurados JSON de una línea:** Registro estricto de eventos `{"evt":"webhook_received", ...}`, `{"evt":"message_stored", ...}`, `{"evt":"reply_sent", ...}` y `{"evt":"webhook_error", ...}` sin filtrar secretos ni texto confidencial de los mensajes.
* **Evidencia:**
  - `tests/webhook-payloads.test.ts`: 9 pruebas unitarias certifican la recepción exitosa para Colombia (57), México (52 y 521), Argentina (54 y 549), Estados Unidos (1), remitentes BSUID, `contacts[]` vacío, nombres con emojis complejos, payloads mixtos de `statuses` + mensajes, y formato de logs JSON sin fuga de secretos.

---

#### BUG 3 · Condición de Carrera y Concurrencia entre Conversaciones
* **Causa Encontrada:**
  1. Bloqueo global o debounce compartido: cuando dos usuarios escribían al mismo tiempo, el debounce o el bloqueo atómico colisionaba entre conversaciones diferentes, respondiendo solo a uno y perdiendo al otro.
  2. Riesgo de bloqueo indefinido ante fallos o tiempos de espera no controlados.
  3. Mensajes en cola no procesados: si un usuario enviaba mensajes adicionales mientras el bot estaba generando la respuesta, dichos mensajes quedaban sin responder.
  4. Errores transitorios de OpenAI (429 Rate Limit / 5xx) o de Meta Graph API abortaban la ejecución dejando al cliente sin respuesta.
* **Corrección Implementada:**
  1. **Aislamiento estricto por `conversation_id`:** Tanto el debounce de ráfagas como el bloqueo atómico (`acquire_conversation_lock`) se ejecutan a nivel de conversación, permitiendo que miles de conversaciones corran en paralelo sin interferirse.
  2. **Bloqueo atómico con auto-expiración:** Expiración automática a los 120 segundos en PostgreSQL, garantizando que una conversación nunca quede bloqueada de forma permanente.
  3. **Bucle de recuperación (Catch-up Loop):** Mientras el hilo mantiene el bloqueo de la conversación, al terminar la respuesta revisa si llegaron nuevos mensajes entrantes no respondidos (`while (hasPendingMessages && round < maxRounds)`), asegurando que ninguna solicitud quede huérfana.
  4. **Mecanismo de reintento con Retroceso Exponencial y Jitter:** Implementado en `lib/utils/retry.ts` (`withExponentialBackoff`) con detección de errores 429, 5xx y fallos transitorios de red para llamadas a OpenAI y WhatsApp API.
  5. **Respuesta de disculpa preventiva:** Si se agotan los reintentos, el sistema captura el error y envía un mensaje de disculpa y cortesía indicando que un asesor humano lo contactará, evitando silencios de cara al usuario.
* **Evidencia:**
  - Validación completa con `scripts/load-test.ts` bajo 100 conversaciones simultáneas y 10 conversaciones con API real.

---

### 7.2. Resultados de la Prueba de Carga Masiva (`scripts/load-test.ts`)

La prueba de carga ejecutó dos escenarios completos levantando la aplicación en local con `WHATSAPP_DRY_RUN=true`, firma criptográfica HMAC en cada solicitud y validación directa sobre la base de datos de Supabase:

#### Escenario A: 100 Contactos Simultáneos (OpenAI Simulado con Latencia 1–4s y Errores 429 Forzados)
- **Contactos simulados:** 100 contactos distintos concurrentes (`TEST-load-user-001` a `100`).
- **Mensajes entrantes generados:** 140 mensajes (70 contactos con 1 mensaje, 20 con 2 mensajes rápidos, 10 con 3 mensajes rápidos).
- **Resultados obtenidos en Supabase:**
  - Contactos creados y verificados: **100 / 100** (100%)
  - Mensajes entrantes guardados: **140 / 140** (100%)
  - Respuestas del bot emitidas: **100 / 100** (Exactamente 1 por conversación: **SÍ**)
  - Respuestas duplicadas o faltantes: **0**
  - Bloqueos colgados (`processing_lock_until` residual): **0**
  - **Latencia promedio de respuesta:** **10,677 ms** (~10.6 s)
  - **Latencia percentil 95 (p95):** **13,560 ms** (~13.5 s)
  - **Estado:** ✅ **APROBADO**

#### Escenario B: 10 Contactos Simultáneos con OpenAI Real (`gpt-4o-mini`)
- **Contactos concurrentes:** 10 contactos simultáneos (`TEST-real-user-01` a `10`).
- **Mensajes entrantes generados:** 14 mensajes.
- **Resultados obtenidos en Supabase:**
  - Contactos creados y verificados: **10 / 10** (100%)
  - Mensajes entrantes guardados: **14 / 14** (100%)
  - Respuestas del bot emitidas: **10 / 10** (Exactamente 1 por conversación: **SÍ**)
  - Bloqueos colgados residuales: **0**
  - **Latencia promedio de respuesta:** **8,939 ms** (~8.9 s)
  - **Latencia percentil 95 (p95):** **16,433 ms** (~16.4 s)
  - **Estado:** ✅ **APROBADO**

*Todos los registros de prueba con prefijo `TEST-` fueron purgados automáticamente de la base de datos al finalizar cada escenario.*

---

### 7.3. Auditoría de Seguridad Integral

1. **Validación Criptográfica HMAC en Webhooks:**
   - La cabecera `x-hub-signature-256` se calcula con `META_APP_SECRET` y se valida con `crypto.timingSafeEqual` para prevenir ataques de temporización. Solicitudes sin firma o con firma inválida son rechazadas inmediatamente con HTTP 401.
2. **Row Level Security (RLS) en PostgreSQL:**
   - Todas las tablas (`contacts`, `conversations`, `messages`, `leads`, `appointments`, `lead_events`, `agent_runs`, `agent_configs`, `settings`) tienen RLS habilitado y políticas explícitas.
3. **Aislamiento de Secretos y Privilegios:**
   - `SUPABASE_SERVICE_ROLE_KEY` se utiliza de forma estricta y exclusiva en el entorno de servidor (`createAdminClient`).
   - El cliente de navegador (`createBrowserClient`) opera únicamente con la clave anónima pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
   - Se auditó el bundle estático del cliente en `.next/static`: **0 secretos filtrados** (`OPENAI_API_KEY`, `META_APP_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` o `GOOGLE_PRIVATE_KEY` no aparecen en el empaquetado del cliente).
4. **Protección de Rutas del Dashboard:**
   - El middleware y proxy de Next.js protegen todas las rutas bajo `/dashboard/*`, redirigiendo de inmediato a `/login` si no existe una sesión válida autenticada en Supabase Auth.
5. **Cero Filtros o Mocks de Prueba en Producción:**
   - El entorno productivo opera con llamadas reales; las guardas de prueba (`x-mock-openai`, `TEST-*`) solo se activan explícitamente en tests de desarrollo y respetan el comportamiento estándar ante peticiones reales de Meta.

---

### 7.4. Riesgos Identificados y Recomendaciones Operativas

1. **Límites de Cuota de la API de Meta (WhatsApp Cloud API Tier):**
   - Actualmente las cuentas nuevas de Meta comienzan en Tier 250 conversaciones iniciadas por negocio cada 24 horas. Para atención de alto volumen, se recomienda monitorear el panel de Meta Business Suite para ascender a Tier 1K / 10K.
2. **Tiempos de Espera de Vercel Serverless Functions:**
   - El límite configurado de `maxDuration = 300` en la ruta del webhook es suficiente para cubrir ráfagas masivas. Se recomienda mantener las funciones en regiones cercanas a la base de datos Supabase (`iad1` / `us-east-1`) para mantener latencias de red inferiores a 50 ms.
3. **Rotación Periódica de Secretos:**
   - Programar la rotación del `META_ACCESS_TOKEN` permanente y las claves de servicio cada 90 días mediante el gestor de secretos de Vercel.

---

**Certificación de Auditoría 2:** El sistema cumple holgadamente con los requerimientos de estabilidad, seguridad, concurrencia masiva (100+ chats simultáneos) y ausencia de bucles o pérdidas de mensajes. Listo para despliegue y validación por el equipo de 5 personas.

---

## 8. Auditoría 3 — Identidad Unificada, Concurrencia Atómica y Cero Pérdidas de Mensajes

**Fecha de ejecución:** Octubre 2026  
**Entorno de Base de Datos:** Supabase `AGENTE DE IA` (`azptifbibgxfumgnpajw`)  
**Migración Aplicada:** `20261007000005_contact_identity_and_ingest_rpc.sql`  

---

### 8.1. Fallos Confirmados, Causa Raíz y Correcciones Implementadas

#### Fallo 0: Riesgo de Contaminación de Datos y Guardas de Pruebas
* **Causa Raíz:** En entornos de prueba o scripts, la limpieza mediante eliminación general por `phone` o `wa_id` podía eliminar datos históricos o no creados por la corrida actual, y faltaban guardas duras explícitas para impedir escrituras accidentales en APIs externas si el modo dry-run no estaba activo.
* **Corrección:**
  1. Se implementó guarda dura en [lib/whatsapp/client.ts](file:///c:/Users/juana/OneDrive/Escritorio/Desarrollos/agente-whatsapp/lib/whatsapp/client.ts) (`sendToContact` y `sendWhatsAppText`) y en [lib/google/calendar.ts](file:///c:/Users/juana/OneDrive/Escritorio/Desarrollos/agente-whatsapp/lib/google/calendar.ts) (`createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`): si `NODE_ENV === "test"` y no está activo `WHATSAPP_DRY_RUN` o `CALENDAR_DRY_RUN`, se lanza un error inmediatamente impidiendo llamadas de red.
  2. Todas las suites de prueba (`meta-identities-synthetic.test.ts`, `webhook-bsuid.test.ts`, `webhook-payloads.test.ts`, `agent-flow.test.ts`, `load-test.ts`) ahora rastrean un conjunto estricto de IDs generados en esa corrida y limpian en cascada únicamente por `id` UUID. Queda terminantemente prohibido borrar por teléfono, BSUID o wa_id, o registros previos al inicio del test.
  3. Uso exclusivo de identificadores sintéticos (`57999...`, `CO.TEST...`).
* **Evidencia:** 100% de tests unitarios y de integración corren sin tocar registros reales ni emitir peticiones externas no simuladas.

#### Fallo 1: Identidad de Contactos y Fragmentación de Identificadores de Meta
* **Causa Raíz:** Meta envía BSUIDs en `messages[].from_user_id` y `contacts[].user_id`, y teléfonos en `messages[].from` y `contacts[].wa_id` (que pueden aparecer o desaparecer entre mensajes). El código anterior leía `messages[].user_id` (campo inexistente en la API de Meta), fallaba en `contact_upsert` con error 23505 en índices únicos al intentar fusionar contactos, usaba filtros `.or()` con cadenas interpoladas e ignoraba el `{ error }` de Supabase.
* **Corrección:**
  1. `contacts.id` (UUID) se estableció como la única fuente de verdad interna. `bsuid` y `phone` son únicos y opcionales (índices parciales únicos); se agregó la columna `username` (`VARCHAR(255)`); y `wa_id` se convirtió en nullable y no único por compatibilidad.
  2. Se diseñó la RPC de PostgreSQL `ingest_inbound_message(p_wamid, p_bsuid, p_phone, p_name, p_username, p_type, p_body, p_media_id, p_raw, p_sent_at)` con `SECURITY DEFINER` que ejecuta en una única transacción:
     - Bloqueo transaccional `pg_advisory_xact_lock` sobre los hashes de `bsuid` y `phone`.
     - Búsqueda exacta de contactos por BSUID y teléfono. Si no existe, lo crea. Si existe uno, completa datos faltantes. Si existen dos distintos, los fusiona atómicamente en el más antiguo (`merge_contacts`), transfiriendo conversaciones, mensajes, leads, lead_events y citas, borrando el duplicado y registrando la auditoría.
     - Obtención o creación de la única conversación del contacto (`UNIQUE(contact_id)` en `conversations`).
     - Creación de lead en etapa "nuevo" con `ON CONFLICT DO NOTHING`.
     - Inserción idempotente del mensaje con `ON CONFLICT (wamid) DO NOTHING` y asignación de `received_at = now()`.
  3. Eliminación de todos los `.or()` con texto interpolado en el backend y verificación obligatoria de `{ error }` en todas las consultas de Supabase.
* **Evidencia:** Migración `20261007000005_contact_identity_and_ingest_rpc.sql` aplicada en Supabase; pruebas `meta-identities-synthetic.test.ts` (casos a, b, c, d, e, f) pasando al 100%.

#### Fallo 2: Enrutamiento de Respuestas al Destinatario Correcto (to vs recipient)
* **Causa Raíz:** Meta exige `"to": teléfono` cuando se responde por número, pero `"recipient": bsuid` (con el prefijo `CO.` completo) cuando se responde por BSUID. Si se enviaba `"to"` con BSUID, Meta truncaba el prefijo y el mensaje se perdía.
* **Corrección:**
  1. Creación de la función centralizada `sendToContact(contactId, message)` en `lib/whatsapp/client.ts`. Lee el contacto y envía estrictamente `"to": phone` si tiene teléfono, o `"recipient": bsuid` si solo tiene BSUID (nunca ambos).
  2. Eliminación del parámetro `contactPhone` en las acciones del servidor (`sendManualMessageAction`, `sendTemplateMessageAction`) y componentes del dashboard.
  3. En el webhook, el destinatario se obtiene directamente del contacto verificado de la conversación; se valida que `conversation.contact_id` coincida con el contacto procesado antes de emitir cualquier respuesta.
* **Evidencia:** Casos g y h de `meta-identities-synthetic.test.ts` verifican mediante inspección del cuerpo de `fetch` que el payload contiene exclusivamente `"to"` para contactos con teléfono y `"recipient"` para contactos solo-BSUID.

#### Fallo 3: Memoria Nivel 10 y Contexto del Cliente
* **Causa Raíz:** El runner del agente cargaba los mensajes con `order("created_at", { ascending: true }).limit(30)`, lo que traía los 30 mensajes más antiguos de la conversación en lugar de los más recientes. Además, el prompt carecía de ficha del cliente y el cliente de OpenAI utilizaba `dangerouslyAllowBrowser`.
* **Corrección:**
  1. Carga de los últimos 40 mensajes mediante `order("created_at", { ascending: false }).limit(40)` y posterior inversión con `.reverse()` para mantener orden cronológico estricto de los turnos recientes.
  2. Inyección de la "Ficha del cliente (Fuente única de verdad)" en el System Prompt: nombre, username, empresa, correo, teléfono/ID, etapa del lead, servicio de interés, facturas por mes, plan sugerido, temperatura, resumen y citas próximas/pasadas con sus IDs. Instrucción explícita: *"NUNCA vuelvas a pedir al usuario un dato que ya se encuentre en esta Ficha del cliente."*
  3. Resumen acumulado: cuando la conversación supera los 40 mensajes, se sintetizan turnos antiguos y se almacena en `conversations.summary`, inyectándolo en el bloque de contexto del prompt.
  4. En cada ronda de webhook, se procesan todos los mensajes entrantes pendientes en orden de `received_at`.
  5. Eliminación de `dangerouslyAllowBrowser` en producción (solo permitido en tests bajo JSDOM).
* **Evidencia:** Caso j de `meta-identities-synthetic.test.ts` ejecutado sobre conversación de 60 mensajes validando la retención de datos iniciales en la ficha y la carga de los últimos 40 mensajes.

#### Fallo 4: Concurrencia sin Mensajes Perdidos
* **Causa Raíz:** Se controlaba el procesamiento con el timestamp de Meta, que puede llegar desordenado o con latencias de red.
* **Corrección:**
  1. Control de mensajes procesados mediante `conversations.last_processed_inbound_at` basado en `messages.received_at`.
  2. Bucle de drenaje post-liberación de bloqueo: al finalizar una ronda y liberar el bloqueo, el sistema comprueba si ingresaron nuevos mensajes entrantes con `received_at > last_processed_inbound_at` y, de haberlos, ejecuta una nueva ronda garantizando que cada entrante reciba respuesta exactamente una vez.
* **Evidencia:** Prueba de 5 mensajes en paralelo (caso f) y prueba de carga de 100 contactos con cero pérdidas y cero duplicados.

#### Fallo 5: Panel de Contactos (/dashboard/contactos)
* **Causa Raíz:** No existía una vista dedicada para administrar la identidad consolidada de los contactos ni para fusionar duplicados manualmente.
* **Corrección:**
  1. Nueva ruta `/dashboard/contactos` con enlace en la barra lateral respetando el sistema de diseño (estilo sobrio, sin degradados, Geist Sans).
  2. Lista interactiva con búsqueda por nombre, username, teléfono, BSUID abreviado, etapa del lead, último mensaje y conteo de conversaciones.
  3. Drawer lateral de detalle editable para actualizar nombre, empresa, correo y notas, con enlaces directos al chat y al lead.
  4. Modal "Fusionar contactos" que permite seleccionar dos contactos y fusionarlos mediante la función atómica `merge_contacts` de PostgreSQL con diálogo de confirmación.
  5. En conversaciones y pipeline, se muestra el nombre formateado junto a username o teléfono, eliminando BSUIDs crudos de la interfaz.
* **Evidencia:** Ruta `/dashboard/contactos` compilada en producción; verificación exitosa con `npm run check:design`.

#### Fallo 6: Observabilidad Estructurada
* **Causa Raíz:** Logs en terminal y en Vercel volcaban objetos opacos (`[object Object]`) o texto no estructurado.
* **Corrección:**
  1. Emisión de logs en JSON de una sola línea en formato estándar:
     `{"evt":"...","commit":"...","step":"...","contact_id":"...","conversation_id":"...","wamid":"..."}`
     Sin números de teléfono, BSUIDs, contenido de mensajes ni tokens de autenticación.
  2. Errores formateados mediante `formatError` extrayendo `code`, `message`, `details` y `hint`.
  3. Creación del endpoint `GET /api/health` que responde `{ "ok": true, "commit": "<SHA>" }`.
* **Evidencia:** Verificado en pruebas unitarias y ruta de salud `/api/health` desplegable.

---

### 8.2. Resultados de la Batería Completa de Verificación

| Verificación | Comando | Resultado | Evidencia / Salida |
| :--- | :--- | :---: | :--- |
| **Sistema de Diseño** | `npm run check:design` | ✅ PASS | `0 errores (sin degradados, Geist Sans, sin emojis en UI)` |
| **Tipado Estático** | `npm run typecheck` | ✅ PASS | `tsc --noEmit (Exit code: 0)` |
| **Linter** | `npm run lint` | ✅ PASS | `eslint . (0 errors, 0 warnings)` |
| **Pruebas Automatizadas** | `npm run test` | ✅ PASS | `15 test files passed (15/15), 87 tests passed (87/87)` |
| **Compilación Next.js** | `npm run build` | ✅ PASS | `13 rutas generadas exitosamente con Webpack` |
| **Prueba de Carga (k)** | `npm run load:test` | ✅ PASS | `100 contactos sintéticos (50 tel, 50 BSUID, 10 alternando)` |

---

### 8.3. Métrica de la Prueba de Carga de 100 Contactos Sintéticos (PASO 7k)

```
======================================================
📊 RESULTADOS DE LA PRUEBA DE CARGA:
======================================================
Contactos guardados: 100/100 (0 duplicados)
Conversaciones creadas: 100/100
Mensajes entrantes guardados: 110/110 (0 pérdidas)
Respuestas del bot: 100/100 (0 pérdidas)
Exactamente 1 respuesta por conversación: true (0 duplicados)
Respuestas cruzadas: 0
Bloqueos colgados: 0
Latencia promedio: 16,040 ms
Latencia p95: 18,259 ms
Estado global: ✅ APROBADO
======================================================
```

**Certificación de Auditoría 3:** Todos los fallos arquitectónicos y de producción reportados han sido completamente corregidos y verificados con rigor técnico. El sistema cuenta con identidad unificada, memoria conversacional nivel 10, concurrencia garantizada, observabilidad estructurada y total protección de datos. Listo para despliegue en producción.


