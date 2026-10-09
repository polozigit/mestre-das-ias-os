/**
 * Identidade da marca na tela Marca: leitura e validação do bloco ```marca-dados``` dos documentos
 * publicados (identidade-visual, tom-de-voz e logo), divisão do texto em seções `## ` e junção dos três
 * documentos numa só estrutura. Código PURO (sem React, sem rede), pra rodar no node --test.
 *
 * O contrato do bloco nasce no script `marca_dados.py` da skill de identidade (plano
 * specs/2026-10-08-identidade-marca-plano.md, §5). Aqui só se confere a FORMA, de novo, porque o banco
 * guarda texto livre e a tela é a última fronteira antes de pôr o valor num `style` ou numa URL:
 *   - HEX só `^#[0-9A-F]{6}$` (o único valor de cor que vai pra um `style`);
 *   - família de fonte só `^[A-Za-z0-9 ]{1,40}$` (monta o link do Google Fonts e o font-family);
 *   - arquivo de logo só `empresa/marca/...` com extensão de imagem e nunca `..` (é o caminho no bucket).
 * Bloco inválido NUNCA lança: a função devolve null e a tela mostra o documento como texto, como antes.
 */

export const ORIGENS = ["dossie", "persona", "site", "instagram", "apresentacao", "logo", "pesquisa", "proposta", "hipotese"] as const;
export type Origem = (typeof ORIGENS)[number];

export const FUNCOES_COR = ["principal", "apoio", "destaque", "fundo", "texto", "neutro"] as const;
export type FuncaoCor = (typeof FUNCOES_COR)[number];

export const EIXOS_VOZ = ["formal-casual", "serio-engracado", "respeitoso-irreverente", "factual-entusiasmado"] as const;
export type EixoVoz = (typeof EIXOS_VOZ)[number];

export const PAPEIS_LOGO = ["principal", "icone", "claro", "escuro", "svg"] as const;
export type PapelLogo = (typeof PAPEIS_LOGO)[number];

export const USOS_FONTE = ["titulos", "texto", "reserva"] as const;
export type UsoFonte = (typeof USOS_FONTE)[number];

export const TIPOS_MATERIAL = ["site", "instagram", "apresentacao", "logo", "pesquisa"] as const;
export type TipoMaterial = (typeof TIPOS_MATERIAL)[number];

export const RE_HEX = /^#[0-9A-F]{6}$/;
export const RE_FAMILIA = /^[A-Za-z0-9 ]{1,40}$/;
/** Alvo de um material (igual ao RE_ALVO do marca_dados.py): endereço http(s), arquivo do projeto ou @perfil. */
export const RE_ALVO = /^(https?:\/\/\S+|contexto\/fontes-originais\/\S+|@[A-Za-z0-9_.]{1,30})$/;
export const RE_ARQUIVO_LOGO = /^empresa\/marca\/[a-z0-9][a-z0-9/_.-]*\.(png|jpg|jpeg|webp|svg)$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Tetos: o bloco inteiro até 32 KB; listas curtas (o plano fala em até 5 palavras, 6 logos). */
export const TETO_BLOCO_BYTES = 32 * 1024;
export const MAX_LOGOS_ASSINADOS = 6;
const MAX_CORES = 16;
const MAX_PARES = 24;
const MAX_FAMILIAS = 3; // até 2 (títulos e texto) mais a reserva
const MAX_PESOS = 6;
const MAX_PALAVRAS = 5;
const MAX_MATERIAIS = 20;
const MAX_ARQUIVOS = 12;
const MAX_TEXTO = 80;

export type CorMarca = { nome: string; hex: string; funcao: FuncaoCor; origem: Origem | null };
export type ParContraste = { texto: string; fundo: string; razao: number; uso: "texto" | "destaque" };
export type FonteMarca = {
  uso: UsoFonte;
  familia: string;
  pesos: number[];
  fonte: "google" | "sistema" | "outra";
  licenca: "OFL" | "Apache" | "sistema";
  origem: Origem | null;
};
export type MaterialMarca = { n: number; tipo: TipoMaterial; alvo: string; visto_em: string };
export type EscalaVoz = { eixo: EixoVoz; posicao: number; origem: Origem | null };
export type ArquivoLogo = { papel: PapelLogo; arquivo: string };

export type DadosIdentidade = {
  documento: "identidade";
  personalidade: { palavras: string[]; arquetipo: { principal: string; secundario: string | null } | null } | null;
  cores: CorMarca[];
  pares: ParContraste[];
  tipografia: FonteMarca[];
  materiais: MaterialMarca[];
};
export type DadosVoz = { documento: "voz"; escalas: EscalaVoz[]; palavras: string[]; anti: string[] };
export type DadosLogo = { documento: "logo"; arquivos: ArquivoLogo[] };
export type BlocoMarca = DadosIdentidade | DadosVoz | DadosLogo;

