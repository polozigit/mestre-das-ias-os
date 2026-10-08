"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { atualizarEmpresa } from "@/app/(app)/configuracoes/actions";

const INPUT =
  "w-full rounded-md border border-borda bg-bg px-3 py-2.5 text-sm text-fg-1 placeholder:text-fg-4";

/**
 * Formulário pra editar nome/descrição da empresa (quem tem `configuracoes.write`).
 */
export function EmpresaForm({
  nome,
  descricao,
}: {
  nome: string;
  descricao: string | null;
}) {
  const [state, formAction, pending] = useActionState(atualizarEmpresa, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="empresa-nome" className="mb-1 block text-sm font-medium text-fg-2">
          Nome da empresa
        </label>
        <input
          id="empresa-nome"
          name="nome"
          type="text"
          required
          defaultValue={nome}
          className={INPUT}
        />
      </div>

      <div>
        <label
          htmlFor="empresa-descricao"
          className="mb-1 block text-sm font-medium text-fg-2"
        >
          Descrição
        </label>
        <textarea
          id="empresa-descricao"
          name="descricao"
          rows={3}
          defaultValue={descricao ?? ""}
          className={INPUT}
          placeholder="Uma frase sobre o que a empresa faz."
        />
      </div>

      {state && !state.ok && state.error && (
        <p className="rounded-md bg-erro-suave px-3 py-2 text-sm text-erro">
          {state.error}
        </p>
      )}
      {state?.ok && state.info && (
        <p className="rounded-md bg-ok-suave px-3 py-2 text-sm text-ok">{state.info}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
