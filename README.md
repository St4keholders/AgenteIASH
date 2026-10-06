# Stakeholders · Agente de IA para WhatsApp y Dashboard

Agente de atención y agendamiento para WhatsApp (API Cloud oficial de Meta) de la firma **Stakeholders Contadores Públicos** (Medellín, Colombia), integrado con Google Calendar, OpenAI y Supabase.

---

## 1. Requisitos y Ejecución en Local

### Instalación de dependencias
```bash
npm install
```

### Configuración de Variables de Entorno
Copia el archivo de ejemplo y completa los valores requeridos en `.env`:
```bash
cp .env.example .env
```

Verifica la integridad de las variables con:
```bash
npm run check:env
```

### Migraciones de Base de Datos (Supabase)
Las migraciones se encuentran en `supabase/migrations/`:
1. `20261005000001_initial_schema.sql`: Esquema completo de tablas, índices, RPCs de bloqueo atómico y políticas RLS.
2. `20261005000002_seed_initial_data.sql`: Semilla inicial con las etapas del pipeline, configuración inicial publicada del agente y settings.

Para aplicarlas en Supabase CLI:
```bash
supabase db push
# O ejecutarlas directamente en el SQL Editor de tu proyecto en Supabase
```

### Ejecutar el servidor de desarrollo
```bash
npm run dev
```

---

## 2. Google Calendar OAuth 2.0 y Refresh Token

El agente agenda y gestiona citas de diagnóstico (30 minutos) en la cuenta `stakeholdersadm@gmail.com`.

### Cómo obtener el Refresh Token:
1. En **Google Cloud Console**, habilita la **Google Calendar API**.
2. En **Pantalla de consentimiento de OAuth**:
   - Debe estar en estado **"En producción"** (si está en "Pruebas", el refresh token caduca a los 7 días).
   - Agrega los alcances: `https://www.googleapis.com/auth/calendar` y `https://www.googleapis.com/auth/calendar.events`.
3. En **Credenciales**, crea un ID de cliente OAuth 2.0 (Aplicación web):
   - **URI de redireccionamiento autorizados:** `http://localhost:3000/oauth2callback`
4. Ejecuta el script de autorización local:
   ```bash
   npx tsx scripts/google-auth.ts
   ```
5. Abre el enlace generado en el navegador, autoriza con la cuenta de Google y el script guardará automáticamente el `GOOGLE_REFRESH_TOKEN` en tu archivo `.env` sin imprimirlo en terminal.

---

## 3. Comandos de Verificación del Proyecto

En cualquier momento puedes correr la batería de validaciones:
```bash
npm run check:env      # Valida que todas las variables requeridas existan sin mostrar secretos
npm run check:design   # Valida cumplimiento del sistema de diseño (sobrio, Geist, sin emojis en UI)
npm run typecheck      # Valida tipos de TypeScript con tsc --noEmit
npm run lint           # Ejecuta ESLint
npm run test           # Corre suite completa con Vitest (disponibilidad, webhook, agente, smoke)
npm run build          # Compila Next.js para producción
```

---

## 4. Despliegue en Producción (Vercel)

1. **Subir a GitHub:** Crea un repositorio privado en GitHub y haz push del código (verificando que `.env` no se incluya).
2. **Importar en Vercel:**
   - Importa el repositorio en Vercel como proyecto Next.js.
   - Agrega todas las variables de entorno de `.env` en Vercel Settings > Environment Variables.
   - Configura `WHATSAPP_DRY_RUN=false` y `CALENDAR_DRY_RUN=false`.
3. **Deploy:** Lanza el despliegue a producción.

---

## 5. Configuración del Webhook en Meta WhatsApp Cloud API

1. En el panel de **Meta for Developers**:
   - Selecciona tu app > WhatsApp > Configuración.
   - **URL de devolución de llamada (Callback URL):**
     `https://<tu-proyecto>.vercel.app/api/webhooks/whatsapp`
   - **Token de verificación (Verify Token):**
     El mismo valor configurado en `WHATSAPP_VERIFY_TOKEN`.
   - Haz clic en **Verificar y guardar**.
2. **Campos del webhook:**
   - En **Campos de webhook**, suscríbete al campo `messages`.
3. **Publicación de la app en Meta:**
   - En Configuración básica de la aplicación, ingresa la URL de política de privacidad:
     `https://<tu-proyecto>.vercel.app/privacidad`
   - Y la URL de eliminación de datos de usuario:
     `https://<tu-proyecto>.vercel.app/eliminacion-de-datos`
   - Cambia el modo de la aplicación de **En desarrollo** a **En vivo (Live)**.
