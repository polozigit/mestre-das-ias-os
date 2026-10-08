import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  OrgApqc,
  OrgCarga,
  OrgCargoPlaybook,
  OrgDocumento,
  OrgDocumentoResumo,
  OrgNo,
  OrgOnda,
  OrgPacote,
  OrgPasso,
  OrgRaia,
} from "./tipos.ts";
import { montarFiltroBuscaDocumentos } from "./documentos.ts";
import type { Ocupante } from "./ocupacao.ts";

export type SC = SupabaseClient<Database>;

/**
 * Leitura das views organograma.v_org_* e v_posicao_ocupante.
 * Contrato: docs/superpowers/specs/2026-09-28-gestao-organograma-banco-design.md.
 * Erro de query é LANÇADO (o error.tsx do app trata) — nunca engolido aqui.
 * v_org_pacote NÃO entra aqui: carrega sob demanda no client (PacoteCargo.tsx).
 */

const COLS_NO =
  "no_id, pai_no_id, tipo, ordem, slug, titulo, sigla, cargo_real, sub_area, vagas, " +
  "aparece_a_partir_de, time_total, missao, especialidade, antes, reporta_a_texto, " +
  "reporta_a_slug, area_slug, salario_nota, salario_proxy, salarios, referencias, " +
  "processos, interfaces, pacote";

const COLS_RAIA = "workflow_slug, ordem, chave, nome, cargo_slug";

const COLS_PASSO =
  "workflow_slug, ordem, codigo, passo, quem, faz, entrega, passa, gate, playbook_texto, " +
  "coluna, raias, proximos, lacos, sai_caio, playbooks";

const COLS_ONDA = "ordem, codigo, time, porque, depende, cargos";

const COLS_APQC = "codigo, nome_pt, nome_en";

const COLS_CARGA = "carregado_em, git_sha, ambiente, contagens";

const COLS_CARGO_PLAYBOOK =
  "cargo_slug, pacote_slug, pacote_cargo_slug, pacote_cargo_titulo, playbook_slug, processo, nivel_minimo, papel, ordem";

// SEM `markdown` de propósito — são 80 linhas / ~1,4 MB de texto no total,
// a listagem nunca carrega o corpo (ver getOrgDocumentoTexto, sob demanda).
const COLS_DOCUMENTO_RESUMO = "caminho, tipo, titulo, resumo, tamanho, ordem, pacote_slug, cargo_slug, especialista";
const COLS_DOCUMENTO_COMPLETO = `${COLS_DOCUMENTO_RESUMO}, markdown`;

export type Organograma = {
  nos: OrgNo[];
  raias: OrgRaia[];
  passos: OrgPasso[];
  ondas: OrgOnda[];
  apqc: OrgApqc[];
  carga: OrgCarga | null;
  documentos: OrgDocumentoResumo[];
};

export async function getOrganograma(c: SC): Promise<Organograma> {
  const [rNos, rRaias, rPassos, rOndas, rApqc, rCarga, rDocumentos] = await Promise.all([
    c.schema("organograma").from("v_org_no").select(COLS_NO).order("ordem", { ascending: true }),
    c
      .schema("organograma")
      .from("v_org_workflow_raia")
      .select(COLS_RAIA)
      .order("ordem", { ascending: true }),
    c
      .schema("organograma")
      .from("v_org_workflow_passo")
      .select(COLS_PASSO)
      .order("ordem", { ascending: true }),
    c.schema("organograma").from("v_org_onda").select(COLS_ONDA).order("ordem", { ascending: true }),
    c.schema("organograma").from("v_org_apqc").select(COLS_APQC).order("codigo", { ascending: true }),
    c.schema("organograma").from("v_org_carga").select(COLS_CARGA).maybeSingle(),
    getOrgDocumentos(c),
  ]);

  for (const [rotulo, r] of [
    ["v_org_no", rNos],
    ["v_org_workflow_raia", rRaias],
    ["v_org_workflow_passo", rPassos],
    ["v_org_onda", rOndas],
    ["v_org_apqc", rApqc],
  ] as const) {
    if (r.error) throw new Error(`${rotulo}: ${r.error.message}`);
  }
  // v_org_carga: erro da view de carga também derruba a tela (não é tratado à parte; só a ausência de linha vira "sem data de carga").
  if (rCarga.error) throw new Error(`v_org_carga: ${rCarga.error.message}`);

  return {
    nos: (rNos.data ?? []) as unknown as OrgNo[],
    raias: (rRaias.data ?? []) as unknown as OrgRaia[],
    passos: (rPassos.data ?? []) as unknown as OrgPasso[],
    ondas: (rOndas.data ?? []) as unknown as OrgOnda[],
    apqc: (rApqc.data ?? []) as unknown as OrgApqc[],
    carga: (rCarga.data ?? null) as unknown as OrgCarga | null,
    documentos: rDocumentos,
  };
}

