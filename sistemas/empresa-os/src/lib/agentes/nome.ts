/**
 * Nomes e rótulos amigáveis de agentes, skills e workflows. Funções PURAS (sem import de runtime: rodam
 * no node --test, em nome.test.ts).
 *
 * O nome técnico (`marketing-diretor`, `polozi-criar-ebook`) é o identificador: vive na URL e no banco e
 * só aceita [a-z0-9-]. A tela mostra o nome amigável na frente ("Diretor", "Criar ebook") e o técnico em
 * texto secundário, pra quem precisa chamar o agente ou a skill pelo nome certo.
 */

const PREFIXO_DA_MARCA = "polozi-";

/** Palavras que o nome técnico escreve sem acento e a tela mostra certo (lista fechada, do vocabulário do kit). */
const COM_ACENTO: Record<string, string> = {
  analise: "análise",
  apresentacao: "apresentação",
  conexao: "conexão",
  contratacao: "contratação",
  dominio: "domínio",
  dossie: "dossiê",
  estrategia: "estratégia",
  evidencias: "evidências",
  excelencia: "excelência",
  expressao: "expressão",
  fabrica: "fábrica",
  gestao: "gestão",
  maquina: "máquina",
  metodo: "método",
  metodos: "métodos",
  negocios: "negócios",
  nivel: "nível",
  organizacao: "organização",
  permissoes: "permissões",
  raciocinio: "raciocínio",
  reuniao: "reunião",
  seguranca: "segurança",
  versao: "versão",
  vigilancia: "vigilância",
};

/** Siglas e marcas que não podem sair com inicial minúscula ("qa" vira "QA"). */
const SIGLAS: Record<string, string> = {
  ai: "AI",
  api: "API",
  crm: "CRM",
  github: "GitHub",
  ia: "IA",
  pmo: "PMO",
  qa: "QA",
  seo: "SEO",
  sql: "SQL",
};

/** Minúscula e sem acento: o `time` pode vir "Contratação" e o nome técnico, "contratacao-diretor". */
function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function palavras(texto: string): string[] {
  return texto.split(/[-._\s]+/).filter(Boolean);
}

function emPalavras(lista: string[]): string {
  const certas = lista.map((p) => {
    const minuscula = p.toLowerCase();
    if (Object.hasOwn(SIGLAS, minuscula)) return SIGLAS[minuscula];
    if (Object.hasOwn(COM_ACENTO, minuscula)) return COM_ACENTO[minuscula];
    return minuscula;
  });
  const frase = certas.join(" ");
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

/**
 * Nome amigável: tira o "polozi-" e o prefixo da diretoria (o `time`) do começo do nome técnico, troca
 * hífen por espaço e põe inicial maiúscula. Só tira o prefixo quando sobra alguma coisa depois dele: se o
 * nome É o prefixo ("marketing" no time "marketing"), mostra o nome inteiro.
 *
 *   marketing-diretor (time marketing)     -> "Diretor"
 *   polozi-criar-ebook                      -> "Criar ebook"
 *   polozi-registrar-dossie                 -> "Registrar dossiê"
 *   tecnologia-revisor-seguranca            -> "Revisor segurança"
 */
export function nomeAmigavel(nome: string, time?: string | null): string {
  const baseDoTime = time ? semAcento(time).replace(/[\s_]+/g, "-") : "";
  const prefixoDoTime = baseDoTime ? `${baseDoTime}-` : null;
  let resto = nome.trim();
  // Os dois prefixos podem vir encadeados (polozi-sistema-qa no time "sistema"): tira enquanto houver.
  for (let volta = 0; volta < 3; volta++) {
    const antes = resto;
    if (resto.toLowerCase().startsWith(PREFIXO_DA_MARCA) && resto.length > PREFIXO_DA_MARCA.length) {
      resto = resto.slice(PREFIXO_DA_MARCA.length);
    }
    if (prefixoDoTime && resto.toLowerCase().startsWith(prefixoDoTime) && resto.length > prefixoDoTime.length) {
      resto = resto.slice(prefixoDoTime.length);
    }
    if (resto === antes) break;
  }
  return emPalavras(palavras(resto));
}

/** Modelo do agente por extenso: terra -> "Terra". O nome vem do banco em minúscula. */
export function rotuloModelo(tier: string | null | undefined): string {
  const t = (tier ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "";
}

/** Legenda de uma linha que explica os modelos, mostrada onde o modelo aparece (cards e página do agente). */
export const LEGENDA_DOS_MODELOS = "Sol: raciocínio alto · Terra: dia a dia · Luna: rotina barata";

const ESFORCO: Record<string, string> = {
  minimal: "mínimo",
  low: "baixo",
  medium: "médio",
  high: "alto",
  xhigh: "muito alto",
};

/** Esforço em português ("medium" vira "médio"). Valor desconhecido passa como veio. */
export function rotuloEsforco(esforco: string | null | undefined): string {
  const e = (esforco ?? "").trim();
  return Object.hasOwn(ESFORCO, e) ? ESFORCO[e] : e;
}
