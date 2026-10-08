"use client";

import { useRouter } from "next/navigation";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/ui/ResponsiveTable";
import { formatarData, tempoRelativo } from "@/lib/format";
import { hrefTarefa } from "@/lib/tarefas/grupos";
import { CriadaPorPill, StatusPill } from "./pills";
import type { TarefaOrigem, TarefaStatus } from "@/types/database";

/** Linha serializável (nomes já resolvidos no server — client não vê ids de FK). */
export type TarefaLinha = {
  id: string;
  titulo: string;
  status: TarefaStatus;
  origem: TarefaOrigem;
  /** Trilha do banco (curso, plano90 ou trabalho): o link do detalhe leva o grupo pro menu lateral. */
  trilha: string;
  responsavel: string | null;
  /** agentes.descricao_curta do agente responsável, quando houver. */
  responsavelNota?: string | null;
  atualizadaEm: string;
};

/* Client component porque ResponsiveTable recebe funções de render por coluna —
   e função não atravessa a fronteira server→client como prop. */
const COLUNAS: ResponsiveColumn<TarefaLinha>[] = [
  {
    key: "titulo",
    header: "Título",
    primary: true,
    render: (t) => (
      <span className="font-semibold text-fg-1">{t.titulo}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    width: 140,
    render: (t) => <StatusPill status={t.status} />,
  },
  {
    key: "origem",
    header: "Criada por",
    width: 110,
    render: (t) => <CriadaPorPill origem={t.origem} curto />,
  },
  {
    key: "responsavel",
    header: "Dono",
    render: (t) => (
      <span className="text-fg-2">
        {t.responsavel ?? "Sem dono"}
        {t.responsavelNota && <span className="block text-xs text-fg-3">{t.responsavelNota}</span>}
      </span>
    ),
  },
  {
    key: "atualizada",
    header: "Atualizada",
    width: 130,
    // Na lista a data vai escrita (dia/mês/ano) e o "ontem" fica na dica ao passar o mouse. É o espelho do
    // TempoRelativo; o `suppressHydrationWarning` vale pelo mesmo motivo (o relativo depende de "agora").
    render: (t) => (
      <span className="text-fg-3" title={tempoRelativo(t.atualizadaEm)} suppressHydrationWarning>
        {formatarData(t.atualizadaEm)}
      </span>
    ),
  },
];

export function TarefasTable({ tarefas }: { tarefas: TarefaLinha[] }) {
  const router = useRouter();
  return (
    <ResponsiveTable
      columns={COLUNAS}
      data={tarefas}
      getRowKey={(t) => t.id}
      onRowClick={(t) => router.push(hrefTarefa(t.id, t.trilha))}
      empty="Nenhuma tarefa com esses filtros."
    />
  );
}
