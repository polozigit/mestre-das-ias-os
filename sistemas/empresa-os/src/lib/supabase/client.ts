import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { configPublicaDoNavegador } from "./env";

/** Cliente Supabase pra client components (browser). */
export function createClient() {
  const { url, chavePublica } = configPublicaDoNavegador();
  return createBrowserClient<Database>(url, chavePublica);
}
