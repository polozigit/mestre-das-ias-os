/**
 * Persona na tela Marca: lê o próprio markdown do documento "Cliente ideal e persona" e devolve uma
 * estrutura para a tela desenhar em blocos. Código PURO (sem React, sem rede), para rodar no node --test.
 *
 * O documento já é estruturado (seções `## 1..`, linhas `- Rótulo: texto (origem)` e tabelas), então não
 * há bloco de dados novo: a leitura é tolerante e só reconhece o que conhece. O que fugir do molde vai
 * para `extras` ou fica de fora, mas a função NUNCA lança. Quando o texto não tem nem a seção "Cliente
 * ideal" nem uma seção "Persona...", devolve null e a tela mostra o documento em texto, como antes.
 *
 * Tetos (a tela é a última fronteira antes de pôr o texto na página): texto de até 200 KB, listas de até
 * 40 itens, texto de item de até 1.200 caracteres (corta com reticências).
 */

import { dividirSecoes, normalizarTitulo } from "./marca-dados.ts";

// ---------------------------------------------------------------------------
// Tipos, listas e rótulos que a tela usa
// ---------------------------------------------------------------------------

export const TIPOS_ORIGEM = ["dossie", "relato", "pesquisa", "clientes", "material", "analise", "hipotese", "nao-consta", "proposta"] as const;
export type TipoOrigem = (typeof TIPOS_ORIGEM)[number];

/** Selos (rótulos para o leigo) de cada origem. */
export const ROTULOS_ORIGEM: Record<TipoOrigem, string> = {
  dossie: "Dossiê",
  relato: "Você contou",
  pesquisa: "Pesquisa",
  clientes: "Lista de clientes",
  material: "Material seu",
  analise: "Análise do especialista",
  hipotese: "Hipótese",
  "nao-consta": "Não sabemos",
  proposta: "Proposta do time",
};

/** Origem de um item: o parêntese do fim da linha (ou da célula). `detalhe` é o resto da marca, quando há. */
export type OrigemPersona = { tipo: TipoOrigem; detalhe: string | null };
/** Texto sem as marcas e sem o ponto final solto, mais as origens na ordem em que apareciam. */
export type ItemPersona = { texto: string; origens: OrigemPersona[] };

export type ObjetivoPersona = ItemPersona & {
  /** Exatamente 3 partes separadas por `;`: prático, como quer ser visto, como quer se sentir. Senão null. */
  partes: [string, string, string] | null;
};
export type LinguagemPersona = ItemPersona & {
  /** Frases entre aspas (`"..."` ou `“...”`). */
  citacoes: string[];
};

export type CamposPersona = {
  arquetipo: ItemPersona | null;
  contexto: ItemPersona | null;
  objetivo: ObjetivoPersona | null;
  dores: ItemPersona | null;
  resultado: ItemPersona | null;
  gatilho: ItemPersona | null;
  objecoes: ItemPersona | null;
  habito: ItemPersona | null;
  alternativas: ItemPersona | null;
  criterios: ItemPersona | null;
  jornada: ItemPersona | null;
  linguagem: LinguagemPersona | null;
};
export type ChaveCampo = keyof CamposPersona;

/** Rótulos para leigo, sem jargão. */
export const ROTULOS_CAMPOS: Record<ChaveCampo, string> = {
  arquetipo: "Nome do arquétipo",
  contexto: "Contexto",
  objetivo: "O que quer alcançar",
  dores: "O que incomoda hoje",
  resultado: "O que ele espera ganhar",
  gatilho: "O que acontece no dia em que decide",
  objecoes: "Dúvidas e medos",
  habito: "Costume que puxa de volta",
  alternativas: "O que faria sem a empresa",
  criterios: "O que compara",
  jornada: "Caminho até a compra",
  linguagem: "Nas palavras do cliente",
};

export type ExtraPersona = { rotulo: string; item: ItemPersona };
export type PerfilPersona = { nome: string | null; campos: CamposPersona; extras: ExtraPersona[] };

