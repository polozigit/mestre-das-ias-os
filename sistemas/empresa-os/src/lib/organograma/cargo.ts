/**
 * Funções puras do PainelCargo (tudo que o banco tem sobre um cargo) — sem
 * React, sem I/O. Consomem `OrgNo`, já carregado pela página.
 */

import type { OrgNo, OrgProcesso } from "./tipos.ts";

export type FatoCargo = { rotulo: string; valor: string };

/** Fatos curtos do cargo — sigla, cargo real (só quando difere do título),
 * porte mínimo da empresa e vagas de referência — na ordem fixa abaixo,
 * omitindo qualquer campo `null` (não mostra o que o banco não tem). */
export function fatosCargo(no: OrgNo): FatoCargo[] {
  const fatos: FatoCargo[] = [];
  if (no.sigla) fatos.push({ rotulo: "Sigla", valor: no.sigla });
  if (no.cargo_real && no.cargo_real !== no.titulo) {
    fatos.push({ rotulo: "Cargo real", valor: no.cargo_real });
  }
  if (no.aparece_a_partir_de != null) {
    fatos.push({ rotulo: "Aparece a partir de", valor: `${no.aparece_a_partir_de} pessoas` });
  }
  if (no.vagas != null) {
    fatos.push({ rotulo: "Vagas de referência", valor: String(no.vagas) });
  }
  return fatos;
}

/** Códigos APQC do processo que NÃO aparecem já citados em `p.notas` — evita
 * repetir o mesmo código do catálogo 2x na mesma linha do painel (uma vez na
 * nota livre, outra na lista `apqc` original). */
export function apqcSemNotas(p: OrgProcesso): string[] {
  const notas = p.notas ?? "";
  return p.apqc.filter((c) => !notas.includes(c));
}

export type ItemIndiceCargo = { href: string; rotulo: string };

/** Itens do índice fixo do cargo (nav sticky entre Palco e PainelCargo) — só
 * os blocos que o cargo realmente tem, na ordem em que aparecem na tela.
 * "Resumo" sempre existe (é o próprio painel); os demais são condicionais ao
 * dado do banco, pra não linkar pra uma seção vazia/ausente. */
export function itensIndiceCargo(no: OrgNo): ItemIndiceCargo[] {
  const itens: ItemIndiceCargo[] = [{ href: "#cargo-resumo", rotulo: "Resumo" }];
  if (no.processos.length > 0) itens.push({ href: "#cargo-processos", rotulo: "Processos" });
  if (no.tipo !== "area") itens.push({ href: "#cargo-salario", rotulo: "Salário" });
  if (no.referencias.length > 0) itens.push({ href: "#cargo-referencias", rotulo: "Referências" });
  if (no.pacote) {
    itens.push({ href: "#pacote-playbooks", rotulo: `Playbooks · ${no.pacote.n_playbooks}` });
    itens.push({ href: "#pacote-partes", rotulo: "Partes do pacote" });
  }
  return itens;
}