// ---------------------------------------------------------------------------
// Extração do bloco
// ---------------------------------------------------------------------------

const RE_CERCA = /```marca-dados[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/;

/** O JSON do primeiro bloco cercado ```marca-dados``` do markdown, ou null (sem bloco, ou maior que 32 KB). */
export function extrairBloco(texto: string): string | null {
  const m = RE_CERCA.exec(texto);
  if (!m) return null;
  if (new TextEncoder().encode(m[1]).length > TETO_BLOCO_BYTES) return null;
  return m[1];
}

// ---------------------------------------------------------------------------
// Validação da forma (cada campo é montado de novo: nada do JSON original vai adiante)
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const ehTexto = (v: unknown, max = MAX_TEXTO): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const emLista = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === "string" && (lista as readonly string[]).includes(v);

/** Origem ausente vale null (sem selo); presente e fora da lista invalida o item (undefined). */
function origemDe(v: unknown): Origem | null | undefined {
  if (v === undefined || v === null) return null;
  return emLista(ORIGENS, v) ? v : undefined;
}

function listaDePalavras(v: unknown): string[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_PALAVRAS) return undefined;
  const saida: string[] = [];
  for (const p of v) {
    if (!ehTexto(p, 40)) return undefined;
    saida.push(p.trim());
  }
  return saida;
}

function lerCores(v: unknown): CorMarca[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_CORES) return undefined;
  const nomes = new Set<string>();
  const saida: CorMarca[] = [];
  for (const c of v) {
    if (!ehObjeto(c) || !ehTexto(c.nome, 40) || typeof c.hex !== "string" || !RE_HEX.test(c.hex) || !emLista(FUNCOES_COR, c.funcao)) return undefined;
    const origem = origemDe(c.origem);
    if (origem === undefined || nomes.has(c.nome)) return undefined;
    nomes.add(c.nome);
    saida.push({ nome: c.nome, hex: c.hex, funcao: c.funcao, origem });
  }
  return saida;
}

function lerPares(v: unknown): ParContraste[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_PARES) return undefined;
  const saida: ParContraste[] = [];
  for (const p of v) {
    if (!ehObjeto(p) || !ehTexto(p.texto, 40) || !ehTexto(p.fundo, 40)) return undefined;
    if (typeof p.razao !== "number" || !Number.isFinite(p.razao) || p.razao < 1 || p.razao > 21) return undefined;
    if (p.uso !== "texto" && p.uso !== "destaque") return undefined;
    saida.push({ texto: p.texto, fundo: p.fundo, razao: p.razao, uso: p.uso });
  }
  return saida;
}

function lerTipografia(v: unknown): FonteMarca[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_FAMILIAS) return undefined;
  const saida: FonteMarca[] = [];
  for (const f of v) {
    if (!ehObjeto(f) || !emLista(USOS_FONTE, f.uso)) return undefined;
    if (typeof f.familia !== "string" || !RE_FAMILIA.test(f.familia) || f.familia.trim() !== f.familia) return undefined;
    if (f.fonte !== "google" && f.fonte !== "sistema" && f.fonte !== "outra") return undefined;
    if (f.licenca !== "OFL" && f.licenca !== "Apache" && f.licenca !== "sistema") return undefined;
    const pesos = f.pesos === undefined ? [] : f.pesos;
    if (!Array.isArray(pesos) || pesos.length > MAX_PESOS) return undefined;
    for (const p of pesos) if (!Number.isInteger(p) || p < 100 || p > 900 || p % 100 !== 0) return undefined;
    const origem = origemDe(f.origem);
    if (origem === undefined) return undefined;
    saida.push({ uso: f.uso, familia: f.familia, pesos: [...new Set(pesos as number[])].sort((a, b) => a - b), fonte: f.fonte, licenca: f.licenca, origem });
  }
  if (saida.filter((f) => f.uso !== "reserva").length > 2) return undefined;
  return saida;
}

function lerMateriais(v: unknown): MaterialMarca[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_MATERIAIS) return undefined;
  const saida: MaterialMarca[] = [];
  for (const m of v) {
    if (!ehObjeto(m) || !Number.isInteger(m.n) || (m.n as number) < 1 || (m.n as number) > 99) return undefined;
    if (!emLista(TIPOS_MATERIAL, m.tipo) || !ehTexto(m.alvo, 300) || !RE_ALVO.test(m.alvo as string)) return undefined;
    if (typeof m.visto_em !== "string" || !RE_DATA.test(m.visto_em)) return undefined;
    saida.push({ n: m.n as number, tipo: m.tipo, alvo: m.alvo, visto_em: m.visto_em });
  }
  return saida;
}

function lerPersonalidade(v: unknown): DadosIdentidade["personalidade"] | undefined {
  if (v === undefined || v === null) return null;
  if (!ehObjeto(v)) return undefined;
  const palavras = listaDePalavras(v.palavras);
  if (palavras === undefined) return undefined;
  let arquetipo: { principal: string; secundario: string | null } | null = null;
  if (v.arquetipo !== undefined && v.arquetipo !== null) {
    const a = v.arquetipo;
    if (!ehObjeto(a) || !ehTexto(a.principal, 40)) return undefined;
    if (a.secundario !== undefined && a.secundario !== null && !ehTexto(a.secundario, 40)) return undefined;
    arquetipo = { principal: a.principal.trim(), secundario: typeof a.secundario === "string" ? a.secundario.trim() : null };
  }
  return { palavras, arquetipo };
}

function lerEscalas(v: unknown): EscalaVoz[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > EIXOS_VOZ.length) return undefined;
  const vistos = new Set<string>();
  const saida: EscalaVoz[] = [];
  for (const e of v) {
    if (!ehObjeto(e) || !emLista(EIXOS_VOZ, e.eixo) || vistos.has(e.eixo)) return undefined;
    if (!Number.isInteger(e.posicao) || (e.posicao as number) < 1 || (e.posicao as number) > 5) return undefined;
    const origem = origemDe(e.origem);
    if (origem === undefined) return undefined;
    vistos.add(e.eixo);
    saida.push({ eixo: e.eixo, posicao: e.posicao as number, origem });
  }
  return saida;
}

/** Caminho de logo aceito: regex, sem `..` em lugar nenhum. */
export function arquivoLogoValido(v: unknown): v is string {
  return typeof v === "string" && v.length <= 200 && RE_ARQUIVO_LOGO.test(v) && !v.includes("..");
}

function lerArquivos(v: unknown): ArquivoLogo[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_ARQUIVOS) return undefined;
  const saida: ArquivoLogo[] = [];
  for (const a of v) {
    if (!ehObjeto(a) || !emLista(PAPEIS_LOGO, a.papel) || !arquivoLogoValido(a.arquivo)) return undefined;
    saida.push({ papel: a.papel, arquivo: a.arquivo });
  }
  return saida;
}

/** A forma do bloco já interpretado (JSON.parse); null se qualquer campo foge do contrato. */
export function validarBloco(bruto: unknown): BlocoMarca | null {
  if (!ehObjeto(bruto) || bruto.versao !== 1) return null;
  if (bruto.documento === "identidade") {
    const personalidade = lerPersonalidade(bruto.personalidade);
    const cores = lerCores(bruto.cores);
    const pares = lerPares(bruto.pares);
    const tipografia = lerTipografia(bruto.tipografia);
    const materiais = lerMateriais(bruto.materiais);
    if (personalidade === undefined || !cores || !pares || !tipografia || !materiais) return null;
    return { documento: "identidade", personalidade, cores, pares, tipografia, materiais };
  }
  if (bruto.documento === "voz") {
    const escalas = lerEscalas(bruto.escalas);
    const palavras = listaDePalavras(bruto.palavras);
    const anti = listaDePalavras(bruto.anti);
    if (!escalas || !palavras || !anti) return null;
    return { documento: "voz", escalas, palavras, anti };
  }
  if (bruto.documento === "logo") {
    const arquivos = lerArquivos(bruto.arquivos);
    if (!arquivos) return null;
    return { documento: "logo", arquivos };
  }
  return null;
}

/** Do markdown ao bloco validado. Sem bloco, JSON quebrado ou forma inválida: null. Nunca lança. */
export function lerBloco(texto: string): BlocoMarca | null {
  try {
    const json = extrairBloco(texto);
    if (json === null) return null;
    return validarBloco(JSON.parse(json));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------

export type Secao = {
  /** Título normalizado: sem número na frente, sem acento, minúsculo (é por ele que a tela casa a seção). */
  chave: string;
  /** Título pra mostrar, sem o número na frente. */
  titulo: string;
  corpo: string;
};

/** "3. Logo" e "Logo" são a mesma seção; "Regras de Ouro" casa com "regras de ouro". */
export function tituloSemNumero(titulo: string): string {
  return titulo.trim().replace(/^\d+\s*[.)-]\s*/, "").trim();
}
export function normalizarTitulo(titulo: string): string {
  return tituloSemNumero(titulo)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Divide por `## ` (fora de blocos de código). O que vem antes do primeiro `## ` fica de fora. */
