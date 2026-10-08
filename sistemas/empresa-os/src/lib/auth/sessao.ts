import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { sessaoDoRpc, type Sessao } from "./permissoes";

export type { Sessao };

/**
 * Sessão do usuário logado (permissões por slug) — 1 RPC por request,
 * compartilhada por layouts e páginas via cache() do React.
 * Erro na RPC = falha FECHADA (null, tratado como sem acesso).
 */
export const getSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sessao_atual");
  if (error) return null;
  return sessaoDoRpc(Array.isArray(data) ? data[0] : data);
});
