import test from "node:test";
import assert from "node:assert/strict";
import {
  IDS_CAPITULO,
  PARA_ENTENDER,
  TETO_BLOCO_ESTUDO_BYTES,
  capitulosDoEstudo,
  extrairBlocoEstudo,
  formatarNumerosFonte,
  fontesAgrupadas,
  lerEstudo,
  notaDeVersao,
  rotuloDasRefs,
  subtituloDaAbertura,
  textoSemDados,
  tituloDoCapitulo,
  validarEstudo,
} from "./persona-estudo.ts";
import { EXEMPLO_ESTUDO_JSON } from "./persona-estudo.exemplo.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Bruto = any;

const exemplo = (): Bruto => JSON.parse(EXEMPLO_ESTUDO_JSON);
const compacto = (o: unknown) => JSON.stringify(o);

/** O documento como o script grava: markdown legível e, no fim, o bloco compacto. */
function documento(o: unknown, bloco = compacto(o)): string {
  return [
    "# Estudo do cliente ideal - Clima Exemplo Ar-Condicionado",
    "",
    "- Estado: rascunho",
    "",
    "## Em uma frase",
    "",
    "- Arquétipo: A família do apartamento novo.",
    "",
    "## Dados para o sistema",
    "",
    "```persona-dados",
    bloco,
    "```",
    "",
  ].join("\n");
}

/** Lê o exemplo depois de aplicar a mutação `f` (sobre uma cópia). */
function com(f: (o: Bruto) => void) {
  const o = exemplo();
  f(o);
  return lerEstudo(documento(o));
}

test("o exemplo do contrato passa inteiro, com todos os capítulos na ordem", () => {
  const e = lerEstudo(documento(exemplo()));
  assert.ok(e);
  assert.deepEqual(capitulosDoEstudo(e), [...IDS_CAPITULO]);
  assert.equal(e.empresa, "Clima Exemplo Ar-Condicionado");
  assert.equal(e.tipo_cliente, "pessoa");
  assert.equal(e.abertura.arquetipo.enfase, "não quer surpresa");
  assert.equal(e.descobertas?.itens.length, 3);
  assert.equal(e.descobertas?.extra?.capitulo, "decide");
  assert.equal(e.quem?.grupo_compra?.papeis.length, 4);
  assert.equal(e.forcas?.empurra[3].ausente, true);
  assert.equal(e.forcas?.segura[0].ausente, false);
  assert.equal(e.decide?.caminho?.pontos.length, 7);
  assert.equal(e.decide?.posicao?.pontos.filter((p) => p.nosso).length, 1);
  assert.deepEqual(e.onde?.zonas.map((z) => z.tipo), ["cruza", "informa", "compara", "escuta"]);
  assert.deepEqual(e.sabe?.degraus.map((d) => d.nivel), [1, 2, 3, 4, 5]);
  assert.equal(e.sabe?.degraus[0].onde, null);
  assert.equal(e.mensagem?.duvidas[1].pendencia, null);
  assert.equal(e.mensagem?.provas_faltam[0].origem, null);
  assert.equal(e.apostas?.roteiro?.perguntas.length, 5);
  assert.equal(e.semana?.acoes[2].origem?.tipo, "disse");
  assert.equal(e.fontes.itens.length, 7);
  // hipótese sai com a razão, sem refs
  assert.deepEqual(e.quem?.pessoa[2].origem, {
    tipo: "hipotese",
    razao: "As reclamações públicas são desse tipo; falta ouvir de um cliente se ele chegou com esse medo.",
  });
});

test("a saída é remontada: chave desconhecida não passa adiante", () => {
  const e = com((o) => {
    o.extra_raiz = 1;
    o.quem.perfil[0].lixo = "x";
    o.abertura.retrato.origem.razao = "não vale fora de hipótese";
  });
  assert.ok(e);
  assert.equal("extra_raiz" in e, false);
  assert.deepEqual(Object.keys(e.quem!.perfil[0]).sort(), ["origem", "texto"]);
  assert.deepEqual(Object.keys(e.abertura.retrato.origem).sort(), ["refs", "tipo"]);
});

// ---------------------------------------------------------------------------
// 3.1: invalida o bloco inteiro
// ---------------------------------------------------------------------------

