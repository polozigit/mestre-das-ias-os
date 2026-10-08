import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { configPublicaDoServidor } from "./env";

/** Cliente Supabase pra Server Components e server actions (lê a sessão dos cookies). */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, chavePublica } = configPublicaDoServidor();

  return createServerClient<Database>(
    url,
    chavePublica,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component não pode escrever cookie — o middleware cuida do refresh.
          }
        },
      },
    },
  );
}
