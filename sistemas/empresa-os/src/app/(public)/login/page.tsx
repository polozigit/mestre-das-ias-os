"use client";

import { useState, useTransition } from "react";
import { LogoMarca } from "@/components/marca/LogoMarca";
import { nomeSistema } from "../../../../config/empresa";
import { entrar, enviarRecuperacaoSenha } from "./actions";

type Modo = "login" | "recuperar";

function CampoEmail() {
  return (
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
        className="campo w-full rounded-md border border-borda bg-bg px-3 py-2.5 text-sm text-fg-1 placeholder:text-fg-4"
        placeholder="voce@empresa.com.br"
      />
    </div>
  );
}

function Avisos({ erro, aviso }: { erro: string | null; aviso: string | null }) {
  return (
    <>
      {erro && (
        <p role="alert" className="surgir rounded-md bg-erro-suave px-3 py-2 text-sm text-erro [--origem:top_center]">{erro}</p>
      )}
      {aviso && (
        <p role="status" className="surgir rounded-md bg-ok-suave px-3 py-2 text-sm text-ok [--origem:top_center]">{aviso}</p>
      )}
    </>
  );
}

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
    <main className="palco-luz flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="entrada-pagina w-full max-w-sm rounded-lg border border-borda bg-bg-elevada p-8 shadow-[var(--sombra-md)]">
        <LogoMarca alt={nomeSistema} width={140} height={36} priority className="mb-4 h-9 w-auto" />
        <h1 className="mb-1 text-lg font-semibold text-fg-1">{nomeSistema}</h1>
        {modo === "login" ? (
          <>
            <p className="mb-6 text-sm text-fg-3">Entre com seu e-mail e senha.</p>
            <form onSubmit={onSubmit} className="space-y-4">
              <CampoEmail />
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
                  className="campo w-full rounded-md border border-borda bg-bg px-3 py-2.5 text-sm text-fg-1"
                />
              </div>
              <Avisos erro={erro} aviso={aviso} />
              <button
                type="submit"
                disabled={pending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-acento px-4 py-2.5 text-sm font-semibold text-fg-sobre-acento shadow-[var(--sombra-sm)] transition-[background-color,scale] duration-150 ease-saida hover:bg-acento-hover motion-safe:active:scale-[0.98] disabled:opacity-70"
              >
                {pending && (
                  <span aria-hidden="true" className="gira size-4 rounded-full border-2 border-current border-t-transparent" />
                )}
                {pending ? "Entrando..." : "Entrar"}
              </button>
            </form>
          </>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-fg-3">
              A senha é trocada por dentro do sistema, sem e-mail. Escolha o seu caso:
            </p>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-fg-1">Sou da equipe</h2>
              <p className="text-sm leading-relaxed text-fg-2">
                Peça pra quem cuida do sistema na sua empresa abrir Usuários, tocar no seu nome e
                escolher Redefinir senha. Você recebe uma senha provisória e troca por uma sua no
                primeiro acesso.
              </p>
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-fg-1">Sou o dono</h2>
              <p className="text-sm leading-relaxed text-fg-2">
                Abra o Codex e peça pra sua IA: <span className="font-medium text-fg-1">zera a senha do meu sistema</span>.
                Depois entre com a senha provisória e troque.
              </p>
            </div>

            <details className="group rounded-md border border-borda-suave px-3 py-2">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm text-fg-3 hover:text-fg-2 md:min-h-0 md:py-1">
                Tentar receber um link por e-mail
              </summary>
              <div className="space-y-3 pb-2 pt-2">
                <p className="text-xs leading-relaxed text-fg-3">
                  Última opção: o e-mail pode demorar, cair no spam ou nem chegar, porque o envio
                  padrão tem limite baixo. Se não chegar em alguns minutos, use um dos caminhos acima.
                </p>
                <form onSubmit={onSubmit} className="space-y-3">
                  <CampoEmail />
                  <Avisos erro={erro} aviso={aviso} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-borda bg-bg px-4 py-2.5 text-sm font-medium text-fg-2 transition-[background-color,scale] duration-150 ease-saida hover:bg-bg-sutil motion-safe:active:scale-[0.98] disabled:opacity-70"
                  >
                    {pending && (
                      <span aria-hidden="true" className="gira size-4 rounded-full border-2 border-current border-t-transparent" />
                    )}
                    {pending ? "Enviando..." : "Enviar link por e-mail"}
                  </button>
                </form>
              </div>
            </details>
          </div>
        )}

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
