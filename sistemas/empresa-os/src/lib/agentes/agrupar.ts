/**
 * Helpers PUROS da tela Time de Agentes (sem import de runtime: roda no node --test).
 * Lista vazia sempre vira estrutura vazia válida; a tela decide o estado vazio.
 */
export type AgenteLinha = {
  id: string;
  name: string;
  time: string;
  descricao_curta: string;
  estado: "instalado" | "disponivel" | "aposentado";
  tier: string;
  esforco: string;
};

const TIME_SISTEMA = "sistema";

/**
 * O estado que conta como "instalado". É a regra ÚNICA do número que aparece em dois lugares: o
 * "Instalados" da tela de Agentes e o "Agentes instalados" do Início. Os dois usam esta constante,
 * então nunca mostram contagens diferentes pra mesma empresa.
 */
export const ESTADO_INSTALADO = "instalado" satisfies AgenteLinha["estado"];

/** Quantos agentes estão instalados (disponível e aposentado não contam). */
export function contarInstalados(agentes: readonly { estado: string }[]): number {
  return agentes.filter((a) => a.estado === ESTADO_INSTALADO).length;
}

/** Times em ordem alfabética pt-BR, "sistema" por último; aposentado fica fora. */
export function agruparPorTime(a: AgenteLinha[]): { time: string; agentes: AgenteLinha[] }[] {
  const mapa = new Map<string, AgenteLinha[]>();
  for (const agente of a) {
    if (agente.estado === "aposentado") continue;
    const grupo = mapa.get(agente.time);
    if (grupo) grupo.push(agente);
    else mapa.set(agente.time, [agente]);
  }
  return [...mapa.entries()]
    .sort(([x], [y]) => {
      if (x === TIME_SISTEMA && y !== TIME_SISTEMA) return 1;
      if (y === TIME_SISTEMA && x !== TIME_SISTEMA) return -1;
      return x.localeCompare(y, "pt-BR");
    })
    .map(([time, agentes]) => ({ time, agentes }));
}

/** Execução mais recente (maior terminado_em) de cada agente. */
export function ultimaExecucaoPorAgente<T extends { agente: string; terminado_em: string }>(
  e: T[],
): Map<string, T> {
  const mapa = new Map<string, T>();
  for (const exec of e) {
    const atual = mapa.get(exec.agente);
    if (!atual || new Date(exec.terminado_em).getTime() > new Date(atual.terminado_em).getTime()) {
      mapa.set(exec.agente, exec);
    }
  }
  return mapa;
}

/** Execução do agente: `execucoes_agente.agente` guarda `agentes.name`, não o uuid. */
export function execucaoDoAgente<T>(agente: { name: string }, mapa: Map<string, T>): T | null {
  return mapa.get(agente.name) ?? null;
}
