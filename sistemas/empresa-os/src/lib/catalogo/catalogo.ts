/**
 * Helpers PUROS da tela "Agentes, skills e workflows" (sem import de runtime: roda no node --test).
 */
export type TipoArtefato = "agente" | "skill" | "workflow";
export type EstadoArtefato = "instalado" | "disponivel" | "aposentado";
export type ArtefatoCard = {
  id: string;
  tipo: TipoArtefato;
  nome: string;
  time: string;
  resumo: string;
  estado: EstadoArtefato;
};

const TIPOS: readonly TipoArtefato[] = ["agente", "skill", "workflow"];
const TIME_SISTEMA = "sistema";

export const ROTULO_TIPO: Record<TipoArtefato, { singular: string; plural: string }> = {
  agente: { singular: "Agente", plural: "Agentes" },
  skill: { singular: "Skill", plural: "Skills" },
  workflow: { singular: "Workflow", plural: "Workflows" },
};

export const ROTA_TIPO: Record<"skill" | "workflow", "skills" | "workflows"> = {
  skill: "skills",
  workflow: "workflows",
};

export function tipoDaBusca(v: string | string[] | undefined): TipoArtefato {
  const bruto = Array.isArray(v) ? v[0] : v;
  return TIPOS.find((t) => t === bruto) ?? "agente";
}

/** Mesmo CHECK da 0022: ^[a-z0-9][a-z0-9._-]*$, ate 80. Fora disso nunca existe: 404 sem ir ao banco. */
export function nomeArtefatoValido(nome: string): boolean {
  return nome.length <= 80 && /^[a-z0-9][a-z0-9._-]*$/.test(nome) && !nome.includes("..");
}

export function agruparArtefatos(
  lista: ArtefatoCard[],
  mostrarAposentados: boolean,
): { time: string; itens: ArtefatoCard[] }[] {
  const mapa = new Map<string, ArtefatoCard[]>();
  for (const item of lista) {
    if (item.estado === "aposentado" && !mostrarAposentados) continue;
    const grupo = mapa.get(item.time);
    if (grupo) grupo.push(item);
    else mapa.set(item.time, [item]);
  }
  return [...mapa.entries()]
    .sort(([x], [y]) => {
      if (x === TIME_SISTEMA && y !== TIME_SISTEMA) return 1;
      if (y === TIME_SISTEMA && x !== TIME_SISTEMA) return -1;
      return x.localeCompare(y, "pt-BR");
    })
    .map(([time, itens]) => ({ time, itens: itens.sort((p, q) => p.nome.localeCompare(q.nome, "pt-BR")) }));
}

export function hrefArtefato(tipo: TipoArtefato, nome: string): string {
  const seguro = encodeURIComponent(nome);
  return tipo === "agente" ? `/agentes/${seguro}` : `/agentes/${ROTA_TIPO[tipo]}/${seguro}`;
}

const SHIKI: Record<string, string> = {
  python: "python", bash: "bash", javascript: "javascript", typescript: "typescript", sql: "sql",
  toml: "toml", yaml: "yaml", json: "json", markdown: "markdown",
};

export function linguagemShiki(linguagem: string): string {
  return Object.hasOwn(SHIKI, linguagem) ? SHIKI[linguagem] : "text";
}

/** Campo opcional do artefato: o texto sem espaço nas pontas, ou null quando vazio (a tela esconde o campo). */
export function textoDeclarado(v: string | null | undefined): string | null {
  const texto = (v ?? "").trim();
  return texto === "" ? null : texto;
}

/** De onde o artefato veio (artefatos_ia.origem, CHECK da migration 0022) em palavras do dono. */
const ROTULO_ORIGEM: Record<string, string> = {
  nucleo: "kit base",
  time: "time do kit",
  plugin: "plugin",
  sistema: "sistema",
  casa: "criado na sua empresa",
};

export function rotuloOrigem(origem: string): string {
  return Object.hasOwn(ROTULO_ORIGEM, origem) ? ROTULO_ORIGEM[origem] : origem;
}

/** Tira o frontmatter YAML (bloco ---...--- no INICIO) do markdown. Sem fechamento ou no meio do texto: devolve igual. */
export function semFrontmatter(texto: string): string {
  const m = /^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(texto);
  return m ? texto.slice(m[0].length).replace(/^(?:[ \t]*\r?\n)+/, "") : texto;
}

export type VizinhoArtefato = { tipo: string; nome: string; resumo: string; estado: string };

/**
 * Artefatos vizinhos (quem chama / o que usa): sem nulo, sem repetido, sem aposentado, por nome.
 * O banco nunca apaga relacao de origem aposentada (a RPC so reescreve as de quem continua no
 * catalogo), entao e este filtro que impede a tela de listar o que ja saiu do repositorio.
 */
export function vizinhosVisiveis(lista: (VizinhoArtefato | null)[]): VizinhoArtefato[] {
  const vistos = new Map<string, VizinhoArtefato>();
  for (const v of lista) {
    if (!v || v.estado === "aposentado") continue;
    vistos.set(`${v.tipo}:${v.nome}`, v);
  }
  return [...vistos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
