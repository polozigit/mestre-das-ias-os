import type { OrgPacote } from "./tipos.ts";

/**
 * Atribuição exigida pela licença do banco O*NET (CC BY 4.0,
 * https://www.onetcenter.org/license_db.html): citar versão do banco e USDOL/ETA,
 * a licença, que houve modificação e que o USDOL/ETA não endossa. Tem que aparecer
 * na tela que usa o conteúdo, não só dentro de um texto recolhido.
 *
 * Fonte do texto = o DADO: o pacote já traz a frase de crédito (config/organograma.json,
 * carregada em organograma.*). `CREDITO_ONET_PADRAO` só cobre pacote que cita O*NET sem
 * trazer a frase; organograma.test.ts prova que é idêntica à frase do dado (sem drift).
 */
export const CREDITO_ONET_PADRAO =
  "O*NET 31.0 Database, USDOL/ETA, CC BY 4.0 (onetcenter.org/license_db.html), modificado pela Polozi; o USDOL/ETA não endossa este uso.";

export const URL_LICENCA_ONET = "https://www.onetcenter.org/license_db.html";
const TRECHO_LICENCA = "onetcenter.org/license_db.html";

const CITA_ONET = /O\*NET/;
const FRASE_CREDITO = /O\*NET \d+(?:\.\d+)? Database[^\n]*?não endossa este uso\./;

export type CreditoOnet = { texto: string; url: string };

function textosDoPacote(p: OrgPacote): string[] {
  return [
    ...p.secoes.map((s) => s.markdown),
    ...p.playbooks.map((pb) => pb.markdown),
    ...(p.casos_md ? [p.casos_md] : []),
  ];
}

/** Crédito O*NET a exibir pro pacote, ou null se o pacote não usa conteúdo O*NET. */
export function creditoOnet(pacote: OrgPacote): CreditoOnet | null {
  const textos = textosDoPacote(pacote);
  if (!textos.some((t) => CITA_ONET.test(t))) return null;
  for (const t of textos) {
    const achada = FRASE_CREDITO.exec(t);
    if (achada) return { texto: achada[0], url: URL_LICENCA_ONET };
  }
  return { texto: CREDITO_ONET_PADRAO, url: URL_LICENCA_ONET };
}

/** Parte o texto do crédito em [antes, trecho-da-licença, depois] pra o trecho virar link. */
export function partesDoCredito(texto: string): [string, string, string] | null {
  const i = texto.indexOf(TRECHO_LICENCA);
  if (i < 0) return null;
  return [texto.slice(0, i), TRECHO_LICENCA, texto.slice(i + TRECHO_LICENCA.length)];
}
