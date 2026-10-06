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
 */
export async function createSessionClient() {
  const config = getConfig();
  const cookieStore = await cookies();

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
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}
