import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/lib/database.types";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

export const createBrowserClientInstance = createClient;
export { createClient as createBrowserClient };
