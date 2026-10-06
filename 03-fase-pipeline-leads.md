# 03 · Fase 3: Pipeline de leads y contacto directo

Lee primero `00-contexto-general.md`. Requiere las fases 01 y 02. Modo autónomo: no pidas aprobación, construye y verifica hasta cumplir los criterios.

## Objetivo

Un tablero tipo Kanban donde cada persona que escribe queda clasificada en una etapa del embudo, el agente la mueve automáticamente y el equipo puede contactarla directamente.

## 1. Tablero (`/dashboard/pipeline`)

- Columnas = `pipeline_stages` en orden: Nuevo → Calificado → Diagnóstico agendado → Asistió → Propuesta → Cliente / Perdido.
- Encabezado de cada columna: nombre y número de leads.
- **Tarjeta** (compacta): nombre, servicio de interés, temperatura (badge discreto: caliente/tibio/frío), próxima cita si existe, tiempo desde el último mensaje.
- **Arrastrar y soltar** entre columnas (`@dnd-kit`). Cada movimiento manual registra un `lead_event` con `actor = human`.
- Filtros arriba: servicio, temperatura, "con cita esta semana", búsqueda por nombre o teléfono.
- Actualización en tiempo real (Realtime sobre `leads`): si el bot mueve un lead, la tarjeta cambia de columna sola.
- Franja superior de métricas simples: leads nuevos esta semana, diagnósticos agendados esta semana, tasa Nuevo → Diagnóstico agendado.

## 2. Movimiento automático por el agente

Ajustar la fase 01 para que el agente, mediante `update_lead`, mueva el lead:
- Nuevo → **Calificado**: cuando conoce la necesidad y el servicio de interés.
- → **Diagnóstico agendado**: al crear una cita (ya ocurre en `book_appointment`).
- Si se cancela la cita sin reprogramar → vuelve a **Calificado**.
- El agente **nunca** mueve a Asistió, Propuesta, Cliente ni Perdido; esas etapas son solo del equipo.
- Opcional configurable: marcar automáticamente "Asistió" no; lo marca un humano desde la cita.

## 3. Detalle del lead (panel lateral al abrir una tarjeta)

- Datos del contacto (editables) y del lead: servicio, facturas por mes, plan sugerido, temperatura, resumen generado por el agente, responsable (`owner`) y notas internas.
- Historial (`lead_events`): quién lo movió y cuándo.
- Citas, con acciones: marcar **Asistió** o **No asistió** (actualiza la cita y, si asistió, mueve el lead a "Asistió").
- Botón **"Abrir conversación"** → lleva al hilo en `/dashboard/conversaciones`.

## 4. Contactar directamente

Botón **"Contactar"** en la tarjeta y en el detalle:
- **Ventana de 24 h abierta:** abre una caja de texto y envía mensaje libre (mismo comportamiento que la fase 02: `sender = human` y bot apagado en esa conversación).
- **Ventana cerrada:** muestra las **plantillas aprobadas** del WABA (listar vía Graph API: `/{WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`, solo `APPROVED`), con su categoría (marketing/utilidad) y un aviso de que tienen costo. Permite llenar las variables, previsualizar y enviar.
- Guardar el envío en `messages` y registrar un `lead_event`.

## 5. Vista de agenda (`/dashboard/agenda`)

- Lista por día (hoy, mañana, esta semana) de las citas de `appointments`: hora, nombre, servicio, modalidad, enlace de Meet o "Presencial", estado.
- Acciones: marcar asistió/no asistió, abrir lead, abrir conversación.
- No hace falta un calendario visual complejo; prioriza una lista clara.

## Criterios de aceptación

- [ ] Cada contacto nuevo aparece en "Nuevo" automáticamente.
- [ ] Al agendar por WhatsApp, la tarjeta pasa sola a "Diagnóstico agendado" sin recargar.
- [ ] Puedo arrastrar tarjetas y queda el historial.
- [ ] Puedo contactar a un lead con texto libre dentro de 24 h y con plantilla fuera de 24 h.
- [ ] La agenda muestra las citas y permite marcar asistencia.
- [ ] Todo respeta el sistema de diseño de `00`.
