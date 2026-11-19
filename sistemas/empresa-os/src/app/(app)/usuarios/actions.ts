"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { assertAcesso } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { actionError as err, type ActionResult } from "@/lib/action-result";
import { SENHA_PROVISORIA } from "@/lib/senha-provisoria";
import { mensagemDeAcesso, metadataComSenhaProvisoria, podeRedefinirSenha } from "@/lib/senha-equipe";
import {
  agruparPermissoes,
  diffPermissoes,
  podeEditarUsuario,
  podeMexerNoSlug,
  validarAlternarAtivo,
  validarConvite,
} from "./regras";

/**
 * Convite, troca de permissão e (des)ativação são eventos de SEGURANÇA: cada
 * um vira linha em `atividade`. O INSERT vai pelo client do OPERADOR (a policy
 * exige usuario_id = usuario_atual(), agente_id nulo e tipo <> 'sistema').
 * Falha aqui NÃO desfaz a ação: devolve ok:true com aviso.
 */
async function registrarAtividade(
  operador: Awaited<ReturnType<typeof createClient>>,
  dados: { usuarioId: string; tipo: string; descricao: string },
): Promise<string | null> {
  const { error } = await operador.from("atividade").insert({
    usuario_id: dados.usuarioId,
    tipo: dados.tipo,
    descricao: dados.descricao,
    // NULL de propósito: não existe `usuarios.read` no catálogo, então qualquer valor
    // preenchido faria a policy negar o INSERT de quem só tem usuarios.manage.
    modulo_origem: null,
  });
  return error ? error.message : null;
}

/** Origem do site a partir dos headers do proxy (o endereço da mensagem de acesso funciona também em preview). */
async function siteOrigin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

/**
 * Resultado das ações de acesso: `acesso` é o texto pronto (endereço, e-mail e
 * senha provisória) pra quem cadastrou mandar pra pessoa. Só volta pra quem
 * passou na checagem de permissão; a senha nunca é gravada nem logada.
 */
export type ResultadoAcesso = ActionResult & { acesso?: string };

/**
 * Cadastra alguém SEM e-mail: cria o login no Supabase Auth (Admin API, service
 * key) já com a senha provisória e a marca `senha_provisoria`, + linha em
 * `usuarios` (sem permissão nenhuma: o dono concede depois, no painel da
 * pessoa). `usuarios` não dá INSERT a authenticated (cadastro é server-side).
 * O e-mail padrão do Supabase não serve aqui: só entrega pra membro da conta
 * do Supabase e limita a 2 por hora.
 *
 * Ordem importa: (1) pre-check de duplicidade ANTES do Auth, senão um auth user
 * órfão trava o e-mail; (2) createUser; (3) INSERT do perfil; (4) se o
 * INSERT falhar, deleteUser desfaz o login pra não queimar o e-mail.
 * E-mail que já existe no Auth: createUser falha e nada é regravado.
 */
