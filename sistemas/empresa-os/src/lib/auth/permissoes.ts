export type Sessao = { usuarioId: string; nome: string; email: string; eDono: boolean; senhaTrocadaEm: string | null; permissoes: string[] };
export type Modulo = "inicio" | "cronograma" | "tarefas" | "organograma" | "agentes" | "marca" | "atividade" | "usuarios" | "configuracoes";

export const PERMISSAO_MODULO: Record<Modulo, string | null> = {
  inicio: null, cronograma: "tarefas.read", tarefas: "tarefas.read", organograma: "organograma.read",
  agentes: "agentes.read", marca: "documentos.read", atividade: "atividade.read",
  usuarios: "usuarios.manage", configuracoes: "configuracoes.read",
};
export const MODULO_ROTA: Record<Modulo, string> = {
  inicio: "/inicio", cronograma: "/cronograma", tarefas: "/tarefas", organograma: "/organograma",
  agentes: "/agentes", marca: "/marca", atividade: "/atividade", usuarios: "/usuarios", configuracoes: "/configuracoes",
};

export function moduloDaRota(pathname: string): Modulo | null {
  for (const [m, rota] of Object.entries(MODULO_ROTA) as [Modulo, string][]) {
    if (pathname === rota || pathname.startsWith(rota + "/")) return m;
  }
  return null;
}

export function pode(sessao: Pick<Sessao, "eDono" | "permissoes"> | null, modulo: Modulo): boolean {
  if (!sessao) return false;
  const slug = PERMISSAO_MODULO[modulo];
  if (slug === null) return true;
  return sessao.eDono || sessao.permissoes.includes(slug);
}

/** Pode escrever? Dono sempre; os demais precisam do slug de escrita exato (ex.: "tarefas.write"). */
export function podeEscrever(sessao: Pick<Sessao, "eDono" | "permissoes"> | null, slugEscrita: string): boolean {
  if (!sessao) return false;
  return sessao.eDono || sessao.permissoes.includes(slugEscrita);
}

export function sessaoDoRpc(l: { usuario_id: string; nome: string; email: string; e_dono: boolean; senha_trocada_em: string | null; permissoes: string[] | null } | null | undefined): Sessao | null {
  if (!l) return null;
  return { usuarioId: l.usuario_id, nome: l.nome, email: l.email, eDono: l.e_dono, senhaTrocadaEm: l.senha_trocada_em, permissoes: l.permissoes ?? [] };
}
