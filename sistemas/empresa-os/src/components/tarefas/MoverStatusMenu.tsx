"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { usePermissions } from "@/lib/auth/PermissionsProvider";
import { podeEscrever } from "@/lib/auth/permissoes";
import { transicoesValidas } from "@/lib/tarefas/status";
import { moverTarefa } from "@/app/(app)/tarefas/actions";
import type { TarefaStatus } from "@/types/database";

/**
 * Verbo humano pra cada transição — "Concluir" comunica melhor que
 * "Mover pra Concluída".
 */
function rotuloAcao(de: TarefaStatus, para: TarefaStatus): string {
  switch (para) {
    case "CONCLUIDA":
      return "Concluir";
    case "CANCELADA":
      return "Cancelar tarefa";
    case "REVISAO":
      return "Mandar pra revisão";
    case "BACKLOG":
      return de === "CANCELADA" ? "Reativar no backlog" : "Voltar pro backlog";
    case "EM_ANDAMENTO":
      if (de === "BACKLOG") return "Iniciar";
      if (de === "CONCLUIDA") return "Reabrir";
      return "Voltar pra andamento";
  }
}

/**
 * Ações de status da tarefa: botões só com as transições que a máquina de
 * estados permite (lib/tarefas/status.ts). SEM drag-and-drop — decisão v1: o
 * fluxo é sempre por ação explícita, validada de novo na server action.
 *
 * Quem não tem `tarefas.write` (e não é dono) não vê os botões (cosmético);
 * quem nega de verdade é a RLS (policy tarefas_update).
 */
export function MoverStatusMenu({
  tarefaId,
  status,
}: {
  tarefaId: string;
  status: TarefaStatus;
}) {
  const { sessao } = usePermissions();
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // UI esconde, RLS garante: sem tarefas.write o banco nega o UPDATE.
  if (!podeEscrever(sessao, "tarefas.write")) return null;

  const destinos = transicoesValidas(status);

  function mover(para: TarefaStatus) {
    setErro(null);
    startTransition(async () => {
      const res = await moverTarefa(tarefaId, para);
      if (!res.ok) setErro(res.error ?? "Não foi possível mover a tarefa.");
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {destinos.map((para) => (
          <Button
            key={para}
            size="sm"
            className="min-h-11 md:min-h-0"
            variant={
              para === "CANCELADA"
                ? "danger"
                : para === "CONCLUIDA"
                  ? "primary"
                  : "secondary"
            }
            disabled={pending}
            onClick={() => mover(para)}
          >
            {rotuloAcao(status, para)}
          </Button>
        ))}
      </div>
      {erro && (
        <p className="mt-2 rounded-md bg-erro-suave px-3 py-2 text-sm text-erro">
          {erro}
        </p>
      )}
    </div>
  );
}