/** Listagem de documentos (SEM markdown) — public.v_org_documento. Entra no
 * Promise.all de getOrganograma (server); chamada solta aqui é só pra tipar
 * o retorno perto de onde a coluna é declarada. */
export async function getOrgDocumentos(c: SC): Promise<OrgDocumentoResumo[]> {
  const { data, error } = await c
    .schema("organograma")
    .from("v_org_documento")
    .select(COLS_DOCUMENTO_RESUMO)
    .order("ordem", { ascending: true });
  if (error) throw new Error(`v_org_documento: ${error.message}`);
  return (data ?? []) as unknown as OrgDocumentoResumo[];
}

/** 1 documento completo (COM markdown) por `caminho` — chamada do client ao
 * abrir o documento na vista Documentos (nunca no server, nunca em lote). */
export async function getOrgDocumentoTexto(c: SC, caminho: string): Promise<OrgDocumento | null> {
  const { data, error } = await c
    .schema("organograma")
    .from("v_org_documento")
    .select(COLS_DOCUMENTO_COMPLETO)
    .eq("caminho", caminho)
    .maybeSingle();
  if (error) throw new Error(`v_org_documento (texto): ${error.message}`);
  return (data ?? null) as unknown as OrgDocumento | null;
}

/** Busca por termo em título OU markdown — devolve só `caminho` (o filtro na
 * tela recorta `documentos` já carregado por esses caminhos). Chamada do
 * client; o corte de termo curto (< 3 chars) é responsabilidade de quem
 * chama (ver deveBuscarDocumentos em lib/organograma/documentos.ts) — esta
 * função não repete a checagem. */
export async function buscarOrgDocumentos(c: SC, termo: string): Promise<string[]> {
  const { data, error } = await c
    .schema("organograma")
    .from("v_org_documento")
    .select("caminho")
    .or(montarFiltroBuscaDocumentos(termo));
  if (error) throw new Error(`v_org_documento (busca): ${error.message}`);
  return ((data ?? []) as unknown as { caminho: string }[]).map((d) => d.caminho);
}

/** v_org_pacote por cargo_slug — chamada do client (@/lib/supabase/client) em PacoteCargo.tsx. */
export async function getOrgPacotePorCargo(c: SC, cargoSlug: string): Promise<OrgPacote | null> {
  const { data, error } = await c
    .schema("organograma")
    .from("v_org_pacote")
    .select(
      "cargo_slug, slug, versao, data, validade, modelou, aprovou, pasta, auditoria, marcas, casos_md, secoes, playbooks",
    )
    .eq("cargo_slug", cargoSlug)
    .maybeSingle();
  if (error) throw new Error(`v_org_pacote: ${error.message}`);
  return (data ?? null) as unknown as OrgPacote | null;
}

/** v_org_cargo_playbook por cargo_slug — em quais playbooks o cargo atua,
 * inclusive cargo SEM pacote próprio (o playbook mora no pacote de outro
 * cargo). Chamada do client (@/lib/supabase/client) em PainelCargo.tsx,
 * mesmo padrão sob-demanda de getOrgPacotePorCargo. */
export async function getOrgPlaybooksPorCargo(c: SC, cargoSlug: string): Promise<OrgCargoPlaybook[]> {
  const { data, error } = await c
    .schema("organograma")
    .from("v_org_cargo_playbook")
    .select(COLS_CARGO_PLAYBOOK)
    .eq("cargo_slug", cargoSlug)
    .order("ordem", { ascending: true });
  if (error) throw new Error(`v_org_cargo_playbook: ${error.message}`);
  return (data ?? []) as unknown as OrgCargoPlaybook[];
}

/** Ocupação vigente de cada posição (pessoa, agente ou vazio) — organograma.v_posicao_ocupante.
 * Linha sem posicao_id/cargo_slug é descartada. */
export async function getOcupacao(c: SC): Promise<Ocupante[]> {
  const { data, error } = await c
    .schema("organograma")
    .from("v_posicao_ocupante")
    .select("posicao_id, cargo_slug, ocupante_tipo, agente_name")
    .order("posicao_id", { ascending: true });
  if (error) throw new Error(`v_posicao_ocupante: ${error.message}`);
  const linhas: Ocupante[] = [];
  for (const r of data ?? []) {
    if (r.posicao_id === null || r.cargo_slug === null) continue;
    const tipo = r.ocupante_tipo === "agente" || r.ocupante_tipo === "pessoa" ? r.ocupante_tipo : "vazio";
    linhas.push({ posicao_id: r.posicao_id, cargo_slug: r.cargo_slug, ocupante_tipo: tipo, agente_name: r.agente_name });
  }
  return linhas;
}
