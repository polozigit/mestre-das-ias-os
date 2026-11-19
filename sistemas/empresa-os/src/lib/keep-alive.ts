/**
 * Keep-alive do banco (Supabase Free pausa o projeto depois de ~1 semana sem uso).
 *
 * Quem chama é o Cron da Vercel (vercel.json, 1x por dia, grátis no plano Hobby), não o GitHub
 * Actions: a cota grátis do Actions fica só para aplicar migration (decisão 26/10/2026). A Vercel
 * manda `Authorization: Bearer <CRON_SECRET>` quando a variável CRON_SECRET existe no projeto
 * (doc vercel.com/docs/cron-jobs/manage-cron-jobs, "Securing cron jobs"). Sem CRON_SECRET, a rota
 * recusa tudo: nunca fica aberta.
 *
 * Só a produção roda o Cron (a Vercel não roda Cron em deploy de preview). Por isso a produção
 * também toca o banco de HOMOLOGAÇÃO, que o preview usa: com NEXT_PUBLIC_SUPABASE_URL_HOMOLOG e
 * NEXT_PUBLIC_SUPABASE_ANON_KEY_HOMOLOG (as duas públicas, gravadas pelo `conectar.py vercel-env`)
 * faz 1 leitura leve com a chave anon. Falha na homologação NUNCA muda o status da resposta: só
 * aparece no campo `homologacao` ("ok", "falhou" ou "ausente").
 */

export type ResultadoConsulta = { erro: string | null };

export function autorizado(cabecalho: string | null, segredo: string | undefined): boolean {
  return Boolean(segredo) && cabecalho === `Bearer ${segredo}`;
}

/** Roda UMA leitura no banco e traduz para a resposta da rota. Nunca devolve dado nem chave. */
export async function tocarBanco(
  consultar: () => Promise<ResultadoConsulta>,
): Promise<{ status: number; corpo: { ok: boolean; motivo?: string } }> {
  try {
    const { erro } = await consultar();
    if (erro) return { status: 502, corpo: { ok: false, motivo: "o banco recusou a leitura" } };
    return { status: 200, corpo: { ok: true } };
  } catch {
    return { status: 500, corpo: { ok: false, motivo: "não consegui falar com o banco" } };
  }
}

export type EstadoHomologacao = "ok" | "falhou" | "ausente";

const TEMPO_MAXIMO_HOMOLOGACAO_MS = 8000;

/**
 * 1 leitura leve (`empresa`, 1 linha) no banco de homologação com a chave anon. RLS devolvendo
 * lista vazia é sucesso: o que importa é uma consulta de verdade no Postgres. Só 2xx conta como "ok".
 * Nunca lança, nunca devolve dado nem chave.
 */
export async function tocarHomologacao(
  url: string | undefined,
  chaveAnon: string | undefined,
  buscar: typeof fetch = fetch,
  tempoMaximoMs: number = TEMPO_MAXIMO_HOMOLOGACAO_MS,
): Promise<EstadoHomologacao> {
  const base = (url ?? "").trim().replace(/\/+$/, "");
  const chave = (chaveAnon ?? "").trim();
  if (!base || !chave) return "ausente";
  if (!base.startsWith("https://")) return "falhou";
  try {
    const resposta = await buscar(`${base}/rest/v1/empresa?select=id&limit=1`, {
      headers: { apikey: chave, Authorization: `Bearer ${chave}` },
      signal: AbortSignal.timeout(tempoMaximoMs),
      cache: "no-store",
    });
    return resposta.ok ? "ok" : "falhou";
  } catch {
    return "falhou";
  }
}
