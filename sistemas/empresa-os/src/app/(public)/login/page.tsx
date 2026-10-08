"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { empresa, nomeSistema } from "../../../../config/empresa";
import { entrar, enviarRecuperacaoSenha } from "./actions";

type Modo = "login" | "recuperar";

export default function LoginPage() {
  const [modo, setModo] = useState<Modo>("login");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    const dados = new FormData(e.currentTarget);
    startTransition(async () => {
      if (modo === "login") {
        const res = await entrar(dados);
        if (res?.error) setErro(res.error);
      } else {
        const res = await enviarRecuperacaoSenha(dados);
        if (res?.error) setErro(res.error);
        if ("success" in (res ?? {}) && res.success) setAviso(res.success);
      }
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-lg border border-borda bg-bg-elevada p-8 shadow-[var(--sombra-md)]">
        <Image
          src={empresa.logo}
          alt={nomeSistema}
          width={140}
          height={36}
          priority
          unoptimized
          className="mb-4 h-9 w-auto"
        />
        <h1 className="mb-1 text-lg font-semibold text-fg-1">{nomeSistema}</h1>
        <p className="mb-6 text-sm text-fg-3">
          {modo === "login"
            ? "Entre com seu e-mail e senha."
            : "Informe seu e-mail pra receber o link de redefinição."}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-fg-2">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border border-borda bg-bg px-3 py-2.5 text-sm text-fg-1 placeholder:text-fg-4"
              placeholder="voce@empresa.com.br"
            />
          </div>

          {modo === "login" && (
            <div>
              <label htmlFor="senha" className="mb-1 block text-sm font-medium text-fg-2">
                Senha
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-md border border-borda bg-bg px-3 py-2.5 text-sm text-fg-1"
              />
            </div>
          )}

          {erro && (
            <p className="rounded-md bg-erro-suave px-3 py-2 text-sm text-erro">{erro}</p>
          )}
          {aviso && (
            <p className="rounded-md bg-ok-suave px-3 py-2 text-sm text-ok">{aviso}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-acento px-4 py-2.5 text-sm font-semibold text-fg-sobre-acento hover:bg-acento-hover disabled:opacity-60"
          >
            {pending
              ? "Aguarde..."
              : modo === "login"
                ? "Entrar"
                : "Enviar link"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setModo(modo === "login" ? "recuperar" : "login");
            setErro(null);
            setAviso(null);
          }}
          className="mt-4 text-sm font-medium text-acento-texto hover:underline"
        >
          {modo === "login" ? "Esqueci minha senha" : "Voltar pro login"}
        </button>
      </div>
    </main>
  );
}