export type NivelConsciencia = 1 | 2 | 3 | 4 | 5;
/** Os cinco níveis, como o documento os descreve no cabeçalho. */
export const ROTULOS_NIVEL: Record<NivelConsciencia, string> = {
  1: "não percebe o problema",
  2: "sente a dor, mas não sabe que existe solução",
  3: "conhece soluções, mas não escolheu",
  4: "conhece a empresa, mas ainda não se decidiu",
  5: "pronto para comprar",
};
export type SegmentoConsciencia = {
  segmento: string;
  /** 1 a 5 pelo número no começo da célula; senão null. */
  nivel: NivelConsciencia | null;
  rotuloNivel: string | null;
  sinal: ItemPersona;
  comunicacao: ItemPersona;
};
export type LacunaPersona = { lacuna: string; pergunta: string; quem: string };
export type FontePersona = { n: number; titulo: string; url: string | null; acessado: string | null };

export type CabecalhoPersona = {
  empresa: string | null;
  estado: string | null;
  versao: string | null;
  origemPersona: string | null;
  fontesUsadas: string | null;
  /** Linha `- Oferta em foco: ...`, sem a marca de origem. */
  ofertaEmFoco: string | null;
};

/** Uma linha da tabela "Descobertas": a conclusão, o que o dono disse, o que o mercado mostra e a ação. */
export type DescobertaPersona = {
  descoberta: ItemPersona;
  voceDisse: ItemPersona;
  mercadoMostra: ItemPersona;
  oQueFazer: ItemPersona;
};
export type DuvidaPersona = { duvida: ItemPersona; resposta: ItemPersona };
/** Seção "Plano de mensagem". Rótulo fora do molde vai para `extras`. */
export type PlanoPersona = {
  promessa: ItemPersona | null;
  provas: ItemPersona | null;
  ondeQuando: ItemPersona | null;
  duvidas: DuvidaPersona[];
  extras: ExtraPersona[];
};

export type PlacarPersona = { respondido: number; pesquisa: number; analise: number; hipotese: number; naoSabemos: number };

export type PersonaCompleta = {
  cabecalho: CabecalhoPersona;
  clienteIdeal: ItemPersona[];
  persona: PerfilPersona | null;
  consciencia: SegmentoConsciencia[];
  /** Vazia quando o documento não tem a seção "Descobertas". */
  descobertas: DescobertaPersona[];
  /** null quando o documento não tem a seção "Plano de mensagem". */
  plano: PlanoPersona | null;
  naoECliente: ItemPersona[];
  lacunas: LacunaPersona[];
  fontes: FontePersona[];
  /** Só documento antigo; o molde novo não tem "Como validar". */
  validar: string | null;
  placar: PlacarPersona;
};

export const IDS_DIVISOES = [
  "descobertas", "retrato", "cliente", "forcas", "escolha", "palavras", "consciencia", "plano", "nao-cliente", "falta", "fontes",
] as const;
export type IdDivisao = (typeof IDS_DIVISOES)[number];
/** Ordem fixa dos blocos, com o rótulo curto para a navegação. */
export const DIVISOES_PERSONA: ReadonlyArray<{ id: IdDivisao; rotulo: string }> = [
  { id: "descobertas", rotulo: "Descobertas" },
  { id: "retrato", rotulo: "Retrato" },
  { id: "cliente", rotulo: "Cliente ideal" },
  { id: "forcas", rotulo: "Compra e trava" },
  { id: "escolha", rotulo: "Como escolhe" },
  { id: "palavras", rotulo: "Palavras do cliente" },
  { id: "consciencia", rotulo: "O quanto já sabe" },
  { id: "plano", rotulo: "O que fazer" },
  { id: "nao-cliente", rotulo: "Quem não é" },
  { id: "falta", rotulo: "O que falta saber" },
  { id: "fontes", rotulo: "Fontes" },
];

// ---------------------------------------------------------------------------
// Tetos
// ---------------------------------------------------------------------------

export const TETO_TEXTO_BYTES = 200 * 1024;
export const MAX_ITENS = 40;
export const MAX_TEXTO_ITEM = 1200;
const MAX_MARCAS = 4;
const MAX_ROTULO = 80;
const MAX_VALIDAR = 4000;

// ---------------------------------------------------------------------------
// Texto e marcas de origem
// ---------------------------------------------------------------------------

