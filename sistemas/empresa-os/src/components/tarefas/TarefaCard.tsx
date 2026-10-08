import Link from "next/link";
import { TempoRelativo } from "@/components/ui/TempoRelativo";
import { hrefTarefa } from "@/lib/tarefas/grupos";
import { CriadaPorPill } from "./pills";
import type { TarefaOrigem, TarefaStatus } from "@/types/database";

/** Dados serializáveis que o card precisa (nomes já resolvidos pelo server). */
export type TarefaCardData = {
  id: string;
  titulo: string;
  status: TarefaStatus;
  origem: TarefaOrigem;
  /** Trilha do banco (curso, plano90 ou trabalho): o link do detalhe leva o grupo pro menu lateral. */
  trilha: string;
  /** Nome do dono humano e/ou do agente, já resolvido (null = sem responsável). */
  responsavel: string | null;
  atualizadaEm: string;
};

/** Card do quadro: resumo clicável — o detalhe (e as ações) moram em /tarefas/[id]. */
export function TarefaCard({ tarefa }: { tarefa: TarefaCardData }) {
  return (
    <Link
      href={hrefTarefa(tarefa.id, tarefa.trilha)}
      className="block rounded-md border border-borda bg-bg-elevada p-3 shadow-[var(--sombra-sm)] transition-colors hover:bg-bg-sutil focus-visible:bg-bg-sutil"
    >
      <p className="text-sm font-semibold leading-snug text-fg-1">
        {tarefa.titulo}
      </p>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <CriadaPorPill origem={tarefa.origem} />
        {tarefa.responsavel && (
          <span className="truncate text-xs text-fg-3">{tarefa.responsavel}</span>
        )}
      </div>
      <TempoRelativo
        iso={tarefa.atualizadaEm}
        className="mt-2 block text-[11px] text-fg-4"
      />
    </Link>
  );
}
