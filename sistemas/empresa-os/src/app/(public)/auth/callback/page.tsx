"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { configPublicaDoNavegador } from "@/lib/supabase/env";

/**
 * Destino dos links de e-mail (magic link implicit). O @supabase/ssr NÃO
 * consome o hash sozinho: desligamos a auto-detecção e fazemos o parse
 * explícito, setando a sessão (escreve os cookies que o servidor lê).
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const { url, chavePublica } = configPublicaDoNavegador();
    const supabase = createBrowserClient<Database>(
      url,
      chavePublica,
      { auth: { detectSessionInUrl: false, flowType: "implicit" } },
    );

    async function completar() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        router.replace("/inicio");
        return;
      }

      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        router.replace(error ? "/login?error=auth" : "/inicio");
        return;
      }

      router.replace("/login?error=auth");
    }

    void completar();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg">
      <p className="text-sm text-fg-2">Autenticando...</p>
    </main>
  );
}
