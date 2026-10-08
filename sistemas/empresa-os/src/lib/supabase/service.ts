import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { lerConfigServico } from "../../../config/supabase-env-servidor.mjs";

/**
 * Cliente com SERVICE ROLE (ignora RLS, sem sessão de usuário).
 *
 * SERVER-ONLY. Nunca usar em componente user-facing nem expor a chave ao
 * browser (ela vive só em env server-side, fora de NEXT_PUBLIC_). Uso no
 * template: fluxo de convite de usuário (auth.admin) e scripts de setup.
 * A chave vem de SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY (a que a
 * integração Supabase -> Vercel grava); falta algo: erro com os nomes aceitos.
 */
export function createServiceClient() {
  const { url, chaveSecreta } = lerConfigServico(process.env);
  return createClient<Database>(url, chaveSecreta, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
