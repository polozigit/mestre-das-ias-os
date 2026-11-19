/**
 * Faixa de "ambiente de teste" do PREVIEW da Vercel. Só imports relativos/de tipo:
 * o node:test importa este arquivo direto (não resolve o alias `@/`).
 *
 * Aparece SÓ quando `VERCEL_ENV === "preview"`. Produção e desenvolvimento local
 * (sem `VERCEL_ENV` ou "development") nunca mostram.
 *
 * O endereço do sistema de verdade vem de `VERCEL_PROJECT_PRODUCTION_URL`, variável
 * de sistema da Vercel: é preenchida também em deploy de preview e vem SEM `https://`
 * (https://vercel.com/docs/environment-variables/system-environment-variables).
 * Se ela faltar (o projeto desligou "Enable access to System Environment Variables"),
 * a faixa aparece sem o link.
 */
type Env = Record<string, string | undefined>;

export interface FaixaTeste {
  mostrar: boolean;
  /** Endereço completo (com https://) do sistema de produção; null = faixa sem link. */
  enderecoProducao: string | null;
}

export function faixaDeTeste(env: Env): FaixaTeste {
  if (env.VERCEL_ENV !== "preview") return { mostrar: false, enderecoProducao: null };
  const dominio = (env.VERCEL_PROJECT_PRODUCTION_URL ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  return { mostrar: true, enderecoProducao: dominio ? `https://${dominio}` : null };
}
