import type { AgenteLinha } from "../agentes/agrupar.ts";
import { nomeAmigavel } from "../agentes/nome.ts";
import type { ArtefatoCard } from "./catalogo.ts";

/**
 * Busca da lista de agentes, skills e workflows. Roda no navegador (filtra o que a página já trouxe,
 * sem ir ao banco). Funções PURAS (só import relativo, sem alias: rodam no node --test, em busca.test.ts).
 *
 * Regras: não liga pra maiúscula nem acento ("seguranca" acha "Segurança"); cada palavra digitada tem
 * que aparecer em algum campo do item (E lógico, em qualquer ordem); busca vazia mostra tudo.
 */

/** Minúscula, sem acento, sem espaço nas pontas. */
export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** As palavras digitadas, já normalizadas. */
export function termosDaBusca(busca: string): string[] {
  const limpa = normalizarBusca(busca);
  return limpa === "" ? [] : limpa.split(/\s+/);
}

/** O item casa com a busca? `campos` são os textos pesquisáveis dele (nome, descrição, time...). */
export function casaComBusca(campos: readonly (string | null | undefined)[], busca: string): boolean {
  const termos = termosDaBusca(busca);
  if (termos.length === 0) return true;
  const alvo = normalizarBusca(campos.filter((c): c is string => !!c).join(" "));
  return termos.every((termo) => alvo.includes(termo));
}

export type GrupoDeItens<T> = { time: string; itens: T[] };

/** Filtra os itens de cada grupo e some com o grupo que ficou vazio. Busca vazia devolve tudo. */
export function filtrarGruposPorBusca<T>(
  grupos: readonly GrupoDeItens<T>[],
  busca: string,
  camposDe: (item: T) => readonly (string | null | undefined)[],
): GrupoDeItens<T>[] {
  return grupos
    .map((g) => ({ time: g.time, itens: g.itens.filter((item) => casaComBusca(camposDe(item), busca)) }))
    .filter((g) => g.itens.length > 0);
}

/** Quantos itens sobraram nos grupos. */
export function contarItens(grupos: readonly GrupoDeItens<unknown>[]): number {
  return grupos.reduce((soma, g) => soma + g.itens.length, 0);
}

/** O que a busca procura num agente: nome amigável, nome técnico, descrição curta e time. */
export function camposDoAgente(a: Pick<AgenteLinha, "name" | "time" | "descricao_curta">): string[] {
  return [nomeAmigavel(a.name, a.time), a.name, a.descricao_curta, a.time];
}

/** O que a busca procura numa skill ou workflow: nome amigável, nome técnico, resumo e time. */
export function camposDoArtefato(a: Pick<ArtefatoCard, "nome" | "time" | "resumo">): string[] {
  return [nomeAmigavel(a.nome, a.time), a.nome, a.resumo, a.time];
}
