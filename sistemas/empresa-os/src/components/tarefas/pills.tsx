import { Pill, type PillTone } from "@/components/ui/Pill";
import { fraseCriadaPor, rotuloCriadaPor } from "@/lib/tarefas/rotulos";
import { ROTULO_STATUS } from "@/lib/tarefas/status";
import type { TarefaOrigem, TarefaStatus } from "@/types/database";

/* Pills de domínio do módulo Tarefas — um lugar só pro mapa status→tom, pra
   lista, quadro e detalhe nunca divergirem de cor. */

const TOM_STATUS: Record<TarefaStatus, PillTone> = {
  BACKLOG: "neutral",
  EM_ANDAMENTO: "info",
  REVISAO: "warning",
  CONCLUIDA: "success",
  CANCELADA: "danger",
};

export function StatusPill({ status }: { status: TarefaStatus }) {
  return (
    <Pill tone={TOM_STATUS[status]} dot>
      {ROTULO_STATUS[status]}
    </Pill>
  );
}

/**
 * Quem criou a tarefa. `curto` ("Você" / "IA") é pra coluna da tabela, que já tem o cabeçalho
 * "Criada por"; sem ele sai a frase inteira ("Criada por você"), pra card e detalhe.
 */
export function CriadaPorPill({ origem, curto = false }: { origem: TarefaOrigem; curto?: boolean }) {
  const texto = curto ? rotuloCriadaPor(origem) : fraseCriadaPor(origem);
  return (
    <Pill tone={origem === "ia" ? "brand" : "neutral"} className="shrink-0 whitespace-nowrap">
      {texto}
    </Pill>
  );
}
