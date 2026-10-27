/**
 * Keep-alive do banco (Supabase Free pausa o projeto depois de ~1 semana sem uso).
 *
 * Quem chama é o Cron da Vercel (vercel.json, 1x por dia, grátis no plano Hobby), não o GitHub
 * Actions: a cota grátis do Actions fica só para aplicar migration (decisão 26/10/2026). A Vercel
 * manda `Authorization: Bearer <CRON_SECRET>` quando a variável CRON_SECRET existe no projeto
 * (doc vercel.com/docs/cron-jobs/manage-cron-jobs, "Securing cron jobs"). Sem CRON_SECRET, a rota
 * recusa tudo: nunca fica aberta.
 *
 * Só a produção: a Vercel não roda Cron em deploy de preview, então a homologação continua sem
 * toque diário (se pausar, restaure no painel da Supabase).
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
