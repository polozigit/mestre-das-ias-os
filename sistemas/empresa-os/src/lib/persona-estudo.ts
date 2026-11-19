/*
 * Estudo do cliente ideal na aba Persona: leitura e validação do bloco ```persona-dados``` (versão 1) do
 * documento `empresa/publico/persona.md`. Contrato: specs/2026-11-19-persona-estudo-contrato.md.
 *
 * A tela é a última fronteira (o banco guarda texto livre): cada campo é remontado, com teto, enumeração e
 * forma conferidos; o que está errado é descartado (o item, o sub-bloco ou o capítulo, conforme a seção 3.2
 * do contrato) e nada lança. Bloco ausente ou inválido (3.1) dá null, e a tela cai no leitor antigo
 * (persona-dados.ts) ou no texto.
 */

export const VERSAO_ESTUDO = 1 as const;
export const TETO_BLOCO_ESTUDO_BYTES = 64 * 1024;
/** Mesmo teto do leitor antigo (persona-dados.ts): documento maior nem é lido. */
export const TETO_DOCUMENTO_BYTES = 200 * 1024;

export const TIPOS_ORIGEM = ["disse", "pesquisa", "leitura", "hipotese"] as const;
export type TipoOrigem = (typeof TIPOS_ORIGEM)[number];

export const IDS_CAPITULO = [
  "descobertas", "quem", "pensa", "quer", "forcas", "decide", "onde", "sabe", "mensagem", "nao", "apostas", "semana",
] as const;
export type IdCapitulo = (typeof IDS_CAPITULO)[number];

export const TIPOS_CLIENTE = ["pessoa", "empresa", "os-dois"] as const;
export type TipoCliente = (typeof TIPOS_CLIENTE)[number];

export const FUNCOES_COMPRA = ["decide", "influencia", "usa"] as const;
export type FuncaoCompra = (typeof FUNCOES_COMPRA)[number];

export const INCLINACOES = ["empurra", "segura", "equilibrio"] as const;
export type Inclinacao = (typeof INCLINACOES)[number];

export const ESTADOS_CAMINHO = ["atua", "fora", "vazamento"] as const;
export type EstadoCaminho = (typeof ESTADOS_CAMINHO)[number];

/** Ordem da tela: da mais perto à mais longe. */
export const TIPOS_ZONA = ["cruza", "informa", "compara", "escuta"] as const;
export type TipoZona = (typeof TIPOS_ZONA)[number];

export const TEMPOS_APOSTA = ["1-hora", "1-dia", "1-semana", "2-semanas", "1-mes"] as const;
export type TempoAposta = (typeof TEMPOS_APOSTA)[number];

