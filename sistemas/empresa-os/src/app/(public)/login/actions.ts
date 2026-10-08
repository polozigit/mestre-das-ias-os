"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { configPublicaDoServidorOuNada, mensagemFaltaConfig } from "@/lib/supabase/env";

/**
 * Origem do site a partir dos headers do proxy — necessário pro redirectTo
 * dos e-mails funcionar também nos previews da Vercel.
 */
async function siteOrigin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export async function entrar(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  if (!email || !senha) return { error: "Informe e-mail e senha." };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) {
    // Mensagem genérica de propósito (anti-enumeração): dizer se errou o
    // e-mail OU a senha transformaria o login em ferramenta de descoberta
    // de contas.
    if (error.code === "invalid_credentials" || error.status === 400) {
      return {
        error:
          "E-mail ou senha incorretos. Se você ainda não tem conta, o acesso é por convite — peça ao dono da empresa.",
      };
    }
    if (error.status === 429) {
      return {
        error: "Muitas tentativas. Espere alguns minutos e tente de novo.",
      };
    }
    return { error: "Não foi possível entrar agora. Tente de novo em instantes." };
  }
  redirect("/inicio");
}

/**
 * "Esqueci minha senha": e-mail de recuperação com link pra
 * /auth/definir-senha. Resposta neutra mesmo pra e-mail inexistente
 * (anti-enumeração) — o Supabase só envia se a conta existir.
 */
export async function enviarRecuperacaoSenha(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Informe o e-mail." };

  const { url, chavePublica } = configPublicaDoServidorOuNada();
  if (!url || !chavePublica) {
    return { error: mensagemFaltaConfig({ url: !url, chavePublica: !chavePublica }) };
  }

  // Implicit flow: o link do e-mail carrega os tokens no hash e funciona em
  // qualquer navegador/dispositivo (PKCE exigiria o mesmo browser do pedido).
  const supabase = createClient(url, chavePublica, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "implicit",
    },
  });

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/definir-senha`,
  });

  if (error)
    return { error: "Não foi possível enviar agora. Tente de novo em instantes." };
  return {
    success:
      "Se esse e-mail tiver cadastro, o link de redefinição chega em instantes.",
  };
}

export async function sair() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
