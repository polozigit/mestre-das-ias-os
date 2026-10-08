import { limparTextos, type TextosAtividade } from "./plano-textos.ts";

/**
 * `ordem` = posição da tarefa no plano (public.tarefas.ordem); a view do cronograma não a traz, por isso opcional.
 * `chave` = chave da tarefa no plano (`curso.d1.contas`), a ligação com o texto do arquivo do plano.
 * `textos` = o que a tela mostra no "Como fazer"; só vem quando a tela pediu (o Início não pede).
 */
export type ItemCronograma = {
  tarefa_id: string; titulo: string; status: string; trilha: string; fase: string | null; prazo_previsto_em: string | null;
  ordem?: number | null; chave?: string | null; textos?: TextosAtividade;
};
export type FaseResumo = { fase: string; rotulo: string; itens: ItemCronograma[]; feitas: number; total: number; atrasadas: number };
export type TrilhaResumo = { trilha: "curso" | "plano90"; rotulo: string; fases: FaseResumo[]; pct: number; faseAtual: string | null; proximo: ItemCronograma | null };
export type PassoAtual = { trilha: "curso" | "plano90"; rotuloTrilha: string; item: ItemCronograma; numero: number; total: number };

export const ORDEM_FASES = { curso: ["D1", "D2", "D3"], plano90: ["clareza", "fundacao", "ativacao", "aplicacao", "escala"] };
export const ROTULO_FASE: Record<string, string> = {
  D1: "Dia 1", D2: "Dia 2", D3: "Dia 3",
  clareza: "Semana 1 · Clareza", fundacao: "Semanas 2-3 · Fundação", ativacao: "Semanas 4-7 · Ativação",
  aplicacao: "Semanas 8-12 · Aplicação", escala: "Semana 13 · Escala",
};
const ROTULO_TRILHA = { curso: "Curso (3 dias)", plano90: "90 dias" } as const;
/** Status em que o passo já terminou (feito ou descartado): não conta como pendente. */
export const FECHADA: ReadonlySet<string> = new Set(["CONCLUIDA", "CANCELADA"]);

/** Atrasada = o prazo já passou e o passo ainda não terminou (nem concluído nem cancelado). Sem prazo nunca atrasa. */
export function estaAtrasada(item: Pick<ItemCronograma, "status" | "prazo_previsto_em">, hojeISO: string): boolean {
  return !FECHADA.has(item.status) && item.prazo_previsto_em !== null && item.prazo_previsto_em < hojeISO;
}

/** Ordem do plano; tarefa sem `ordem` vai pro fim e mantém a ordem de chegada (sort é estável). */
function porOrdem(a: ItemCronograma, b: ItemCronograma): number {
  const pa = a.ordem ?? Number.POSITIVE_INFINITY;
  const pb = b.ordem ?? Number.POSITIVE_INFINITY;
  return pa === pb ? 0 : pa < pb ? -1 : 1;
}

export function montarCronograma(itens: ItemCronograma[], hojeISO: string): TrilhaResumo[] {
  return (["curso", "plano90"] as const).map((trilha) => {
    const fases = ORDEM_FASES[trilha].map((fase) => {
      const daFase = itens.filter((i) => i.trilha === trilha && i.fase === fase).sort(porOrdem);
      const validas = daFase.filter((i) => i.status !== "CANCELADA");
      return {
        fase, rotulo: ROTULO_FASE[fase], itens: daFase,
        feitas: validas.filter((i) => i.status === "CONCLUIDA").length,
        total: validas.length,
        atrasadas: daFase.filter((i) => estaAtrasada(i, hojeISO)).length,
      };
    });
    const total = fases.reduce((s, f) => s + f.total, 0);
    const feitas = fases.reduce((s, f) => s + f.feitas, 0);
    const atual = fases.find((f) => f.itens.some((i) => !FECHADA.has(i.status)));
    const proximo = atual?.itens.find((i) => !FECHADA.has(i.status)) ?? null;
    return { trilha, rotulo: ROTULO_TRILHA[trilha], fases, pct: total === 0 ? 0 : Math.round((feitas / total) * 100), faseAtual: atual?.fase ?? null, proximo };
  });
}

/** Próximo passo do aluno: o primeiro pendente da primeira trilha (curso antes de 90 dias) que ainda tem pendência. */
export function passoAtual(trilhas: TrilhaResumo[]): PassoAtual | null {
  const t = trilhas.find((x) => x.proximo !== null);
  if (!t || !t.proximo) return null;
  const numeros = numerarPassos(t);
  return { trilha: t.trilha, rotuloTrilha: t.rotulo, item: t.proximo, numero: numeros.get(t.proximo.tarefa_id) ?? 0, total: numeros.size };
}

/** Número de cada passo (1, 2, 3...) atravessando as fases na ordem do plano; cancelada não recebe número. */
export function numerarPassos(trilha: TrilhaResumo): Map<string, number> {
  const numeros = new Map<string, number>();
  for (const f of trilha.fases) for (const i of f.itens) if (i.status !== "CANCELADA") numeros.set(i.tarefa_id, numeros.size + 1);
  return numeros;
}

/** Itens que a tela desenha: a cancelada só aparece quando o dono pede ("mostrar canceladas"). */
export function itensVisiveis<T extends { status: string }>(itens: readonly T[], mostrarCanceladas: boolean): T[] {
  return mostrarCanceladas ? [...itens] : itens.filter((i) => i.status !== "CANCELADA");
}

/** Quantas atividades canceladas o cronograma tem (decide se o "mostrar canceladas" aparece). */
export function contarCanceladas(trilhas: TrilhaResumo[]): number {
  return trilhas.reduce((s, t) => s + t.fases.reduce((n, f) => n + f.itens.filter((i) => i.status === "CANCELADA").length, 0), 0);
}

/** A tarefa de plano nasce com criterio_pronto = prova do modelo: nesse caso o detalhe mostra a prova uma vez só. */
export function criterioRepeteProva(prova: string | null | undefined, criterio: string | null | undefined): boolean {
  const p = (prova ?? "").trim();
  return p !== "" && p === (criterio ?? "").trim();
}

type LinhaDaView = {
  tarefa_id: string | null; titulo: string | null; status: string | null; trilha: string | null; fase: string | null; prazo_previsto_em: string | null;
  /** Só vêm quando a consulta pediu as colunas de instrução (tela do Cronograma). */
  instrucao?: string | null; comando?: string | null; prova?: string | null;
};

/**
 * Linhas da view do cronograma + `ordem` e `chave` (por id da tarefa) -> itens. Linha incompleta cai fora;
 * ordem ou chave ausentes ficam null. `textos` só existe quando a linha trouxe as colunas de instrução.
 */
export function montarItens(
  linhas: LinhaDaView[],
  ordemPorTarefa: Map<string, number | null>,
  chavePorTarefa: Map<string, string | null> = new Map(),
): ItemCronograma[] {
  return linhas.flatMap((l) => {
    if (!(l.tarefa_id && l.titulo && l.status && l.trilha)) return [];
    const item: ItemCronograma = {
      tarefa_id: l.tarefa_id, titulo: l.titulo, status: l.status, trilha: l.trilha, fase: l.fase, prazo_previsto_em: l.prazo_previsto_em,
      ordem: ordemPorTarefa.get(l.tarefa_id) ?? null, chave: chavePorTarefa.get(l.tarefa_id) ?? null,
    };
    if ("instrucao" in l || "comando" in l || "prova" in l) item.textos = limparTextos({ instrucao: l.instrucao, comando: l.comando, prova: l.prova });
    return [item];
  });
}
