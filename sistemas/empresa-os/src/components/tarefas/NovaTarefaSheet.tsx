"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  SheetGrabber,
  sheetBackdropClasses,
  sheetPanelClasses,
} from "@/components/ui/Sheet";
import { usePermissions } from "@/lib/auth/PermissionsProvider";
import { podeEscrever } from "@/lib/auth/permissoes";
import { criarTarefa } from "@/app/(app)/tarefas/actions";

const CAMPO =
  "w-full rounded-md border border-borda bg-bg px-3 py-2.5 text-sm text-fg-1 placeholder:text-fg-4";
const ROTULO = "mb-1 block text-sm font-medium text-fg-2";

/**
 * Botão "Nova tarefa" + bottom-sheet/painel com o formulário de criação.
 * Origem é sempre "humano" (tarefa de IA nasce por trás, via service role).
 *
 * Sem `tarefas.write` o botão SOME — mas isso é cosmético: quem nega de verdade
 * é a policy de INSERT no banco (tem_permissao), e a action só traduz a negativa. UI esconde; RLS garante.
 */
export function NovaTarefaSheet({
  usuarios,
}: {
  /** Membros ATIVOS, candidatos a dono da tarefa. */
  usuarios: { id: string; nome: string }[];
}) {
  const { sessao } = usePermissions();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Esc fecha o sheet (padrão de diálogo).
  useEffect(() => {
    if (!aberto) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [aberto]);

  if (!podeEscrever(sessao, "tarefas.write")) return null;

  function fechar() {
    setAberto(false);
    setErro(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const dados = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await criarTarefa(dados);
      if (!res.ok) {
        setErro(res.error ?? "Não foi possível criar a tarefa.");
        return;
      }
      formRef.current?.reset();
      fechar();
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setAberto(true)}>
        <Plus size={16} />
        Nova tarefa
      </Button>

      <div
        className={sheetBackdropClasses(aberto)}
        onClick={fechar}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Nova tarefa"
        // Fechado, o sheet sai do tab order e da árvore de acessibilidade.
        inert={!aberto}
        className={sheetPanelClasses(aberto)}
      >
        <SheetGrabber />
        <header className="flex items-center justify-between gap-3 border-b border-borda-suave px-5 py-4">
          <h2 className="font-display text-lg font-bold text-fg-1">
            Nova tarefa
          </h2>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="grid size-11 place-items-center rounded-md text-fg-3 hover:bg-bg-sutil hover:text-fg-1 md:size-9"
          >
            <X size={18} />
          </button>
        </header>

        <form ref={formRef} onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label htmlFor="nova-tarefa-titulo" className={ROTULO}>
              Título
            </label>
            <input
              id="nova-tarefa-titulo"
              name="titulo"
              type="text"
              required
              maxLength={200}
              placeholder="Ex.: Revisar proposta do cliente X"
              className={CAMPO}
            />
          </div>

          <div>
            <label htmlFor="nova-tarefa-objetivo" className={ROTULO}>
              Objetivo
            </label>
            <textarea
              id="nova-tarefa-objetivo"
              name="objetivo"
              rows={3}
              placeholder="O que essa tarefa precisa alcançar?"
              className={CAMPO}
            />
          </div>

          <div>
            <label htmlFor="nova-tarefa-criterio" className={ROTULO}>
              Critério de pronto
            </label>
            <textarea
              id="nova-tarefa-criterio"
              name="criterio_pronto"
              rows={3}
              placeholder="Como saber que ficou pronta de verdade?"
              className={CAMPO}
            />
          </div>

          <div>
            <label htmlFor="nova-tarefa-dono" className={ROTULO}>
              Dono
            </label>
            <select id="nova-tarefa-dono" name="dono_id" className={CAMPO}>
              <option value="">Sem dono por enquanto</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>

          {erro && (
            <p className="rounded-md bg-erro-suave px-3 py-2 text-sm text-erro">
              {erro}
            </p>
          )}

          <div className="flex justify-end gap-2 pb-4">
            <Button type="button" variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Criando..." : "Criar tarefa"}
            </Button>
          </div>
        </form>
      </aside>
    </>
  );
}
