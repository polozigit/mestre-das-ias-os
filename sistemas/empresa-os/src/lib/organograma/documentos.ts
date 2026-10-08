/**
 * Vista "Documentos" do organograma — PURO, sem React, sem I/O.
 * Consome `OrgDocumentoResumo[]` (public.v_org_documento, sem o markdown) e
 * devolve estruturas prontas pra tela: rótulo por tipo, agrupamento, filtro
 * combinado (tipo + busca) e o filtro `.or()` do PostgREST pra busca.
 */

import type { OrgDocumentoResumo, OrgDocumentoTipo } from "./tipos.ts";

/** Ordem fixa de exibição dos tipos — igual à ordem dos chips de filtro. */
export const TIPO_ORDEM: OrgDocumentoTipo[] = [
  "frente",
  "maturidade",
  "dimensao",
  "area_maturidade",
  "pesquisa",
  "molde",
  "cultura",
  "dossie",
  "auditoria",
  "fonte_especialista",
  "especialista",
  "playbook_compartilhado",
  "gestao",
];

export const TIPO_ROTULO: Record<OrgDocumentoTipo, string> = {
  frente: "Decisões da frente",
  maturidade: "Modelo de maturidade",
  dimensao: "Dimensões",
  area_maturidade: "Áreas (maturidade)",
  pesquisa: "Pesquisas",
  molde: "Moldes",
  cultura: "Cultura",
  dossie: "Dossiês",
  auditoria: "Auditorias",
  gestao: "Gestão do projeto",
  fonte_especialista: "Leituras das referências",
  especialista: "Conhecimento dos especialistas",
  playbook_compartilhado: "Playbooks compartilhados",
};

export const BUSCA_MIN_CHARS = 3;

/** Termo curto demais não consulta — evita `.or()` varrendo o markdown
 * inteiro (1,4 MB) por 1-2 letras. */
export function deveBuscarDocumentos(termo: string): boolean {
  return termo.trim().length >= BUSCA_MIN_CHARS;
}

/** Escapa curinga do ILIKE (`%`, `_`) e aspas dupla/barra invertida — o
 * termo entra num valor "entre aspas duplas" do filtro `.or()` do PostgREST
 * (ver `montarFiltroBuscaDocumentos`); a vírgula digitada pelo usuário fica
 * protegida pelas aspas duplas em volta do valor inteiro (sintaxe "quoted
 * value" da URL grammar do PostgREST — é assim que o próprio PostgREST pede
 * pra conter vírgula/parênteses/dois-pontos dentro de 1 valor de filtro sem
 * virar um novo termo do `.or()`), então não precisa de barra própria.
 * Ordem importa: barra invertida primeiro, senão as barras inseridas depois
 * (por `%`/`_`/aspas) seriam escapadas de novo. */
export function escaparTermoBusca(termo: string): string {
  return termo
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/** Argumento do `.or()` pra buscar `termo` em `titulo` OU `markdown`, os dois
 * com o mesmo padrão `%termo%` entre aspas duplas. */
export function montarFiltroBuscaDocumentos(termo: string): string {
  const padrao = `"%${escaparTermoBusca(termo.trim())}%"`;
  return `titulo.ilike.${padrao},markdown.ilike.${padrao}`;
}

export function contarPorTipo(docs: OrgDocumentoResumo[]): Record<OrgDocumentoTipo, number> {
  const contagem = Object.fromEntries(TIPO_ORDEM.map((t) => [t, 0])) as Record<
    OrgDocumentoTipo,
    number
  >;
  for (const d of docs) contagem[d.tipo] = (contagem[d.tipo] ?? 0) + 1;
  return contagem;
}

export type GrupoDocumentos = {
  tipo: OrgDocumentoTipo;
  rotulo: string;
  documentos: OrgDocumentoResumo[];
};

/** Agrupa por tipo, na ORDEM fixa de `TIPO_ORDEM` (tipo sem documento fica de
 * fora — não aparece grupo vazio na lista), cada grupo ordenado por `ordem`. */
export function agruparPorTipo(docs: OrgDocumentoResumo[]): GrupoDocumentos[] {
  const porTipo = new Map<OrgDocumentoTipo, OrgDocumentoResumo[]>();
  for (const d of docs) {
    const lista = porTipo.get(d.tipo) ?? [];
    lista.push(d);
    porTipo.set(d.tipo, lista);
  }
  return TIPO_ORDEM.filter((t) => (porTipo.get(t)?.length ?? 0) > 0).map((t) => ({
    tipo: t,
    rotulo: TIPO_ROTULO[t],
    documentos: [...(porTipo.get(t) ?? [])].sort((a, b) => a.ordem - b.ordem),
  }));
}

/** Filtro combinado: `tipo` (chip selecionado) e `caminhosBusca` (resultado
 * da busca no banco, já limitado a `caminho`) — os dois opcionais, aplicados
 * em AND quando os dois vêm preenchidos. */
export function filtrarDocumentos(
  docs: OrgDocumentoResumo[],
  opts: { tipo?: OrgDocumentoTipo | null; caminhosBusca?: string[] | null },
): OrgDocumentoResumo[] {
  let out = docs;
  if (opts.tipo) out = out.filter((d) => d.tipo === opts.tipo);
  if (opts.caminhosBusca) {
    const set = new Set(opts.caminhosBusca);
    out = out.filter((d) => set.has(d.caminho));
  }
  return out;
}

/** `tamanho` (chars) formatado em KB, separador decimal pt-BR. */
const NOME_ESPECIALISTA: Record<string, string> = {
  brunson: "Russell Brunson",
  "chet-holmes": "Chet Holmes",
  "ia-native-anthropic": "IA-native (Anthropic)",
};

/** Nome legível do especialista a partir do slug da pasta em 12-fabrica-gurus. */
export function rotuloEspecialista(slug: string): string {
  return (
    NOME_ESPECIALISTA[slug] ??
    slug
      .split("-")
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(" ")
  );
}

export function formatarTamanhoKB(tamanho: number): string {
  return `${(tamanho / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
}
