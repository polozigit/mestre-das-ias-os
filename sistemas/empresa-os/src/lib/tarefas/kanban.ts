import type { TarefaOrigem, TarefaStatus } from "@/types/database";

/**
 * Agrupamento e filtro do quadro de tarefas — funções puras, testadas em
 * kanban.test.ts, sem nenhuma dependência de banco ou de React.
 */

/**
 * Colunas do quadro, na ordem de exibição. CANCELADA fica FORA do quadro DE
 * PROPÓSITO: cancelada não é trabalho em fluxo, é trabalho descartado — ela
 * aparece só na LISTA (com o filtro de status). Se um dia alguém "perder" uma
 * tarefa do quadro, confira antes de tudo se ela não foi cancelada: tarefa
 * sumindo "misteriosamente" do quadro é o bug clássico desse desenho.
 */
export const ORDEM_QUADRO = [
  "BACKLOG",
  "EM_ANDAMENTO",
  "REVISAO",
  "CONCLUIDA",
] as const satisfies readonly TarefaStatus[];

export type StatusQuadro = (typeof ORDEM_QUADRO)[number];

export type ColunaQuadro<T> = { status: StatusQuadro; tarefas: T[] };

/**
 * Distribui as tarefas nas 4 colunas do quadro, preservando a ordem de entrada
 * dentro de cada coluna (quem ordena é o chamador — ex.: atualizada_em desc).
 * Coluna sem tarefa vem vazia, nunca some. Tarefa CANCELADA é descartada aqui.
 */
export function agruparPorStatus<T extends { status: TarefaStatus }>(
  tarefas: T[],
): ColunaQuadro<T>[] {
  const colunas: ColunaQuadro<T>[] = ORDEM_QUADRO.map((status) => ({
    status,
    tarefas: [],
  }));
  const porStatus = new Map<TarefaStatus, ColunaQuadro<T>>(
    colunas.map((c) => [c.status, c]),
  );
  for (const tarefa of tarefas) {
    // CANCELADA não está no Map → cai fora do quadro (comportamento desejado).
    porStatus.get(tarefa.status)?.tarefas.push(tarefa);
  }
  return colunas;
}

export type FiltroTarefas = {
  origem?: TarefaOrigem;
  donoId?: string;
  status?: TarefaStatus;
};

/**
 * Filtro combinável (E lógico) da lista. Campo ausente no filtro = não
 * restringe. donoId nunca casa tarefa sem dono (dono_id null).
 */
export function filtrar<
  T extends { origem: TarefaOrigem; dono_id: string | null; status: TarefaStatus },
>(tarefas: T[], filtro: FiltroTarefas): T[] {
  return tarefas.filter(
    (t) =>
      (!filtro.origem || t.origem === filtro.origem) &&
      (!filtro.donoId || t.dono_id === filtro.donoId) &&
      (!filtro.status || t.status === filtro.status),
  );
}