/** Sem acento e sem caixa, para casar rótulos e marcas. */
function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tira do fim (e, se pedido, do começo) os caracteres do conjunto, num laço só: sem regex com retrocesso. */
function aparar(texto: string, caracteres: string, comeco = false): string {
  let ini = 0;
  let fim = texto.length;
  while (fim > 0 && caracteres.includes(texto[fim - 1])) fim--;
  if (comeco) while (ini < fim && caracteres.includes(texto[ini])) ini++;
  return texto.slice(ini, fim);
}
const ESPACOS = " \t\r\n\u00a0\u2028\u2029\ufeff";
const FIM_DE_ITEM = `${ESPACOS}.`;

function cortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}

/** Dentro do parêntese: reconhece a marca ou devolve null (parêntese comum fica no texto). */
function lerMarca(conteudo: string): OrigemPersona | null {
  const original = conteudo.trim();
  const c = chave(original);
  const depoisDaPrimeiraPalavra = () => original.replace(/^\S+\s*/, "").trim() || null;
  const depoisDaVirgula = () => {
    const i = original.indexOf(",");
    return i >= 0 ? original.slice(i + 1).trim() || null : null;
  };
  if (/^dossie(\s|$)/.test(c)) return { tipo: "dossie", detalhe: depoisDaPrimeiraPalavra() };
  if (/^relato do dono\b/.test(c)) return { tipo: "relato", detalhe: depoisDaVirgula() };
  if (/^pesquisa\s*\[/.test(c)) return { tipo: "pesquisa", detalhe: depoisDaPrimeiraPalavra() };
  if (/^dados de clientes\b/.test(c)) return { tipo: "clientes", detalhe: depoisDaVirgula() };
  if (/^material do dono\b/.test(c)) return { tipo: "material", detalhe: original.slice("material do dono".length).replace(/^[\s,:;-]+/, "").trim() || null };
  if (/^analise\s*(:|$)/.test(c)) {
    const i = original.indexOf(":");
    return { tipo: "analise", detalhe: i >= 0 ? original.slice(i + 1).trim() || null : null };
  }
  if (/^hipotese\b/.test(c)) return { tipo: "hipotese", detalhe: null };
  if (/^nao consta\b/.test(c)) return { tipo: "nao-consta", detalhe: null };
  if (/^proposta do time\b/.test(c)) return { tipo: "proposta", detalhe: null };
  return null;
}

const RE_MARCA_FIM = /\(([^()]*)\)[\s.;]*$/;

/** Tira as marcas do fim (uma ou mais) e o ponto final solto; corta o texto no teto. */
function lerItem(bruto: string): ItemPersona {
  let resto = bruto.trim();
  const origens: OrigemPersona[] = [];
  for (let i = 0; i < MAX_MARCAS; i++) {
    const m = RE_MARCA_FIM.exec(resto);
    if (!m) break;
    const marca = lerMarca(m[1]);
    if (!marca) break;
    origens.unshift(marca);
    resto = resto.slice(0, m.index).trimEnd();
  }
  const texto = cortar(aparar(resto, FIM_DE_ITEM).trim(), MAX_TEXTO_ITEM);
  return { texto, origens };
}

// ---------------------------------------------------------------------------
// Listas e tabelas
// ---------------------------------------------------------------------------

/** Itens `- ` ou `* ` da seção; linha recuada logo depois continua o item anterior. */
function itensDeLista(corpo: string): string[] {
  const itens: string[] = [];
  for (const linha of corpo.split(/\r?\n/)) {
    const m = /^\s{0,3}[-*]\s+(.*)$/.exec(linha);
    if (m) {
      itens.push(m[1].trim());
    } else if (/^\s{2,}\S/.test(linha) && itens.length > 0 && !linha.trimStart().startsWith("|")) {
      itens[itens.length - 1] += ` ${linha.trim()}`;
    }
  }
  return itens;
}

function celulas(linha: string): string[] {
  let t = linha.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.replaceAll("\\|", "|").trim());
}

const ehSeparador = (cels: string[]) => cels.length > 0 && cels.every((c) => /^:?-{1,}:?$/.test(c));