test("sem bloco, bloco sem fechamento ou texto que não é string: null", () => {
  assert.equal(lerEstudo("# Persona\n\nSó texto."), null);
  assert.equal(lerEstudo("```persona-dados\n{}\n"), null);
  assert.equal(lerEstudo("```marca-dados\n" + compacto(exemplo()) + "\n```"), null);
  assert.equal(lerEstudo(undefined as never), null);
  assert.equal(lerEstudo(42 as never), null);
});

test("com dois blocos, vale o primeiro", () => {
  const ruim = documento(null, "{quebrado");
  assert.equal(lerEstudo(ruim + "\n" + documento(exemplo())), null);
  const bom = documento(exemplo());
  assert.ok(lerEstudo(bom + "\n```persona-dados\n{quebrado\n```\n"));
});

test("cerca aceita espaço depois do nome e CRLF", () => {
  const t = "```persona-dados  \r\n" + compacto(exemplo()) + "\r\n  ```\r\n";
  assert.ok(lerEstudo(t));
  assert.equal(extrairBlocoEstudo("```persona-dados x\n{}\n```"), null);
});

test("bloco acima de 64 KB em UTF-8: null", () => {
  const o = exemplo();
  const base = compacto(o);
  // completa com espaço (JSON válido) até passar do teto por 1 byte
  const grande = base + " ".repeat(TETO_BLOCO_ESTUDO_BYTES - new TextEncoder().encode(base).length + 1);
  assert.equal(lerEstudo(documento(o, grande)), null);
  const noLimite = base + " ".repeat(TETO_BLOCO_ESTUDO_BYTES - new TextEncoder().encode(base).length);
  assert.ok(lerEstudo(documento(o, noLimite)));
});

test("JSON quebrado ou que não é objeto: null", () => {
  assert.equal(lerEstudo(documento(null, "{")), null);
  assert.equal(lerEstudo(documento(null, "[]")), null);
  assert.equal(lerEstudo(documento(null, "null")), null);
  assert.equal(validarEstudo("texto"), null);
});

test("versao, documento, empresa e tipo_cliente inválidos derrubam o bloco", () => {
  assert.equal(com((o) => (o.versao = 2)), null);
  assert.equal(com((o) => (o.versao = "1")), null);
  assert.equal(com((o) => (o.documento = "marca")), null);
  assert.equal(com((o) => (o.empresa = "   ")), null);
  assert.equal(com((o) => (o.empresa = "x".repeat(81))), null);
  assert.equal(com((o) => (o.tipo_cliente = "familia")), null);
  assert.ok(com((o) => (o.empresa = "x".repeat(80))));
});

test("fontes ausente, que não é objeto ou com itens que não são lista derrubam o bloco", () => {
  assert.equal(com((o) => delete o.fontes), null);
  assert.equal(com((o) => (o.fontes = [])), null);
  assert.equal(com((o) => (o.fontes.itens = {})), null);
});

test("abertura inválida derruba o bloco", () => {
  assert.equal(com((o) => delete o.abertura), null);
  assert.equal(com((o) => (o.abertura.arquetipo.texto = "x".repeat(91))), null);
  assert.equal(com((o) => (o.abertura.retrato.origem = { tipo: "disse", refs: [] })), null);
  assert.equal(com((o) => (o.abertura.retrato.texto = "linha\nquebrada")), null);
  assert.equal(com((o) => (o.abertura.versao.numero = "1")), null);
  assert.equal(com((o) => (o.abertura.versao.data = "18/11/2026")), null);
  assert.equal(com((o) => (o.abertura.versao.perguntas_dono = 6)), null);
  assert.equal(com((o) => (o.abertura.versao.paginas = 2.5)), null);
  assert.equal(com((o) => (o.abertura.versao.registro_dossie = "")), null);
  // dossie_em é opcional: ausente vira null; presente e inválida derruba
  assert.equal(com((o) => delete o.abertura.versao.dossie_em)?.abertura.versao.dossie_em, null);
  assert.equal(com((o) => (o.abertura.versao.dossie_em = "ontem")), null);
});

test("sem nenhum capítulo com conteúdo: null", () => {
  assert.equal(
    com((o) => {
      for (const id of IDS_CAPITULO) delete o[id];
    }),
    null,
  );
  // um só capítulo basta
  const so = com((o) => {
    for (const id of IDS_CAPITULO) if (id !== "nao") delete o[id];
  });
  assert.deepEqual(so && capitulosDoEstudo(so), ["nao"]);
});

