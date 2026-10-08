/**
 * Rótulos em português simples das tarefas: quem criou e de onde ela veio.
 * Funções PURAS, testadas em rotulos.test.ts. O banco fala `humano`/`ia` e `plano`/`chat`;
 * a tela fala "Você"/"IA" e "plano de 90 dias"/"conversa".
 */

/** Valor curto da coluna e do filtro "Criada por": `humano` vira "Você". */
export function rotuloCriadaPor(origem: string): string {
  return origem === "ia" ? "IA" : "Você";
}

/** Frase inteira, pra onde não há cabeçalho de coluna (card do quadro, topo do detalhe). */
export function fraseCriadaPor(origem: string): string {
  return origem === "ia" ? "Criada por IA" : "Criada por você";
}

/** Valores de `tarefas.origem_tipo` que a tela conhece (migration 0014: chat, ideia, especificacao...). */
const ROTULO_ORIGEM_TIPO: Record<string, string> = {
  chat: "conversa",
  ideia: "ideia",
  especificacao: "especificação",
  roadmap_item: "planejamento",
  reuniao_item: "reunião",
};

/** Tipo de origem que nenhuma regra conhece vira texto legível ("minha_origem" → "minha origem"). */
function humanizar(tipo: string): string {
  return tipo.replace(/[_-]+/g, " ").trim();
}

/**
 * "Veio de": de onde a tarefa nasceu, em palavras do dono. Sem origem (tarefa criada direto na tela)
 * devolve null e a tela não mostra a linha. `plano` depende da trilha: a mesma origem é o curso de
 * 3 dias, o plano de 90 dias ou, nas tarefas do dia a dia, um plano de trabalho. A palavra solta
 * "plano" nunca chega à tela.
 */
export function rotuloVeioDe(
  origemTipo: string | null | undefined,
  trilha?: string | null,
): string | null {
  const tipo = (origemTipo ?? "").trim();
  if (!tipo) return null;
  if (tipo === "plano") {
    if (trilha === "plano90") return "plano de 90 dias";
    if (trilha === "curso") return "curso de 3 dias";
    return "plano de trabalho";
  }
  return Object.hasOwn(ROTULO_ORIGEM_TIPO, tipo) ? ROTULO_ORIGEM_TIPO[tipo] : humanizar(tipo);
}

/**
 * `origem_ref` é um id interno (plano) ou o link da conversa (chat). Só vira link clicável se for
 * um endereço http(s) válido; id interno não diz nada ao dono e nunca aparece, e esquema perigoso
 * (javascript:, data:) nunca vira link.
 */
export function linkDaOrigem(origemRef: string | null | undefined): string | null {
  try {
    const url = new URL((origemRef ?? "").trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
