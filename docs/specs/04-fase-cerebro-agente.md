# 04 · Fase 4: Editor del "cerebro" del agente

Lee primero `00-contexto-general.md`. Requiere las fases 01, 02 y 03. Modo autónomo: no pidas aprobación, construye y verifica hasta cumplir los criterios.

## Objetivo

Que el equipo pueda cambiar cómo responde el agente (tono, conocimiento, embudo de ventas, reglas y horarios) desde el dashboard, probar los cambios antes de aplicarlos y volver a una versión anterior. Los cambios publicados aplican **al instante**, sin redeploy, porque el agente lee la configuración publicada en cada ejecución (ya implementado en la fase 01).

## 1. Estructura (`/dashboard/agente`)

Página con secciones en pestañas o en una columna con índice lateral. Se edita siempre un **borrador** (`agent_configs.status = draft`); la versión publicada no se toca hasta publicar.

**a. Identidad y tono**
- Nombre del asistente, cómo se presenta, trato (tú/usted), nivel de formalidad, longitud máxima de las respuestas, uso de emojis (sí/no/moderado), firma opcional.

**b. Conocimiento del negocio**
- Lista editable de servicios: nombre, descripción, a quién va dirigido, precio o "se cotiza", qué incluye.
- Preguntas frecuentes (pregunta → respuesta), con orden.
- Texto libre "Información adicional".
- Dirección para citas presenciales (`direccion_presencial`).

**c. Embudo de ventas**
- Lista ordenada de etapas de conversación (por defecto: Saludo → Descubrir necesidad → Calificar → Proponer diagnóstico → Agendar → Cierre).
- Por etapa: objetivo, preguntas que debe hacer, información que debe obtener, cuándo pasar a la siguiente y ejemplos de mensajes.
- Reglas de calificación por servicio (por ejemplo, contabilidad: preguntar facturas por mes → sugerir plan).

**d. Reglas y límites**
- Qué nunca debe decir o prometer.
- Cuándo pasar a un humano.
- Cómo responder temas fuera del negocio.

**e. Horarios y citas**
- Días y horas de atención, duración de la cita, anticipación mínima, días máximos hacia adelante, modalidades habilitadas, opciones de horario a ofrecer por día.
- Estos valores los usan las herramientas del servidor para validar (no solo el prompt).

## 2. Vista previa del prompt

Un panel desplegable que muestra el system prompt final generado a partir del borrador (solo lectura), para entender exactamente qué recibe el modelo.

## 3. Probador

- Un chat de prueba dentro de la página que ejecuta el agente con la configuración **borrador**.
- Las herramientas corren en **modo simulación**: consultan disponibilidad real, pero **no crean, mueven ni cancelan** eventos en Google Calendar ni escriben en leads; muestran lo que harían ("Se crearía una cita el jueves 9 a las 3:00 p. m.").
- Muestra las herramientas llamadas en cada turno (plegable), para depurar.
- Botón "Reiniciar prueba".

## 4. Versiones

- **Guardar borrador**: valida campos obligatorios.
- **Publicar**: el borrador pasa a `published` con versión nueva; la anterior queda en el historial. Pide confirmación.
- **Historial de versiones**: lista con fecha, autor y versión; ver diferencias básicas y **restaurar** una versión anterior como nuevo borrador.
- Cada `agent_runs` registra la `config_version` usada, para saber qué versión respondió cada mensaje.

## 5. Validación de datos

- Definir el esquema de `agent_configs.data` con **Zod** y validarlo al guardar y al cargarlo en el agente.
- Si la configuración publicada fuera inválida, el agente usa la última versión válida y registra el error.

## Criterios de aceptación

- [ ] Cambio el tono a "usted" en el borrador, lo pruebo en el probador y el resultado cambia; en WhatsApp todavía no cambia.
- [ ] Publico y el siguiente mensaje de WhatsApp ya usa el nuevo tono, sin redeploy.
- [ ] Agrego una pregunta frecuente y el agente la responde.
- [ ] Cambio el horario de atención y las herramientas dejan de ofrecer horas fuera del nuevo rango.
- [ ] El probador nunca crea eventos reales.
- [ ] Puedo restaurar una versión anterior.
- [ ] Todo respeta el sistema de diseño de `00`.
