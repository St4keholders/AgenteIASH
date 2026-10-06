# Guía de Despliegue a Producción (Paso a Paso)

Este documento describe los pasos manuales para desplegar el proyecto **Agente WhatsApp IA (Stakeholders Contadores)** a producción en Vercel, configurar el Webhook de Meta Cloud API, publicar la aplicación de Meta y crear el usuario administrativo en Supabase Auth.

---

## 1. Crear Repositorio Privado en GitHub

1. Ingresa a tu cuenta de [GitHub](https://github.com).
2. Haz clic en **New repository** (o **Nuevo repositorio**).
3. Asigna un nombre (ej: `agente-whatsapp-stakeholders`).
4. Selecciona visibilidad: **Private** (Privado).
5. No inicialices con README ni .gitignore (ya existen en el proyecto local).
6. En tu terminal local, vincula el remoto y sube los cambios:
   ```bash
   git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
   git branch -M master
   git push -u origin master
   ```

---

## 2. Importar el Proyecto en Vercel

1. Ve a [Vercel](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **Add New...** → **Project**.
3. Selecciona el repositorio privado que acabas de subir y haz clic en **Import**.
4. Configuración del proyecto:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `next build --webpack` (o dejar por defecto `npm run build`)
   - **Output Directory**: `.next`

---

## 3. Configurar Variables de Entorno en Vercel

Antes de desplegar, despliega la sección **Environment Variables** en Vercel y agrega las siguientes variables.

> [!IMPORTANT]
> En producción, asegúrate de configurar los modos DRY_RUN en `false` para que los mensajes de WhatsApp salgan en vivo y los eventos se creen en el calendario oficial de Google Calendar.

| Variable | Valor / Descripción | Ejemplo Producción |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | URL de tu despliegue en Vercel | `https://agente-stakeholders.vercel.app` |
| `APP_TIMEZONE` | Zona horaria del negocio | `America/Bogota` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de Supabase del proyecto "AGENTE DE IA" | `https://azptifbibgxfumgnpajw.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Llave anónima pública de Supabase | Tu clave pública (`eyJ...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave de servicio (secreta, solo backend) | Tu service role key (`eyJ...`) |
| `OPENAI_API_KEY` | Clave API de OpenAI | `sk-proj-...` |
| `OPENAI_MODEL` | Modelo de OpenAI para el agente | `gpt-4o-mini` |
| `META_APP_ID` | ID de la App en Meta for Developers | Tu App ID numérico |
| `META_APP_SECRET` | App Secret para validar firma HMAC SHA-256 | Tu App Secret |
| `META_PHONE_NUMBER_ID` | ID del número de WhatsApp Cloud API | Tu Phone Number ID |
| `META_ACCESS_TOKEN` | Token de acceso del sistema de Meta | `EAA...` |
| `WHATSAPP_VERIFY_TOKEN` | Token para handshake GET del webhook | Cadena secreta creada por ti |
| `WHATSAPP_DRY_RUN` | Simulación de envíos por WhatsApp | **`false`** |
| `GOOGLE_CLIENT_ID` | Client ID de Google Cloud OAuth 2.0 | Tu ID de cliente |
| `GOOGLE_CLIENT_SECRET` | Client Secret de Google Cloud OAuth 2.0 | Tu secreto de cliente |
| `GOOGLE_REFRESH_TOKEN` | Refresh token permanente para Google Calendar | Tu refresh token |
| `GOOGLE_CALENDAR_ID` | ID del calendario de citas | `primary` |
| `GOOGLE_BUSY_CALENDAR_IDS` | IDs de calendarios para consulta de disponibilidad | `primary` |
| `CALENDAR_DRY_RUN` | Simulación de agendamiento en Google Calendar | **`false`** |

Haz clic en **Deploy**. Espera a que el build finalice y obtengas tu dominio de producción: `https://<tu-proyecto>.vercel.app`.

---

## 4. Configurar el Webhook en Meta for Developers

1. Ingresa a [Meta for Developers](https://developers.facebook.com/apps/).
2. Selecciona tu aplicación de WhatsApp.
3. En el menú lateral izquierdo, ve a **WhatsApp** → **Configuration** (Configuración).
4. En la sección **Webhook**, haz clic en **Edit** (Editar):
   - **Callback URL**: `https://<tu-proyecto>.vercel.app/api/webhooks/whatsapp`
   - **Verify Token**: El valor exacto que pusiste en `WHATSAPP_VERIFY_TOKEN`.
5. Haz clic en **Verify and Save** (Verificar y guardar). El endpoint responderá de inmediato `200` y el handshake quedará validado.
6. En **Webhook fields** (Campos de webhook), haz clic en **Manage** (Administrar) y suscríbete a:
   - `messages` (Obligatorio: recibe mensajes de texto, audios e imágenes entrantes y actualizaciones de estado).

---

## 5. Publicar la App de Meta en Modo En Vivo (Live)

Para que cualquier usuario de WhatsApp (no solo números de prueba) pueda escribir al agente:

1. En el panel superior de Meta for Developers, cambia el selector de **In Development** a **Live**.
2. Si te solicita información básica del negocio:
   - **Privacy Policy URL**: `https://<tu-proyecto>.vercel.app/privacidad` (ruta ya construida y desplegada en este proyecto).
   - **Terms of Service URL**: `https://<tu-proyecto>.vercel.app/privacidad`
   - **Data Deletion Instructions**: `https://<tu-proyecto>.vercel.app/eliminacion-de-datos` (ruta ya construida en este proyecto).
   - **Categoría**: Negocios / Finanzas.
3. Guarda los cambios. Tu app quedará oficialmente en modo **Live**.

---

## 6. Crear el Usuario Administrativo en Supabase Auth

Para poder acceder al dashboard protegido (`/dashboard`):

1. Ve a [Supabase Dashboard](https://supabase.com/dashboard/project/azptifbibgxfumgnpajw).
2. En el menú lateral izquierdo, haz clic en **Authentication** → **Users**.
3. Haz clic en el botón verde **Add User** → **Create user**.
4. Ingresa los datos:
   - **Email**: tu correo electrónico corporativo o personal (ej: `admin@stakeholders.com.co`).
   - **Password**: contraseña segura.
   - Marca la casilla **Auto Confirm User?** para que el usuario quede activo de inmediato sin requerir confirmación por correo.
5. Haz clic en **Create user**.
6. Abre tu navegador, ingresa a `https://<tu-proyecto>.vercel.app/login` e inicia sesión con las credenciales creadas.

¡Listo! El agente de IA responderá los mensajes de WhatsApp en tiempo real, agendará citas en Google Calendar con enlaces de Meet y tendrás control completo desde tu Dashboard en `/dashboard`.
