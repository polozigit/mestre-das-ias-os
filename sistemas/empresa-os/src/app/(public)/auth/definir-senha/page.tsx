"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogoMarca } from "@/components/marca/LogoMarca";
import { createBrowserClient } from "@supabase/ssr";
import { nomeSistema } from "../../../../../config/empresa";
import type { Database } from "@/types/database";
import { configPublicaDoNavegador } from "@/lib/supabase/env";

type Estado = "carregando" | "pronto" | "invalido";

/**
 * Destino dos links de CONVITE (primeira senha) e de RECUPERAÇÃO (esqueci
 * minha senha). O link chega com os tokens no hash (implicit flow); a página
 * seta a sessão e pede a senha nova, duas vezes.
 */
export default function DefinirSenhaPage() {
  const router = useRouter();
  const handled = useRef(false);
  const supabaseRef = useRef<ReturnType<
    typeof createBrowserClient<Database>
  > | null>(null);
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ehConvite, setEhConvite] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const { url, chavePublica } = configPublicaDoNavegador();
    const supabase = createBrowserClient<Database>(
      url,
      chavePublica,
      { auth: { detectSessionInUrl: false, flowType: "implicit" } },
    );
    supabaseRef.current = supabase;

    async function preparar() {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      setEhConvite(params.get("type") === "invite");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        setEstado(error ? "invalido" : "pronto");
        return;
      }

      // Sem token no hash: aceita se já há sessão (revisitou a página).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setEstado(session ? "pronto" : "invalido");
    }

    void preparar();
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) {
      setErro("A senha precisa de pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirma) {
      setErro("As senhas não conferem.");
      return;
    }
    startTransition(async () => {
      const { error } = await supabaseRef.current!.auth.updateUser({
        password: senha,
      });
      if (error) {
        setErro(
          error.message.includes("different from the old")
            ? "A senha nova precisa ser diferente da atual."
            : "Não foi possível salvar a senha. Tente de novo.",
        );
        return;
      }
      router.replace("/inicio");
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-lg border border-borda bg-bg-elevada p-8 shadow-[var(--sombra-md)]">
        <LogoMarca alt={nomeSistema} width={140} height={36} priority className="mb-6 h-9 w-auto" />

        {estado === "carregando" && (
          <p className="text-sm text-fg-2">Validando o link...</p>
        )}

        {estado === "invalido" && (
          <>
            <h1 className="mb-2 text-lg font-semibold text-fg-1">
              Link inválido ou expirado
            </h1>
            <p className="mb-6 text-sm text-fg-3">
              Peça um link novo em &quot;Esqueci minha senha&quot; na tela de
              login, ou um novo convite ao dono da empresa.
            </p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="w-full rounded-md bg-acento px-4 py-2.5 text-sm font-semibold text-fg-sobre-acento hover:bg-acento-hover"
            >
              Ir pro login
            </button>
          </>
        )}

        {estado === "pronto" && (
          <>
            <h1 className="mb-1 text-lg font-semibold text-fg-1">
              {ehConvite ? `Bem-vindo ao ${nomeSistema}` : "Definir nova senha"}
            </h1>
            <p className="mb-6 text-sm text-fg-3">
              {ehConvite
                ? "Crie a senha que você vai usar pra entrar."
                : "Digite a senha nova duas vezes."}
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="senha"
                  className="mb-1 block text-sm font-medium text-fg-2"
                >
                  Nova senha
                </label>
                <input
                  id="senha"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full rounded-md border border-borda bg-bg px-3 py-2.5 text-sm text-fg-1"
                />
              </div>
              <div>
                <label
                  htmlFor="confirma"
                  className="mb-1 block text-sm font-medium text-fg-2"
                >
                  Repita a senha
                </label>
                <input
                  id="confirma"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirma}
                  onChange={(e) => setConfirma(e.target.value)}
                  className="w-full rounded-md border border-borda bg-bg px-3 py-2.5 text-sm text-fg-1"
                />
              </div>
              {erro && (
                <p className="rounded-md bg-erro-suave px-3 py-2 text-sm text-erro">
                  {erro}
                </p>
              )}
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-md bg-acento px-4 py-2.5 text-sm font-semibold text-fg-sobre-acento hover:bg-acento-hover disabled:opacity-60"
              >
                {pending ? "Salvando..." : "Salvar senha e entrar"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