/** Linhas de dados da primeira tabela da seção, sem o cabeçalho e sem o separador. */
function linhasDeTabela(corpo: string, primeiraCelulaDoCabecalho: string): string[][] {
  const linhas = corpo
    .split(/\r?\n/)
    .filter((l) => l.trimStart().startsWith("|"))
    .map(celulas);
  const iSep = linhas.findIndex(ehSeparador);
  let dados: string[][];
  let colunas: number | null = null;
  if (iSep >= 1) {
    colunas = linhas[iSep - 1].length;
    dados = linhas.slice(iSep + 1);
  } else {
    dados = linhas.filter((l) => !ehSeparador(l));
    if (dados.length > 0 && chave(dados[0][0] ?? "") === primeiraCelulaDoCabecalho) {
      colunas = dados[0].length;
      dados = dados.slice(1);
    }
  }
  // Linha com número de colunas diferente do cabeçalho está torta: descartar é melhor que pôr texto na coluna errada.
  return dados.filter((l) => !ehSeparador(l) && (colunas === null || l.length === colunas)).slice(0, MAX_ITENS);
}

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------

type ChaveRotulo = Exclude<ChaveCampo, never>;
const ROTULOS_CONHECIDOS: ReadonlyArray<[string, ChaveRotulo]> = [
  ["nome do arquetipo", "arquetipo"],
  ["contexto", "contexto"],
  ["o que quer alcancar", "objetivo"],
  ["o que empurra", "dores"],
  ["o que puxa", "resultado"],
  ["gatilho de compra", "gatilho"],
  ["objecoes e ansiedades", "objecoes"],
  ["habito que segura", "habito"],
  ["alternativas reais", "alternativas"],
  ["criterios de decisao", "criterios"],
  ["jornada e canais", "jornada"],
  ["linguagem do cliente", "linguagem"],
];

function campoDoRotulo(rotulo: string): ChaveRotulo | null {
  const c = normalizarTitulo(rotulo);
  for (const [prefixo, campo] of ROTULOS_CONHECIDOS) if (c === prefixo || c.startsWith(`${prefixo} `) || c.startsWith(`${prefixo}(`)) return campo;
  return null;
}

function partesDoObjetivo(texto: string): [string, string, string] | null {
  const partes = texto.split(";").map((p) => aparar(p.trim(), FIM_DE_ITEM));
  if (partes.length !== 3 || partes.some((p) => p.length === 0)) return null;
  return [partes[0], partes[1], partes[2]];
}

function citacoesDe(texto: string): string[] {
  const saida: string[] = [];
  const re = /"([^"]+)"|“([^”]+)”/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null && saida.length < MAX_ITENS) {
    const t = (m[1] ?? m[2]).trim();
    if (t) saida.push(t);
  }
  return saida;
}

function lerPerfil(titulo: string, corpo: string): PerfilPersona {
  const campos: CamposPersona = {
    arquetipo: null, contexto: null, objetivo: null, dores: null, resultado: null, gatilho: null,
    objecoes: null, habito: null, alternativas: null, criterios: null, jornada: null, linguagem: null,
  };
  const extras: ExtraPersona[] = [];
  for (const bruto of itensDeLista(corpo)) {
    const m = /^([^:/]{1,80}):\s*(.*)$/.exec(bruto);
    const rotulo = m ? m[1].trim() : "Observação";
    const item = lerItem(m ? m[2] : bruto);
    if (item.texto === "") continue;
    const campo = m ? campoDoRotulo(rotulo) : null;
    if (campo === null || campos[campo] !== null) {
      if (extras.length < MAX_ITENS) extras.push({ rotulo: cortar(rotulo, MAX_ROTULO), item });
      continue;
    }
    if (campo === "objetivo") campos.objetivo = { ...item, partes: partesDoObjetivo(item.texto) };
    else if (campo === "linguagem") campos.linguagem = { ...item, citacoes: citacoesDe(item.texto) };
    else campos[campo] = item;
  }
  // O nome só existe depois de um separador ("Persona: Ana", "Persona — Ana"); "Persona principal" não tem nome.
  const nome = /^persona\s*[:\-–—]\s*(.*)$/i.exec(titulo.trim())?.[1].trim() ?? "";
  return { nome: nome === "" ? null : cortar(nome, MAX_ROTULO), campos, extras };
}

