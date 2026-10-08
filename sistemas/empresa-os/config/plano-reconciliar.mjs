/**
 * Regras puras que o setup usa pra manter o cronograma coerente quando o plano ganha uma versão nova
 * (scripts/setup-inicial.mjs, passo 3b). Sem I/O: o setup lê e grava; aqui só se decide.
 * Mora em config/ porque o setup da fábrica copia config/ inteiro pra uma pasta temporária.
 */

/** @typedef {{ id: string, chave: string, ordem: number, status: string, titulo?: string, metadata?: Record<string, unknown> | null }} TarefaPlano */

/** Chave da tarefa semeada de uma atividade: `<trilha>.<fase minúscula>.<chave da atividade>` (migration 0016). */
export function chaveDaTarefa(etapa, atividade) {
  return `${etapa.trilha}.${String(etapa.fase).toLowerCase()}.${atividade.chave}`;
}

/** Atividades do modelo na ordem do plano (etapa, depois atividade), com a chave da tarefa e a marca de instalação. */
export function atividadesEmOrdem(modelo) {
  return [...modelo.etapas]
    .sort((a, b) => a.ordem - b.ordem)
    .flatMap((e) =>
      [...e.atividades]
        .sort((a, b) => a.ordem - b.ordem)
        .map((a) => ({ chave: chaveDaTarefa(e, a), trilha: e.trilha, feitaNaInstalacao: a.feita_na_instalacao === true })),
    );
}

/**
 * Reordena as tarefas de UMA trilha para seguirem a ordem do modelo.
 * `tarefas` = só as tarefas do plano dessa trilha (as do modelo + as órfãs de versão antiga).
 * A ordem no banco é única por trilha e tem lacunas (a trilha pode dividir a faixa com outras tarefas):
 * por isso reaproveita os MESMOS valores, só redistribuídos. Órfã (chave que saiu do modelo) vai pro fim.
 * Devolve só o que muda: [{ id, chave, de, para }].
 * @param {TarefaPlano[]} tarefas
 * @param {string[]} chavesEmOrdem
 * @returns {{ id: string, chave: string, de: number, para: number }[]}
 */
export function planejarOrdem(tarefas, chavesEmOrdem) {
  const noModelo = new Set(chavesEmOrdem);
  const porChave = new Map(tarefas.map((t) => [t.chave, t]));
  const seguindo = chavesEmOrdem.flatMap((c) => (porChave.has(c) ? [porChave.get(c)] : []));
  const orfas = tarefas.filter((t) => !noModelo.has(t.chave)).sort((a, b) => a.ordem - b.ordem);
  const sequencia = [...seguindo, ...orfas];
  const faixa = sequencia.map((t) => t.ordem).sort((a, b) => a - b);
  return sequencia.flatMap((t, i) => (t.ordem === faixa[i] ? [] : [{ id: t.id, chave: t.chave, de: t.ordem, para: faixa[i] }]));
}

/**
 * Órfãs: tarefas de uma versão anterior do plano cuja chave não existe mais no modelo atual.
 * Só a órfã ainda em BACKLOG vira CANCELADA (a trilha não se apaga, só se cancela). Quem já começou
 * (EM_ANDAMENTO, REVISAO) tem trabalho de gente: não se mexe, só se avisa (`orfasParaAvisar`).
 * Concluída e cancelada ficam como história.
 * @param {TarefaPlano[]} tarefasDeVersaoAntiga
 * @param {string[]} chavesDoModelo
 * @returns {TarefaPlano[]}
 */
export function orfasParaCancelar(tarefasDeVersaoAntiga, chavesDoModelo) {
  const noModelo = new Set(chavesDoModelo);
  return tarefasDeVersaoAntiga.filter((t) => !noModelo.has(t.chave) && t.status === "BACKLOG");
}

