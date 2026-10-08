export type Aba = "marca" | "persona" | "dossie";

export const ABAS: Aba[] = ["marca", "persona", "dossie"];

export const ROTULO_ABA: Record<Aba, string> = {
  marca: "Identidade e voz",
  persona: "Persona",
  dossie: "Dossiê",
};

/**
 * Texto do estado vazio de cada aba: o que o dono pede à IA pra o documento aparecer aqui. Os três nascem na
 * etapa "Gravar dossiê, persona e marca" do Cronograma (Dia 1); a persona parte do dossiê, por isso o
 * dossiê vem primeiro.
 */
export const ETAPA_QUE_PUBLICA: Record<Aba, string> = {
  marca: 'Peça à sua IA: "monta a identidade e a voz da marca". Ela aparece aqui quando estiver pronta.',
  persona: 'Peça à sua IA: "monta a persona a partir do dossiê". Registre o dossiê antes; a persona aparece aqui quando estiver pronta.',
  dossie: 'Peça à sua IA: "registra o dossiê". Ele aparece aqui quando estiver pronto.',
};

/** Valor de `?aba=` desconhecido, ausente ou vazio cai em "marca". */
export function abaDaUrl(v: string | null | undefined): Aba {
  return v === "marca" || v === "persona" || v === "dossie" ? v : "marca";
}

/** Agrupa por aba, mais recente primeiro. Tipo `extracao` (ou qualquer outro) fica fora. */
export function porAba<T extends { tipo: string; publicado_em: string }>(docs: T[]): Record<Aba, T[]> {
  const r: Record<Aba, T[]> = { marca: [], persona: [], dossie: [] };
  for (const d of docs) {
    if (d.tipo === "marca" || d.tipo === "persona" || d.tipo === "dossie") r[d.tipo].push(d);
  }
  for (const a of ABAS) {
    r[a].sort((x, y) => (x.publicado_em < y.publicado_em ? 1 : x.publicado_em > y.publicado_em ? -1 : 0));
  }
  return r;
}

/**
 * Documento aberto de uma aba: o pedido em `?doc=` quando ele é desta aba, senão o mais recente.
 * Aba sem nenhum documento devolve null (a tela mostra o estado vazio dela).
 */
export function abertoDaAba<T extends { id: string }>(daAba: T[], docId: string | null | undefined): T | null {
  return daAba.find((d) => d.id === docId) ?? daAba[0] ?? null;
}

/** O documento aberto de CADA aba. Um `?doc=` de outra aba não vale: cada aba cai no seu mais recente. */
export function abertosDasAbas<T extends { id: string }>(
  grupos: Record<Aba, T[]>,
  docId: string | null | undefined,
): Record<Aba, T | null> {
  return {
    marca: abertoDaAba(grupos.marca, docId),
    persona: abertoDaAba(grupos.persona, docId),
    dossie: abertoDaAba(grupos.dossie, docId),
  };
}

/** Endereço da tela Marca numa aba, e num documento dela quando não é o mais recente. */
export function hrefMarca(aba: Aba, docId?: string | null): string {
  return docId ? `/marca?aba=${aba}&doc=${encodeURIComponent(docId)}` : `/marca?aba=${aba}`;
}

/**
 * Endereço de cada aba. Quem está aberto numa aba que NÃO é o mais recente leva o `doc` junto, pra voltar
 * a ela (ou recarregar a página) mostrar o mesmo documento que a tela mostra.
 */
export function hrefsDasAbas<T extends { id: string }>(
  grupos: Record<Aba, T[]>,
  abertos: Record<Aba, T | null>,
): Record<Aba, string> {
  const href = (aba: Aba) => {
    const aberto = abertos[aba];
    return hrefMarca(aba, aberto && aberto.id !== grupos[aba][0]?.id ? aberto.id : null);
  };
  return { marca: href("marca"), persona: href("persona"), dossie: href("dossie") };
}

/**
 * Clique "normal" do mouse num link de aba: botão esquerdo, sem Ctrl, Cmd, Shift nem Alt. Esse a tela trata
 * (troca a aba na hora); os outros ficam com o navegador (abrir em outra guia ou janela).
 */
export function cliqueSimples(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/**
 * Endereço a empurrar no histórico quando se clica numa aba, ou null se a URL já está nela (clicar na aba
 * aberta não cria passo novo no "voltar"). `buscaAtual` é a query da URL NA HORA do clique
 * (`window.location.search`), nunca a aba que a tela desenhou por último: dois cliques seguidos, antes de a
 * tela se redesenhar, valem os dois (com a aba velha o último clique se perdia).
 */
export function enderecoDaTroca(aba: Aba, hrefDaAba: string, buscaAtual: string): string | null {
  return abaDaUrl(new URLSearchParams(buscaAtual).get("aba")) === aba ? null : hrefDaAba;
}