function lerConsciencia(corpo: string): SegmentoConsciencia[] {
  const saida: SegmentoConsciencia[] = [];
  for (const l of linhasDeTabela(corpo, "segmento")) {
    const segmento = lerItem(l[0] ?? "").texto;
    if (segmento === "") continue;
    const celulaNivel = (l[1] ?? "").trim();
    const m = /^([1-5])(?!\d)\s*[:.)-]?\s*(.*)$/.exec(celulaNivel);
    const nivel = m ? (Number(m[1]) as NivelConsciencia) : null;
    const rotulo = (m ? m[2] : celulaNivel).trim();
    saida.push({
      segmento,
      nivel,
      rotuloNivel: rotulo === "" ? null : cortar(rotulo, MAX_ROTULO),
      sinal: lerItem(l[2] ?? ""),
      comunicacao: lerItem(l[3] ?? ""),
    });
  }
  return saida;
}

function lerDescobertas(corpo: string): DescobertaPersona[] {
  const saida: DescobertaPersona[] = [];
  for (const l of linhasDeTabela(corpo, "descoberta")) {
    const descoberta = lerItem(l[0] ?? "");
    if (descoberta.texto === "") continue;
    saida.push({ descoberta, voceDisse: lerItem(l[1] ?? ""), mercadoMostra: lerItem(l[2] ?? ""), oQueFazer: lerItem(l[3] ?? "") });
  }
  return saida;
}

const ROTULOS_PLANO: ReadonlyArray<[string, "promessa" | "provas" | "ondeQuando"]> = [
  ["promessa central", "promessa"],
  ["provas", "provas"],
  ["onde e quando falar", "ondeQuando"],
];

function lerPlano(corpo: string): PlanoPersona {
  const plano: PlanoPersona = { promessa: null, provas: null, ondeQuando: null, duvidas: [], extras: [] };
  for (const bruto of itensDeLista(corpo)) {
    const m = /^([^:/]{1,80}):\s*(.*)$/.exec(bruto);
    const rotulo = m ? m[1].trim() : "Observação";
    const item = lerItem(m ? m[2] : bruto);
    if (item.texto === "") continue;
    const c = chave(rotulo);
    const campo = m ? (ROTULOS_PLANO.find(([prefixo]) => c === prefixo || c.startsWith(`${prefixo} `))?.[1] ?? null) : null;
    if (campo === null || plano[campo] !== null) {
      if (plano.extras.length < MAX_ITENS) plano.extras.push({ rotulo: cortar(rotulo, MAX_ROTULO), item });
      continue;
    }
    plano[campo] = item;
  }
  for (const l of linhasDeTabela(corpo, "duvida do cliente")) {
    const duvida = lerItem(l[0] ?? "");
    if (duvida.texto === "") continue;
    plano.duvidas.push({ duvida, resposta: lerItem(l[1] ?? "") });
  }
  return plano;
}

function lerLacunas(corpo: string): LacunaPersona[] {
  const saida: LacunaPersona[] = [];
  for (const l of linhasDeTabela(corpo, "lacuna")) {
    const lacuna = lerItem(l[0] ?? "").texto;
    if (lacuna === "") continue;
    saida.push({ lacuna, pergunta: lerItem(l[1] ?? "").texto, quem: cortar((l[2] ?? "").trim(), MAX_ROTULO) });
  }
  return saida;
}

const RE_ACESSADO = /\bacessad[oa]\s+em\s+(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})\/(\d{4}))/i;

/** Data do "acessado em": ISO (2026-11-01) ou brasileira (01/11/2026), devolvida em ISO. */
function dataAcessado(texto: string): string | null {
  const m = RE_ACESSADO.exec(texto);
  if (!m) return null;
  if (m[1]) return `${m[1]}-${m[2]}-${m[3]}`;
  return `${m[6]}-${m[5].padStart(2, "0")}-${m[4].padStart(2, "0")}`;
}
const RE_URL = /https?:\/\/[^\s)>\]]+/i;
const RE_ESQUEMA_ESTRANHO = /\b(?:javascript|data|vbscript|file|ftp):\S*/gi;

