/**
 * Os dois grupos de tarefas que o menu separa. Funções PURAS (sem banco, sem React),
 * testadas em grupos.test.ts.
 *
 *  - "trabalho": o dia a dia da empresa (item "Tarefas" do menu, /tarefas).
 *  - "curso": as tarefas do curso de 3 dias e da trilha de 90 dias, juntas (item "Tarefas do curso",
 *    /tarefas?trilha=curso).
 *
 * O banco guarda 3 trilhas (CHECK ck_tarefas_trilha, migration 0006): curso, plano90 e trabalho.
 * O grupo "curso" reúne as duas primeiras.
 */
export type GrupoTarefas = "trabalho" | "curso";

const TRILHAS_DO_GRUPO: Record<GrupoTarefas, readonly string[]> = {
  trabalho: ["trabalho"],
  curso: ["curso", "plano90"],
};

/** Trilhas do banco que o grupo reúne (alimenta o `.in("trilha", ...)` da consulta). */
export function trilhasDoGrupo(grupo: GrupoTarefas): readonly string[] {
  return TRILHAS_DO_GRUPO[grupo];
}

/** Grupo a que a trilha de uma tarefa pertence. Trilha desconhecida cai no dia a dia. */
export function grupoDaTrilha(trilha: string | null | undefined): GrupoTarefas {
  return trilha === "curso" || trilha === "plano90" ? "curso" : "trabalho";
}

/**
 * Valor de ?trilha= da URL → grupo. `curso` e `plano90` abrem o grupo do curso; ausente, vazio,
 * inválido ou `trabalho` abrem o dia a dia (o padrão). Nunca vira erro.
 */
export function grupoDaBusca(valor: string | string[] | undefined): GrupoTarefas {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return grupoDaTrilha(bruto);
}

/**
 * Endereço da lista de um grupo. O dia a dia é a URL limpa (/tarefas); o curso leva ?trilha=curso.
 * `extras` são os outros filtros (visao, status, origem, dono); valor vazio não entra.
 */
export function hrefListaTarefas(
  grupo: GrupoTarefas,
  extras: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  if (grupo === "curso") params.set("trilha", "curso");
  for (const [chave, valor] of Object.entries(extras)) if (valor) params.set(chave, valor);
  const consulta = params.toString();
  return consulta ? `/tarefas?${consulta}` : "/tarefas";
}

/**
 * Endereço do detalhe de uma tarefa. Tarefa do curso leva ?trilha=curso só pra o menu lateral
 * acender o item certo ("Tarefas do curso"); a página do detalhe ignora o parâmetro.
 */
export function hrefTarefa(id: string, trilha: string | null | undefined): string {
  return grupoDaTrilha(trilha) === "curso" ? `/tarefas/${id}?trilha=curso` : `/tarefas/${id}`;
}

/** Textos de cada lista: título, subtítulo, estado vazio e o rótulo do link de volta no detalhe. */
export const TEXTOS_DO_GRUPO: Record<
  GrupoTarefas,
  { titulo: string; subtitulo: string; vazioTitulo: string; vazioDescricao: string; voltar: string }
> = {
  trabalho: {
    titulo: "Tarefas do dia a dia",
    subtitulo: "O trabalho da empresa, feito por você e pelas suas IAs.",
    vazioTitulo: "Nenhuma tarefa ainda",
    vazioDescricao:
      'Crie a primeira pelo botão "Nova tarefa". Ela nasce no Backlog e caminha pelo quadro até Concluída.',
    voltar: "Tarefas",
  },
  curso: {
    titulo: "Tarefas do curso e da trilha de 90 dias",
    subtitulo:
      "Os passos do curso de 3 dias e do plano de 90 dias. Para ver a ordem e o prazo de cada um, abra o Cronograma.",
    vazioTitulo: "Nenhuma tarefa do curso ainda",
    vazioDescricao:
      "As tarefas do curso e do plano de 90 dias aparecem aqui depois que o sistema é instalado. Enquanto isso, veja as tarefas do dia a dia.",
    voltar: "Tarefas do curso",
  },
};
