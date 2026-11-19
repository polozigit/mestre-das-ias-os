"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validarNovaSenha } from "@/lib/senha-provisoria";
import type { ActionResult } from "@/lib/action-result";

/**
 * Troca a senha do usuário LOGADO (sessão dele, sem chave de admin, sem e-mail) e
 * baixa a marca de senha provisória no mesmo passo.
 */
export async function trocarSenha(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const nova = String(formData.get("nova") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  const invalido = validarNovaSenha(nova, confirmacao);
  if (invalido) return { ok: false, error: invalido };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sua sessão acabou. Entre de novo e tente outra vez." };

  const { error } = await supabase.auth.updateUser({
    password: nova,
    data: { senha_provisoria: false },
  });
  if (error) {
    if (error.code === "same_password") {
      return { ok: false, error: "A senha nova precisa ser diferente da atual." };
    }
    if (error.code === "weak_password") {
      return { ok: false, error: "Essa senha é fraca demais. Escolha outra, maior ou mais variada." };
    }
    if (error.code === "reauthentication_needed") {
      return { ok: false, error: "Por segurança, saia do sistema, entre de novo e tente outra vez." };
    }
    return { ok: false, error: "Não deu pra salvar a senha agora. Tente de novo em instantes." };
  }

  // Carimba usuarios.senha_trocada_em na PRÓPRIA linha (RPC da 0004, só se ainda NULL).
  // Vale pro dono e pra equipe; a redefinição em Usuários volta a coluna pra NULL.
  // Falha aqui não desfaz a troca: a marca que manda no aviso é a do Auth.
  await supabase.rpc("marcar_senha_trocada");

  // O aviso mora no layout: força o layout a ler o usuário de novo.
  revalidatePath("/", "layout");
  return { ok: true, info: "Senha trocada. Use a nova senha na próxima vez que entrar." };
}
