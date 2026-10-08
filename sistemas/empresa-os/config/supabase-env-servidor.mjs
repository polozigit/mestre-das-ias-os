/**
 * SÓ SERVIDOR. Nomes aceitos da chave SECRETA do Supabase (a de máquina, que ignora RLS).
 *
 * Mesma ideia de `supabase-env.mjs`: a integração Supabase -> Vercel grava `SUPABASE_SECRET_KEY`, o
 * sistema nasceu lendo `SUPABASE_SERVICE_ROLE_KEY`; agora aceita os DOIS, o primeiro da lista vence.
 *
 * Fica num arquivo à parte de propósito: nenhum componente de cliente (`"use client"`) nem arquivo que
 * um deles importe pode citar estes nomes (regra C4 do tecnologia-revisor-seguranca). Quem importa
 * daqui: src/lib/supabase/service.ts e scripts/setup-inicial.mjs, nunca o navegador. E esta chave
 * NUNCA vira variável `NEXT_PUBLIC_*`.
 */
import { ErroConfigSupabase, nomesAceitos, NOMES_URL, primeiroValor, urlSupabase } from "./supabase-env.mjs";

/** @typedef {Record<string, string | undefined>} Variaveis */

/** Chave de serviço: o primeiro nome da lista que estiver preenchido vence. */
export const NOMES_CHAVE_SECRETA = Object.freeze(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]);

/** @param {Variaveis} env */
export function chaveSecretaSupabase(env) {
  return primeiroValor(env, NOMES_CHAVE_SECRETA);
}

/**
 * Mensagem de "service-role não configurado": o que falta e QUAIS nomes são aceitos. Nunca cita valor.
 * @param {{ url: boolean, chaveSecreta: boolean }} faltando
 */
export function mensagemFaltaConfigServico(faltando) {
  const partes = [];
  if (faltando.url) partes.push(`a URL do projeto (aceita ${nomesAceitos(NOMES_URL)})`);
  if (faltando.chaveSecreta) partes.push(`a chave de serviço (aceita ${nomesAceitos(NOMES_CHAVE_SECRETA)})`);
  return (
    `Service-role não configurado: falta ${partes.join(" e ")}. ` +
    "Defina um nome de cada no ambiente do servidor (na Vercel: Settings > Environment Variables; " +
    "na máquina: credenciais/.env)."
  );
}

/**
 * URL + chave de serviço, ou lança `ErroConfigSupabase` dizendo os nomes aceitos.
 * @param {Variaveis} env
 * @returns {{ url: string, chaveSecreta: string }}
 */
export function lerConfigServico(env) {
  const url = urlSupabase(env);
  const chaveSecreta = chaveSecretaSupabase(env);
  if (!url || !chaveSecreta) {
    throw new ErroConfigSupabase(mensagemFaltaConfigServico({ url: !url, chaveSecreta: !chaveSecreta }));
  }
  return { url, chaveSecreta };
}
