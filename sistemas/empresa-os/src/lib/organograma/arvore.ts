/**
 * Montagem e leitura da árvore do organograma — PURO, sem React, sem I/O.
 * Consome `OrgNo[]` (public.v_org_no) e devolve estruturas prontas pra tela.
 */

import type { OrgNo } from "./tipos.ts";

export type IndiceArvore = {
  raiz: OrgNo | null;
  porId: Map<string, OrgNo>;
  /** Filhos por `no_id` do pai, já ordenados por `ordem`. Nó órfão (pai
   * ausente do payload) não entra em nenhuma lista — fica indexável por
   * `porId`, mas fora da árvore navegável a partir da raiz. */
  filhos: Map<string, OrgNo[]>;
};

export function montarArvore(nos: OrgNo[]): IndiceArvore {
  const porId = new Map<string, OrgNo>();
  for (const n of nos) porId.set(n.no_id, n);

  const filhosBrutos = new Map<string, OrgNo[]>();
  let raiz: OrgNo | null = null;

  for (const n of nos) {
    if (n.tipo === "root") raiz = raiz ?? n;
    if (n.pai_no_id == null) continue; // é a raiz (ou nó solto sem pai declarado)
    if (!porId.has(n.pai_no_id)) continue; // órfão: pai não existe no payload
    const lista = filhosBrutos.get(n.pai_no_id) ?? [];
    lista.push(n);
    filhosBrutos.set(n.pai_no_id, lista);
  }

  const filhos = new Map<string, OrgNo[]>();
  for (const [paiId, lista] of filhosBrutos) {
    filhos.set(
      paiId,
      [...lista].sort((a, b) => a.ordem - b.ordem),
    );
  }

  return { raiz, porId, filhos };
}

/** Lista da raiz até `no_id` (inclusive). Id desconhecido ou cadeia quebrada
 * (ancestral ausente do payload) devolve o trecho encontrado — nunca lança. */
export function caminho(indice: IndiceArvore, no_id: string): OrgNo[] {
  const alvo = indice.porId.get(no_id);
  if (!alvo) return [];

  const lista: OrgNo[] = [alvo];
  let atual = alvo;
  const vistos = new Set<string>([atual.no_id]);
  while (atual.pai_no_id != null) {
    const pai = indice.porId.get(atual.pai_no_id);
    if (!pai || vistos.has(pai.no_id)) break; // ancestral ausente ou ciclo — não quebra
    lista.unshift(pai);
    vistos.add(pai.no_id);
    atual = pai;
  }
  return lista;
}

export type Resumo = {
  cargos: number;
  pessoas: number;
  processos: number;
  horasMes: number;
  comSalario: number;
};

const EH_PESSOA = new Set<OrgNo["tipo"]>(["root", "cabeca", "cargo"]);

export function resumo(nos: OrgNo[]): Resumo {
  const r: Resumo = { cargos: 0, pessoas: 0, processos: 0, horasMes: 0, comSalario: 0 };
  for (const n of nos) {
    if (EH_PESSOA.has(n.tipo)) {
      r.cargos += 1;
      r.pessoas += n.vagas ?? 0;
      if (n.salarios.length > 0) r.comSalario += 1;
    }
    for (const p of n.processos) {
      r.processos += 1;
      r.horasMes += p.horas_mes ?? 0;
    }
  }
  return r;
}

const RE_APQC =
  /APQC(?: PCF)?(?: Cross-Industry)?(?: v7\.4)?(?: \(2024\))?[ :-]*(?:categoria )?(\d{1,2}(?:\.\d{1,2}){1,3})((?:\s*(?:,|\/| e )\s*\d{1,2}(?:\.\d{1,2}){1,3})*)/g;
const RE_CODIGO_EXTRA = /\d{1,2}(?:\.\d{1,2}){1,3}/g;

/** Porta a regex `apq()` do artefato: troca menção a "APQC <codigo>" por
 * "<nome> (APQC <codigo>)", ou "APQC <codigo> (código não achado no PCF v7.4)"
 * quando o código não está no catálogo. Lista de códigos ligados por vírgula,
 * barra ou " e " (seguidos de outro código) é resolvida item a item, cada um
 * ganhando o próprio rótulo — junção não numérica ("e grupo 7.2") fica como
 * texto solto, igual ao comportamento original. */
export function rotuloApqc(texto: string, apqc: Map<string, string>): string {
  return String(texto ?? "").replace(RE_APQC, (_all, c1: string, rest: string) => {
    const codigos = [c1, ...(rest.match(RE_CODIGO_EXTRA) ?? [])];
    return codigos
      .map((c) => (apqc.has(c) ? `${apqc.get(c)} (APQC ${c})` : `APQC ${c} (código não achado no PCF v7.4)`))
      .join(" · ");
  });
}

/** Parte do título antes do primeiro "(", sem espaço nas pontas. */
export function rotuloCurto(titulo: string): string {
  return titulo.split("(")[0].trim();
}