export function dividirSecoes(texto: string): Secao[] {
  const secoes: Secao[] = [];
  let atual: { titulo: string; linhas: string[] } | null = null;
  let cerca: string | null = null;
  const fechar = () => {
    if (!atual) return;
    secoes.push({ chave: normalizarTitulo(atual.titulo), titulo: tituloSemNumero(atual.titulo), corpo: atual.linhas.join("\n").trim() });
  };
  for (const linha of texto.split(/\r?\n/)) {
    const abre = /^\s*(```+|~~~+)/.exec(linha);
    if (abre) {
      if (cerca === null) cerca = abre[1][0];
      else if (abre[1][0] === cerca) cerca = null;
    }
    const titulo = cerca === null ? /^##\s+(.+?)\s*#*\s*$/.exec(linha) : null;
    if (titulo) {
      fechar();
      atual = { titulo: titulo[1], linhas: [] };
    } else if (atual) {
      atual.linhas.push(linha);
    }
  }
  fechar();
  return secoes;
}

const SECOES_FORA_DA_TELA = new Set(["anexo", "dados para o sistema"]);

// ---------------------------------------------------------------------------
// Junção dos documentos
// ---------------------------------------------------------------------------

export type DocMarca = {
  id: string;
  titulo: string;
  texto: string;
  publicado_em: string;
  caminho_origem?: string;
};

export type MarcaCompleta = {
  identidade: { doc: DocMarca; dados: DadosIdentidade; secoes: Secao[] } | null;
  voz: { doc: DocMarca; dados: DadosVoz; secoes: Secao[] } | null;
  logo: { doc: DocMarca; dados: DadosLogo } | null;
  /** Todos os documentos da aba (recente primeiro), pro rodapé. */
  documentos: DocMarca[];
};

/**
 * Junta identidade + voz + logo. `docs` vem do mais recente pro mais antigo; de cada tipo de bloco vale o
 * primeiro VÁLIDO. Nenhum bloco válido: null (a tela cai no documento em texto).
 */
export function juntarMarca(docs: DocMarca[]): MarcaCompleta | null {
  const r: MarcaCompleta = { identidade: null, voz: null, logo: null, documentos: docs };
  for (const doc of docs) {
    const dados = lerBloco(doc.texto);
    if (!dados) continue;
    const secoes = dividirSecoes(doc.texto).filter((s) => !SECOES_FORA_DA_TELA.has(s.chave));
    if (dados.documento === "identidade" && !r.identidade) r.identidade = { doc, dados, secoes };
    else if (dados.documento === "voz" && !r.voz) r.voz = { doc, dados, secoes };
    else if (dados.documento === "logo" && !r.logo) r.logo = { doc, dados };
  }
  return r.identidade || r.voz || r.logo ? r : null;
}

/** Os arquivos de logo a assinar: válidos, sem repetir, até 6. */
export function arquivosDeLogo(m: MarcaCompleta): ArquivoLogo[] {
  const vistos = new Set<string>();
  const saida: ArquivoLogo[] = [];
  for (const a of m.logo?.dados.arquivos ?? []) {
    if (!arquivoLogoValido(a.arquivo) || vistos.has(a.arquivo)) continue;
    vistos.add(a.arquivo);
    saida.push(a);
    if (saida.length === MAX_LOGOS_ASSINADOS) break;
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Divisões da tela
// ---------------------------------------------------------------------------

export type IdDivisao = "essencia" | "personalidade" | "logo" | "cores" | "tipografia" | "imagem" | "aplicacoes" | "voz" | "regras" | "fontes";

export const ROTULO_DIVISAO: Record<IdDivisao, string> = {
  essencia: "Essência",
  personalidade: "Personalidade",
  logo: "Logo",
  cores: "Cores",
  tipografia: "Tipografia",
  imagem: "Imagem",
  aplicacoes: "Aplicações",
  voz: "Voz",
  regras: "Regras",
  fontes: "Fontes",
};

/** Ordem fixa das divisões na tela e na navegação. */
export const ORDEM_DIVISOES: IdDivisao[] = ["essencia", "personalidade", "logo", "cores", "tipografia", "imagem", "aplicacoes", "voz", "regras", "fontes"];

/** Chave normalizada do título da seção do identidade-visual.md → divisão. */
const DIVISAO_DA_SECAO: Record<string, IdDivisao> = {
  "plataforma da marca": "essencia",
  "personalidade e arquetipo": "personalidade",
  logo: "logo",
  cores: "cores",
  tipografia: "tipografia",
  "imagem e elementos": "imagem",
  aplicacoes: "aplicacoes",
  "regras de ouro": "regras",
  fontes: "fontes",
};

export function secaoDaDivisao(m: MarcaCompleta, id: IdDivisao): Secao | null {
  return m.identidade?.secoes.find((s) => DIVISAO_DA_SECAO[s.chave] === id && s.corpo !== "") ?? null;
}

/** Seções do tom-de-voz.md que viram cartão na divisão Voz (a de fontes vai pra divisão Fontes). */
export function secoesDeVoz(m: MarcaCompleta): Secao[] {
  return (m.voz?.secoes ?? []).filter((s) => s.chave !== "fontes" && s.corpo !== "");
}
export function secaoFontesDeVoz(m: MarcaCompleta): Secao | null {
  return m.voz?.secoes.find((s) => s.chave === "fontes" && s.corpo !== "") ?? null;
}

/** Divisões que têm algo a mostrar, na ordem fixa. */
export function divisoesComConteudo(m: MarcaCompleta, temLogo: boolean): IdDivisao[] {
  const dI = m.identidade?.dados;
  const tem: Record<IdDivisao, boolean> = {
    essencia: secaoDaDivisao(m, "essencia") !== null,
    personalidade: !!dI?.personalidade && (dI.personalidade.palavras.length > 0 || dI.personalidade.arquetipo !== null) || secaoDaDivisao(m, "personalidade") !== null,
    logo: temLogo || secaoDaDivisao(m, "logo") !== null,
    cores: (dI?.cores.length ?? 0) > 0 || secaoDaDivisao(m, "cores") !== null,
    tipografia: (dI?.tipografia.length ?? 0) > 0 || secaoDaDivisao(m, "tipografia") !== null,
    imagem: secaoDaDivisao(m, "imagem") !== null,
    aplicacoes: secaoDaDivisao(m, "aplicacoes") !== null,
    voz: !!m.voz && (m.voz.dados.escalas.length > 0 || m.voz.dados.palavras.length > 0 || m.voz.dados.anti.length > 0 || secoesDeVoz(m).length > 0),
    regras: secaoDaDivisao(m, "regras") !== null,
    fontes: (dI?.materiais.length ?? 0) > 0 || secaoDaDivisao(m, "fontes") !== null || secaoFontesDeVoz(m) !== null,
  };
  return ORDEM_DIVISOES.filter((d) => tem[d]);
}

// ---------------------------------------------------------------------------
// Apoio visual
// ---------------------------------------------------------------------------

/** Razão de contraste do jeito brasileiro: "11,2:1". */
export function razaoTexto(razao: number): string {
  return `${razao.toFixed(razao < 10 ? 2 : 1).replace(".", ",")}:1`;
}

/** Endereço do Google Fonts (css2) só com as famílias validadas marcadas como google; sem nenhuma: null. */
export function urlGoogleFonts(fontes: FonteMarca[]): string | null {
  const vistas = new Map<string, Set<number>>();
  for (const f of fontes) {
    if (f.fonte !== "google" || !RE_FAMILIA.test(f.familia)) continue;
    const pesos = vistas.get(f.familia) ?? new Set<number>();
    for (const p of f.pesos) pesos.add(p);
    vistas.set(f.familia, pesos);
  }
  if (vistas.size === 0) return null;
  const familias = [...vistas].map(([nome, pesos]) => {
    const base = `family=${nome.trim().replace(/\s+/g, "+")}`;
    return pesos.size > 0 ? `${base}:wght@${[...pesos].sort((a, b) => a - b).join(";")}` : base;
  });
  return `https://fonts.googleapis.com/css2?${familias.join("&")}&display=swap`;
}

/** `font-family` da amostra: a família da marca (já validada) e, atrás, a pilha do sistema. */
export function pilhaDaFamilia(familia: string): string {
  const nome = RE_FAMILIA.test(familia) ? `"${familia}", ` : "";
  return `${nome}ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
}

/** Cor pelo nome, só se o HEX passa na regex (defesa em profundidade antes do `style`). */
export function hexDaCor(cores: CorMarca[], nome: string): string | null {
  const c = cores.find((x) => x.nome === nome);
  return c && RE_HEX.test(c.hex) ? c.hex : null;
}

/** Endereço clicável de um material: só http(s). Arquivo do projeto e @perfil aparecem como texto. */
export function linkDoMaterial(alvo: string): string | null {
  return /^https?:\/\//.test(alvo) && RE_ALVO.test(alvo) ? alvo : null;
}