export const RE_REF_DOSSIE = /^(?:[A-H][0-9]{1,2}[a-z]?|[0-9]{1,2}\.[0-9]{1,2})$/;
export const RE_REF_RELATO = /^relato [0-9]{4}-[0-9]{2}-[0-9]{2}$/;
export const RE_REF_PESQUISA = /^\[([0-9]{1,3})\]$/;
export const RE_DATA = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
export const RE_URL = /^https:\/\/[^\s<>"'`]{1,490}$/;
const RE_NUMERO_VERSAO = /^[0-9]{1,2}\.[0-9]{1,2}$/;
const RE_CONTROLE = /[\u0000-\u001F]/;

/** `B5a`, `2.4`, `relato 2026-11-18` ou `[3]`. */
export type Ref = string;

export type Origem =
  | { tipo: "disse"; refs: Ref[] }
  | { tipo: "pesquisa"; refs: Ref[] }
  | { tipo: "leitura"; refs: Ref[] }
  | { tipo: "hipotese"; razao: string };

export type Afirmacao = { texto: string; origem: Origem };
export type Evidencia = { tipo: "disse" | "pesquisa"; refs: Ref[]; texto: string };

export type Versao = {
  numero: string;
  data: string;
  registro_dossie: string;
  dossie_em: string | null;
  perguntas_dossie: number;
  sem_resposta: number;
  perguntas_dono: number;
  trechos: number;
  paginas: number;
};

export type Abertura = {
  arquetipo: { texto: string; enfase: string | null };
  retrato: Afirmacao;
  versao: Versao;
};

export type Descoberta = {
  titulo: string;
  corpo: string;
  por_que_importa: string;
  o_que_fazer: string;
  origem: Origem;
  evidencias: Evidencia[];
};
export type CapDescobertas = {
  itens: Descoberta[];
  extra: { texto: string; capitulo: IdCapitulo; origem: Origem } | null;
};

export type Papel = { papel: string; funcao: FuncaoCompra; nivel: 0 | 1 | 2 | 3; texto: string | null; origem: Origem };
export type CapQuem = {
  momento: Afirmacao | null;
  perfil: Afirmacao[];
  pessoa: Afirmacao[];
  grupo_compra: { papeis: Papel[]; nota: Afirmacao | null } | null;
  evidencias: Evidencia[];
};

export type CapPensa = {
  acredita: Afirmacao[];
  teme: Afirmacao[];
  deseja: Afirmacao[];
  espelho: { paragrafos: string[]; origem: Origem; evidencias: Evidencia[] } | null;
  evidencias: Evidencia[];
};

export type Trabalho = { enunciado: string; origem: Origem; o_que_pede: string };
export type CapQuer = {
  pratico: Trabalho | null;
  ser_visto: Trabalho | null;
  sentir: Trabalho | null;
  evidencias: Evidencia[];
};

export type Peso = { texto: string; peso: 1 | 2 | 3; ausente: boolean; origem: Origem };
export type CapForcas = {
  empurra: Peso[];
  segura: Peso[];
  inclinacao: Inclinacao;
  leitura: Afirmacao | null;
  como_virar: { titulo: string; texto: string }[];
  evidencias: Evidencia[];
};

export type PontoCaminho = { etapa: string; texto: string; estado: EstadoCaminho; alerta: string | null; origem: Origem };
export type PontoMapa = { nome: string; x: number; y: number; nosso: boolean; origem: Origem };
export type Posicao = {
  eixo_x: { esq: string; dir: string };
  eixo_y: { baixo: string; cima: string };
  pontos: PontoMapa[];
  leitura: Afirmacao;
  ressalva: string | null;
  evidencias: Evidencia[];
};
export type Criterio = { termo: string; significado: string; origem: Origem };
export type CapDecide = {
  caminho: { pontos: PontoCaminho[] } | null;
  posicao: Posicao | null;
  criterios: Criterio[];
  evidencias: Evidencia[];
};

export type Zona = { tipo: TipoZona; lugares: Afirmacao[]; como_chegar: string };
export type CapOnde = { zonas: Zona[]; nao_alcancado: string | null; evidencias: Evidencia[] };

export type Degrau = { nivel: 1 | 2 | 3 | 4 | 5; sinal: string; onde: string | null; o_que_dizer: string };
export type CapSabe = {
  /** Sempre 5, ordenados por nível. */
  degraus: Degrau[];
  foco: 1 | 2 | 3 | 4 | 5;
  leitura: { paragrafos: string[]; origem: Origem } | null;
  evidencias: Evidencia[];
};

export type Duvida = {
  duvida: string;
  origem_duvida: Origem;
  resposta: string;
  origem_resposta: Origem;
  pendencia: string | null;
};
export type CapMensagem = {
  promessa_hoje: Afirmacao | null;
  promessa_sugerida: { texto: string; motivos: string[]; origem: Origem; evidencias: Evidencia[] } | null;
  risco: { titulo: string; texto: string; origem: Origem; teste: string | null } | null;
  onde_quando: Afirmacao | null;
  provas_tem: Afirmacao[];
  provas_faltam: { texto: string; origem: Origem | null }[];
  duvidas: Duvida[];
  evidencias: Evidencia[];
};

export type CapNao = { perfis: { perfil: string; porque: string; origem: Origem }[] };

export type Aposta = { aposta: string; por_que: string; como_confirmar: string; tempo: TempoAposta };
export type CapApostas = {
  itens: Aposta[];
  roteiro: { conversas: number; minutos: number; com_quem: string; perguntas: string[] } | null;
};

export type CapSemana = { acoes: { acao: string; resolve: string; origem: Origem | null }[] };

export type Fonte = { n: number; titulo: string; url: string; data_acesso: string };
export type Fontes = { busca_disponivel: boolean; data_acesso: string | null; itens: Fonte[]; nao_achado: string[] };

export type EstudoPersona = {
  versao: 1;
  documento: "persona";
  empresa: string;
  oferta: Afirmacao | null;
  tipo_cliente: TipoCliente;
  onde_atende: Afirmacao | null;
  abertura: Abertura;
  /** Capítulo ausente, inválido ou sem conteúdo depois da validação = null (não aparece). */
  descobertas: CapDescobertas | null;
  quem: CapQuem | null;
  pensa: CapPensa | null;
  quer: CapQuer | null;
  forcas: CapForcas | null;
  decide: CapDecide | null;
  onde: CapOnde | null;
  sabe: CapSabe | null;
  mensagem: CapMensagem | null;
  nao: CapNao | null;
  apostas: CapApostas | null;
  semana: CapSemana | null;
  fontes: Fontes;
};

// ---------------------------------------------------------------------------
// Textos fixos da tela (seção 1 do contrato; nenhum deles vem do JSON)
// ---------------------------------------------------------------------------

/** Título padrão de cada capítulo (o de descobertas depende do número de itens: ver tituloDoCapitulo). */
export const TITULOS_CAPITULO: Record<IdCapitulo, string> = {
  descobertas: "Coisas que você ainda não tinha visto",
  quem: "Quem é, e em que momento está",
  pensa: "Como pensa",
  quer: "O que quer resolver",
  forcas: "O que empurra para a compra, e o que segura",
  decide: "Como decide",
  onde: "Onde está, e como chegar",
  sabe: "O quanto já sabe",
  mensagem: "O que dizer",
  nao: "Quem não é o cliente",
  apostas: "O que ainda é aposta, e como confirmar",
  semana: "O que fazer esta semana",
};

/** Rótulo curto da navegação grudada no topo. */
export const ROTULOS_CURTOS: Record<IdCapitulo, string> = {
  descobertas: "Descobertas",
  quem: "Quem é",
  pensa: "Como pensa",
  quer: "O que quer",
  forcas: "Empurra e segura",
  decide: "Como decide",
  onde: "Onde está",
  sabe: "O quanto sabe",
  mensagem: "Mensagem",
  nao: "Quem não é",
  apostas: "Apostas",
  semana: "Esta semana",
};

/** "Para entender" de cada capítulo, com o nome técnico (opcional, fonte menor). */
export const PARA_ENTENDER: Record<IdCapitulo, { texto: string; tecnico: string | null }> = {
  descobertas: {
    texto:
      "Descoberta é o que aparece quando uma resposta sua é lida ao lado de outra, ou ao lado do que o mercado mostra. Cada uma muda uma decisão concreta de venda.",
    tecnico: null,
  },
  quem: {
    texto:
      "Cliente ideal tem duas camadas: para quem você vende, seja uma empresa ou uma família num certo momento da vida, e a pessoa que decide a compra. Acertar só a pessoa faz você convencer quem nunca vai comprar.",
    tecnico: "No marketing, isso se chama perfil de cliente ideal e persona.",
  },
  pensa: {
    texto:
      "As pessoas compram a partir do que acreditam, do que temem e do que desejam. Mensagem que bate de frente com uma crença não é ouvida; mensagem que nomeia o medo ganha confiança.",
    tecnico: null,
  },
  quer: {
    texto:
      "Todo cliente contrata uma solução para três trabalhos ao mesmo tempo: um prático, um de como quer ser visto e um de como quer se sentir. O prático justifica a compra; os outros dois costumam decidir.",
    tecnico: "No marketing, isso se chama trabalho a ser feito.",
  },
  forcas: {
    texto:
      "Toda compra é uma balança: de um lado, o incômodo com o jeito atual e a atração pelo novo; do outro, o medo da mudança e o conforto do costume. Enquanto o lado que segura pesar mais, ninguém compra, por melhor que seja a oferta.",
    tecnico: "As forças da troca, no método de Bob Moesta e Chris Spiek.",
  },
  decide: {
    texto:
      "Toda compra tem um caminho: o primeiro incômodo, um tempo só observando, um fato que faz agir, a busca e a escolha. Saber em que ponto o cliente está diz o que falar e mostra onde você perde gente.",
    tecnico: "O caminho vem do método de Bob Moesta e Chris Spiek; o mapa compara as alternativas reais, como ensina April Dunford.",
  },
  onde: {
    texto:
      "Cliente ideal sem endereço não vende. Aqui estão os lugares onde ele já cruza com você, onde se informa, onde compara e quem ele escuta, do mais perto ao mais longe.",
    tecnico: null,
  },
  sabe: {
    texto:
      "Nem todo cliente está no mesmo ponto. Falar de preço com quem ainda não sente o problema afasta, e explicar o problema para quem já quer comprar faz perder a venda: cada degrau pede uma mensagem.",
    tecnico: "Os cinco degraus vêm de Eugene Schwartz, publicitário americano.",
  },
  mensagem: {
    texto:
      "Mensagem tem três partes: a promessa, as provas que a sustentam e a resposta pronta para cada dúvida. A promessa fala do que o cliente quer; a prova é algo que ele consegue ver.",
    tecnico: null,
  },
  nao: {
    texto:
      "Saber para quem não vender economiza anúncio, tempo e retrabalho. Um cliente errado, mesmo satisfeito, não volta a comprar nem indica quem compraria.",
    tecnico: null,
  },
  apostas: {
    texto:
      "Uma primeira versão de cliente ideal é um conjunto de apostas bem fundamentadas. Cada uma vira fato com uma checagem simples: um número que você já tem ou uma conversa curta com quem já comprou.",
    tecnico: null,
  },
  semana: {
    texto: "Estudo que não vira ação é enfeite. Estas ações, nesta ordem, confirmam as apostas mais caras e já mexem na venda.",
    tecnico: null,
  },
};

export const ROTULOS_ORIGEM: Record<TipoOrigem, string> = {
  disse: "você disse",
  pesquisa: "pesquisa",
  leitura: "leitura do especialista",
  hipotese: "hipótese do especialista",
};

/** Legenda das marcas, na abertura. */
export const LEGENDA_ORIGEM: Record<TipoOrigem, string> = {
  disse: "resposta sua no dossiê ou na conversa",
  pesquisa: "página pública, com link",
  leitura: "conclusão tirada das evidências",
  hipotese: "aposta, com a razão ao lado",
};

/** Título da coluna do perfil, por tipo de cliente. */
export const ROTULOS_PERFIL: Record<TipoCliente, string> = {
  empresa: "A empresa",
  pessoa: "A situação",
  "os-dois": "O perfil",
};

export const ROTULOS_FUNCAO: Record<FuncaoCompra, string> = { decide: "decide", influencia: "influencia", usa: "usa" };

export const ROTULOS_ESTADO: Record<EstadoCaminho, string> = {
  atua: "onde você atua hoje",
  fora: "fora do seu alcance",
  vazamento: "onde você perde gente",
};

export const ROTULOS_ZONA: Record<TipoZona, string> = {
  cruza: "Já cruza com você",
  informa: "Onde se informa",
  compara: "Onde aprende e compara",
  escuta: "Quem escuta",
};

/** Traços de proximidade de cada zona (de 4 a 1). */
export const PROXIMIDADE_ZONA: Record<TipoZona, number> = { cruza: 4, informa: 3, compara: 2, escuta: 1 };

export const ROTULOS_DEGRAU: Record<Degrau["nivel"], string> = {
  1: "Não percebe o problema",
  2: "Sente a dor, não conhece a saída",
  3: "Conhece saídas, não escolheu",
  4: "Conhece você, não decidiu",
  5: "Pronto para comprar",
};

export const ROTULOS_TEMPO: Record<TempoAposta, string> = {
  "1-hora": "1 hora",
  "1-dia": "1 dia",
  "1-semana": "1 semana",
  "2-semanas": "2 semanas",
  "1-mes": "1 mês",
};

export const ROTULOS_TRABALHO = { pratico: "O prático", ser_visto: "Ser visto", sentir: "Sentir" } as const;

// ---------------------------------------------------------------------------
// Extração
// ---------------------------------------------------------------------------

const ABRE_CERCA = "```persona-dados";

/**
 * O JSON do PRIMEIRO bloco ```persona-dados do markdown, ou null (sem bloco, sem fechamento, ou com mais de
 * 64 KB). Feito com indexOf, não com regex: o tempo é linear mesmo com muitas cercas abertas.
 */
export function extrairBlocoEstudo(texto: string): string | null {
  if (typeof texto !== "string") return null;
  const ini = texto.indexOf(ABRE_CERCA);
  if (ini < 0) return null;
  // o nome da cerca precisa estar no começo da linha
  if (ini > 0 && texto[ini - 1] !== "\n") return null;
  const fimLinha = texto.indexOf("\n", ini);
  if (fimLinha < 0) return null;
  const resto = texto.slice(ini + ABRE_CERCA.length, fimLinha).replace(/\r$/, "");
  if (!/^[ \t]*$/.test(resto)) return null;
  const corpoIni = fimLinha + 1;
  // fechamento: uma linha só com espaços e ```
  let i = corpoIni;
  while (i <= texto.length) {
    let fim = texto.indexOf("\n", i);
    if (fim < 0) fim = texto.length;
    const linha = texto.slice(i, fim).replace(/\r$/, "");
    if (/^[ \t]*```[ \t]*$/.test(linha)) {
      let corpo = texto.slice(corpoIni, Math.max(corpoIni, i - 1));
      if (corpo.endsWith("\r")) corpo = corpo.slice(0, -1);
      if (new TextEncoder().encode(corpo).length > TETO_BLOCO_ESTUDO_BYTES) return null;
      return corpo;
    }
    if (fim >= texto.length) break;
    i = fim + 1;
  }
  return null;
}

/** O markdown sem a seção "## Dados para o sistema" (até o próximo título ## fora de bloco cercado). */
export function textoSemDados(texto: string): string {
  if (typeof texto !== "string") return "";
  const linhas = texto.split("\n");
  const saida: string[] = [];
  let dentro = false;
  let cerca = false;
  for (const linha of linhas) {
    const l = linha.replace(/\r$/, "");
    if (dentro) {
      if (/^[ \t]*```/.test(l)) cerca = !cerca;
      if (!cerca && /^##\s/.test(l) && !/^##\s+Dados para o sistema\s*$/.test(l)) {
        dentro = false;
        saida.push(linha);
      }
      continue;
    }
    if (/^##\s+Dados para o sistema\s*$/.test(l)) {
      dentro = true;
      cerca = false;
      continue;
    }
    saida.push(linha);
  }
  return saida.join("\n").replace(/\n{3,}$/, "\n\n");
}

