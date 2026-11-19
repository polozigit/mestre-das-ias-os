"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { SENHA_MINIMA } from "@/lib/senha-provisoria";
import { trocarSenha } from "@/app/(app)/conta/senha/actions";

const campo =
  "w-full rounded-md border border-borda bg-bg px-3 py-2.5 text-sm text-fg-1";

export function FormTrocarSenha() {
  const [res, action, pending] = useActionState(trocarSenha, null);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="nova" className="mb-1 block text-sm font-medium text-fg-2">
          Nova senha
        </label>
        <input
          id="nova"
          name="nova"
          type="password"
          autoComplete="new-password"
          minLength={SENHA_MINIMA}
          required
          className={campo}
        />
        <p className="mt-1 text-xs text-fg-4">Pelo menos {SENHA_MINIMA} caracteres.</p>
      </div>
      <div>
        <label htmlFor="confirmacao" className="mb-1 block text-sm font-medium text-fg-2">
          Repita a senha nova
        </label>
        <input
          id="confirmacao"
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          required
          className={campo}
        />
      </div>

      {res?.error && (
        <p role="alert" className="rounded-md bg-erro-suave px-3 py-2 text-sm text-erro">
          {res.error}
        </p>
      )}
      {res?.ok && res.info && (
        <p role="status" className="rounded-md bg-ok-suave px-3 py-2 text-sm text-ok">
          {res.info}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </form>
  );
}
