/**
 * Leitura única dos NOMES das variáveis públicas do Supabase que o sistema aceita.
 *
 * Por que existe (07/10/2026): a integração Supabase -> Vercel passou a gravar `SUPABASE_URL` e
 * `SUPABASE_PUBLISHABLE_KEY` (além de `NEXT_PUBLIC_SUPABASE_URL`), e o sistema nasceu lendo
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`: o site não achava o banco. Agora cada valor aceita DOIS nomes e
 * o primeiro da lista vence, então quem já funciona com o nome antigo não muda de comportamento.
 *
 * ESTE ARQUIVO VAI PRO NAVEGADOR: só cita nomes de variável PÚBLICA (URL e chave publishable/anon).
 * Os nomes da chave SECRETA moram em `supabase-env-servidor.mjs`, que componente de cliente nunca
 * importa (regra C4 do tecnologia-revisor-seguranca; o teste supabase-env.test.ts trava isso).
 *
 * Sem I/O e sem `process`: quem chama entrega o objeto de variáveis (`process.env` no servidor; no
 * navegador, um objeto com `process.env.NEXT_PUBLIC_...` escrito por extenso, porque o Next só troca
 * essa forma, ver src/lib/supabase/env.ts). O `next.config.ts` copia o valor das variáveis sem
 * prefixo pros nomes `NEXT_PUBLIC_` na hora do build (envPublicoDoBuild), é assim que a chave
 * publishable chega ao navegador.
 * Mora em config/ porque o setup da fábrica copia config/ inteiro e o setup-inicial.mjs importa daqui.
 */

/** @typedef {Record<string, string | undefined>} Variaveis */

/** URL do projeto: o primeiro nome da lista que estiver preenchido vence. */
export const NOMES_URL = Object.freeze(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);

/** Chave pública (anon/publishable): pública por desenho, segura no navegador porque TODA tabela tem RLS. */
export const NOMES_CHAVE_PUBLICA = Object.freeze(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"]);

export class ErroConfigSupabase extends Error {
  /** @param {string} mensagem */
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroConfigSupabase";
  }
}

/**
 * Primeiro valor preenchido (sem espaço nas pontas) entre os nomes, na ordem dada; `undefined` se nenhum.
 * @param {Variaveis} env
 * @param {readonly string[]} nomes
 * @returns {string | undefined}
 */
export function primeiroValor(env, nomes) {
  for (const nome of nomes) {
    const valor = env[nome];
    if (typeof valor === "string" && valor.trim() !== "") return valor.trim();
  }
  return undefined;
}

/** "NOME_A ou NOME_B", pra mensagem de erro. @param {readonly string[]} nomes */
export function nomesAceitos(nomes) {
  return nomes.join(" ou ");
}

/** @param {Variaveis} env */
export function urlSupabase(env) {
  return primeiroValor(env, NOMES_URL);
}

/** @param {Variaveis} env */
export function chavePublicaSupabase(env) {
  return primeiroValor(env, NOMES_CHAVE_PUBLICA);
}

/**
 * Mensagem de "banco não configurado": diz o que falta e QUAIS nomes são aceitos. Nunca cita valor.
 * @param {{ url: boolean, chavePublica: boolean }} faltando
 */
export function mensagemFaltaConfig(faltando) {
  const partes = [];
  if (faltando.url) partes.push(`a URL do projeto (aceita ${nomesAceitos(NOMES_URL)})`);
  if (faltando.chavePublica) partes.push(`a chave pública (aceita ${nomesAceitos(NOMES_CHAVE_PUBLICA)})`);
  return (
    `Banco não configurado: falta ${partes.join(" e ")}. ` +
    "Defina um nome de cada no ambiente (na Vercel: Settings > Environment Variables; na máquina: .env.local)."
  );
}

/**
 * URL + chave pública, ou lança `ErroConfigSupabase` dizendo os nomes aceitos.
 * @param {Variaveis} env
 * @returns {{ url: string, chavePublica: string }}
 */
export function lerConfigPublica(env) {
  const url = urlSupabase(env);
  const chavePublica = chavePublicaSupabase(env);
  if (!url || !chavePublica) {
    throw new ErroConfigSupabase(mensagemFaltaConfig({ url: !url, chavePublica: !chavePublica }));
  }
  return { url, chavePublica };
}

/**
 * O mesmo sem lançar: o que faltar vem `undefined`. Pro proxy, que deixa passar quando não há banco,
 * e pra ação que responde com mensagem em vez de estourar.
 * @param {Variaveis} env
 * @returns {{ url: string | undefined, chavePublica: string | undefined }}
 */
export function lerConfigPublicaOuNada(env) {
  return { url: urlSupabase(env), chavePublica: chavePublicaSupabase(env) };
}

/**
 * O que o `next.config.ts` grava no pacote do navegador: SEMPRE com os nomes `NEXT_PUBLIC_` que o código
 * do navegador lê, qualquer que seja o nome em que o valor chegou. Só entra o que está preenchido (sem
 * variável nenhuma, o comportamento é o de antes). Só URL e chave PÚBLICA: chave secreta nunca vira
 * `NEXT_PUBLIC_` (C4).
 * @param {Variaveis} env
 * @returns {Record<string, string>}
 */
export function envPublicoDoBuild(env) {
  const { url, chavePublica } = lerConfigPublicaOuNada(env);
  /** @type {Record<string, string>} */
  const saida = {};
  if (url) saida.NEXT_PUBLIC_SUPABASE_URL = url;
  if (chavePublica) saida.NEXT_PUBLIC_SUPABASE_ANON_KEY = chavePublica;
  return saida;
}
