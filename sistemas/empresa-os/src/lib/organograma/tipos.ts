/**
 * Tipos das views public.v_org_* (schema organograma), contrato fechado em
 * docs/superpowers/specs/2026-09-28-gestao-organograma-banco-design.md.
 * Nomes de campo IDÊNTICOS às colunas das views — não traduzir, não renomear.
 */

export type OrgNoTipo = "root" | "cabeca" | "area" | "cargo";

export type OrgAuditoriaSalario = "ok" | "secundaria" | "nao_confirmado";

export type OrgSalario = {
  cargo_pesquisado: string;
  nivel: string | null;
  moeda: string;
  minimo: number | null;
  mediana: number | null;
  maximo: number | null;
  fonte: string;
  url: string;
  auditoria: OrgAuditoriaSalario | null;
};

export type OrgProcesso = {
  titulo: string;
  horas_mes: number | null;
  notas: string | null;
  apqc: string[];
};

export type OrgInterface = {
  titulo: string;
  nota: string | null;
};

export type OrgPacoteResumo = {
  slug: string;
  versao: string;
  data: string | null; // pacote sem cabeçalho (copywriter) não tem data
  aprovou: string | null;
  n_playbooks: number;
};

/** 1 linha por nó do desenho (raiz, diretoria, área, cargo) — public.v_org_no. */
export type OrgNo = {
  no_id: string; // "c:<slug>" ou "a:<slug>"
  pai_no_id: string | null;
  tipo: OrgNoTipo;
  ordem: number;
  slug: string;
  titulo: string;
  sigla: string | null;
  cargo_real: string | null;
  sub_area: string | null;
  vagas: number | null;
  /** Porte da empresa (pessoas) a partir do qual o cargo existe — inteiro
   * (ex. CHRO = 150), não texto: coluna corrigida pra bater com o banco. */
  aparece_a_partir_de: number | null;
  time_total: number | null;
  missao: string | null;
  especialidade: string | null;
  antes: string | null;
  reporta_a_texto: string | null;
  reporta_a_slug: string | null;
  area_slug: string | null;
  salario_nota: string | null;
  salario_proxy: string | null;
  salarios: OrgSalario[];
  referencias: string[];
  processos: OrgProcesso[];
  interfaces: OrgInterface[];
  pacote: OrgPacoteResumo | null;
};

export type OrgMarcas = {
  VERIFIED: number;
  SNIPPET: number;
  premissa: number;
  a_modelar: number;
};

export type OrgPacoteSecao = {
  titulo: string;
  markdown: string;
};

/** 1 entrada de public.v_org_pacote.playbooks[].papeis — quem atua no
 * playbook; o primeiro item é o dono do pacote. */
export type OrgPapel = {
  cargo_slug: string;
  cargo_titulo: string;
  papel: string;
};

export type OrgPlaybook = {
  slug: string;
  processo: string;
  nivel_minimo: string | null;
  horas_texto: string | null;
  frequencia: string | null;
  apqc: string | null;
  markdown: string;
  papeis: OrgPapel[];
};

/** 1 linha por pacote modelado — public.v_org_pacote (carregado sob demanda por cargo_slug). */
export type OrgPacote = {
  cargo_slug: string;
  slug: string;
  versao: string;
  data: string | null; // pacote sem cabeçalho (copywriter) não tem data
  validade: string | null;
  modelou: string | null;
  aprovou: string | null;
  pasta: string | null;
  auditoria: string | null;
  marcas: OrgMarcas;
  casos_md: string | null;
  secoes: OrgPacoteSecao[];
  playbooks: OrgPlaybook[];
};

/** 1 linha por raia — public.v_org_workflow_raia. */
export type OrgRaia = {
  workflow_slug: string;
  ordem: number;
  chave: string;
  nome: string;
  cargo_slug: string | null;
};

export type OrgPassoPlaybookRef = {
  pacote_slug: string;
  slug: string;
};

/** 1 linha por passo W1-W15 — public.v_org_workflow_passo. */
export type OrgPasso = {
  workflow_slug: string;
  ordem: number;
  codigo: string;
  passo: string;
  quem: string | null;
  faz: string | null;
  entrega: string | null;
  passa: string | null;
  gate: string | null;
  playbook_texto: string | null;
  coluna: number;
  raias: string[];
  proximos: string[];
  lacos: string[];
  sai_caio: boolean;
  playbooks: OrgPassoPlaybookRef[];
};

export type OrgOndaCargo = {
  texto: string;
  cargo_slug: string | null;
};

/** 1 linha por onda — public.v_org_onda. */
export type OrgOnda = {
  ordem: number;
  codigo: string;
  time: string;
  porque: string | null;
  depende: string | null;
  cargos: OrgOndaCargo[];
};

/** 1 linha por playbook em que um cargo atua — public.v_org_cargo_playbook
 * (carregado sob demanda por cargo_slug, mesmo padrão de v_org_pacote).
 * Cobre cargo SEM pacote próprio: o playbook pertence ao pacote de outro
 * cargo (`pacote_cargo_slug`/`pacote_cargo_titulo`). */
export type OrgCargoPlaybook = {
  cargo_slug: string;
  pacote_slug: string;
  pacote_cargo_slug: string;
  pacote_cargo_titulo: string;
  playbook_slug: string;
  processo: string;
  nivel_minimo: string | null;
  papel: string;
  ordem: number;
};

/** 1 linha por código — public.v_org_apqc (PCF 7.4). */
export type OrgApqc = {
  codigo: string;
  nome_pt: string;
  nome_en: string | null;
};

/** Última carga — public.v_org_carga. */
export type OrgCarga = {
  carregado_em: string;
  git_sha: string | null;
  ambiente: string | null;
  contagens: Record<string, number> | null;
};

export type OrgDocumentoTipo =
  | "frente"
  | "maturidade"
  | "dimensao"
  | "area_maturidade"
  | "pesquisa"
  | "molde"
  | "cultura"
  | "dossie"
  | "auditoria"
  | "gestao"
  | "fonte_especialista"
  | "especialista"
  | "playbook_compartilhado";

/** 1 linha por documento SEM o markdown — public.v_org_documento (listagem,
 * NUNCA carrega o corpo: ~500 linhas / ~4 MB de markdown no total). */
export type OrgDocumentoResumo = {
  caminho: string;
  tipo: OrgDocumentoTipo;
  titulo: string;
  resumo: string | null;
  tamanho: number;
  ordem: number;
  pacote_slug: string | null;
  cargo_slug: string | null;
  /** slug do especialista (12-fabrica-gurus/<slug>) nos cards de conhecimento; null no resto. */
  especialista: string | null;
};

/** 1 documento COM o markdown inteiro — carregado sob demanda por `caminho`
 * (client, ao abrir o documento na vista Documentos). */
export type OrgDocumento = OrgDocumentoResumo & { markdown: string };
