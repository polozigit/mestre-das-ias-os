import type { TarefaStatus } from "@/types/database";

/**
 * Máquina de estados das tarefas — fonte única de "de onde pode ir pra onde".
 *
 * Espelha o CHECK de status da migration 0006 (mesmos 5 valores); o teste em
 * status.test.ts trava essa simetria. O banco NÃO valida transição (só o
 * conjunto de valores) — quem garante o fluxo é esta camada, usada tanto pra
 * montar o menu de ações quanto pra validar na server action.
 */
export const TRANSICOES: Record<TarefaStatus, readonly TarefaStatus[]> = {
  BACKLOG: ["EM_ANDAMENTO", "CANCELADA"],
  EM_ANDAMENTO: ["REVISAO", "BACKLOG", "CANCELADA"],
  REVISAO: ["CONCLUIDA", "EM_ANDAMENTO", "CANCELADA"],
  // Terminais com uma única saída: reabrir (CONCLUIDA) e reativar (CANCELADA).
  CONCLUIDA: ["EM_ANDAMENTO"],
  CANCELADA: ["BACKLOG"],
};

/** Rótulos pt-BR pra UI — o banco fala BACKLOG, a tela fala "Backlog". */
export const ROTULO_STATUS: Record<TarefaStatus, string> = {
  BACKLOG: "Backlog",
  EM_ANDAMENTO: "Em andamento",
  REVISAO: "Revisão",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

/** Pra onde uma tarefa neste status pode ir (na ordem de exibição do menu). */
export function transicoesValidas(de: TarefaStatus): readonly TarefaStatus[] {
  return TRANSICOES[de] ?? [];
}

/** A transição de → para é permitida pela máquina de estados? */
export function podeMover(de: TarefaStatus, para: TarefaStatus): boolean {
  return transicoesValidas(de).includes(para);
}