export async function convidarMembro(
  _prev: ResultadoAcesso | null,
  formData: FormData,
): Promise<ResultadoAcesso> {
  try {
    const sessao = await assertAcesso("usuarios");
    const nome = String(formData.get("nome") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();

    const invalido = validarConvite({ nome, email });
    if (invalido) return err(invalido);

    const operador = await createClient();
    const { data: jaExiste, error: buscaErr } = await operador
      .from("usuarios")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (buscaErr) return err(`Não deu pra verificar o e-mail: ${buscaErr.message}`);
    if (jaExiste) return err("Já existe uma pessoa com esse e-mail.");

    const service = createServiceClient();
    const { data: convite, error: conviteErr } = await service.auth.admin.createUser({
      email,
      password: SENHA_PROVISORIA,
      email_confirm: true,
      user_metadata: { senha_provisoria: true },
    });
    if (conviteErr) {
      // Mesmo caso do convite antigo (e-mail já no Auth): para aqui, sem tocar na senha de ninguém.
      if (conviteErr.code === "email_exists" || conviteErr.code === "user_already_exists") {
        return err(
          "Esse e-mail já tem login no sistema, mas não aparece na lista. Peça pra IA da empresa conferir o usuário no painel do Supabase.",
        );
      }
      return err(`O cadastro falhou: ${conviteErr.message}`);
    }

    const { error: perfilErr } = await service.from("usuarios").insert({
      nome,
      email,
      auth_user_id: convite.user?.id ?? null,
    });
    if (perfilErr) {
      let compensacaoFalhou = false;
      if (convite.user?.id) {
        const { error: undoErr } = await service.auth.admin
          .deleteUser(convite.user.id)
          .catch((e: unknown) => ({ error: e instanceof Error ? e : new Error(String(e)) }));
        compensacaoFalhou = !!undoErr;
      }
      if (compensacaoFalhou) {
        return err(
          `O cadastro falhou (${perfilErr.message}) E a limpeza da conta de login também: ` +
            `o e-mail ${email} pode ter ficado preso no Auth. Peça pra IA da empresa remover o usuário órfão no painel do Supabase antes de convidar de novo.`,
        );
      }
      return err(`Login desfeito, o cadastro falhou: ${perfilErr.message}`);
    }

    const atvErr = await registrarAtividade(operador, {
      usuarioId: sessao.usuarioId,
      tipo: "membro_convidado",
      descricao: `${sessao.nome} cadastrou ${nome} (${email}) com a senha provisória.`,
    });

    revalidatePath("/usuarios");
    const acesso = mensagemDeAcesso({ nome, endereco: await siteOrigin(), email, senha: SENHA_PROVISORIA });
    if (atvErr) {
      return { ok: true, acesso, info: `Cadastro feito, mas o registro na atividade falhou: ${atvErr}` };
    }
    return { ok: true, acesso, info: "Cadastro feito. Depois abra a pessoa na lista pra dar as permissões." };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Falha ao cadastrar.");
  }
}

/**
 * Volta a senha de alguém da equipe pra provisória (sem e-mail). Mesma checagem
 * das outras actions do módulo: `assertAcesso("usuarios")` (sessão + permissão)
 * e o alvo lido pelo client da SESSÃO (RLS: só acha quem é desta empresa). Do
 * formulário só vem o id; o resto sai do banco. A service key só entra depois
 * de tudo isso, e só pra trocar a senha no Auth.
 */
export async function redefinirSenha(usuarioId: string): Promise<ResultadoAcesso> {
  try {
    const sessao = await assertAcesso("usuarios");
    if (typeof usuarioId !== "string" || !usuarioId) return err("Pessoa não encontrada.");
    const operador = await createClient();

    const { data: alvo, error: alvoErr } = await operador
      .from("usuarios")
      .select("id, nome, email, e_dono, ativo, auth_user_id")
      .eq("id", usuarioId)
      .maybeSingle();
    if (alvoErr) return err(alvoErr.message);
    if (alvo && !podeEditarUsuario(alvo, sessao)) return err("O dono não é editado por outra pessoa.");

    const decisao = podeRedefinirSenha(sessao, alvo);
    if (!decisao.pode) return err(decisao.motivo);
    // podeRedefinirSenha já barrou alvo nulo e sem login; o TS não enxerga através da função.
    if (!alvo || !alvo.auth_user_id) return err("Pessoa não encontrada.");

    const service = createServiceClient();
    const { data: conta, error: contaErr } = await service.auth.admin.getUserById(alvo.auth_user_id);
    // Defesa extra: o login apontado tem que ser o da mesma pessoa (mesmo e-mail).
    if (contaErr || !conta.user || (conta.user.email ?? "").toLowerCase() !== alvo.email) {
      return err("Não deu pra achar o login desta pessoa. Peça pra IA da empresa conferir no painel do Supabase.");
    }

    const { error: updErr } = await service.auth.admin.updateUserById(alvo.auth_user_id, {
      password: SENHA_PROVISORIA,
      user_metadata: metadataComSenhaProvisoria(conta.user.user_metadata),
    });
    if (updErr) return err("Não deu pra redefinir a senha agora. Tente de novo em instantes.");

    // Coerência com `usuarios.senha_trocada_em` (NULL = precisa trocar a senha inicial):
    // voltou pra provisória, volta a NULL. Falha aqui não desfaz a senha.
    const { error: carimboErr } = await service
      .from("usuarios")
      .update({ senha_trocada_em: null })
      .eq("id", alvo.id);

    const atvErr = await registrarAtividade(operador, {
      usuarioId: sessao.usuarioId,
      tipo: "senha_redefinida",
      descricao: `${sessao.nome} voltou a senha de ${alvo.nome} para a provisória.`,
    });

    revalidatePath("/usuarios");
    const acesso = mensagemDeAcesso({
      nome: alvo.nome,
      endereco: await siteOrigin(),
      email: alvo.email,
      senha: SENHA_PROVISORIA,
    });
    const avisos = [
      carimboErr ? `a marca de troca na lista falhou (${carimboErr.message})` : null,
      atvErr ? `o registro na atividade falhou (${atvErr})` : null,
    ].filter(Boolean);
    if (avisos.length) return { ok: true, acesso, info: `Senha redefinida, mas ${avisos.join(" e ")}.` };
    return { ok: true, acesso, info: `A senha de ${alvo.nome} voltou a ser a provisória.` };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Falha ao redefinir a senha.");
  }
}

/**
 * Grava o conjunto de permissões de uma pessoa. O "antes" vem do BANCO (nunca
 * do client). Só mexe em slugs de módulo ligado e, fora o dono, nunca em
 * `usuarios.manage` (o gatilho do banco também barra). Escreve com o client
 * do operador: a policy exige `usuarios.manage` e concedida_por = quem concede.
 */
export async function salvarPermissoes(
  usuarioId: string,
  desejadas: string[],
): Promise<ActionResult> {
  try {
    const sessao = await assertAcesso("usuarios");
    const operador = await createClient();

    const { data: alvo, error: alvoErr } = await operador
      .from("usuarios")
      .select("id, nome, e_dono")
      .eq("id", usuarioId)
      .maybeSingle();
    if (alvoErr) return err(alvoErr.message);
    if (!alvo) return err("Pessoa não encontrada.");
    if (!podeEditarUsuario(alvo, sessao)) return err("O dono não é editado por outra pessoa.");
    if (alvo.e_dono) return err("O dono já tem todas as permissões.");

    const [permsRes, modsRes, atuaisRes] = await Promise.all([
      operador.from("permissoes").select("slug, modulo, acao, descricao"),
      operador.from("modulo").select("slug, nome, ligado"),
      operador.from("usuarios_permissoes").select("permissao").eq("usuario_id", usuarioId),
    ]);
    const falha = permsRes.error ?? modsRes.error ?? atuaisRes.error;
    if (falha) return err(falha.message);

    const concedivel = new Set(
      agruparPermissoes(permsRes.data ?? [], modsRes.data ?? [])
        .flatMap((g) => g.permissoes.map((p) => p.slug))
        .filter((s) => podeMexerNoSlug(s, sessao)),
    );
    const atuais = (atuaisRes.data ?? []).map((r) => r.permissao).filter((s) => concedivel.has(s));
    const { conceder, revogar } = diffPermissoes(
      atuais,
      desejadas.filter((s) => concedivel.has(s)),
    );
    if (conceder.length === 0 && revogar.length === 0) return { ok: true, info: "Nada mudou." };

    if (conceder.length > 0) {
      const { error } = await operador.from("usuarios_permissoes").insert(
        conceder.map((permissao) => ({
          usuario_id: usuarioId,
          permissao,
          concedida_por: sessao.usuarioId,
        })),
      );
      if (error) return err(error.message);
    }
    if (revogar.length > 0) {
      const { error } = await operador
        .from("usuarios_permissoes")
        .delete()
        .eq("usuario_id", usuarioId)
        .in("permissao", revogar);
      if (error) return err(error.message);
    }

    const partes = [
      conceder.length ? `concedeu ${conceder.join(", ")}` : null,
      revogar.length ? `tirou ${revogar.join(", ")}` : null,
    ].filter(Boolean);
    const atvErr = await registrarAtividade(operador, {
      usuarioId: sessao.usuarioId,
      tipo: "permissoes_alteradas",
      descricao: `${sessao.nome} ${partes.join(" e ")} de ${alvo.nome}.`,
    });

    revalidatePath("/usuarios");
    if (atvErr) return { ok: true, info: `Permissões salvas, mas o registro na atividade falhou: ${atvErr}` };
    return { ok: true, info: "Permissões salvas." };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Falha ao salvar as permissões.");
  }
}

/**
 * Desativa/reativa o acesso (desativar preserva o histórico). `usuarios` só
 * dá UPDATE em nome e ativo. O anti-lockout (ninguém desativa a si mesmo)
 * existe só em regras.ts.
 */
export async function alternarAtivo(usuarioId: string, ativo: boolean): Promise<ActionResult> {
  try {
    const sessao = await assertAcesso("usuarios");
    const operador = await createClient();

    const { data: alvo, error: alvoErr } = await operador
      .from("usuarios")
      .select("id, nome, e_dono, ativo")
      .eq("id", usuarioId)
      .maybeSingle();
    if (alvoErr) return err(alvoErr.message);
    if (!alvo) return err("Pessoa não encontrada.");
    if (!podeEditarUsuario(alvo, sessao)) return err("O dono não é editado por outra pessoa.");

    const invalido = validarAlternarAtivo({
      alvoId: alvo.id,
      alvoEDono: alvo.e_dono,
      ativoNovo: ativo,
      sessaoUsuarioId: sessao.usuarioId,
    });
    if (invalido) return err(invalido);

    const { data: atualizado, error: updErr } = await operador
      .from("usuarios")
      .update({ ativo })
      .eq("id", usuarioId)
      .select("id");
    if (updErr) return err(updErr.message);
    // RLS filtra em silêncio: update barrado volta 0 linhas, não erro.
    if (!atualizado || atualizado.length === 0) {
      return err("A alteração não foi aplicada: o banco negou a permissão.");
    }

    const atvErr = await registrarAtividade(operador, {
      usuarioId: sessao.usuarioId,
      tipo: ativo ? "acesso_reativado" : "acesso_desativado",
      descricao: ativo
        ? `${sessao.nome} reativou o acesso de ${alvo.nome}.`
        : `${sessao.nome} desativou o acesso de ${alvo.nome}.`,
    });

    revalidatePath("/usuarios");
    if (atvErr) {
      return { ok: true, info: `Acesso ${ativo ? "reativado" : "desativado"}, mas o registro na atividade falhou: ${atvErr}` };
    }
    return { ok: true };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Falha ao atualizar o acesso.");
  }
}
