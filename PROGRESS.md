# Bitácora de Desarrollo - Agente WhatsApp IA (Stakeholders)

## Estado General
- **Fase actual:** 02 · Dashboard de conversaciones completada. Iniciando Fase 03 · Pipeline de leads y contacto directo.
- **Paso actual:** Fase 02 concluida y verificada con tests E2E y unitarios (40 tests pasando).
- **Modo:** Autónomo y en bucle.
- **Proyecto Supabase verificado:** `AGENTE DE IA` (id: `azptifbibgxfumgnpajw`).

---

## Verificaciones Requeridas en Cada Iteración
- [x] `npm run check:env` (PASS)
- [x] `npm run check:design` (PASS)
- [x] `npm run typecheck` (PASS)
- [x] `npm run lint` (PASS)
- [x] `npm run test` (PASS - 40 tests pasando en 9 archivos)
- [x] `npm run build` (PASS - Next.js 16 App Router compila 12 páginas estáticas y dinámicas)

---

## Criterios de Aceptación por Fase

### Fase 01: Agente de WhatsApp + Citas en Google Calendar
- [x] Meta verifica el webhook correctamente (GET con verify token).
- [x] Mensaje "hola" → respuesta en pocos segundos; varios mensajes seguidos → una sola respuesta (debounce).
- [x] Una nota de voz se transcribe y se responde con sentido.
- [x] "Quiero agendar para mañana" → ofrece horarios reales libres → agenda → aparece en Google Calendar con Meet (virtual) y en `appointments`.
- [x] "Muévela para el jueves a las 3" → se reprograma en Calendar y en la base de datos.
- [x] "Cancélala" → se cancela en ambos.
- [x] No se puede agendar fuera de L–V 7:00–19:00, en festivos, en el pasado ni encima de otra cita.
- [x] Pedir un asesor → el bot se apaga en esa conversación (`needs_human = true`, `bot_enabled = false`).
- [x] Reintentos de Meta no duplican mensajes ni respuestas (idempotencia por `wamid`).
- [x] Ningún secreto en el repositorio.

### Fase 02: Dashboard de Conversaciones
- [x] Solo usuarios creados en Supabase Auth pueden entrar (`/login` → `/dashboard`).
- [x] Un mensaje que llega por WhatsApp aparece en la lista y en el hilo sin recargar (Realtime).
- [x] Puedo responder manualmente dentro de la ventana de 24 h y el bot se apaga en ese chat.
- [x] Puedo apagar y encender el bot por conversación y de forma global (`settings.bot_global_enabled`).
- [x] Los audios se escuchan y muestran su transcripción desplegable.
- [x] El diseño cumple el sistema de 00: blanco, Geist Sans, sin degradados ni emojis.

### Fase 03: Pipeline de Leads y Contacto Directo
- [ ] Cada contacto nuevo aparece en "Nuevo" automáticamente.
- [ ] Al agendar por WhatsApp, la tarjeta pasa sola a "Diagnóstico agendado" sin recargar.
- [ ] Puedo arrastrar tarjetas (drag-and-drop con `@dnd-kit`) y queda el historial en `lead_events`.
- [ ] Puedo contactar a un lead con texto libre dentro de 24 h y con plantilla fuera de 24 h.
- [ ] La agenda muestra las citas y permite marcar asistencia.
- [ ] Todo respeta el sistema de diseño de 00.

### Fase 04: Editor del "Cerebro" del Agente
- [ ] Cambio el tono a "usted" en el borrador, lo pruebo en el probador y el resultado cambia; en WhatsApp todavía no cambia.
- [ ] Publico y el siguiente mensaje de WhatsApp ya usa el nuevo tono, sin redeploy.
- [ ] Agrego una pregunta frecuente y el agente la responde.
- [ ] Cambio el horario de atención y las herramientas dejan de ofrecer horas fuera del nuevo rango.
- [ ] El probador nunca crea eventos reales (simulación).
- [ ] Puedo restaurar una versión anterior.
- [ ] Todo respeta el sistema de diseño de 00.

---

## Registro de Decisiones Técnicas
1. **Proyecto Supabase:** Confirmado `AGENTE DE IA` (`azptifbibgxfumgnpajw`), sin tocar ningún otro proyecto.
2. **Normalización de Variables:** `.env` normalizado y verificado contra `.gitignore`. `.env.example` creado sin secretos.
3. **Migraciones:** Creadas y aplicadas exitosamente con MCP Supabase (`20261005000001_initial_schema.sql` y `20261005000002_seed_initial_data.sql`). Tipos TypeScript sincronizados en `lib/database.types.ts`.
4. **Cálculo de Festivos:** Algoritmo exacto de Computus y Ley Emiliani implementado en UTC puro en `lib/calendar/colombia-holidays.ts`.
5. **Disponibilidad:** Validaciones estrictas en servidor en `lib/calendar/availability.ts`.
6. **Integraciones:** Google Calendar OAuth 2.0 y freebusy implementado en `lib/google/calendar.ts`, WhatsApp Cloud API en `lib/whatsapp/client.ts`, Whisper en `lib/openai/transcribe.ts`.
7. **Webhook:** Manejo de HMAC SHA-256 en tiempo constante, idempotencia por `wamid`, debounce y bloqueo atómico RPC en `app/api/webhooks/whatsapp/route.ts`.
8. **Pruebas Automatizadas:** 27 tests pasando (smoke de proveedores, webhook HMAC, cálculo de festivos y disponibilidad, prueba controlada real en Google Calendar y flujo completo de herramientas del agente).
