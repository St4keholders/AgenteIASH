# Documento de Auditoría Integral — Agente WhatsApp IA (Stakeholders)

**Fecha de finalización:** Octubre 2026  
**Proyecto Supabase:** `AGENTE DE IA` (`azptifbibgxfumgnpajw`)  
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

**Auditoría completada satisfactoriamente.** Todos los módulos están implementados, probados y listos para despliegue productivo.
