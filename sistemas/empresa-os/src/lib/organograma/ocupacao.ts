/**
 * Ocupação de posições do organograma (organograma.v_posicao_ocupante):
 * quem ocupa cada posição hoje, pessoa, agente ou ninguém. Lógica pura.
 */

export type Ocupante = {
  posicao_id: number;
  cargo_slug: string;
  ocupante_tipo: "pessoa" | "agente" | "vazio";
  agente_name: string | null;
};

export type ResumoOcupacao = { pessoa: number; agente: number; vazio: number };

export function ocupacaoPorCargo(linhas: Ocupante[]): Map<string, Ocupante[]> {
  const m = new Map<string, Ocupante[]>();
  for (const l of linhas) {
    const lista = m.get(l.cargo_slug);
    if (lista) lista.push(l);
    else m.set(l.cargo_slug, [l]);
  }
  return m;
}

export function resumoOcupacao(linhas: Ocupante[]): ResumoOcupacao {
  const r: ResumoOcupacao = { pessoa: 0, agente: 0, vazio: 0 };
  for (const l of linhas) r[l.ocupante_tipo] += 1;
  return r;
}

/** "Vazio" | "Agente: <name>" | "Pessoa" | "2 posições: 1 agente, 1 vazia". */
export function rotuloOcupacao(o: Ocupante[] | undefined): string {
  if (!o || o.length === 0) return "Vazio";
  if (o.length === 1) {
    const u = o[0];
    if (u.ocupante_tipo === "agente") return u.agente_name ? `Agente: ${u.agente_name}` : "Agente";
    return u.ocupante_tipo === "pessoa" ? "Pessoa" : "Vazio";
  }
  const r = resumoOcupacao(o);
  const partes: string[] = [];
  if (r.pessoa) partes.push(`${r.pessoa} ${r.pessoa === 1 ? "pessoa" : "pessoas"}`);
  if (r.agente) partes.push(`${r.agente} ${r.agente === 1 ? "agente" : "agentes"}`);
  if (r.vazio) partes.push(`${r.vazio} ${r.vazio === 1 ? "vazia" : "vazias"}`);
  return `${o.length} posições: ${partes.join(", ")}`;
}
