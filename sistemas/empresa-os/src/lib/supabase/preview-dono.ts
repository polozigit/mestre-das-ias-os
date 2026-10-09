/**
 * Entrada de QA no PREVIEW da Vercel como o DONO, sem senha guardada e sem
 * usuário extra. Só imports relativos/de tipo: o node:test importa este arquivo
 * direto (não resolve o alias `@/`).
 *
 * Fluxo: o link de teste traz `?preview_token=` (ou o cookie `preview_auth` da
 * visita anterior). Se o ambiente é preview e o token confere, o servidor usa a
 * chave de admin para gerar um link mágico do dono (`auth.admin.generateLink`,
 * que NÃO envia e-mail) e troca o `hashed_token` por sessão real no cliente SSR
 * que grava cookies (`auth.verifyOtp`). Sessão real = RLS devolve os dados do
 * dono, e a página tem o que testar.
 *
 * Produção NUNCA aceita o token: o gate de `VERCEL_ENV` barra mesmo se
 * `PREVIEW_TEST_TOKEN` vazar para o env de produção.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";

/** O que o proxy faz depois: seguir, seguir entregando o cookie, ou mandar pro /login com erro. */
export type ResultadoPreview = "fora" | "ja-logado" | "logou" | "falhou";

type Env = Record<string, string | undefined>;

/** Fatia do cliente SSR (o que grava os cookies da sessão) que este fluxo usa. */
export interface ClienteSessao {
  auth: {
    getUser(): Promise<{ data: { user: unknown | null } }>;
    verifyOtp(params: {
      token_hash: string;
      type: "email";
    }): Promise<{ error: unknown | null }>;
  };
}

/** O que este fluxo precisa da chave de admin (service role), em 2 perguntas. */
export interface AdminPreview {
  /** O e-mail é do dono ATIVO da empresa (tabela `usuarios`)? */
  donoAtivoExiste(email: string): Promise<boolean>;
  /** `hashed_token` de um link mágico do e-mail (não envia e-mail); null em erro. */
  hashDoLinkMagico(email: string): Promise<string | null>;
}

/** Adapta o cliente de service role (`createServiceClient`) para o fluxo. */
export function adminDoPreview(cliente: SupabaseClient<Database>): AdminPreview {
  return {
    async donoAtivoExiste(email) {
      const { data, error } = await cliente
        .from("usuarios")
        .select("id")
        .eq("email", email)
        .eq("e_dono", true)
        .eq("ativo", true)
        .maybeSingle();
      return !error && !!data;
    },
    async hashDoLinkMagico(email) {
      const { data, error } = await cliente.auth.admin.generateLink({ type: "magiclink", email });
      return error ? null : (data.properties?.hashed_token ?? null);
    },
  };
}

/**
 * O token fornecido abre o preview? Só com os 4: ambiente preview, token
 * configurado, e-mail do dono configurado e token igual.
 */
export function tokenDePreviewValido(env: Env, fornecido: string | null | undefined): boolean {
  const token = env.PREVIEW_TEST_TOKEN;
  return (
    env.VERCEL_ENV === "preview" &&
    !!token &&
    !!env.PREVIEW_OWNER_EMAIL &&
    fornecido === token
  );
}

export async function entrarComoDonoNoPreview(opcoes: {
  env: Env;
  tokenFornecido: string | null | undefined;
  sessao: ClienteSessao;
  criarAdmin: () => AdminPreview;
}): Promise<ResultadoPreview> {
  const { env, tokenFornecido, sessao, criarAdmin } = opcoes;
  if (!tokenDePreviewValido(env, tokenFornecido)) return "fora";

  const { data: atual } = await sessao.auth.getUser();
  if (atual.user) return "ja-logado";

  try {
    const email = env.PREVIEW_OWNER_EMAIL!.trim().toLowerCase();
    const admin = criarAdmin();
    // Confere ANTES que o e-mail é do dono ativo: o generateLink de magiclink
    // CRIA a conta se ela não existir, e um e-mail digitado errado viraria um
    // login fantasma. Também impede o token de abrir sessão de outro membro.
    if (!(await admin.donoAtivoExiste(email))) return "falhou";
    const hash = await admin.hashDoLinkMagico(email);
    if (!hash) return "falhou";

    // `type: "email"`: o supabase-js marca `magiclink` como obsoleto no verifyOtp.
    const { error: erroOtp } = await sessao.auth.verifyOtp({ token_hash: hash, type: "email" });
    return erroOtp ? "falhou" : "logou";
  } catch {
    // Chave de admin ausente ou rede: falha visível, nunca redirect mudo.
    return "falhou";
  }
}
