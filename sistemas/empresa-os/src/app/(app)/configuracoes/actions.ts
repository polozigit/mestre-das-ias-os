"use server";

import { revalidatePath } from "next/cache";
import { assertAcesso } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { actionError as err, type ActionResult } from "@/lib/action-result";

/**
 * Atualiza nome/descrição da empresa (`public.empresa`, linha única id = 1).
 * Abrir o módulo exige `configuracoes.read`; EDITAR exige `configuracoes.write`
 * (ou ser o dono), checado aqui e, de verdade, pela policy empresa_update (o
 * UPDATE vai pelo client do operador justamente pra policy valer).
 */
export async function atualizarEmpresa(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const sessao = await assertAcesso("configuracoes");
    if (!sessao.eDono && !sessao.permissoes.includes("configuracoes.write")) {
      return err("Você não tem permissão para editar os dados da empresa.");
    }

    const nome = String(formData.get("nome") ?? "").trim();
    const descricao = String(formData.get("descricao") ?? "").trim();
    if (!nome) return err("O nome da empresa não pode ficar vazio.");

    const operador = await createClient();
    const { data: atualizado, error: updErr } = await operador
      .from("empresa")
      .update({ nome, descricao: descricao || null })
      .eq("id", 1)
      .select("id");
    if (updErr) return err(updErr.message);
    // RLS filtra em silêncio: update barrado volta 0 linhas, não erro.
    if (!atualizado || atualizado.length === 0) {
      return err("A alteração não foi aplicada — o banco negou a permissão.");
    }

    // Linha do tempo: quem mexeu nos dados da empresa fica registrado.
    // A policy de INSERT exige usuario_id = usuario_atual() (a própria
    // sessão) e agente_id nulo, exatamente o que vai aqui.
    const { error: atvErr } = await operador.from("atividade").insert({
      modulo_origem: "configuracoes",
      usuario_id: sessao.usuarioId,
      tipo: "empresa_editada",
      descricao: `${sessao.nome} atualizou os dados da empresa.`,
    });

    revalidatePath("/configuracoes");

    // A edição em si deu certo; se só o registro falhou, avisa sem mentir.
    if (atvErr) {
      return {
        ok: true,
        info: `Dados salvos, mas o registro na atividade falhou: ${atvErr.message}`,
      };
    }
    return { ok: true, info: "Dados da empresa atualizados." };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Falha ao salvar.");
  }
}