// ---------------------------------------------------------------------------
// Validação (seção 3 do contrato)
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const emLista = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === "string" && (lista as readonly string[]).includes(v);
const inteiro = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

/** Texto≤N: string com algo além de espaço, sem caractere de controle, até N pontos de código. */
function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string" || v.trim() === "" || RE_CONTROLE.test(v)) return null;
  // conta pontos de código sem montar array para string enorme
  if (v.length > max * 2) return null;
  return [...v].length <= max ? v : null;
}

/** Campo opcional: ausente (ou null) = null; presente e inválido = INVALIDO (derruba quem o contém). */
const INVALIDO = Symbol("invalido");
function opcional<T>(v: unknown, ler: (v: unknown) => T | null): T | null | typeof INVALIDO {
  if (v === undefined || v === null) return null;
  const r = ler(v);
  return r === null ? INVALIDO : r;
}

/** Lista com teto: o começo até o teto, depois os itens válidos. Não é lista = vazia. */
function lista<T>(v: unknown, max: number, ler: (v: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const saida: T[] = [];
  for (const item of v.slice(0, max)) {
    const r = ler(item);
    if (r !== null) saida.push(r);
  }
  return saida;
}

const ehData = (v: unknown): v is string => typeof v === "string" && RE_DATA.test(v);

/** Leitor ligado às fontes válidas do bloco (para conferir cada `[n]`). */
function leitores(fontesValidas: Set<number>) {
  function refValida(r: unknown, tipo: TipoOrigem): r is string {
    if (typeof r !== "string") return false;
    const pesq = RE_REF_PESQUISA.exec(r);
    if (pesq) return tipo !== "disse" && fontesValidas.has(Number(pesq[1]));
    const dossieOuRelato = RE_REF_DOSSIE.test(r) || RE_REF_RELATO.test(r);
    return dossieOuRelato && tipo !== "pesquisa";
  }

  function refs(v: unknown, tipo: TipoOrigem, max: number): string[] | null {
    if (!Array.isArray(v) || v.length < 1 || v.length > max) return null;
    return v.every((r) => refValida(r, tipo)) ? (v as string[]).slice() : null;
  }

  function origem(v: unknown): Origem | null {
    if (!ehObjeto(v) || !emLista(TIPOS_ORIGEM, v.tipo)) return null;
    if (v.tipo === "hipotese") {
      if (v.refs !== undefined && !(Array.isArray(v.refs) && v.refs.length === 0)) return null;
      const razao = texto(v.razao, 200);
      return razao === null ? null : { tipo: "hipotese", razao };
    }
    const r = refs(v.refs, v.tipo, 8);
    return r === null ? null : { tipo: v.tipo, refs: r };
  }

  function afirmacao(max: number) {
    return (v: unknown): Afirmacao | null => {
      if (!ehObjeto(v)) return null;
      const t = texto(v.texto, max);
      const o = origem(v.origem);
      return t === null || o === null ? null : { texto: t, origem: o };
    };
  }

  function evidencia(v: unknown): Evidencia | null {
    if (!ehObjeto(v) || (v.tipo !== "disse" && v.tipo !== "pesquisa")) return null;
    const r = refs(v.refs, v.tipo, 4);
    const t = texto(v.texto, 240);
    return r === null || t === null ? null : { tipo: v.tipo, refs: r, texto: t };
  }

  const evidencias = (v: unknown, max = 8) => lista(v, max, evidencia);

  return { origem, afirmacao, evidencia, evidencias };
}

type Leitores = ReturnType<typeof leitores>;

function lerFontes(v: unknown): Fontes | null {
  if (!ehObjeto(v) || !Array.isArray(v.itens)) return null;
  const vistos = new Set<number>();
  const itens: Fonte[] = [];
  for (const f of v.itens) {
    if (itens.length >= 50) break;
    if (!ehObjeto(f)) continue;
    const n = inteiro(f.n, 1, 999);
    const titulo = texto(f.titulo, 160);
    const url = typeof f.url === "string" && RE_URL.test(f.url) ? f.url : null;
    if (n === null || vistos.has(n) || titulo === null || url === null || !ehData(f.data_acesso)) continue;
    vistos.add(n);
    itens.push({ n, titulo, url, data_acesso: f.data_acesso });
  }
  itens.sort((a, b) => a.n - b.n);
  return {
    busca_disponivel: v.busca_disponivel === true,
    data_acesso: ehData(v.data_acesso) ? v.data_acesso : null,
    itens,
    nao_achado: lista(v.nao_achado, 5, (x) => texto(x, 300)),
  };
}

function lerVersao(v: unknown): Versao | null {
  if (!ehObjeto(v)) return null;
  const numero = typeof v.numero === "string" && RE_NUMERO_VERSAO.test(v.numero) ? v.numero : null;
  const registro = texto(v.registro_dossie, 40);
  const dossieEm = opcional(v.dossie_em, (x) => (ehData(x) ? x : null));
  const perguntas_dossie = inteiro(v.perguntas_dossie, 0, 300);
  const sem_resposta = inteiro(v.sem_resposta, 0, 300);
  const perguntas_dono = inteiro(v.perguntas_dono, 0, 5);
  const trechos = inteiro(v.trechos, 0, 50);
  const paginas = inteiro(v.paginas, 0, 10);
  if (
    numero === null ||
    !ehData(v.data) ||
    registro === null ||
    dossieEm === INVALIDO ||
    perguntas_dossie === null ||
    sem_resposta === null ||
    perguntas_dono === null ||
    trechos === null ||
    paginas === null
  )
    return null;
  return { numero, data: v.data, registro_dossie: registro, dossie_em: dossieEm, perguntas_dossie, sem_resposta, perguntas_dono, trechos, paginas };
}

function lerAbertura(v: unknown, L: Leitores): Abertura | null {
  if (!ehObjeto(v) || !ehObjeto(v.arquetipo)) return null;
  const arq = texto(v.arquetipo.texto, 90);
  const retrato = L.afirmacao(280)(v.retrato);
  const versao = lerVersao(v.versao);
  if (arq === null || retrato === null || versao === null) return null;
  const enfase = texto(v.arquetipo.enfase, 40);
  return { arquetipo: { texto: arq, enfase: enfase !== null && arq.includes(enfase) ? enfase : null }, retrato, versao };
}

/** Sub-bloco opcional de capítulo: inválido some sozinho (null), sem levar o capítulo. */
const subBloco = <T>(v: unknown, ler: (v: unknown) => T | null): T | null => (v === undefined || v === null ? null : ler(v));

function lerDescobertas(v: Obj, L: Leitores): CapDescobertas | null {
  const itens = lista(v.itens, 3, (d): Descoberta | null => {
    if (!ehObjeto(d)) return null;
    const titulo = texto(d.titulo, 200);
    const corpo = texto(d.corpo, 800);
    const porQue = texto(d.por_que_importa, 400);
    const oQue = texto(d.o_que_fazer, 400);
    const origem = L.origem(d.origem);
    const evidencias = L.evidencias(d.evidencias, 6);
    if (titulo === null || corpo === null || porQue === null || oQue === null || origem === null || evidencias.length === 0) return null;
    return { titulo, corpo, por_que_importa: porQue, o_que_fazer: oQue, origem, evidencias };
  });
  if (itens.length === 0) return null;
  const extra = subBloco(v.extra, (x) => {
    if (!ehObjeto(x)) return null;
    const t = texto(x.texto, 360);
    const origem = L.origem(x.origem);
    if (t === null || origem === null || !emLista(IDS_CAPITULO, x.capitulo) || x.capitulo === "descobertas") return null;
    return { texto: t, capitulo: x.capitulo, origem };
  });
  return { itens, extra };
}

function lerQuem(v: Obj, L: Leitores): CapQuem | null {
  const perfil = lista(v.perfil, 6, L.afirmacao(240));
  const pessoa = lista(v.pessoa, 6, L.afirmacao(240));
  if (perfil.length === 0 && pessoa.length === 0) return null;
  const grupo = subBloco(v.grupo_compra, (g) => {
    if (!ehObjeto(g)) return null;
    const porNivel = [0, 0, 0, 0];
    const papeis = lista(g.papeis, 6, (p): Papel | null => {
      if (!ehObjeto(p)) return null;
      const papel = texto(p.papel, 60);
      const nivel = inteiro(p.nivel, 0, 3) as Papel["nivel"] | null;
      const t = opcional(p.texto, (x) => texto(x, 240));
      const origem = L.origem(p.origem);
      if (papel === null || nivel === null || t === INVALIDO || origem === null || !emLista(FUNCOES_COMPRA, p.funcao)) return null;
      return { papel, funcao: p.funcao, nivel, texto: t, origem };
    }).filter((p) => ++porNivel[p.nivel] <= 2);
    if (papeis.length < 2 || !papeis.some((p) => p.nivel === 0)) return null;
    const nota = opcional(g.nota, L.afirmacao(400));
    if (nota === INVALIDO) return null;
    return { papeis, nota };
  });
  return {
    momento: subBloco(v.momento, L.afirmacao(280)),
    perfil,
    pessoa,
    grupo_compra: grupo,
    evidencias: L.evidencias(v.evidencias),
  };
}

function lerPensa(v: Obj, L: Leitores): CapPensa | null {
  const acredita = lista(v.acredita, 5, L.afirmacao(200));
  const teme = lista(v.teme, 5, L.afirmacao(200));
  const deseja = lista(v.deseja, 5, L.afirmacao(200));
  if (acredita.length + teme.length + deseja.length === 0) return null;
  const espelho = subBloco(v.espelho, (x) => {
    if (!ehObjeto(x)) return null;
    const paragrafos = lista(x.paragrafos, 3, (p) => texto(p, 600));
    const origem = L.origem(x.origem);
    const evidencias = L.evidencias(x.evidencias, 6);
    return paragrafos.length === 0 || origem === null || evidencias.length === 0 ? null : { paragrafos, origem, evidencias };
  });
  return { acredita, teme, deseja, espelho, evidencias: L.evidencias(v.evidencias) };
}

function lerQuer(v: Obj, L: Leitores): CapQuer | null {
  const trabalho = (x: unknown): Trabalho | null => {
    if (!ehObjeto(x)) return null;
    const enunciado = texto(x.enunciado, 240);
    const origem = L.origem(x.origem);
    const pede = texto(x.o_que_pede, 240);
    return enunciado === null || origem === null || pede === null ? null : { enunciado, origem, o_que_pede: pede };
  };
  const pratico = subBloco(v.pratico, trabalho);
  const ser_visto = subBloco(v.ser_visto, trabalho);
  const sentir = subBloco(v.sentir, trabalho);
  if (!pratico && !ser_visto && !sentir) return null;
  return { pratico, ser_visto, sentir, evidencias: L.evidencias(v.evidencias) };
}

function lerForcas(v: Obj, L: Leitores): CapForcas | null {
  if (!emLista(INCLINACOES, v.inclinacao)) return null;
  const peso = (podeAusente: boolean) => (x: unknown): Peso | null => {
    if (!ehObjeto(x)) return null;
    const t = texto(x.texto, 120);
    const p = inteiro(x.peso, 1, 3) as Peso["peso"] | null;
    const origem = L.origem(x.origem);
    const ausente = x.ausente === undefined ? false : x.ausente;
    if (t === null || p === null || origem === null || typeof ausente !== "boolean" || (ausente && !podeAusente)) return null;
    return { texto: t, peso: p, ausente, origem };
  };
  const empurra = lista(v.empurra, 6, peso(true));
  const segura = lista(v.segura, 6, peso(false));
  if (empurra.length === 0 && segura.length === 0) return null;
  return {
    empurra,
    segura,
    inclinacao: v.inclinacao,
    leitura: subBloco(v.leitura, L.afirmacao(400)),
    como_virar: lista(v.como_virar, 3, (x) => {
      if (!ehObjeto(x)) return null;
      const titulo = texto(x.titulo, 60);
      const t = texto(x.texto, 300);
      return titulo === null || t === null ? null : { titulo, texto: t };
    }),
    evidencias: L.evidencias(v.evidencias),
  };
}

function lerPosicao(x: unknown, L: Leitores): Posicao | null {
  if (!ehObjeto(x) || !ehObjeto(x.eixo_x) || !ehObjeto(x.eixo_y)) return null;
  const esq = texto(x.eixo_x.esq, 30);
  const dir = texto(x.eixo_x.dir, 30);
  const baixo = texto(x.eixo_y.baixo, 30);
  const cima = texto(x.eixo_y.cima, 30);
  if (esq === null || dir === null || baixo === null || cima === null) return null;
  const nomes = new Set<string>();
  const pontos = lista(x.pontos, 7, (p): PontoMapa | null => {
    if (!ehObjeto(p)) return null;
    const nome = texto(p.nome, 40);
    const px = inteiro(p.x, 0, 100);
    const py = inteiro(p.y, 0, 100);
    const nosso = p.nosso === undefined ? false : p.nosso;
    const origem = L.origem(p.origem);
    if (nome === null || px === null || py === null || typeof nosso !== "boolean" || origem === null) return null;
    return { nome, x: px, y: py, nosso, origem };
  }).filter((p) => (nomes.has(p.nome) ? false : (nomes.add(p.nome), true)));
  if (pontos.length < 2 || pontos.filter((p) => p.nosso).length !== 1) return null;
  const leitura = L.afirmacao(700)(x.leitura);
  const ressalva = opcional(x.ressalva, (r) => texto(r, 300));
  if (leitura === null || ressalva === INVALIDO) return null;
  return { eixo_x: { esq, dir }, eixo_y: { baixo, cima }, pontos, leitura, ressalva, evidencias: L.evidencias(x.evidencias) };
}

function lerDecide(v: Obj, L: Leitores): CapDecide | null {
  const caminho = subBloco(v.caminho, (c) => {
    if (!ehObjeto(c)) return null;
    const pontos = lista(c.pontos, 8, (p): PontoCaminho | null => {
      if (!ehObjeto(p)) return null;
      const etapa = texto(p.etapa, 40);
      const t = texto(p.texto, 200);
      const alerta = opcional(p.alerta, (a) => texto(a, 200));
      const origem = L.origem(p.origem);
      if (etapa === null || t === null || alerta === INVALIDO || origem === null || !emLista(ESTADOS_CAMINHO, p.estado)) return null;
      if (p.estado === "vazamento" && alerta === null) return null;
      return { etapa, texto: t, estado: p.estado, alerta, origem };
    });
    return pontos.length < 3 ? null : { pontos };
  });
  const posicao = subBloco(v.posicao, (x) => lerPosicao(x, L));
  const criterios = lista(v.criterios, 6, (x): Criterio | null => {
    if (!ehObjeto(x)) return null;
    const termo = texto(x.termo, 30);
    const significado = texto(x.significado, 200);
    const origem = L.origem(x.origem);
    return termo === null || significado === null || origem === null ? null : { termo, significado, origem };
  });
  if (!caminho && !posicao && criterios.length === 0) return null;
  return { caminho, posicao, criterios, evidencias: L.evidencias(v.evidencias) };
}

function lerOnde(v: Obj, L: Leitores): CapOnde | null {
  const vistos = new Set<TipoZona>();
  const zonas = lista(v.zonas, 4, (z): Zona | null => {
    if (!ehObjeto(z) || !emLista(TIPOS_ZONA, z.tipo)) return null;
    const lugares = lista(z.lugares, 5, L.afirmacao(220));
    const chegar = texto(z.como_chegar, 300);
    return lugares.length === 0 || chegar === null ? null : { tipo: z.tipo, lugares, como_chegar: chegar };
  })
    .filter((z) => (vistos.has(z.tipo) ? false : (vistos.add(z.tipo), true)))
    .sort((a, b) => TIPOS_ZONA.indexOf(a.tipo) - TIPOS_ZONA.indexOf(b.tipo));
  if (zonas.length === 0) return null;
  return { zonas, nao_alcancado: subBloco(v.nao_alcancado, (x) => texto(x, 400)), evidencias: L.evidencias(v.evidencias) };
}

function lerSabe(v: Obj, L: Leitores): CapSabe | null {
  if (!Array.isArray(v.degraus) || v.degraus.length !== 5) return null;
  const degraus: Degrau[] = [];
  for (const d of v.degraus) {
    if (!ehObjeto(d)) return null;
    const nivel = inteiro(d.nivel, 1, 5) as Degrau["nivel"] | null;
    const sinal = texto(d.sinal, 160);
    const onde = opcional(d.onde, (x) => texto(x, 140));
    const dizer = texto(d.o_que_dizer, 260);
    if (nivel === null || sinal === null || onde === INVALIDO || dizer === null || degraus.some((x) => x.nivel === nivel)) return null;
    degraus.push({ nivel, sinal, onde, o_que_dizer: dizer });
  }
  degraus.sort((a, b) => a.nivel - b.nivel);
  const foco = inteiro(v.foco, 1, 5) as CapSabe["foco"] | null;
  if (foco === null) return null;
  const leitura = subBloco(v.leitura, (x) => {
    if (!ehObjeto(x)) return null;
    const paragrafos = lista(x.paragrafos, 3, (p) => texto(p, 400));
    const origem = L.origem(x.origem);
    return paragrafos.length === 0 || origem === null ? null : { paragrafos, origem };
  });
  return { degraus, foco, leitura, evidencias: L.evidencias(v.evidencias) };
}

function lerMensagem(v: Obj, L: Leitores): CapMensagem | null {
  const promessa_sugerida = subBloco(v.promessa_sugerida, (x) => {
    if (!ehObjeto(x)) return null;
    const t = texto(x.texto, 160);
    const origem = L.origem(x.origem);
    if (t === null || origem === null) return null;
    return { texto: t, motivos: lista(x.motivos, 4, (m) => texto(m, 200)), origem, evidencias: L.evidencias(x.evidencias, 6) };
  });
  const risco = subBloco(v.risco, (x) => {
    if (!ehObjeto(x)) return null;
    const titulo = texto(x.titulo, 160);
    const t = texto(x.texto, 700);
    const origem = L.origem(x.origem);
    const teste = opcional(x.teste, (s) => texto(s, 300));
    if (titulo === null || t === null || origem === null || teste === INVALIDO) return null;
    return { titulo, texto: t, origem, teste };
  });
  const provas_faltam = lista(v.provas_faltam, 6, (x) => {
    if (!ehObjeto(x)) return null;
    const t = texto(x.texto, 220);
    const origem = opcional(x.origem, L.origem);
    return t === null || origem === INVALIDO ? null : { texto: t, origem };
  });
  const duvidas = lista(v.duvidas, 8, (x): Duvida | null => {
    if (!ehObjeto(x)) return null;
    const duvida = texto(x.duvida, 160);
    const origemDuvida = L.origem(x.origem_duvida);
    const resposta = texto(x.resposta, 400);
    const origemResposta = L.origem(x.origem_resposta);
    const pendencia = opcional(x.pendencia, (p) => texto(p, 200));
    if (duvida === null || origemDuvida === null || resposta === null || origemResposta === null || pendencia === INVALIDO) return null;
    return { duvida, origem_duvida: origemDuvida, resposta, origem_resposta: origemResposta, pendencia };
  });
  const promessa_hoje = subBloco(v.promessa_hoje, L.afirmacao(280));
  const provas_tem = lista(v.provas_tem, 6, L.afirmacao(220));
  if (!promessa_hoje && !promessa_sugerida && provas_tem.length + provas_faltam.length + duvidas.length === 0) return null;
  return {
    promessa_hoje,
    promessa_sugerida,
    risco,
    onde_quando: subBloco(v.onde_quando, L.afirmacao(300)),
    provas_tem,
    provas_faltam,
    duvidas,
    evidencias: L.evidencias(v.evidencias),
  };
}

function lerNao(v: Obj, L: Leitores): CapNao | null {
  const perfis = lista(v.perfis, 6, (x) => {
    if (!ehObjeto(x)) return null;
    const perfil = texto(x.perfil, 120);
    const porque = texto(x.porque, 300);
    const origem = L.origem(x.origem);
    return perfil === null || porque === null || origem === null ? null : { perfil, porque, origem };
  });
  return perfis.length === 0 ? null : { perfis };
}

function lerApostas(v: Obj): CapApostas | null {
  const itens = lista(v.itens, 10, (x): Aposta | null => {
    if (!ehObjeto(x)) return null;
    const aposta = texto(x.aposta, 200);
    const porQue = texto(x.por_que, 240);
    const confirmar = texto(x.como_confirmar, 240);
    if (aposta === null || porQue === null || confirmar === null || !emLista(TEMPOS_APOSTA, x.tempo)) return null;
    return { aposta, por_que: porQue, como_confirmar: confirmar, tempo: x.tempo };
  });
  if (itens.length === 0) return null;
  const roteiro = subBloco(v.roteiro, (x) => {
    if (!ehObjeto(x)) return null;
    const conversas = inteiro(x.conversas, 3, 10);
    const minutos = inteiro(x.minutos, 10, 60);
    const comQuem = texto(x.com_quem, 300);
    const perguntas = lista(x.perguntas, 5, (p) => texto(p, 200));
    if (conversas === null || minutos === null || comQuem === null || perguntas.length < 3) return null;
    return { conversas, minutos, com_quem: comQuem, perguntas };
  });
  return { itens, roteiro };
}

function lerSemana(v: Obj, L: Leitores): CapSemana | null {
  const acoes = lista(v.acoes, 5, (x) => {
    if (!ehObjeto(x)) return null;
    const acao = texto(x.acao, 240);
    const resolve = texto(x.resolve, 200);
    const origem = opcional(x.origem, L.origem);
    return acao === null || resolve === null || origem === INVALIDO ? null : { acao, resolve, origem };
  });
  return acoes.length === 0 ? null : { acoes };
}

/** Capítulo que não é objeto sai; o leitor decide se o que sobrou tem conteúdo. */
function capitulo<T>(v: unknown, ler: (v: Obj) => T | null): T | null {
  return ehObjeto(v) ? ler(v) : null;
}

/** Seção 3 do contrato. null = bloco inválido (a tela cai no leitor antigo). Nunca lança. */
export function validarEstudo(bruto: unknown): EstudoPersona | null {
  try {
    if (!ehObjeto(bruto) || bruto.versao !== VERSAO_ESTUDO || bruto.documento !== "persona") return null;
    const empresa = texto(bruto.empresa, 80);
    if (empresa === null || !emLista(TIPOS_CLIENTE, bruto.tipo_cliente)) return null;
    const fontes = lerFontes(bruto.fontes);
    if (fontes === null) return null;
    const L = leitores(new Set(fontes.itens.map((f) => f.n)));
    const abertura = lerAbertura(bruto.abertura, L);
    if (abertura === null) return null;
    const e: EstudoPersona = {
      versao: VERSAO_ESTUDO,
      documento: "persona",
      empresa,
      oferta: subBloco(bruto.oferta, L.afirmacao(160)),
      tipo_cliente: bruto.tipo_cliente,
      onde_atende: subBloco(bruto.onde_atende, L.afirmacao(80)),
      abertura,
      descobertas: capitulo(bruto.descobertas, (v) => lerDescobertas(v, L)),
      quem: capitulo(bruto.quem, (v) => lerQuem(v, L)),
      pensa: capitulo(bruto.pensa, (v) => lerPensa(v, L)),
      quer: capitulo(bruto.quer, (v) => lerQuer(v, L)),
      forcas: capitulo(bruto.forcas, (v) => lerForcas(v, L)),
      decide: capitulo(bruto.decide, (v) => lerDecide(v, L)),
      onde: capitulo(bruto.onde, (v) => lerOnde(v, L)),
      sabe: capitulo(bruto.sabe, (v) => lerSabe(v, L)),
      mensagem: capitulo(bruto.mensagem, (v) => lerMensagem(v, L)),
      nao: capitulo(bruto.nao, (v) => lerNao(v, L)),
      apostas: capitulo(bruto.apostas, lerApostas),
      semana: capitulo(bruto.semana, (v) => lerSemana(v, L)),
      fontes,
    };
    return capitulosDoEstudo(e).length === 0 ? null : e;
  } catch {
    return null;
  }
}

/** Extrai, faz o parse e valida. null = sem bloco ou bloco inválido. Nunca lança. */
export function lerEstudo(texto: string): EstudoPersona | null {
  try {
    if (typeof texto !== "string") return null;
    if (texto.length > TETO_DOCUMENTO_BYTES || new TextEncoder().encode(texto).length > TETO_DOCUMENTO_BYTES) return null;
    const bloco = extrairBlocoEstudo(texto);
    if (bloco === null) return null;
    return validarEstudo(JSON.parse(bloco));
  } catch {
    return null;
  }
}

/** Os capítulos que aparecem, na ordem fixa. */
export function capitulosDoEstudo(e: EstudoPersona): IdCapitulo[] {
  return IDS_CAPITULO.filter((id) => e[id] !== null);
}

// ---------------------------------------------------------------------------
// Formatos da tela
// ---------------------------------------------------------------------------

const NUMERAIS = ["", "Uma", "Duas", "Três"] as const;

export function tituloDoCapitulo(e: EstudoPersona, id: IdCapitulo): string {
  if (id !== "descobertas") return TITULOS_CAPITULO[id];
  const n = e.descobertas?.itens.length ?? 0;
  return n === 1 ? "Uma coisa que você ainda não tinha visto" : `${NUMERAIS[n] ?? n} coisas que você ainda não tinha visto`;
}

/** "2026-11-18" vira "18/11/2026". */
export function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function subtituloDaAbertura(e: EstudoPersona): string {
  const base =
    "Quem é o seu cliente ideal, como pensa, onde encontrá-lo e o que dizer a ele. Não é um resumo das suas respostas: é o que elas significam quando cruzadas entre si";
  return comPesquisa(e) ? `${base} e com o que o mercado mostra.` : `${base}.`;
}

export const comPesquisa = (e: EstudoPersona) => e.fontes.busca_disponivel && e.fontes.itens.length > 0;

export function notaDeVersao(e: EstudoPersona): string {
  const v = e.abertura.versao;
  const qual = v.numero.startsWith("1.") ? "Primeira versão" : `Versão ${v.numero}`;
  const partes = [`as ${plural(v.perguntas_dossie, "pergunta", "perguntas")} do seu dossiê`];
  if (v.perguntas_dono > 0) partes.push(`${plural(v.perguntas_dono, "pergunta", "perguntas")} a você`);
  if (v.trechos > 0) partes.push(`${plural(v.trechos, "trecho", "trechos")} de ${plural(v.paginas, "página pública", "páginas públicas")}`);
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
  const fim = e.apostas ? ": o que é aposta está marcado, e o capítulo Apostas mostra como confirmar cada uma." : ".";
  return `${qual}, de ${dataBR(v.data)}, feita com ${lista}. Nenhum cliente foi ouvido ainda${fim}`;
}

/** Junta com vírgula e "e": ["a","b","c"] vira "a, b e c". */
export function juntarComE(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** Referências de "De onde tirei" que não são de pesquisa: `B3 e B4`, `conversa de 18/11`. */
export function rotuloDasRefs(refs: Ref[]): string {
  return juntarComE(
    refs.map((r) => {
      if (RE_REF_RELATO.test(r)) {
        const [, m, d] = r.slice("relato ".length).split("-");
        return `conversa de ${d}/${m}`;
      }
      return r;
    }),
  );
}

/** Número de uma ref `[n]`, ou null. */
export function numeroDaRef(r: Ref): number | null {
  const m = RE_REF_PESQUISA.exec(r);
  return m ? Number(m[1]) : null;
}

export type GrupoFonte = { numeros: number[]; titulo: string; url: string };

/** Fontes com a mesma URL viram uma linha só, com os números juntos, na ordem do primeiro número. */
export function fontesAgrupadas(fontes: Fontes): GrupoFonte[] {
  const porUrl = new Map<string, GrupoFonte>();
  for (const f of fontes.itens) {
    const g = porUrl.get(f.url);
    if (g) g.numeros.push(f.n);
    else porUrl.set(f.url, { numeros: [f.n], titulo: f.titulo, url: f.url });
  }
  return [...porUrl.values()];
}

/** [2, 3] fica "[2, 3]"; três ou mais seguidos viram faixa: "[7 a 9]". */
export function formatarNumerosFonte(numeros: number[]): string {
  const ns = [...numeros].sort((a, b) => a - b);
  const partes: string[] = [];
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    if (j - i >= 2) partes.push(`${ns[i]} a ${ns[j]}`);
    else for (let k = i; k <= j; k++) partes.push(String(ns[k]));
    i = j + 1;
  }
  return `[${partes.join(", ")}]`;
}

/** Linha de base do rodapé de fontes. */
export function baseDasFontes(e: EstudoPersona): string {
  const v = e.abertura.versao;
  const dossie = `${v.dossie_em ? `Dossiê respondido em ${dataBR(v.dossie_em)}` : "Dossiê"}: ${plural(v.perguntas_dossie, "pergunta", "perguntas")}, ${v.sem_resposta} sem resposta.`;
  if (!comPesquisa(e)) return `Desta vez não houve pesquisa na internet: o estudo usa só o dossiê e as suas respostas. ${dossie}`;
  const acesso = e.fontes.data_acesso ? `Páginas acessadas em ${dataBR(e.fontes.data_acesso)}. ` : "";
  return `${acesso}${dossie}`;
}