function lerFontes(corpo: string): FontePersona[] {
  const saida: FontePersona[] = [];
  for (const bruto of itensDeLista(corpo)) {
    const m = /^\[(\d{1,3})\]\s*(.*)$/.exec(bruto);
    if (!m) continue;
    let resto = m[2];
    const acessado = dataAcessado(resto);
    resto = resto.replace(/\bacessad[oa]\s+em\s+\S*/i, " ");
    const u = RE_URL.exec(resto);
    const url = u ? u[0].replace(/[.,;]+$/, "") : null;
    // Título: o texto antes do link; se não há, o que vem depois ("https://x — Título"). Esquema estranho sai sempre.
    const limpar = (t: string) => aparar(t.replace(RE_ESQUEMA_ESTRANHO, " "), `${ESPACOS}.(,;:-–—`, true).replace(/\s+/g, " ").trim();
    let titulo = limpar(u ? resto.slice(0, u.index) : resto);
    if (u && titulo === "") titulo = limpar(resto.slice(u.index + u[0].length));
    saida.push({ n: Number(m[1]), titulo: cortar(titulo || url || `Fonte ${m[1]}`, MAX_TEXTO_ITEM), url, acessado });
    if (saida.length >= MAX_ITENS) break;
  }
  return saida;
}

function lerCabecalho(texto: string): CabecalhoPersona {
  const cab: CabecalhoPersona = { empresa: null, estado: null, versao: null, origemPersona: null, fontesUsadas: null, ofertaEmFoco: null };
  for (const linha of texto.split(/\r?\n/)) {
    if (/^##\s/.test(linha)) break;
    const titulo = /^#\s+(\S.*)$/.exec(linha.trimEnd());
    if (titulo && cab.empresa === null) {
      const e = /^Cliente ideal e persona\s*[-–:]\s*(\S.*)$/i.exec(titulo[1]);
      if (e) cab.empresa = cortar(e[1].trim(), MAX_ROTULO);
      continue;
    }
    const campo = /^\s{0,3}[-*]\s+([^:]{1,60}):\s*(.*)$/.exec(linha);
    if (!campo) continue;
    const valor = cortar(campo[2].trim(), MAX_TEXTO_ITEM);
    if (valor === "") continue;
    switch (chave(campo[1])) {
      case "estado": cab.estado ??= valor; break;
      case "versao": cab.versao ??= valor; break;
      case "origem da persona": cab.origemPersona ??= valor; break;
      case "fontes usadas": cab.fontesUsadas ??= valor; break;
      case "oferta em foco": {
        const oferta = lerItem(valor).texto;
        if (oferta !== "") cab.ofertaEmFoco ??= oferta;
        break;
      }
    }
  }
  return cab;
}

// ---------------------------------------------------------------------------
// Placar
// ---------------------------------------------------------------------------

const CATEGORIA: Record<TipoOrigem, keyof PlacarPersona> = {
  dossie: "respondido",
  relato: "respondido",
  material: "respondido",
  pesquisa: "pesquisa",
  clientes: "pesquisa",
  analise: "analise",
  hipotese: "hipotese",
  proposta: "hipotese",
  "nao-consta": "naoSabemos",
};

/** Conta cada item pela PRIMEIRA origem; item sem marca ou sem texto não entra. */
function calcularPlacar(p: Omit<PersonaCompleta, "placar">): PlacarPersona {
  const placar: PlacarPersona = { respondido: 0, pesquisa: 0, analise: 0, hipotese: 0, naoSabemos: 0 };
  const conta = (item: ItemPersona | null) => {
    if (!item || item.texto === "" || item.origens.length === 0) return;
    placar[CATEGORIA[item.origens[0].tipo]]++;
  };
  p.clienteIdeal.forEach(conta);
  if (p.persona) {
    for (const k of Object.keys(p.persona.campos) as ChaveCampo[]) conta(p.persona.campos[k]);
    p.persona.extras.forEach((e) => conta(e.item));
  }
  for (const c of p.consciencia) {
    conta(c.sinal);
    conta(c.comunicacao);
  }
  for (const d of p.descobertas) {
    conta(d.descoberta);
    conta(d.voceDisse);
    conta(d.mercadoMostra);
    conta(d.oQueFazer);
  }
  if (p.plano) {
    conta(p.plano.promessa);
    conta(p.plano.provas);
    conta(p.plano.ondeQuando);
    p.plano.extras.forEach((e) => conta(e.item));
    for (const d of p.plano.duvidas) {
      conta(d.duvida);
      conta(d.resposta);
    }
  }
  p.naoECliente.forEach(conta);
  placar.naoSabemos += p.lacunas.length;
  return placar;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

function itensDaSecao(corpo: string): ItemPersona[] {
  return itensDeLista(corpo)
    .map(lerItem)
    .filter((i) => i.texto !== "")
    .slice(0, MAX_ITENS);
}

/** Lê o documento de persona. Nunca lança; null quando não é persona (ou passa de 200 KB). */
export function lerPersona(texto: string): PersonaCompleta | null {
  try {
    if (typeof texto !== "string") return null;
    if (new TextEncoder().encode(texto).length > TETO_TEXTO_BYTES) return null;
    const secoes = dividirSecoes(texto);
    const secaoCliente = secoes.find((s) => /^cliente ideal(?![a-z])/.test(s.chave) && !s.chave.startsWith("cliente ideal e persona"));
    const secaoPersona = secoes.find((s) => s.chave === "persona" || s.chave.startsWith("persona:") || s.chave.startsWith("persona "));
    if (!secaoCliente && !secaoPersona) return null;

    const doTipo = (prefixo: string) => secoes.find((s) => s.chave.startsWith(prefixo));
    const validar = doTipo("como validar")?.corpo.trim() ?? "";
    const secaoPlano = doTipo("plano de mensagem");
    const parcial: Omit<PersonaCompleta, "placar"> = {
      cabecalho: lerCabecalho(texto),
      clienteIdeal: secaoCliente ? itensDaSecao(secaoCliente.corpo) : [],
      persona: secaoPersona ? lerPerfil(secaoPersona.titulo, secaoPersona.corpo) : null,
      consciencia: lerConsciencia(doTipo("nivel de consciencia")?.corpo ?? ""),
      descobertas: lerDescobertas(doTipo("descobertas")?.corpo ?? ""),
      plano: secaoPlano ? lerPlano(secaoPlano.corpo) : null,
      naoECliente: itensDaSecao(doTipo("quem nao e")?.corpo ?? ""),
      lacunas: lerLacunas(doTipo("o que ainda nao sabemos")?.corpo ?? ""),
      fontes: lerFontes(doTipo("fontes")?.corpo ?? ""),
      validar: validar === "" ? null : cortar(validar, MAX_VALIDAR),
    };
    return { ...parcial, placar: calcularPlacar(parcial) };
  } catch {
    return null;
  }
}

/** Ids dos blocos que têm conteúdo, na ordem fixa de IDS_DIVISOES. */
export function divisoesDaPersona(p: PersonaCompleta): IdDivisao[] {
  const c = p.persona?.campos;
  const tem = (...itens: Array<ItemPersona | null | undefined>) => itens.some((i) => i != null);
  const pl = p.plano;
  const presentes: Record<IdDivisao, boolean> = {
    descobertas: p.descobertas.length > 0,
    retrato: tem(c?.arquetipo, c?.contexto, c?.objetivo),
    cliente: p.clienteIdeal.length > 0,
    forcas: tem(c?.dores, c?.resultado, c?.gatilho, c?.objecoes, c?.habito),
    escolha: tem(c?.alternativas, c?.criterios, c?.jornada),
    palavras: tem(c?.linguagem),
    consciencia: p.consciencia.length > 0,
    plano: pl !== null && (tem(pl.promessa, pl.provas, pl.ondeQuando) || pl.duvidas.length > 0 || pl.extras.length > 0),
    "nao-cliente": p.naoECliente.length > 0,
    falta: p.lacunas.length > 0,
    fontes: p.fontes.length > 0,
  };
  return IDS_DIVISOES.filter((id) => presentes[id]);
}