// ---------------------------------------------------------------------------
// 3.2: descarta só o item
// ---------------------------------------------------------------------------

test("fonte ruim sai sozinha; n repetido fica o primeiro; url só https", () => {
  const e = com((o) => {
    o.fontes.itens[1].url = "http://anuncios-bairro.invalid/tecnico-ar";
    o.fontes.itens.push({ n: 1, titulo: "Repetida", url: "https://x.invalid/a", data_acesso: "2026-11-18" });
    o.fontes.itens.push({ n: 1000, titulo: "Fora", url: "https://x.invalid/b", data_acesso: "2026-11-18" });
    o.fontes.itens.push({ n: 8, titulo: "Script", url: "javascript:alert(1)", data_acesso: "2026-11-18" });
    o.fontes.itens.push({ n: 9, titulo: "Aspas", url: 'https://x.invalid/"a', data_acesso: "2026-11-18" });
    o.fontes.itens.push({ n: 10, titulo: "Data", url: "https://x.invalid/c", data_acesso: "2026-18-11x" });
  });
  assert.ok(e);
  assert.deepEqual(e.fontes.itens.map((f) => f.n), [1, 3, 4, 5, 6, 7]);
  assert.equal(e.fontes.itens[0].titulo, "Split com instalação inclusa");
  // [2] deixou de existir: a leitura do mapa cita [2], então a posição cai (o capítulo segue pelo caminho);
  // a terceira descoberta (origem com [2]) e o perfil que citava [2] também
  assert.equal(e.decide?.posicao, null);
  assert.ok(e.decide?.caminho);
  assert.equal(e.descobertas?.itens.length, 2);
  assert.equal(e.nao?.perfis.length, 2);
});

test("mais de 50 fontes: ficam as 50 primeiras", () => {
  const e = com((o) => {
    for (let n = 8; n <= 60; n++) o.fontes.itens.push({ n, titulo: `F${n}`, url: `https://x.invalid/${n}`, data_acesso: "2026-11-18" });
  });
  assert.equal(e?.fontes.itens.length, 50);
});

test("texto vazio, acima do teto, com controle ou que não é string derruba o item, sem cortar", () => {
  const e = com((o) => {
    o.quem.perfil[0].texto = "x".repeat(241);
    o.quem.perfil[1].texto = "tem\ttab";
    o.quem.pessoa[0].texto = 7;
    o.quem.pessoa[1].texto = " ";
  });
  assert.equal(e?.quem?.perfil.length, 1);
  assert.equal(e?.quem?.pessoa.length, 1);
  // teto contado em pontos de código: 240 caracteres acentuados passam
  const ok = com((o) => (o.quem.perfil[0].texto = "ç".repeat(240)));
  assert.equal(ok?.quem?.perfil[0].texto.length, 240);
});