/**
 * Metadata gravada ao cancelar uma órfã: guarda o que ela era (`status_anterior`) e em que versão saiu do plano.
 * @param {TarefaPlano} t
 * @param {number} versao
 * @returns {Record<string, unknown>}
 */
export function metadataAoCancelar(t, versao) {
  return { ...t.metadata, removida_do_plano_na_versao: versao, status_anterior: t.status };
}

/**
 * Órfãs que a reconciliação NÃO cancela porque alguém já mexeu nelas: o setup só avisa no log.
 * @param {TarefaPlano[]} tarefasDeVersaoAntiga
 * @param {string[]} chavesDoModelo
 * @returns {TarefaPlano[]}
 */
export function orfasParaAvisar(tarefasDeVersaoAntiga, chavesDoModelo) {
  const noModelo = new Set(chavesDoModelo);
  return tarefasDeVersaoAntiga.filter((t) => !noModelo.has(t.chave) && ["EM_ANDAMENTO", "REVISAO"].includes(t.status));
}

/**
 * Órfãs que um setup anterior já cancelou nesta versão do plano (pra garantir o registro na atividade).
 * @param {TarefaPlano[]} tarefasDeVersaoAntiga
 * @param {string[]} chavesDoModelo
 * @param {number} versao
 * @returns {TarefaPlano[]}
 */
export function orfasJaCanceladas(tarefasDeVersaoAntiga, chavesDoModelo, versao) {
  const noModelo = new Set(chavesDoModelo);
  return tarefasDeVersaoAntiga.filter(
    (t) => !noModelo.has(t.chave) && t.status === "CANCELADA" && t.metadata?.removida_do_plano_na_versao === versao,
  );
}

/**
 * Passos que a própria instalação já provou. Só os que ainda estão em BACKLOG e nunca foram marcados
 * (marca em metadata): se o aluno reabrir um passo depois, rodar o setup de novo não o conclui outra vez.
 * @param {TarefaPlano[]} tarefas
 * @param {string[]} chavesInstaladas
 * @param {string} marca
 * @returns {TarefaPlano[]}
 */
export function passosParaConcluir(tarefas, chavesInstaladas, marca) {
  const instaladas = new Set(chavesInstaladas);
  return tarefas.filter((t) => instaladas.has(t.chave) && t.status === "BACKLOG" && !t.metadata?.[marca]);
}

/**
 * Passos que o setup já concluiu (status CONCLUIDA com a marca): servem pra garantir o registro na atividade.
 * @param {TarefaPlano[]} tarefas
 * @param {string[]} chavesInstaladas
 * @param {string} marca
 * @returns {TarefaPlano[]}
 */
export function passosJaConcluidos(tarefas, chavesInstaladas, marca) {
  const instaladas = new Set(chavesInstaladas);
  return tarefas.filter((t) => instaladas.has(t.chave) && t.status === "CONCLUIDA" && Boolean(t.metadata?.[marca]));
}

/**
 * Passo que só o sistema publicado prova (o setup roda ANTES da Vercel): fica fora de `feita_na_instalacao`
 * e o setup só o conclui quando `siteNoAr` for verdadeiro.
 */
export const CHAVE_SISTEMA_NO_AR = "curso.d1.sistema-no-ar";

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/** URL pública e segura o bastante pra valer como prova: https, sem host local. */
export function urlPublicaHttps(url) {
  try {
    const u = new URL(String(url));
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && !HOSTS_LOCAIS.has(host) && !host.endsWith(".localhost");
  } catch {
    return false;
  }
}

/** Endereço da tela de login do sistema, a partir do SITE_URL (com ou sem barra final). */
export function urlDoLogin(siteUrl) {
  return `${String(siteUrl).replace(/\/+$/, "")}/login`;
}

/** O sistema está no ar: URL pública em https e o /login respondeu exatamente 200. */
export function siteNoAr(siteUrl, status) {
  return urlPublicaHttps(siteUrl) && status === 200;
}
