import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Database } from "@/lib/database.types";
import { getConfig } from "@/lib/config";

/**
 * Cliente de Supabase con permisos de Service Role.
 * Usado exclusivamente en el servidor para webhook, agent runner y tareas en segundo plano.
 * NUNCA exponer al cliente.
 */
export function createAdminClient() {
  const config = getConfig();
  return createSupabaseClient<Database>(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

/**
 * Cliente de Supabase para Server Components y Server Actions
 * respetando la sesión del usuario autenticado en cookies.
 * Si se invoca fuera de contexto de servidor (ej: tests unitarios), recurre a admin client.
 */
export async function createSessionClient() {
  const config = getConfig();

  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    cookieStore = await cookies();
  } catch {
    // Fuera de request context de Next.js (tests unitarios o scripts)
  }

  if (!cookieStore) {
    return createAdminClient();
  }

  return createServerClient<Database>(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignorar en server components de solo lectura
          }
        },
      },
    }
  );
}
