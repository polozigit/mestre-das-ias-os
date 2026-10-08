import {
  lerConfigPublica,
  lerConfigPublicaOuNada,
  mensagemFaltaConfig,
} from "../../../config/supabase-env.mjs";

/**
 * Leitura das variáveis PÚBLICAS do Supabase (URL e chave pública), aceitando os dois nomes de cada
 * (lista em config/supabase-env.mjs): NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL, e
 * NEXT_PUBLIC_SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY. Falta alguma: erro claro com os nomes aceitos.
 *
 * Sem nenhuma chave secreta aqui: este arquivo vai pro navegador (a chave de serviço é de
 * config/supabase-env-servidor.mjs, só importada por src/lib/supabase/service.ts).
 */

/**
 * NAVEGADOR. O Next só troca `process.env.NEXT_PUBLIC_X` escrito por extenso (não `process.env[nome]` nem
 * `process.env` inteiro), por isso as duas leituras abaixo ficam literais. SUPABASE_URL e
 * SUPABASE_PUBLISHABLE_KEY (sem prefixo) chegam aqui porque o next.config.ts as copia pros nomes
 * NEXT_PUBLIC_ na hora do build.
 */
export function configPublicaDoNavegador() {
  return lerConfigPublica({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/** SERVIDOR (Server Component, server action, proxy): lê o ambiente inteiro; erro claro se faltar. */
export function configPublicaDoServidor() {
  return lerConfigPublica(process.env);
}

/** SERVIDOR, sem lançar: o que faltar vem `undefined` (proxy deixa passar sem banco; ação responde com texto). */
export function configPublicaDoServidorOuNada() {
  return lerConfigPublicaOuNada(process.env);
}

export { mensagemFaltaConfig };
