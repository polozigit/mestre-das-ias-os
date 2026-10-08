/**
 * Helpers PUROS da página de um agente (sem import de runtime: roda no node --test).
 * Entrada suja do banco vira estrutura válida; a página decide o estado vazio.
 */

/** Mesma regra do CHECK de agentes.name (0005): só [a-z0-9-]. */
const NOME_VALIDO = /^[a-z0-9-]+$/;

export function nomeAgenteValido(name: string): boolean {
  return NOME_VALIDO.test(name);
}

/**
 * agentes.skills é text[] NOT NULL, mas a página não confia: aceita array ou
 * json em texto, tira branco/vazio/não-string/repetido e mantém a ordem.
 */
export function normalizarSkills(v: unknown): string[] {
  let lista: unknown = v;
  if (typeof v === "string") {
    try {
      lista = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  for (const item of lista) {
    if (typeof item !== "string") continue;
    const skill = item.trim();
    if (skill) vistos.add(skill);
  }
  return [...vistos];
}

const ORDEM_VEREDITO = ["APROVADO", "CONCLUIDO", "BLOQUEADO", "ERRO"];

export type ResumoExecucoes<T> = {
  total: number;
  porVeredito: { veredito: string; qtd: number }[];
  ultima: T | null;
};

/** Contagem por veredito (ordem fixa, desconhecido no fim) e execução mais recente. */
export function resumirExecucoes<T extends { veredito: string; terminado_em: string }>(
  e: T[],
): ResumoExecucoes<T> {
  const contagem = new Map<string, number>();
  let ultima: T | null = null;
  for (const exec of e) {
    contagem.set(exec.veredito, (contagem.get(exec.veredito) ?? 0) + 1);
    if (!ultima || new Date(exec.terminado_em).getTime() > new Date(ultima.terminado_em).getTime()) {
      ultima = exec;
    }
  }
  const posicao = (v: string) => {
    const i = ORDEM_VEREDITO.indexOf(v);
    return i === -1 ? ORDEM_VEREDITO.length : i;
  };
  const porVeredito = [...contagem.entries()]
    .sort(([a], [b]) => posicao(a) - posicao(b) || a.localeCompare(b, "pt-BR"))
    .map(([veredito, qtd]) => ({ veredito, qtd }));
  return { total: e.length, porVeredito, ultima };
}

/** custo_estimado_tokens: NULL = não medido (nunca vira zero). */
export function rotuloTokens(n: number | null): string {
  if (n === null) return "não medido";
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? "token" : "tokens"}`;
}

export type TomVeredito = "success" | "danger" | "info" | "neutral";

export function tomVeredito(veredito: string): TomVeredito {
  switch (veredito) {
    case "APROVADO":
      return "success";
    case "CONCLUIDO":
      return "info";
    case "BLOQUEADO":
    case "ERRO":
      return "danger";
    default:
      return "neutral";
  }
}
