"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  SheetGrabber,
  sheetBackdropClasses,
  sheetPanelClasses,
} from "@/components/ui/Sheet";
import type { ActionResult } from "@/lib/action-result";
import { convidarMembro } from "@/app/(app)/usuarios/actions";

const INPUT =
  "w-full rounded-md border border-borda bg-bg px-3 py-2.5 text-sm text-fg-1 placeholder:text-fg-4";

/**
 * Formulário de convite num sheet (lateral no desktop, bottom-sheet no
 * celular). Só nome e e-mail: as permissões se dão no painel da pessoa
 * depois do convite (a server action valida de novo, UI não é segurança).
 */
export function ConvidarMembroSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const tituloId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [state, formAction, pending] = useActionState(convidarMembro, null);

  // O useActionState guarda o último resultado pra sempre — sem este gate,
  // reabrir o sheet mostraria o erro velho da abertura anterior. Só exibe
  // erro se houve submit NESTA abertura.
  const [submeteuNestaAbertura, setSubmeteuNestaAbertura] = useState(false);

  // Reabriu o sheet: o gate de erro zera (ajuste de estado durante o render,
  // padrão React; os inputs de texto são resetados via formRef).
  const [abertoAntes, setAbertoAntes] = useState(open);
  if (open !== abertoAntes) {
    setAbertoAntes(open);
    if (open) setSubmeteuNestaAbertura(false);
  }

  // Fecha e limpa quando o convite deu certo. A ref guarda o último estado
  // já tratado: sem ela, reabrir o sheet depois de um sucesso fecharia de novo.
  const ultimoTratado = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state && state !== ultimoTratado.current) {
      ultimoTratado.current = state;
      if (state.ok) {
        formRef.current?.reset();
        onClose();
      }
    }
  }, [state, onClose]);

  // Esc fecha (padrão de dialog).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // A11y de dialog: ao abrir, o foco entra no painel (tabIndex -1); ao fechar,
  // volta pra quem estava focado antes (o botão "Convidar pessoa").
  useEffect(() => {
    if (!open) return;
    const origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => origem?.focus();
  }, [open]);

  const erro = submeteuNestaAbertura && state && !state.ok ? state.error : null;

  return (
    <>
      <div className={sheetBackdropClasses(open)} onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-hidden={!open}
        // inert bloqueia foco/clique enquanto fechado (o painel segue montado
        // pra transição funcionar).
        inert={!open}
        tabIndex={-1}
        className={`${sheetPanelClasses(open)} outline-none`}
      >
        <SheetGrabber />
        <header className="flex items-center justify-between border-b border-borda-suave px-5 py-4">
          <h2 id={tituloId} className="font-display text-lg font-bold text-fg-1">
            Convidar pessoa
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-11 place-items-center rounded-md text-fg-3 hover:bg-bg-sutil md:size-9"
          >
            <X size={18} />
          </button>
        </header>

        <form
          ref={formRef}
          action={formAction}
          onSubmit={() => setSubmeteuNestaAbertura(true)}
          className="flex flex-col gap-4 px-5 py-5"
        >
          <p className="text-sm text-fg-3">
            A pessoa recebe um e-mail com o link pra criar a senha. Até você dar
            permissões, ela só enxerga o Início.
          </p>

          <div>
            <label htmlFor="convite-nome" className="mb-1 block text-sm font-medium text-fg-2">
              Nome
            </label>
            <input
              id="convite-nome"
              name="nome"
              type="text"
              required
              autoComplete="off"
              className={INPUT}
              placeholder="Maria da Silva"
            />
          </div>

          <div>
            <label htmlFor="convite-email" className="mb-1 block text-sm font-medium text-fg-2">
              E-mail
            </label>
            <input
              id="convite-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              className={INPUT}
              placeholder="maria@empresa.com.br"
            />
          </div>

          {erro && (
            <p className="rounded-md bg-erro-suave px-3 py-2 text-sm text-erro">{erro}</p>
          )}

          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 md:min-h-0"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="min-h-11 md:min-h-0"
              disabled={pending}
            >
              {pending ? "Enviando..." : "Enviar convite"}
            </Button>
          </div>
        </form>
      </aside>
    </>
  );
}
