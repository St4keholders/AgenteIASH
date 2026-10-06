# 02 · Fase 2: Dashboard de conversaciones

Lee primero `00-contexto-general.md` (especialmente el **sistema de diseño**). Requiere la fase 01 funcionando. Modo autónomo: no pidas aprobación, construye y verifica hasta cumplir los criterios.

## Objetivo

Un dashboard privado donde el equipo vea todas las conversaciones de WhatsApp en tiempo real, intervenga cuando quiera y controle si el bot responde.

## 1. Acceso

- Login con **Supabase Auth** (correo y contraseña). Registro público **desactivado**: los usuarios se crean desde Supabase Auth (para las pruebas, crea un usuario de prueba por script y elimínalo al terminar).
- Todas las rutas bajo `/dashboard` protegidas (middleware o validación en el layout). Si no hay sesión → `/login`.
- Página de login minimalista, centrada, blanca, con el nombre "Stakeholders" en texto (sin logo inventado).

## 2. Estructura del dashboard

- Barra lateral fija (220–240 px) con: Conversaciones, Pipeline, Agenda y Configuración del agente (las dos últimas pueden mostrar "Próximamente" hasta sus fases), más el usuario y "Cerrar sesión" abajo.
- Interruptor global **"Bot activo"** visible en la parte superior (lee y escribe `settings.bot_global_enabled`), con confirmación al apagarlo.

## 3. Vista de conversaciones (`/dashboard/conversaciones`)

Diseño de tres columnas en escritorio (en móvil, navegación por pantallas):

**Columna 1: lista de conversaciones**
- Buscador (nombre, teléfono, texto).
- Filtros: Todas · Sin leer · Requieren humano · Bot apagado.
- Cada fila: nombre o teléfono, último mensaje (una línea), hora, contador de no leídos y un indicador discreto si `needs_human` o el bot está apagado.
- Orden por `last_message_at`. **Se actualiza en tiempo real** con Supabase Realtime (nuevas conversaciones y nuevos mensajes suben arriba sin recargar).

**Columna 2: hilo de mensajes**
- Burbujas sobrias: entrantes a la izquierda (fondo `#FAFAFA`, borde), salientes a la derecha (fondo blanco, borde); etiqueta pequeña de quién envió (Cliente · Bot · Nombre del asesor).
- Audios: reproductor nativo + transcripción desplegable. Imágenes: miniatura que abre en grande (URL firmada de Storage).
- Estado de entrega en los salientes (enviado, entregado, leído, fallido).
- Mensajes nuevos en tiempo real y scroll automático solo si el usuario ya estaba abajo.
- **Caja de respuesta manual:**
  - Si la ventana de 24 h está abierta (`last_inbound_at` < 24 h): permite enviar texto. Al enviar, el mensaje se guarda con `sender = human` y el bot de esa conversación **se apaga automáticamente** (avisar con un texto pequeño).
  - Si la ventana está cerrada: caja deshabilitada con la explicación "La ventana de 24 h está cerrada. Solo se pueden enviar plantillas aprobadas" (las plantillas llegan en la fase 03).
  - Mostrar cuánto tiempo queda de ventana.
- Al abrir una conversación, poner `unread_count = 0`.

**Columna 3: ficha del contacto**
- Nombre, teléfono o ID, correo, empresa (editables).
- Interruptor **"Bot en esta conversación"** (`bot_enabled`) y botón "Marcar como resuelto" para quitar `needs_human`.
- Lead: etapa actual, servicio de interés, temperatura y resumen (solo lectura en esta fase).
- Citas del contacto (próximas y pasadas) con estado y enlace de Meet.

## 4. Implementación

- Server Components para la carga inicial y Server Actions o route handlers para las acciones (enviar mensaje, cambiar interruptores, editar contacto).
- El envío manual reutiliza `lib/whatsapp` de la fase 01.
- Realtime en cliente con el cliente de Supabase del navegador; respetar RLS (solo usuarios autenticados).
- Estados vacíos y de carga sobrios (texto gris, sin ilustraciones).

## Criterios de aceptación

- [ ] Solo usuarios creados en Supabase pueden entrar.
- [ ] Un mensaje que llega por WhatsApp aparece en la lista y en el hilo sin recargar.
- [ ] Puedo responder manualmente dentro de la ventana de 24 h y el bot se apaga en ese chat.
- [ ] Puedo apagar y encender el bot por conversación y de forma global.
- [ ] Los audios se escuchan y muestran su transcripción.
- [ ] El diseño cumple el sistema de `00`: blanco, una tipografía, sin degradados ni emojis.