test("origem: tipo desconhecido, refs fora da conta, ref fora das 3 formas, [n] sem fonte, mistura e hipótese sem razão", () => {
  const casos: [string, unknown][] = [
    ["tipo desconhecido", { tipo: "analise", refs: ["B5a"] }],
    ["disse sem refs", { tipo: "disse", refs: [] }],
    ["refs demais", { tipo: "leitura", refs: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"] }],
    ["ref fora das formas", { tipo: "disse", refs: ["dossiê B5a"] }],
    ["código minúsculo", { tipo: "disse", refs: ["b5a"] }],
    ["[n] sem fonte", { tipo: "pesquisa", refs: ["[42]"] }],
    ["disse com [n]", { tipo: "disse", refs: ["[3]"] }],
    ["pesquisa com código", { tipo: "pesquisa", refs: ["B5a"] }],
    ["pesquisa com relato", { tipo: "pesquisa", refs: ["relato 2026-11-18"] }],
    ["hipótese sem razão", { tipo: "hipotese" }],
    ["hipótese com refs", { tipo: "hipotese", refs: ["B5a"], razao: "porque sim" }],
    ["refs que não é lista", { tipo: "disse", refs: "B5a" }],
    ["sem origem", undefined],
  ];
  for (const [nome, origem] of casos) {
    const e = com((o) => (o.nao.perfis[0].origem = origem));
    assert.equal(e?.nao?.perfis.length, 2, nome);
  }
  // formas válidas
  const validas: unknown[] = [
    { tipo: "disse", refs: ["2.4", "relato 2026-11-18", "C10"] },
    { tipo: "leitura", refs: ["B5a", "[3]", "relato 2026-11-18"] },
    { tipo: "hipotese", refs: [], razao: "porque sim" },
  ];
  for (const origem of validas) assert.equal(com((o) => (o.nao.perfis[0].origem = origem))?.nao?.perfis.length, 3);
});

test("lista acima do teto: fica o começo", () => {
  const e = com((o) => {
    for (let i = 0; i < 5; i++) o.quem.perfil.push({ texto: `extra ${i}`, origem: { tipo: "disse", refs: ["B5a"] } });
  });
  assert.equal(e?.quem?.perfil.length, 6);
  assert.equal(e?.quem?.perfil[5].texto, "extra 2");
});

test("enumeração inválida derruba o item", () => {
  const e = com((o) => {
    o.quem.grupo_compra.papeis[3].funcao = "paga";
    o.decide.caminho.pontos[0].estado = "longe";
    o.forcas.empurra[0].peso = 4;
    o.forcas.segura[0].peso = 1.5;
    o.apostas.itens[0].tempo = "1-ano";
    o.onde.zonas[3].tipo = "le";
  });
  assert.equal(e?.quem?.grupo_compra?.papeis.length, 3);
  assert.equal(e?.decide?.caminho?.pontos.length, 6);
  assert.equal(e?.forcas?.empurra.length, 3);
  assert.equal(e?.forcas?.segura.length, 2);
  assert.equal(e?.apostas?.itens.length, 4);
  assert.deepEqual(e?.onde?.zonas.map((z) => z.tipo), ["cruza", "informa", "compara"]);
});

test("nível do papel fora de 0..3 derruba o papel; mais de 2 por nível, fica o começo", () => {
  const e = com((o) => {
    o.quem.grupo_compra.papeis[1].nivel = 4;
    o.quem.grupo_compra.papeis.push({ papel: "Outro", funcao: "usa", nivel: 2, origem: { tipo: "disse", refs: ["C1"] } });
    o.quem.grupo_compra.papeis.push({ papel: "Mais um", funcao: "usa", nivel: 2, origem: { tipo: "disse", refs: ["C1"] } });
  });
  assert.deepEqual(e?.quem?.grupo_compra?.papeis.map((p) => p.papel), ["O casal", "O síndico", "O grupo do prédio", "Outro"]);
});

test("ponto de vazamento sem alerta cai", () => {
  const e = com((o) => delete o.decide.caminho.pontos[3].alerta);
  assert.equal(e?.decide?.caminho?.pontos.some((p) => p.etapa === "Orçamento"), false);
  // alerta é opcional fora do vazamento
  assert.equal(com((o) => (o.decide.caminho.pontos[0].alerta = "Atenção."))?.decide?.caminho?.pontos[0].alerta, "Atenção.");
});

test("zona com tipo repetido: fica a primeira; a tela ordena da mais perto à mais longe", () => {
  const e = com((o) => {
    o.onde.zonas.reverse(); // escuta, compara, informa, cruza
    o.onde.zonas[1] = { tipo: "escuta", lugares: [{ texto: "Repetida", origem: { tipo: "disse", refs: ["C1"] } }], como_chegar: "x" };
  });
  assert.deepEqual(e?.onde?.zonas.map((z) => z.tipo), ["cruza", "informa", "escuta"]);
  assert.equal(e?.onde?.zonas[2].lugares[0].texto, "O conhecido que indicou.");
  assert.deepEqual(com((o) => o.onde.zonas.reverse())?.onde?.zonas.map((z) => z.tipo), ["cruza", "informa", "compara", "escuta"]);
  // zona sem lugar válido cai
  assert.equal(com((o) => (o.onde.zonas[0].lugares = []))?.onde?.zonas.length, 3);
});

test("ênfase que não é trecho do arquétipo: só a ênfase cai", () => {
  const e = com((o) => (o.abertura.arquetipo.enfase = "outra coisa"));
  assert.ok(e);
  assert.equal(e.abertura.arquetipo.enfase, null);
  assert.equal(com((o) => (o.abertura.arquetipo.enfase = "x".repeat(41)))?.abertura.arquetipo.enfase, null);
});

test("extra com capítulo inválido ou igual a descobertas cai sozinho", () => {
  assert.equal(com((o) => (o.descobertas.extra.capitulo = "descobertas"))?.descobertas?.extra, null);
  assert.equal(com((o) => (o.descobertas.extra.capitulo = "fontes"))?.descobertas?.extra, null);
  assert.equal(com((o) => (o.descobertas.extra.capitulo = "decide"))?.descobertas?.extra?.capitulo, "decide");
});

test("caminho com menos de 3 pontos válidos cai; o capítulo segue pelo mapa e critérios", () => {
  const e = com((o) => (o.decide.caminho.pontos = o.decide.caminho.pontos.slice(0, 2)));
  assert.equal(e?.decide?.caminho, null);
  assert.ok(e?.decide?.posicao);
});

test("posição: eixo inválido, menos de 2 pontos, nenhum ou mais de um nosso, ou leitura inválida derrubam a posição", () => {
  assert.equal(com((o) => (o.decide.posicao.eixo_x.esq = "x".repeat(31)))?.decide?.posicao, null);
  assert.equal(com((o) => delete o.decide.posicao.eixo_y)?.decide?.posicao, null);
  assert.equal(com((o) => (o.decide.posicao.pontos = o.decide.posicao.pontos.slice(0, 1)))?.decide?.posicao, null);
  assert.equal(com((o) => (o.decide.posicao.pontos[0].nosso = false))?.decide?.posicao, null);
  assert.equal(com((o) => (o.decide.posicao.pontos[1].nosso = true))?.decide?.posicao, null);
  assert.equal(com((o) => delete o.decide.posicao.leitura)?.decide?.posicao, null);
  // coordenada fora de 0..100 ou não inteira derruba o ponto
  const e = com((o) => {
    o.decide.posicao.pontos[1].x = 101;
    o.decide.posicao.pontos[2].y = 50.5;
  });
  assert.equal(e?.decide?.posicao, null);
  // nome repetido: fica o primeiro
  const r = com((o) => o.decide.posicao.pontos.push({ ...o.decide.posicao.pontos[1] }));
  assert.equal(r?.decide?.posicao?.pontos.length, 3);
});

test("grupo de compra com menos de 2 papéis ou sem nível 0 cai; o capítulo fica", () => {
  assert.equal(com((o) => (o.quem.grupo_compra.papeis = o.quem.grupo_compra.papeis.slice(0, 1)))?.quem?.grupo_compra, null);
  const semCentro = com((o) => (o.quem.grupo_compra.papeis[0].nivel = 1));
  assert.equal(semCentro?.quem?.grupo_compra, null);
  assert.ok(semCentro?.quem?.perfil.length);
});

test("espelho sem parágrafo, sem origem ou sem evidência válida cai", () => {
  assert.equal(com((o) => (o.pensa.espelho.paragrafos = []))?.pensa?.espelho, null);
  assert.equal(com((o) => delete o.pensa.espelho.origem)?.pensa?.espelho, null);
  assert.equal(com((o) => (o.pensa.espelho.evidencias = [{ tipo: "leitura", refs: ["D5"], texto: "x" }]))?.pensa?.espelho, null);
});

test("sabe sem os 5 níveis, com nível repetido, ou com foco inválido: o capítulo sai", () => {
  assert.equal(com((o) => o.sabe.degraus.pop())?.sabe, null);
  assert.equal(com((o) => (o.sabe.degraus[4].nivel = 4))?.sabe, null);
  assert.equal(com((o) => (o.sabe.degraus[2].sinal = ""))?.sabe, null);
  assert.equal(com((o) => (o.sabe.foco = 6))?.sabe, null);
  assert.equal(com((o) => (o.sabe.foco = "3"))?.sabe, null);
  // fora de ordem: a tela ordena
  assert.deepEqual(com((o) => o.sabe.degraus.reverse())?.sabe?.degraus.map((d) => d.nivel), [1, 2, 3, 4, 5]);
});

test("forças: inclinação inválida derruba o capítulo; ausente só vale em empurra", () => {
  assert.equal(com((o) => (o.forcas.inclinacao = "direita"))?.forcas, null);
  const e = com((o) => (o.forcas.segura[0].ausente = true));
  assert.equal(e?.forcas?.segura.length, 2);
  assert.equal(com((o) => (o.forcas.empurra[0].ausente = "sim"))?.forcas?.empurra.length, 3);
  assert.equal(com((o) => (o.forcas.empurra = []) && (o.forcas.segura = []))?.forcas, null);
});

test("descoberta com campo obrigatório inválido ou sem evidência válida cai", () => {
  const e = com((o) => {
    delete o.descobertas.itens[0].o_que_fazer;
    o.descobertas.itens[1].evidencias = [];
  });
  assert.equal(e?.descobertas?.itens.length, 1);
  assert.equal(tituloDoCapitulo(e!, "descobertas"), "Uma coisa que você ainda não tinha visto");
  const nenhuma = com((o) => (o.descobertas.itens = []));
  assert.equal(nenhuma?.descobertas, null);
});

test("capítulo que não é objeto sai; os outros ficam", () => {
  const e = com((o) => {
    o.quem = [];
    o.pensa = "texto";
    o.quer = null;
  });
  assert.ok(e);
  assert.equal(e.quem, null);
  assert.equal(e.pensa, null);
  assert.equal(e.quer, null);
  assert.ok(e.forcas);
});

test("regras de omissão de cada capítulo (seção 1)", () => {
  assert.equal(com((o) => (o.quem.perfil = []) && (o.quem.pessoa = []))?.quem, null);
  assert.equal(com((o) => (o.pensa.acredita = []) && (o.pensa.teme = []) && (o.pensa.deseja = []))?.pensa, null);
  assert.equal(com((o) => delete o.quer.pratico && delete o.quer.ser_visto && delete o.quer.sentir)?.quer, null);
  assert.equal(
    com((o) => {
      delete o.decide.caminho;
      delete o.decide.posicao;
      o.decide.criterios = [];
    })?.decide,
    null,
  );
  assert.equal(com((o) => (o.onde.zonas = []))?.onde, null);
  const semMsg = com((o) => {
    const m = o.mensagem;
    delete m.promessa_hoje;
    delete m.promessa_sugerida;
    m.provas_tem = [];
    m.provas_faltam = [];
    m.duvidas = [];
  });
  assert.equal(semMsg?.mensagem, null);
  assert.equal(com((o) => (o.nao.perfis = []))?.nao, null);
  assert.equal(com((o) => (o.apostas.itens = []))?.apostas, null);
  assert.equal(com((o) => (o.semana.acoes = []))?.semana, null);
});

test("sub-blocos inválidos somem sem levar o capítulo", () => {
  const e = com((o) => {
    o.quem.momento = { texto: "x" };
    o.forcas.leitura.texto = "";
    o.forcas.como_virar = [{ titulo: "x".repeat(61), texto: "y" }];
    o.onde.nao_alcancado = "x".repeat(401);
    o.sabe.leitura.paragrafos = [];
    o.apostas.roteiro.perguntas = ["só uma", "e duas"];
    o.mensagem.risco.origem = { tipo: "pesquisa", refs: ["B1"] };
    o.decide.posicao.ressalva = "\u0007";
  });
  assert.ok(e);
  assert.equal(e.quem?.momento, null);
  assert.equal(e.forcas?.leitura, null);
  assert.deepEqual(e.forcas?.como_virar, []);
  assert.equal(e.onde?.nao_alcancado, null);
  assert.equal(e.sabe?.leitura, null);
  assert.equal(e.apostas?.roteiro, null);
  assert.equal(e.mensagem?.risco, null);
  assert.equal(e.decide?.posicao, null); // opcional presente e inválido derruba o objeto que o contém
});

test("roteiro fora das faixas cai", () => {
  assert.equal(com((o) => (o.apostas.roteiro.conversas = 2))?.apostas?.roteiro, null);
  assert.equal(com((o) => (o.apostas.roteiro.minutos = 61))?.apostas?.roteiro, null);
  assert.equal(com((o) => (o.apostas.roteiro.com_quem = ""))?.apostas?.roteiro, null);
});

test("evidência: só disse ou pesquisa, de 1 a 4 refs", () => {
  const e = com((o) => {
    o.quem.evidencias.push({ tipo: "leitura", refs: ["B5a"], texto: "x" });
    o.quem.evidencias.push({ tipo: "disse", refs: ["B1", "B2", "B3", "B4", "B5"], texto: "x" });
    o.quem.evidencias.push({ tipo: "disse", refs: ["B1"], texto: "x".repeat(241) });
  });
  assert.equal(e?.quem?.evidencias.length, 3);
});

test("dúvida, prova que falta e ação: origem opcional ausente vira null, presente e ruim derruba", () => {
  const e = com((o) => {
    o.mensagem.provas_faltam[0].origem = { tipo: "disse", refs: [] };
    o.semana.acoes[0].origem = { tipo: "hipotese" };
    o.mensagem.duvidas[0].origem_resposta = undefined;
  });
  assert.equal(e?.mensagem?.provas_faltam.length, 2);
  assert.equal(e?.semana?.acoes.length, 3);
  assert.equal(e?.mensagem?.duvidas.length, 3);
});

test("booleano 'nosso' e 'ausente' que não é booleano derrubam o item", () => {
  const e = com((o) => (o.decide.posicao.pontos[1].nosso = "sim"));
  assert.equal(e?.decide?.posicao?.pontos.length, 2);
});

// ---------------------------------------------------------------------------
// Robustez
// ---------------------------------------------------------------------------

test("nunca lança, com qualquer forma no lugar de qualquer campo", () => {
  const venenos: unknown[] = [null, -1, 1e309, "", [], {}, true, [null]];
  const o = exemplo();
  const caminhos: string[][] = [];
  const andar = (v: unknown, c: string[]) => {
    caminhos.push(c);
    if (v && typeof v === "object") for (const [k, f] of Object.entries(v)) andar(f, [...c, k]);
  };
  andar(o, []);
  // até 4 níveis (todo campo de capítulo, de sub-bloco e de item de lista); mais fundo repete as mesmas funções
  for (const c of caminhos.slice(1).filter((x) => x.length <= 4)) {
    for (const v of venenos) {
      const copia = structuredClone(o);
      let alvo = copia;
      for (const k of c.slice(0, -1)) alvo = alvo[k];
      alvo[c[c.length - 1]] = v;
      assert.doesNotThrow(() => validarEstudo(copia), c.join("."));
    }
  }
});

test("__proto__ no JSON não contamina nada", () => {
  const bloco = compacto(exemplo()).replace('{"versao":1', '{"__proto__":{"poluido":true},"versao":1');
  const e = lerEstudo(documento(null, bloco));
  assert.ok(e);
  assert.equal(({} as Record<string, unknown>).poluido, undefined);
});

test("tempo linear: documento grande com muitas cercas abertas e texto longo", () => {
  const medir = (n: number) => {
    const t = ("```persona-dados\n" + "x".repeat(20) + "\n").repeat(n);
    const ini = performance.now();
    lerEstudo(t);
    textoSemDados(t);
    return performance.now() - ini;
  };
  medir(200); // aquece
  const pequeno = medir(1000);
  const grande = medir(8000); // ~ 300 KB, acima do teto do documento
  const medio = medir(5000); // ~ 190 KB, abaixo do teto
  assert.ok(grande < 200, `grande: ${grande.toFixed(1)} ms`);
  assert.ok(medio < Math.max(50, pequeno * 40), `médio ${medio.toFixed(1)} ms vs pequeno ${pequeno.toFixed(1)} ms`);
  // bloco de 64 KB válido inteiro, lido dentro do tempo
  const ini = performance.now();
  for (let i = 0; i < 20; i++) lerEstudo(documento(exemplo()));
  assert.ok(performance.now() - ini < 1000);
});

// ---------------------------------------------------------------------------
// Textos e formatos
// ---------------------------------------------------------------------------

test("textos Para entender: um por capítulo, sem palavra proibida nem travessão", () => {
  assert.deepEqual(Object.keys(PARA_ENTENDER), [...IDS_CAPITULO]);
  for (const id of IDS_CAPITULO) {
    const { texto, tecnico } = PARA_ENTENDER[id];
    for (const t of [texto, tecnico ?? ""]) {
      assert.doesNotMatch(t, /\bCasa\b|empresa\s*os|f[aá]brica|polozi|—|–/i, id);
    }
  }
  assert.match(PARA_ENTENDER.forcas.tecnico ?? "", /Bob Moesta e Chris Spiek/);
  assert.equal(PARA_ENTENDER.descobertas.tecnico, null);
});

test("nota de versão e subtítulo da abertura", () => {
  const e = lerEstudo(documento(exemplo()))!;
  assert.equal(
    notaDeVersao(e),
    "Primeira versão, de 18/11/2026, feita com as 59 perguntas do seu dossiê, 5 perguntas a você e 7 trechos de 5 páginas públicas. Nenhum cliente foi ouvido ainda: o que é aposta está marcado, e o capítulo Apostas mostra como confirmar cada uma.",
  );
  assert.match(subtituloDaAbertura(e), /quando cruzadas entre si e com o que o mercado mostra\.$/);
  const sem = com((o) => {
    o.abertura.versao.numero = "2.1";
    o.abertura.versao.perguntas_dono = 0;
    o.abertura.versao.trechos = 0;
    o.fontes.busca_disponivel = false;
    delete o.apostas;
  })!;
  assert.equal(notaDeVersao(sem), "Versão 2.1, de 18/11/2026, feita com as 59 perguntas do seu dossiê. Nenhum cliente foi ouvido ainda.");
  assert.match(subtituloDaAbertura(sem), /quando cruzadas entre si\.$/);
  assert.equal(notaDeVersao(com((o) => (o.abertura.versao.numero = "1.3"))!).startsWith("Primeira versão,"), true);
  const umaPergunta = com((o) => (o.abertura.versao.perguntas_dono = 1))!;
  assert.match(notaDeVersao(umaPergunta), /, 1 pergunta a você e/);
});

test("referências: códigos juntos com 'e', relato como conversa de DD/MM", () => {
  assert.equal(rotuloDasRefs(["B3", "B4"]), "B3 e B4");
  assert.equal(rotuloDasRefs(["B5b", "C7", "B8"]), "B5b, C7 e B8");
  assert.equal(rotuloDasRefs(["relato 2026-11-18"]), "conversa de 18/11");
  assert.equal(rotuloDasRefs(["C3", "relato 2026-11-18"]), "C3 e conversa de 18/11");
});

test("fontes com a mesma URL viram uma linha; números seguidos viram faixa", () => {
  const e = lerEstudo(documento(exemplo()))!;
  assert.deepEqual(
    fontesAgrupadas(e.fontes).map((g) => [formatarNumerosFonte(g.numeros), g.titulo]),
    [
      ["[1]", "Split com instalação inclusa"],
      ["[2]", "Técnico de ar-condicionado no bairro"],
      ["[3, 4]", "Avaliações de instaladores em Campinas"],
      ["[5, 6]", "Fórum: o que a instalação básica inclui"],
      ["[7]", "Reclamações sobre instalação de ar"],
    ],
  );
  assert.equal(formatarNumerosFonte([7, 8, 9]), "[7 a 9]");
  assert.equal(formatarNumerosFonte([1, 2, 4, 5, 6, 9]), "[1, 2, 4 a 6, 9]");
});

test("textoSemDados tira só a seção Dados para o sistema", () => {
  const t = "# Título\n\n## Em uma frase\n\n- a\n\n## Dados para o sistema\n\n```persona-dados\n{}\n```\n\n## Depois\n\n- b\n";
  const limpo = textoSemDados(t);
  assert.doesNotMatch(limpo, /Dados para o sistema|persona-dados/);
  assert.match(limpo, /## Em uma frase/);
  assert.match(limpo, /## Depois\n\n- b/);
  assert.equal(textoSemDados("sem seção"), "sem seção");
  // título dentro de bloco cercado não encerra a seção
  const cercado = "## Dados para o sistema\n\n```persona-dados\n## falso\n```\n";
  assert.equal(textoSemDados(cercado).trim(), "");
});

test("títulos dos capítulos: descobertas conta os itens", () => {
  const e = lerEstudo(documento(exemplo()))!;
  assert.equal(tituloDoCapitulo(e, "descobertas"), "Três coisas que você ainda não tinha visto");
  assert.equal(tituloDoCapitulo(com((o) => o.descobertas.itens.pop())!, "descobertas"), "Duas coisas que você ainda não tinha visto");
  assert.equal(tituloDoCapitulo(e, "forcas"), "O que empurra para a compra, e o que segura");
});
