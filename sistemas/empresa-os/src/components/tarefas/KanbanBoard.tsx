import { agruparPorStatus } from "@/lib/tarefas/kanban";
import { ROTULO_STATUS } from "@/lib/tarefas/status";
import { TarefaCard, type TarefaCardData } from "./TarefaCard";

/**
 * Quadro de 4 colunas (CANCELADA fica fora — ver comentário em lib/tarefas/kanban.ts).
 * Sem drag-and-drop de propósito (decisão v1): mover é pelo menu de status no
 * detalhe da tarefa, que só oferece transições válidas.
 */
export function KanbanBoard({ tarefas }: { tarefas: TarefaCardData[] }) {
  const colunas = agruparPorStatus(tarefas);

  return (
    /* O scroll horizontal mora NESTE contêiner: no celular as 4 colunas rolam
       aqui dentro e o body da página nunca ganha scroll-x. */
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3 lg:gap-4">
        {colunas.map((coluna) => (
          <section
            key={coluna.status}
            aria-label={ROTULO_STATUS[coluna.status]}
            className="w-72 shrink-0"
          >
            <header className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-fg-3">
                {ROTULO_STATUS[coluna.status]}
              </h2>
              <span className="text-xs tabular-nums text-fg-4">
                {coluna.tarefas.length}
              </span>
            </header>
            <div className="flex min-h-28 flex-col gap-2 rounded-lg bg-bg-sutil p-2">
              {coluna.tarefas.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-fg-4">
                  Nenhuma tarefa aqui.
                </p>
              ) : (
                coluna.tarefas.map((tarefa) => (
                  <TarefaCard key={tarefa.id} tarefa={tarefa} />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
