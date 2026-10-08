/**
 * Setup inicial do Empresa OS — roda UMA vez, depois das migrations (LEIA-ME
 * passo 6). O que faz: cria a empresa (linha única) e o usuário dono no banco
 * (RPC seed_empresa), carrega o organograma e o plano do curso (e marca como concluídos os passos que a
 * própria instalação prova: contas até banco; "sistema no ar" só com prova real do /login), registra os agentes do núcleo na tela
 * Time de Agentes (RPC sincronizar_agentes), coloca os agentes instalados nas posições
 * do Time de IA e manda o e-mail de convite pro dono definir a senha.
 * Roda em produção E em homologação (a homologação nasce com a "Empresa
 * Exemplo" do seed de exemplo; o dono real vem daqui).
 *
 * Uso:  node scripts/setup-inicial.mjs
 * Env:  URL do Supabase (NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL), chave de serviço
 *       (SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY), SITE_URL
 *       CURSO_INICIO (opcional, AAAA-MM-DD, data do D1; padrão = hoje)
 *       (a IA carrega de credenciais/.env da Casa; valor nunca aparece no chat)
 *
 * Idempotente: rodar de novo (mesmo em outro dia, sem CURSO_INICIO) não duplica nada; se o convite já foi enviado,
 * só refaz o vínculo auth_user_id se estiver faltando.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  atividadesEmOrdem,
  chaveDaTarefa,
  CHAVE_SISTEMA_NO_AR,
  metadataAoCancelar,
  orfasJaCanceladas,
  orfasParaAvisar,
  orfasParaCancelar,
  passosJaConcluidos,
  passosParaConcluir,
  planejarOrdem,
  siteNoAr,
  urlDoLogin,
  urlPublicaHttps,
} from "../config/plano-reconciliar.mjs";
import { urlSupabase } from "../config/supabase-env.mjs";
import { chaveSecretaSupabase, mensagemFaltaConfigServico } from "../config/supabase-env-servidor.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

function falhar(msg) {
  console.error(`\n[setup] ERRO: ${msg}\n`);
  process.exit(1);
}

// PostgREST devolve PGRST106 quando o schema do pedido não está exposto na Data API.
// Os schemas dos módulos (tarefas, organograma) precisam estar na lista de expostos.
function falharSchema(contexto, erro) {
  if (erro?.code === "PGRST106") {
    falhar(
      `${contexto}: o schema não está exposto na Data API do Supabase (PGRST106).\n` +
        "  O que fazer: Dashboard > Project Settings > Data API > Exposed schemas,\n" +
        "  acrescente `tarefas` e `organograma` à lista (mantenha os que já estão), salve e rode de novo.",
    );
  }
  if (erro?.code === "PGRST202") {
    falhar(
      `${contexto}: a função não existe no banco (PGRST202). Falta aplicar uma migration ` +
        "(supabase/README.md, até a 0020) ou recarregar o cache da API; aplique e rode de novo.",
    );
  }
  falhar(`${contexto}: ${erro.message}`);
}

// --- 1. Lê a identidade de config/empresa.ts (formato fixo do template) ---
const configTexto = readFileSync(join(raiz, "config", "empresa.ts"), "utf8");

function campo(nome) {
  const m = configTexto.match(new RegExp(`${nome}:\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

const nome = campo("nome");
const slug = campo("slug");
const nomeMaster = campo("nomeMaster");
// lowercase JÁ AQUI: o seed grava lower(trim(email)) no banco, e o vínculo do
// passo 5 compara por igualdade (case-sensitive no Postgres) — sem normalizar,
// um email com maiúscula no config casaria 0 linhas em silêncio.
const emailMaster = campo("emailMaster")?.trim().toLowerCase() ?? null;

for (const [rotulo, valor] of [
  ["nome", nome],
  ["slug", slug],
  ["nomeMaster", nomeMaster],
  ["emailMaster", emailMaster],
]) {
  if (!valor) falhar(`campo "${rotulo}" não encontrado em config/empresa.ts`);
  if (valor.includes("{{"))
    falhar(
      `config/empresa.ts ainda tem placeholder em "${rotulo}" (${valor}). ` +
        "Preencha a identidade da empresa antes (LEIA-ME passo 3).",
    );
}
if (!/^[a-z0-9-]+$/.test(slug))
  falhar(`slug inválido: "${slug}" (só minúsculas, números e hífen).`);

// --- 2. Conexão service-role ---
const url = urlSupabase(process.env);
const serviceKey = chaveSecretaSupabase(process.env);
const siteUrl = process.env.SITE_URL;
if (!url || !serviceKey)
  falhar(
    `${mensagemFaltaConfigServico({ url: !url, chaveSecreta: !serviceKey })} ` +
      "(source credenciais/.env da Casa antes de rodar).",
  );
if (!siteUrl)
  falhar("defina SITE_URL (a URL do sistema — ex.: https://minha-empresa.vercel.app).");

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- 3. Seed (empresa id = 1 + dono + registro "Empresa criada") ---
const { data: donoId, error: erroSeed } = await supabase.rpc("seed_empresa", {
  p_nome: nome,
  p_email_dono: emailMaster,
  p_nome_dono: nomeMaster,
});
if (erroSeed) falhar(`seed_empresa falhou: ${erroSeed.message}`);
console.log(`[setup] empresa "${nome}" ok (dono ${String(donoId).slice(0, 8)}…)`);

// Descrição vem do config mas não passa pelo seed (assinatura enxuta e
// idempotente). Preenche só se ainda estiver vazia — nunca sobrescreve o que
// o dono editou na tela de Configurações.
const descricao = campo("descricao");
if (descricao && !descricao.includes("{{")) {
  await supabase
    .from("empresa")
    .update({ descricao })
    .eq("id", 1)
    .is("descricao", null);
}

// --- 3b. Conteúdo do produto: organograma de referência e plano do curso ---
// Idempotente: as RPCs reconhecem o que já foi carregado (modelo por
// chave+versao+hash; cronograma por modelo).
const ler = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const org = JSON.parse(ler("config/organograma.json"));
const { error: eOrg } = await supabase.schema("organograma").rpc("carregar", { p: org });
if (eOrg) falharSchema("organograma", eOrg);
console.log("[setup] organograma carregado.");

// Catálogo da tela "Time de Agentes": registra os agentes do núcleo (config/agentes-nucleo.json)
// pela RPC public.sincronizar_agentes (0008). Sem isso a tela nasce vazia: ninguém mais chama a RPC.
// ATENÇÃO: a RPC é espelho — todo agente que existe no banco e NÃO veio no payload vira
// `aposentado`. Este setup só conhece o núcleo (time "sistema"), então reenvia junto, sem mudar
// nada, os agentes já cadastrados de outros times (time <> 'sistema', ainda não aposentados);
// assim rodar o setup de novo nunca aposenta um time instalado depois. Um agente que sai do
// núcleo (time "sistema" fora do JSON) é aposentado de propósito. Pendência pra depois da turma:
// quando houver instalador de times, o time instalado deve entrar no MESMO payload (hoje ele
// só é preservado, não conferido) e o estado `disponivel`/`aposentado` ser calculado por ele.
const nucleo = JSON.parse(ler("config/agentes-nucleo.json")).agentes;
const nomesNucleo = new Set(nucleo.map((a) => a.name));
const COLUNAS_AGENTE = "name,time,descricao_curta,descricao,quando,tier,modelo,esforco,sandbox,skills,estado";
const { data: deOutrosTimes, error: eOutros } = await supabase
  .from("agentes")
  .select(COLUNAS_AGENTE)
  .neq("time", "sistema")
  .neq("estado", "aposentado");
if (eOutros) falharSchema("não consegui ler os agentes de outros times", eOutros);
// A RPC rejeita chave desconhecida e lê só estas colunas; null vira ausente pra não mudar o valor gravado.
const preservados = (deOutrosTimes ?? [])
  .filter((a) => !nomesNucleo.has(a.name))
  .map((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== null)));
const { data: sincronizados, error: eSync } = await supabase.rpc("sincronizar_agentes", {
  p_itens: [...nucleo, ...preservados],
});
if (eSync) falharSchema("sincronizar_agentes (tela Time de Agentes)", eSync);
console.log(
  `[setup] Time de Agentes: ${nucleo.length} do núcleo sincronizados, ${preservados.length} de outros times preservados (RPC devolveu ${sincronizados}).`,
);

// Os agentes instalados ocupam as posições do Time de IA (spec v2 §4.2). Mapa explícito em
// config/agentes-posicao.json (agente -> cargo; o teste confere que o cargo existe). A escrita é
// pela RPC organograma.ocupar_posicao_agente (0020): service_role não tem INSERT direto na tabela.
// Idempotente: agente que já ocupa não duplica; posição com outro ocupante é pulada e logada.
const mapaAgentes = JSON.parse(ler("config/agentes-posicao.json")).agentes;
const { data: instalados, error: eAgentes } = await supabase
  .from("agentes")
  .select("id,name")
  .eq("estado", "instalado");
if (eAgentes) falhar(`não consegui ler os agentes instalados: ${eAgentes.message}`);
if (!instalados || instalados.length === 0) {
  console.log("[setup] nenhum agente instalado ainda — posições do Time de IA ficam vazias (rode o setup de novo depois de instalar o time).");
} else {
  const contagem = { inserida: 0, ja_ocupa: 0, ocupada_por_outro: 0, sem_posicao: 0, sem_cargo_no_mapa: 0 };
  for (const ag of instalados) {
    const cargo = mapaAgentes[ag.name];
    if (!cargo) {
      contagem.sem_cargo_no_mapa++;
      continue;
    }
    const { data: r, error: eOcupa } = await supabase
      .schema("organograma")
      .rpc("ocupar_posicao_agente", { p_agente_id: ag.id, p_cargo_slug: cargo });
    if (eOcupa) falharSchema(`posição de ${cargo} (${ag.name})`, eOcupa);
    contagem[r] = (contagem[r] ?? 0) + 1;
    if (r === "ocupada_por_outro")
      console.log(`[setup] posição de ${cargo} já tem outro ocupante — pulei ${ag.name}.`);
    if (r === "sem_posicao")
      console.warn(`[setup] AVISO: cargo ${cargo} sem posição no organograma — ${ag.name} ficou sem posição.`);
  }
  console.log(
    `[setup] agentes nas posições do Time de IA: ${contagem.inserida} novos, ${contagem.ja_ocupa} já estavam, ` +
      `${contagem.ocupada_por_outro} pulados (outro ocupante), ${contagem.sem_cargo_no_mapa} fora do mapa.`,
  );
}

const bruto = ler("config/planos/mestre.json");
const modelo = { ...JSON.parse(bruto), hash: createHash("sha256").update(bruto).digest("hex") };
const { data: modeloId, error: eMod } = await supabase
  .schema("tarefas")
  .rpc("carregar_modelo_plano", { p_modelo: modelo });
if (eMod) falharSchema("plano", eMod);

// Lê uma consulta do supabase-js: erro vira falha com a dica certa; sem linhas devolve [].
async function consultar(consulta, contexto) {
  const { data, error } = await consulta;
  if (error) falharSchema(contexto, error);
  return data ?? [];
}

// A RPC só é idempotente por modelo + inicio: rodar de novo em outro dia sem
// CURSO_INICIO criaria um 2o cronograma e duplicaria as tarefas. Por isso, se já
// existe instância do plano (sem Parte, não cancelada) de QUALQUER versão do modelo,
// reaproveita o inicio gravado. Versão nova do modelo (mudou o hash, o banco exige
// `versao` nova) vira instância nova que só ACRESCENTA as tarefas que faltam: a RPC
// reaproveita por chave a tarefa já semeada e não mexe no que o aluno fez.
const inicioInformado = process.env.CURSO_INICIO ?? null;
if (inicioInformado && !/^\d{4}-\d{2}-\d{2}$/.test(inicioInformado))
  falhar("CURSO_INICIO precisa ser AAAA-MM-DD");
const versoes = await consultar(
  supabase.schema("tarefas").from("plano_modelo").select("id").eq("chave", modelo.chave),
  "cronograma: não consegui ler as versões do plano",
);
const existentes = await consultar(
  supabase
    .schema("tarefas")
    .from("plano_instancia")
    .select("id,modelo_id,inicio_em")
    .in("modelo_id", versoes.map((v) => v.id))
    .is("parte_id", null)
    .neq("status", "cancelado")
    .order("id", { ascending: false }),
  "cronograma: não consegui ler instâncias",
);
const gravado = existentes[0]?.inicio_em ?? null;
if (gravado && inicioInformado && inicioInformado !== gravado)
  falhar(
    `o cronograma já foi instanciado com início ${gravado}, mas CURSO_INICIO=${inicioInformado}. ` +
      "Rode sem CURSO_INICIO (ou com o mesmo valor) para não duplicar tarefas.",
  );
let instanciaId = existentes.find((i) => i.modelo_id === modeloId)?.id ?? null;
if (instanciaId) {
  console.log(`[setup] cronograma já instanciado (início ${gravado}) — nada a instanciar.`);
} else {
  const inicio = gravado ?? inicioInformado ?? new Date().toISOString().slice(0, 10);
  const { data: novaId, error: eInst } = await supabase
    .schema("tarefas")
    .rpc("instanciar_plano_servico", { p_modelo_id: modeloId, p_inicio: inicio });
  if (eInst) falharSchema("cronograma", eInst);
  instanciaId = novaId;
  console.log(
    gravado
      ? `[setup] plano atualizado para a versão ${modelo.versao}: tarefas novas acrescentadas (início ${gravado} mantido).`
      : `[setup] plano do curso carregado e cronograma instanciado (início ${inicio}).`,
  );
}

// --- 3c. Cronograma coerente com o plano e a instalação já feita ---
// Tudo idempotente e só por service_role (que tem ALL em tarefas, tarefa_plano e atividade):
//   1) religa à versão atual do plano as tarefas que vieram de uma versão antiga (a tela lê instrução e prova por esse elo);
//   2) cancela (nunca apaga) as tarefas de passos que saíram do plano e ainda estavam em BACKLOG;
//      as que já começaram (EM_ANDAMENTO, REVISAO) ficam como estão e geram aviso;
//   3) reordena as tarefas pela ordem do plano (a tela do passo a passo ordena por `ordem`, que é única por trilha);
//   4) marca como CONCLUIDA os passos que a instalação já provou (contas até banco) e, só com prova real
//      (SITE_URL em https público e /login respondendo 200), o passo "sistema no ar".
const sistema = supabase.schema("tarefas");
const atividades = atividadesEmOrdem(modelo);
const chavesPlano = atividades.map((a) => a.chave);
const COLUNAS_TAREFA = "id,chave,titulo,ordem,status,metadata,trilha";
const tarefasDoPlano = await consultar(
  supabase.from("tarefas").select(COLUNAS_TAREFA).in("chave", chavesPlano),
  "plano: não consegui ler as tarefas",
);

// 1) religar
const etapasDoModelo = await consultar(
  sistema.from("plano_etapa_modelo").select("id,trilha,fase,plano_atividade_modelo(id,chave)").eq("modelo_id", modeloId),
  "plano: não consegui ler as etapas do modelo",
);
const destino = new Map();
for (const e of etapasDoModelo)
  for (const a of e.plano_atividade_modelo ?? [])
    destino.set(chaveDaTarefa(e, a), { etapa_modelo_id: e.id, atividade_modelo_id: a.id });
const vinculos = tarefasDoPlano.length
  ? await consultar(
      sistema.from("tarefa_plano").select("tarefa_id,instancia_id,atividade_modelo_id").in("tarefa_id", tarefasDoPlano.map((t) => t.id)),
      "plano: não consegui ler os vínculos das tarefas",
    )
  : [];
const vinculoDe = new Map(vinculos.map((v) => [v.tarefa_id, v]));
let religadas = 0;
for (const t of tarefasDoPlano) {
  const alvo = destino.get(t.chave);
  const v = vinculoDe.get(t.id);
  if (!alvo || !v || (v.instancia_id === instanciaId && v.atividade_modelo_id === alvo.atividade_modelo_id)) continue;
  const { error } = await sistema.from("tarefa_plano").update({ instancia_id: instanciaId, ...alvo }).eq("tarefa_id", t.id);
  if (error) falharSchema(`plano: religar ${t.chave}`, error);
  religadas++;
}

// Atividade de sistema (linha do tempo). Idempotente: só insere se ainda não existe a mesma linha
// pra essa tarefa (assim, se um insert falhou numa rodada, a próxima completa). Falha aqui não desfaz o que já foi gravado.
async function registrarNaAtividade(tarefaId, descricao) {
  const { data: ja, error: erroLer } = await supabase
    .from("atividade")
    .select("id")
    .eq("tipo", "sistema")
    .eq("tarefa_id", tarefaId)
    .eq("descricao", descricao)
    .limit(1);
  if (erroLer) return console.warn(`[setup] AVISO: não consegui ler a atividade (${erroLer.message}).`);
  if (ja && ja.length > 0) return;
  const { error } = await supabase.from("atividade").insert({ tipo: "sistema", descricao, tarefa_id: tarefaId });
  if (error) console.warn(`[setup] AVISO: não consegui registrar na atividade (${error.message}).`);
}
const textoRetirado = (t) => `Passo retirado do plano na versão ${modelo.versao}: ${t.titulo}`;
const textoConcluido = (t) => `Passo concluído pela instalação: ${t.titulo}`;

// 2) órfãs: ainda ligadas a uma instância antiga depois do passo 1 = passo que saiu do plano
const antigas = existentes.filter((i) => i.modelo_id !== modeloId).map((i) => i.id);
let orfas = [];
if (antigas.length > 0) {
  const ligadas = await consultar(
    sistema.from("tarefa_plano").select("tarefa_id").in("instancia_id", antigas),
    "plano: não consegui ler as tarefas da versão antiga",
  );
  orfas = ligadas.length
    ? await consultar(supabase.from("tarefas").select(COLUNAS_TAREFA).in("id", ligadas.map((l) => l.tarefa_id)), "plano: não consegui ler as tarefas órfãs")
    : [];
}
let canceladas = 0;
for (const t of orfasParaCancelar(orfas, chavesPlano)) {
  const { error } = await supabase
    .from("tarefas")
    .update({ status: "CANCELADA", metadata: metadataAoCancelar(t, modelo.versao) })
    .eq("id", t.id)
    .eq("status", "BACKLOG");
  if (error) falharSchema(`plano: cancelar ${t.chave}`, error);
  await registrarNaAtividade(t.id, textoRetirado(t));
  canceladas++;
}
for (const t of orfasJaCanceladas(orfas, chavesPlano, modelo.versao)) await registrarNaAtividade(t.id, textoRetirado(t));
for (const t of orfasParaAvisar(orfas, chavesPlano))
  console.warn(
    `[setup] AVISO: o passo "${t.titulo}" (${t.chave}) saiu do plano mas está ${t.status}; não mexi nele. ` +
      "Se não faz mais sentido, cancele pela tela do Cronograma.",
  );

// 3) ordem. UNIQUE por trilha: estaciona as que mudam acima do maior valor, depois grava o definitivo.
let reordenadas = 0;
for (const trilha of ["curso", "plano90"]) {
  const mudancas = planejarOrdem(
    [...tarefasDoPlano, ...orfas].filter((t) => t.trilha === trilha),
    atividades.filter((a) => a.trilha === trilha).map((a) => a.chave),
  );
  if (mudancas.length === 0) continue;
  const [topo] = await consultar(
    supabase.from("tarefas").select("ordem").eq("trilha", trilha).order("ordem", { ascending: false }).limit(1),
    "plano: não consegui ler a ordem",
  );
  for (const [i, m] of mudancas.entries()) {
    const { error } = await supabase.from("tarefas").update({ ordem: topo.ordem + 1 + i }).eq("id", m.id);
    if (error) falharSchema(`plano: reordenar ${m.chave}`, error);
  }
  for (const m of mudancas) {
    const { error } = await supabase.from("tarefas").update({ ordem: m.para }).eq("id", m.id);
    if (error) falharSchema(`plano: reordenar ${m.chave}`, error);
  }
  reordenadas += mudancas.length;
}

// 4) passos provados: a instalação (feita_na_instalacao) e, com prova real, o sistema no ar.
//    O setup roda ANTES da Vercel (LEIA-ME passo 6 vs 7): sem /login respondendo 200 em https público, "sistema no ar" fica aberto.
async function statusDoLogin(siteUrl) {
  if (!urlPublicaHttps(siteUrl)) return null;
  try {
    const r = await fetch(urlDoLogin(siteUrl), { signal: AbortSignal.timeout(15000) });
    return r.status;
  } catch {
    return null;
  }
}
const statusLogin = await statusDoLogin(siteUrl);
const noAr = siteNoAr(siteUrl, statusLogin);
const chavesProvadas = [...atividades.filter((a) => a.feitaNaInstalacao).map((a) => a.chave), ...(noAr ? [CHAVE_SISTEMA_NO_AR] : [])];
if (!noAr) {
  const porque = !urlPublicaHttps(siteUrl)
    ? `SITE_URL (${siteUrl}) não é um endereço público em https`
    : statusLogin === null
      ? `${urlDoLogin(siteUrl)} não respondeu`
      : `${urlDoLogin(siteUrl)} respondeu ${statusLogin}, não 200`;
  console.warn(
    `[setup] AVISO: o passo "sistema no ar" continua aberto: ${porque}. ` +
      "Publique o sistema na Vercel e rode o setup de novo com SITE_URL=https://<endereço da Vercel> para concluir.",
  );
}
const MARCA_INSTALACAO = "setup_concluiu";
const agora = new Date().toISOString();
let concluidas = 0;
for (const t of passosParaConcluir(tarefasDoPlano, chavesProvadas, MARCA_INSTALACAO)) {
  const { data: feitas, error } = await supabase
    .from("tarefas")
    .update({ status: "CONCLUIDA", concluida_em: agora, metadata: { ...t.metadata, [MARCA_INSTALACAO]: agora.slice(0, 10) } })
    .eq("id", t.id)
    .eq("status", "BACKLOG")
    .select("id");
  if (error) falharSchema(`plano: concluir ${t.chave}`, error);
  if (feitas && feitas.length > 0) {
    await registrarNaAtividade(t.id, textoConcluido(t));
    concluidas++;
  }
}
// Já concluídos por um setup anterior: garante o registro na linha do tempo (o insert dele pode ter falhado).
for (const t of passosJaConcluidos(tarefasDoPlano, chavesProvadas, MARCA_INSTALACAO)) await registrarNaAtividade(t.id, textoConcluido(t));
console.log(
  `[setup] plano: ${religadas} tarefas religadas à versão ${modelo.versao}, ${canceladas} de passos retirados canceladas, ` +
    `${reordenadas} reordenadas, ${concluidas} passos marcados como concluídos pela instalação (sistema no ar: ${noAr ? "provado" : "aberto"}).`,
);

// --- 4. Convite do dono por e-mail (link pra definir a senha) ---
// Rodar de novo não reenvia: se o dono já está vinculado a um login, o convite já saiu
// (reenviar estoura o limite de e-mail do Supabase). REENVIAR_CONVITE=1 força o reenvio.
let authUserId = null;
const { data: donoVinculado, error: erroDono } = await supabase
  .from("usuarios")
  .select("auth_user_id")
  .eq("email", emailMaster)
  .eq("e_dono", true)
  .not("auth_user_id", "is", null)
  .maybeSingle();
if (erroDono) falhar(`não consegui ler o dono: ${erroDono.message}`);
const pularConvite = Boolean(donoVinculado) && process.env.REENVIAR_CONVITE !== "1";

const { data: convite, error: erroConvite } = pularConvite
  ? { data: null, error: null }
  : await supabase.auth.admin.inviteUserByEmail(emailMaster, {
      redirectTo: `${siteUrl.replace(/\/$/, "")}/auth/definir-senha`,
    });

if (pularConvite) {
  authUserId = donoVinculado.auth_user_id;
  console.log(
    "[setup] convite já enviado antes — não reenvio (use REENVIAR_CONVITE=1 pra mandar de novo).",
  );
} else if (erroConvite) {
  const jaExiste =
    erroConvite.code === "email_exists" ||
    /already.*(registered|exists)/i.test(erroConvite.message);
  if (!jaExiste) falhar(`convite falhou: ${erroConvite.message}`);
  console.log("[setup] e-mail já tem conta no Auth — pulando convite.");
  const { data: lista, error: erroLista } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (erroLista) falhar(`não consegui listar usuários do Auth: ${erroLista.message}`);
  authUserId =
    lista.users.find(
      (u) => (u.email ?? "").toLowerCase() === emailMaster.toLowerCase(),
    )?.id ?? null;
} else {
  authUserId = convite.user?.id ?? null;
  console.log(`[setup] convite enviado pra ${emailMaster}.`);
}

// --- 5. Vincula auth.users -> usuarios (se ainda não vinculado) ---
if (authUserId) {
  // .select() para o UPDATE devolver as linhas afetadas: 0 linhas SEM erro é o
  // modo de falha silencioso clássico — aqui a gente confere de verdade.
  const { data: vinculadas, error: erroVinculo } = await supabase
    .from("usuarios")
    .update({ auth_user_id: authUserId })
    .eq("email", emailMaster)
    .eq("e_dono", true)
    .is("auth_user_id", null)
    .select("id");
  if (erroVinculo) falhar(`vínculo do dono falhou: ${erroVinculo.message}`);
  if (vinculadas && vinculadas.length > 0) {
    console.log("[setup] dono vinculado ao login.");
  } else {
    const { data: jaVinculado } = await supabase
      .from("usuarios")
      .select("id")
      .eq("email", emailMaster)
      .eq("e_dono", true)
      .not("auth_user_id", "is", null);
    if (jaVinculado && jaVinculado.length > 0) {
      console.log("[setup] dono já estava vinculado — nada a fazer.");
    } else {
      falhar(
        `nenhuma linha de usuarios casou com o dono "${emailMaster}" — ` +
          "confira o emailMaster em config/empresa.ts (o seed grava em minúsculas).",
      );
    }
  }
} else {
  console.warn(
    "[setup] AVISO: não achei o usuário no Auth pra vincular — rode de novo depois do convite.",
  );
}

console.log(
  `\n[setup] pronto. Próximo passo: ${emailMaster} abre o e-mail de convite e define a senha.`,
);
