/**
 * Textos de cada atividade do plano (curso de 3 dias e trilha de 90 dias) que a tela mostra no
 * "Como fazer". Funções PURAS (sem banco, sem React, sem import de runtime com alias): rodam direto no
 * node --test, em plano-textos.test.ts.
 *
 * DE ONDE VEM O TEXTO. O plano mora em config/planos/mestre.json. O setup carrega esse arquivo no
 * banco (RPC tarefas.carregar_modelo_plano, migration 0014) e a tela lê a view
 * tarefas.v_tarefa_com_instrucao. A RPC copia só chave, ordem, titulo, objetivo, instrucao, comando,
 * prova, prazo, aula e artigo: `por_que` e `passos` NÃO têm coluna no banco. Por isso a tela junta as
 * duas fontes pela chave da tarefa (`curso.d1.contas`, a mesma regra do setup):
 *   - instrucao, comando e prova: o banco primeiro (é o que foi instalado), o arquivo do plano só
 *     preenche o que faltar;
 *   - por_que e passos: só existem no arquivo do plano.
 *
 * TODO campo é OPCIONAL: atividade sem `por_que`, `passos` ou `comando` continua válida e a tela
 * simplesmente não mostra o bloco.
 */

export type TextosAtividade = {
  /** O que fazer, em 1 ou 2 frases. */
  instrucao?: string | null;
  /** Por que o passo importa. */
  por_que?: string | null;
  /** Passo a passo, um item por linha da lista numerada. */
  passos?: string[] | null;
  /** Como saber que ficou pronto. */
  prova?: string | null;
  /** Texto pronto pra colar na IA. */
  comando?: string | null;
};

/** Atividade como está em config/planos/*.json (só o que a tela lê; o resto do arquivo é ignorado). */
export type AtividadePlano = TextosAtividade & { chave: string };
export type EtapaPlano = { trilha: string; fase: string; atividades: AtividadePlano[] };
export type ModeloPlano = { etapas: EtapaPlano[] };

/** Chave da tarefa semeada de uma atividade: `<trilha>.<fase minúscula>.<chave da atividade>` (migration 0016). */
export function chaveDaTarefa(etapa: Pick<EtapaPlano, "trilha" | "fase">, atividade: Pick<AtividadePlano, "chave">): string {
  return `${etapa.trilha}.${String(etapa.fase).toLowerCase()}.${atividade.chave}`;
}

function textoLimpo(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const limpo = valor.trim();
  return limpo === "" ? undefined : limpo;
}

/**
 * Entrada suja (JSON do plano ou linha do banco) vira textos válidos: só string não vazia, `passos`
 * só lista de string não vazia. O que não presta é descartado, nunca vira erro na tela.
 */
export function limparTextos(bruto: unknown): TextosAtividade {
  if (typeof bruto !== "object" || bruto === null) return {};
  const o = bruto as Record<string, unknown>;
  const passos = Array.isArray(o.passos)
    ? o.passos.map(textoLimpo).filter((p): p is string => p !== undefined)
    : [];
  const saida: TextosAtividade = {};
  const instrucao = textoLimpo(o.instrucao);
  const porQue = textoLimpo(o.por_que);
  const prova = textoLimpo(o.prova);
  const comando = textoLimpo(o.comando);
  if (instrucao) saida.instrucao = instrucao;
  if (porQue) saida.por_que = porQue;
  if (passos.length > 0) saida.passos = passos;
  if (prova) saida.prova = prova;
  if (comando) saida.comando = comando;
  return saida;
}

/** Textos de todas as atividades do plano, pela chave da tarefa. */
export function textosDoPlano(plano: ModeloPlano): Map<string, TextosAtividade> {
  const mapa = new Map<string, TextosAtividade>();
  for (const etapa of plano.etapas ?? []) {
    for (const atividade of etapa.atividades ?? []) {
      mapa.set(chaveDaTarefa(etapa, atividade), limparTextos(atividade));
    }
  }
  return mapa;
}

/**
 * Junta o que veio do banco com o que está no arquivo do plano, campo a campo: o banco ganha quando
 * tem texto, o plano preenche o que faltar. `por_que` e `passos` só vêm do plano.
 */
export function mesclarTextos(
  doBanco: TextosAtividade | null | undefined,
  doPlano: TextosAtividade | null | undefined,
): TextosAtividade {
  const banco = limparTextos(doBanco);
  const plano = limparTextos(doPlano);
  return limparTextos({
    instrucao: banco.instrucao ?? plano.instrucao,
    por_que: banco.por_que ?? plano.por_que,
    passos: banco.passos ?? plano.passos,
    prova: banco.prova ?? plano.prova,
    comando: banco.comando ?? plano.comando,
  });
}

/** Item que sabe a própria chave e (talvez) já traz os textos do banco. */
type ItemComChave = { chave?: string | null; textos?: TextosAtividade };

/** Anexa a cada item os textos mesclados (banco + plano), achados pela chave da tarefa. */
export function anexarTextosDoPlano<T extends ItemComChave>(
  itens: readonly T[],
  plano: ReadonlyMap<string, TextosAtividade>,
): (T & { textos: TextosAtividade })[] {
  return itens.map((item) => ({
    ...item,
    textos: mesclarTextos(item.textos, item.chave ? plano.get(item.chave) : undefined),
  }));
}

/** Um bloco da tela, já na ordem em que aparece. */
export type BlocoAtividade =
  | { tipo: "instrucao"; titulo: null; texto: string }
  | { tipo: "por_que"; titulo: string; texto: string }
  | { tipo: "passos"; titulo: string; itens: string[] }
  | { tipo: "comando"; titulo: string; texto: string }
  | { tipo: "prova"; titulo: string; texto: string };

export const TITULOS_DOS_BLOCOS = {
  por_que: "Por que importa",
  passos: "Passo a passo",
  comando: "Cole isto na sua IA",
  prova: "Como saber que ficou pronto",
} as const;

/**
 * O que a tela desenha, na ordem: o que fazer, por que importa, passo a passo, o texto pra colar na
 * IA e como saber que ficou pronto. Campo ausente ou vazio não gera bloco.
 */
export function blocosDaAtividade(textos: TextosAtividade | null | undefined): BlocoAtividade[] {
  const t = limparTextos(textos);
  const blocos: BlocoAtividade[] = [];
  if (t.instrucao) blocos.push({ tipo: "instrucao", titulo: null, texto: t.instrucao });
  if (t.por_que) blocos.push({ tipo: "por_que", titulo: TITULOS_DOS_BLOCOS.por_que, texto: t.por_que });
  if (t.passos) blocos.push({ tipo: "passos", titulo: TITULOS_DOS_BLOCOS.passos, itens: t.passos });
  if (t.comando) blocos.push({ tipo: "comando", titulo: TITULOS_DOS_BLOCOS.comando, texto: t.comando });
  if (t.prova) blocos.push({ tipo: "prova", titulo: TITULOS_DOS_BLOCOS.prova, texto: t.prova });
  return blocos;
}
