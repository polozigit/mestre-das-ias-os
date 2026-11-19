import test from "node:test";
import assert from "node:assert/strict";
import {
  DIVISOES_PERSONA,
  ROTULOS_CAMPOS,
  ROTULOS_ORIGEM,
  TETO_TEXTO_BYTES,
  divisoesDaPersona,
  lerPersona,
  type PersonaCompleta,
} from "./persona-dados.ts";

// Fixtures embutidas: o template é entregue sozinho, então o teste não lê arquivo de fora da pasta.
// PERSONA_COMPLETA é o documento inteiro do molde com pesquisa e planilha de clientes (formato antigo,
// com "Como validar"); PERSONA_PADARIA é o documento enxuto, de rótulos fora do molde.
const PERSONA_COMPLETA = `# Cliente ideal e persona - Padaria Pão Quente

- Estado: rascunho
- Versão: 1.0 (2026-10-08)
- Fonte: dossiê da empresa, registro 2026-10-07_101500 (contexto/dossie/dossie-completo.md)
- Fontes usadas: dossiê; pesquisa pública (2 fontes); dados de clientes (planilha de 2026-10-08, 9 linhas)
- Origem da persona: proto-persona, montada do relato do dono e do que foi pesquisado. Nenhum cliente real foi ouvido ainda; é uma hipótese bem fundamentada, não uma persona confirmada.
- Como ler as marcas: (dossiê 2.4) é o que o dono respondeu na pergunta 2.4; (relato do dono, data) é o que ele disse na conversa da montagem e está no Anexo; (pesquisa [3]) é o que a página número 3 da lista "Fontes da pesquisa" mostra, com o trecho no Anexo; (dados de clientes, data) é o que a planilha de clientes daquele dia mostra, agregada e sem dado pessoal; (hipótese) é dedução do time que ainda precisa de confirmação; (não consta no dossiê) é o que o dossiê não responde.
- Níveis de consciência: 1 não percebe o problema; 2 sente a dor, mas não sabe que existe solução; 3 conhece soluções, mas não escolheu; 4 conhece a empresa, mas ainda não se decidiu; 5 pronto para comprar.

## 1. Cliente ideal

- Mora a até dez quadras da padaria e valoriza pão fresco de manhã (dossiê 2.4).
- É família com criança pequena ou pessoa que trabalha em casa (dossiê 2.4).
- A maioria é pessoa física; algumas empresas encomendam café para reunião (dossiê 2.3).
- Quem decide a compra é a própria pessoa; na empresa, quem pede a mesa de café é quem organiza a reunião (relato do dono, 2026-10-08).
- Na planilha, 6 dos 9 clientes são pessoa física e 6 moram no Centro (dados de clientes, 2026-10-08).
- Compra de novo toda semana, quase uma assinatura informal (dossiê 2.5).
- Compra principalmente no balcão; a encomenda chega pelo WhatsApp (dossiê 2.6).
- Vende mais no inverno e em dezembro; janeiro é fraco (dossiê 2.8).
- Cidade e estado: Londrina, no Paraná (dossiê 1.5).

## 2. Persona: a vizinha do pão fresco

- Nome do arquétipo: a vizinha do pão fresco, só para a equipe conversar sobre ela (proposta do time: não é uma pessoa real).
- Contexto: moradora do bairro, com criança pequena ou trabalhando em casa, que quer o pão da manhã sem sair do trajeto (dossiê 2.4).
- O que quer alcançar: pão fresco na mesa do café; ser a pessoa que serve algo bom em casa; começar o dia sem correria (relato do dono, 2026-10-08).
- O que empurra (dores): o pão acaba cedo e ela não acha alternativa boa de manhã (pesquisa [3]).
- O que puxa (resultado esperado): chegar à padaria e encontrar o pão do dia ainda quente (dossiê 4.2).
- Gatilho de compra: a mesa de café de uma reunião ou de uma visita em casa (dados de clientes, 2026-10-08).
- Objeções e ansiedades: achar o preço mais alto que o da padaria do mercado (dados de clientes, 2026-10-08).
- Hábito que segura: comprar pão embalado no mercado junto com a compra da semana (hipótese).
- Alternativas reais: a padaria do mercado e o pão de forma de pacote (pesquisa [1]).
- Critérios de decisão: frescor, preço e o pão não ter acabado quando ela chega (hipótese).
- Jornada e canais: passa na padaria na ida ou na volta; a encomenda sai pelo WhatsApp (dossiê 2.6).
- Linguagem do cliente: "o pão acabou cedo e não achei nada às sete da manhã" (pesquisa [3]).
- Como a empresa fala dela: o pão sai "fresquinho às seis da manhã todo dia" (dossiê 4.2).

## 3. Nível de consciência por segmento

| Segmento | Nível | Sinal que mostra | O que a comunicação deve fazer |
|---|---|---|---|
| Família do bairro que compra toda semana | 5 pronto para comprar | Volta toda semana (dossiê 2.5) | Avisar a fornada do dia e quando o pão acaba (hipótese) |
| Quem organiza reunião e compra café | 3 conhece soluções | Compara a padaria com o mercado (dados de clientes, 2026-10-08) | Mostrar a mesa de café e o prazo de encomenda (hipótese) |
| Quem só compra pão de pacote no mercado | 2 sente a dor | Reclama de pão que acaba cedo (pesquisa [3]) | Mostrar que o pão fresco existe perto de casa (hipótese) |

## 4. Quem não é o cliente ideal

- Sem dado no dossiê para descrever a anti-persona (não consta no dossiê).
- Cliente que compra uma vez só e some, sem voltar na semana seguinte (relato do dono, 2026-10-08).

## 5. O que ainda não sabemos

| Lacuna | Pergunta para fechar | Quem responde |
|---|---|---|
| Por que o cliente perdido deixou de comprar | Quando o cliente some, o que ele diz? | dono |
| O que mais pesa na escolha entre a padaria e o mercado | O que o cliente compara na hora de escolher? | dono |

## 6. Como validar

Converse com 6 a 10 compradores recentes, cerca de 30 minutos cada, com perguntas abertas, uma por vez. Pergunte o que aconteceu no dia em que decidiram comprar, o que faziam antes e o que quase os fez desistir. Enquanto isso não for feito, esta persona continua sendo proto-persona.

## 7. Fontes da pesquisa

- [1] Como escolher pão de fermentação natural. https://blog.exemplo.invalid/pao-de-fermentacao-natural. Acessado em 2026-10-08.
- [3] Avaliações de padarias de bairro em Londrina. https://mapas.exemplo.invalid/padarias-londrina. Acessado em 2026-10-08.

## Anexo: o que o dono disse na montagem

- 2026-10-08 | Pergunta do time: quem decide a compra e o que ela quer alcançar? | Resposta do dono: "Quem decide é a própria pessoa; na empresa, quem organiza a reunião."
- 2026-10-08 | Pergunta do time: o que o cliente que compra uma vez só faz? | Resposta do dono: "Compra uma vez só e some, sem voltar na semana seguinte."

### Trechos da pesquisa

- [1] "pão de forma de pacote e a padaria do mercado são as opções mais comuns" (https://blog.exemplo.invalid/pao-de-fermentacao-natural)
- [3] "o pão acabou cedo e não achei nada às sete da manhã" (https://mapas.exemplo.invalid/padarias-londrina)

### Dados de clientes

- 2026-10-08 | planilha 9 linhas | "Pao fresquinho de manha" (3 clientes)
- 2026-10-08 | planilha 9 linhas | "preco mais alto" (3 clientes)`;

const PERSONA_PADARIA = `# Cliente ideal e persona - Padaria Pão Quente

- Estado: rascunho
- Versão: 1.0 (2026-10-08)
- Fonte: dossiê da empresa, registro 2026-10-07_101500 (contexto/dossie/dossie-completo.md)
- Fontes usadas: dossiê; sem pesquisa pública; sem dados de clientes
- Origem da persona: proto-persona, montada do relato do dono. Nenhum cliente real foi ouvido ainda; é uma hipótese bem fundamentada, não uma persona confirmada.
- Como ler as marcas: (dossiê 2.4) é o que o dono respondeu na pergunta 2.4; (relato do dono, data) é o que ele disse na conversa da montagem e está no Anexo; (hipótese) é dedução do time que ainda precisa de confirmação; (não consta no dossiê) é o que o dossiê não responde.

## 1. Cliente ideal

- Mora a até dez quadras da padaria e valoriza pão fresco de manhã (dossiê 2.4).
- É família com criança pequena ou pessoa que trabalha em casa (dossiê 2.4).
- A maioria é pessoa física; algumas empresas encomendam café para reunião (dossiê 2.3).
- Compra de novo toda semana, quase uma assinatura informal (dossiê 2.5).
- Compra principalmente no balcão; a encomenda chega pelo WhatsApp (dossiê 2.6).
- Vende mais no inverno e em dezembro; janeiro é fraco (dossiê 2.8).
- Cidade e estado: Londrina, no Paraná (dossiê 1.5).

## 2. Persona: a vizinha do pão fresco

- Nome do arquétipo: a vizinha do pão fresco, só para a equipe conversar sobre ela (proposta do time: não é uma pessoa real).
- Quem é: moradora do bairro, com criança pequena ou trabalhando em casa (dossiê 2.4). Idade, renda e profissão (não consta no dossiê).
- O que valoriza: pão fresco de manhã (dossiê 2.4).
- Como compra: toda semana, no balcão, e encomenda pelo WhatsApp (dossiê 2.5 e 2.6).
- O que reclama: quando o pão acaba cedo, antes das nove (relato do dono, 2026-10-08).
- O que ela não sabe: que a padaria faz encomenda de mesa de café para eventos (dossiê 11.3).
- Pode comparar preço com a padaria do supermercado (hipótese, a partir do dossiê 4.5).
- Como falar com ela: o dono diz que o pão sai "fresquinho às seis da manhã todo dia" (dossiê 4.2).

## 3. Nível de consciência por segmento

| Segmento | Nível | Sinal que mostra | O que a comunicação deve fazer |
|---|---|---|---|
| Família do bairro que compra toda semana | 5 pronto para comprar | Volta toda semana (dossiê 2.5) | Avisar a fornada do dia (hipótese) |

## 4. Quem não é o cliente ideal

- Sem dado no dossiê para descrever a anti-persona (não consta no dossiê).

## 5. O que ainda não sabemos

| Lacuna | Pergunta para fechar | Quem responde |
|---|---|---|
| Maior dor do cliente na hora de comprar | O que mais incomoda quem compra de vocês? | dono |
| Dificuldade na hora de fechar a venda (pergunta 12.3) | Quando o cliente desiste, o que ele diz? | dono |
| Quem são os concorrentes | Quem mais vende pão fresco no bairro? | dono |

## 6. Como validar

Converse com 3 a 5 clientes que compram toda semana, pergunte o que os fez trocar de padaria da última vez e anote aqui o número de conversas e a data. Enquanto isso não for feito, esta persona continua sendo proto-persona.

## 7. Fontes da pesquisa

- Nenhuma pesquisa pública nesta versão.

## Anexo: o que o dono disse na montagem

- 2026-10-08 | Pergunta do time: o que o cliente mais reclama? | Resposta do dono: "Reclamam quando o pão acaba cedo, antes das nove."`;

/** Molde novo: sem "Como validar", fontes na seção 6, marcas de dossiê v2 e uma linha com duas marcas. */
const PERSONA_MOLDE_NOVO = `# Cliente ideal e persona - Oficina Boa Roda

- Estado: rascunho
- Versão: 1.1 (2026-11-18)
- Origem da persona: proto-persona, montada do dossiê e da pesquisa.
- Fontes usadas: dossiê; pesquisa pública (1 fonte)

## 1. Cliente ideal

- Dono de carro com mais de cinco anos de uso, que mora perto da oficina (dossiê B5a e C7).
- Volta a cada seis meses (dossiê B2) (relato do dono, 2026-11-10).
- Compra pelo WhatsApp (material do dono, apresentação de 2026-11-02).

## 2. Persona: o motorista cuidadoso

- Nome do arquétipo: o motorista cuidadoso (proposta do time: não é uma pessoa real).
- Contexto: usa o carro todo dia para trabalhar (dossiê B5a).
- O que quer alcançar: chegar ao trabalho sem susto; ser visto como quem cuida do que é seu; sentir segurança (dossiê B5b).
- O que empurra (dores): ficar parado na estrada (pesquisa [1]).
- Linguagem do cliente: "meu carro me deixou na mão" e “queria saber o preço antes” (pesquisa [1]).

## 3. Nível de consciência por segmento

| Segmento | Nível | Sinal que mostra | O que a comunicação deve fazer |
|---|---|---|---|
| Motorista de aplicativo | 4 conhece a empresa | Pergunta preço no WhatsApp (dossiê C2) | Mandar o orçamento na hora (hipótese) |

## 4. Quem não é o cliente ideal

- Quem só quer o preço mais baixo da cidade (dossiê C6).

## 5. O que ainda não sabemos

| Lacuna | Pergunta para fechar | Quem responde |
|---|---|---|
| Como resolvia antes | Onde levava o carro antes de vir para cá? | dono |

## 6. Fontes da pesquisa

- [1] Avaliações de oficinas do bairro. https://mapas.exemplo.invalid/oficinas. Acessado em 2026-11-12.

## Anexo: o que o dono disse na montagem

- 2026-11-10 | Pergunta do time: quando volta? | Resposta do dono: "A cada seis meses."
`;

const CAMPOS_NULOS = [
  "arquetipo", "contexto", "objetivo", "dores", "resultado", "gatilho",
  "objecoes", "habito", "alternativas", "criterios", "jornada", "linguagem",
] as const;

function persona(texto: string): PersonaCompleta {
  const p = lerPersona(texto);
  assert.notEqual(p, null);
  return p as PersonaCompleta;
}

test("persona_completa: cabeçalho", () => {
  const { cabecalho } = persona(PERSONA_COMPLETA);
  assert.equal(cabecalho.empresa, "Padaria Pão Quente");
  assert.equal(cabecalho.estado, "rascunho");
  assert.equal(cabecalho.versao, "1.0 (2026-10-08)");
  assert.match(cabecalho.origemPersona ?? "", /^proto-persona, montada do relato do dono/);
  assert.equal(
    cabecalho.fontesUsadas,
    "dossiê; pesquisa pública (2 fontes); dados de clientes (planilha de 2026-10-08, 9 linhas)",
  );
});

test("persona_completa: cliente ideal com 9 itens e origens", () => {
  const { clienteIdeal } = persona(PERSONA_COMPLETA);
  assert.equal(clienteIdeal.length, 9);
  assert.deepEqual(clienteIdeal[0], {
    texto: "Mora a até dez quadras da padaria e valoriza pão fresco de manhã",
    origens: [{ tipo: "dossie", detalhe: "2.4" }],
  });
  assert.deepEqual(clienteIdeal[3].origens, [{ tipo: "relato", detalhe: "2026-10-08" }]);
  assert.deepEqual(clienteIdeal[4].origens, [{ tipo: "clientes", detalhe: "2026-10-08" }]);
  assert.equal(clienteIdeal[8].texto, "Cidade e estado: Londrina, no Paraná");
});

test("persona_completa: persona com os 12 campos e o extra", () => {
  const { persona: pf } = persona(PERSONA_COMPLETA);
  assert.ok(pf);
  assert.equal(pf.nome, "a vizinha do pão fresco");
  for (const k of CAMPOS_NULOS) assert.notEqual(pf.campos[k], null, `campo ${k}`);
  assert.deepEqual(pf.campos.arquetipo, {
    texto: "a vizinha do pão fresco, só para a equipe conversar sobre ela",
    origens: [{ tipo: "proposta", detalhe: null }],
  });
  assert.deepEqual(pf.campos.dores?.origens, [{ tipo: "pesquisa", detalhe: "[3]" }]);
  assert.deepEqual(pf.campos.habito?.origens, [{ tipo: "hipotese", detalhe: null }]);
  assert.equal(pf.campos.gatilho?.texto, "a mesa de café de uma reunião ou de uma visita em casa");
  assert.equal(pf.extras.length, 1);
  assert.equal(pf.extras[0].rotulo, "Como a empresa fala dela");
  assert.deepEqual(pf.extras[0].item.origens, [{ tipo: "dossie", detalhe: "4.2" }]);
});

test("persona_completa: objetivo em 3 partes e linguagem em citações", () => {
  const { persona: pf } = persona(PERSONA_COMPLETA);
  assert.ok(pf);
  assert.deepEqual(pf.campos.objetivo?.partes, [
    "pão fresco na mesa do café",
    "ser a pessoa que serve algo bom em casa",
    "começar o dia sem correria",
  ]);
  assert.deepEqual(pf.campos.linguagem?.citacoes, ["o pão acabou cedo e não achei nada às sete da manhã"]);
});

test("persona_completa: tabela de consciência com nível 1 a 5", () => {
  const { consciencia } = persona(PERSONA_COMPLETA);
  assert.equal(consciencia.length, 3);
  assert.equal(consciencia[0].segmento, "Família do bairro que compra toda semana");
  assert.deepEqual(consciencia.map((c) => c.nivel), [5, 3, 2]);
  assert.deepEqual(consciencia.map((c) => c.rotuloNivel), ["pronto para comprar", "conhece soluções", "sente a dor"]);
  assert.deepEqual(consciencia[0].sinal, { texto: "Volta toda semana", origens: [{ tipo: "dossie", detalhe: "2.5" }] });
  assert.deepEqual(consciencia[1].comunicacao.origens, [{ tipo: "hipotese", detalhe: null }]);
});

test("persona_completa: não é cliente, lacunas, fontes e validar", () => {
  const p = persona(PERSONA_COMPLETA);
  assert.equal(p.naoECliente.length, 2);
  assert.deepEqual(p.naoECliente[0].origens, [{ tipo: "nao-consta", detalhe: null }]);
  assert.deepEqual(p.lacunas[0], {
    lacuna: "Por que o cliente perdido deixou de comprar",
    pergunta: "Quando o cliente some, o que ele diz?",
    quem: "dono",
  });
  assert.equal(p.lacunas.length, 2);
  assert.deepEqual(p.fontes, [
    { n: 1, titulo: "Como escolher pão de fermentação natural", url: "https://blog.exemplo.invalid/pao-de-fermentacao-natural", acessado: "2026-10-08" },
    { n: 3, titulo: "Avaliações de padarias de bairro em Londrina", url: "https://mapas.exemplo.invalid/padarias-londrina", acessado: "2026-10-08" },
  ]);
  assert.match(p.validar ?? "", /^Converse com 6 a 10 compradores recentes/);
});

test("persona_completa: placar com números conferidos à mão", () => {
  // Cliente ideal: 8 dossiê/relato + 1 clientes. Persona (13 campos): respondido 5, pesquisa 5, hipótese 3.
  // Consciência (sinal e comunicação): respondido 1, pesquisa 2, hipótese 3. Não cliente: 1 não consta, 1 relato.
  // Lacunas: 2. Anexo e "Como ler as marcas" não contam.
  assert.deepEqual(persona(PERSONA_COMPLETA).placar, { respondido: 15, pesquisa: 8, analise: 0, hipotese: 6, naoSabemos: 3 });
});

test("persona_completa: divisões em ordem fixa", () => {
  assert.deepEqual(divisoesDaPersona(persona(PERSONA_COMPLETA)), [
    "retrato", "cliente", "forcas", "escolha", "palavras", "consciencia", "nao-cliente", "falta", "fontes",
  ]);
});

test("persona_padaria: rótulos fora do molde vão para extras e nada some", () => {
  const p = persona(PERSONA_PADARIA);
  assert.ok(p.persona);
  assert.equal(p.persona.campos.arquetipo?.texto.startsWith("a vizinha"), true);
  assert.deepEqual(p.persona.extras.map((e) => e.rotulo), [
    "Quem é", "O que valoriza", "Como compra", "O que reclama", "O que ela não sabe", "Observação", "Como falar com ela",
  ]);
  // Rótulo desconhecido com a marca "não consta" dentro do texto: a marca do fim é a de dossiê.
  assert.equal(p.persona.extras[0].item.texto.startsWith("moradora do bairro"), true);
  assert.deepEqual(p.persona.extras[0].item.origens, [{ tipo: "nao-consta", detalhe: null }]);
  // Linha sem rótulo e com marca "(hipótese, a partir do dossiê 4.5)".
  assert.deepEqual(p.persona.extras[5].item.origens, [{ tipo: "hipotese", detalhe: null }]);
  assert.equal(p.lacunas.length, 3);
  assert.deepEqual(p.fontes, []); // "Nenhuma pesquisa pública nesta versão." não é fonte
  assert.equal(p.consciencia.length, 1);
  // Conferido à mão: cliente ideal 7 respondido; persona 5 respondido, 2 hipótese (arquétipo e a linha sem rótulo),
  // 1 não consta ("Quem é"); consciência 1 respondido e 1 hipótese; não cliente 1 não consta; 3 lacunas.
  assert.deepEqual(p.placar, { respondido: 13, pesquisa: 0, analise: 0, hipotese: 3, naoSabemos: 5 });
});

test("molde novo: sem Como validar, marcas de dossiê v2 e linha com duas marcas", () => {
  const p = persona(PERSONA_MOLDE_NOVO);
  assert.equal(p.validar, null);
  assert.equal(p.cabecalho.empresa, "Oficina Boa Roda");
  assert.equal(p.cabecalho.versao, "1.1 (2026-11-18)");
  assert.deepEqual(p.clienteIdeal[0].origens, [{ tipo: "dossie", detalhe: "B5a e C7" }]);
  assert.equal(p.clienteIdeal[0].texto, "Dono de carro com mais de cinco anos de uso, que mora perto da oficina");
  // duas marcas na mesma linha: as duas entram, na ordem em que aparecem
  assert.deepEqual(p.clienteIdeal[1], {
    texto: "Volta a cada seis meses",
    origens: [
      { tipo: "dossie", detalhe: "B2" },
      { tipo: "relato", detalhe: "2026-11-10" },
    ],
  });
  assert.deepEqual(p.clienteIdeal[2].origens, [{ tipo: "material", detalhe: "apresentação de 2026-11-02" }]);
  assert.deepEqual(p.fontes, [
    { n: 1, titulo: "Avaliações de oficinas do bairro", url: "https://mapas.exemplo.invalid/oficinas", acessado: "2026-11-12" },
  ]);
  assert.deepEqual(p.persona?.campos.linguagem?.citacoes, ["meu carro me deixou na mão", "queria saber o preço antes"]);
  assert.equal(p.consciencia[0].nivel, 4);
  // item com duas origens conta só na primeira (dossiê): 1 (B5a e C7) + 1 (B2+relato) + 1 (material) = 3 respondido
  // persona: arquétipo (proposta), contexto, objetivo, dores (pesquisa), linguagem (pesquisa); consciência: sinal, comunicação
  assert.deepEqual(p.placar, { respondido: 3 + 2 + 1 + 1, pesquisa: 2, analise: 0, hipotese: 1 + 1, naoSabemos: 1 });
});

test("molde novo: divisões só com conteúdo", () => {
  assert.deepEqual(divisoesDaPersona(persona(PERSONA_MOLDE_NOVO)), [
    "retrato", "cliente", "forcas", "palavras", "consciencia", "nao-cliente", "falta", "fontes",
  ]);
});

test("documento que não é persona devolve null", () => {
  assert.equal(lerPersona("# Tom de voz\n\n## 1. Princípios\n\n- Falar claro.\n"), null);
  assert.equal(lerPersona(""), null);
  assert.equal(lerPersona("texto solto sem seção nenhuma"), null);
});

test("nunca lança com entrada estranha", () => {
  for (const x of [undefined, null, 42, {}, [], "\u0000\u0000", "## "]) {
    assert.doesNotThrow(() => lerPersona(x as unknown as string));
    assert.equal(lerPersona(x as unknown as string), null);
  }
});

test("só com Cliente ideal, ainda é persona; sem persona o resto fica vazio", () => {
  const p = persona("# Cliente ideal e persona - X\n\n## 1. Cliente ideal\n\n- Gente do bairro (dossiê 2.4).\n");
  assert.equal(p.persona, null);
  assert.equal(p.clienteIdeal.length, 1);
  assert.deepEqual(p.consciencia, []);
  assert.deepEqual(p.lacunas, []);
  assert.deepEqual(p.fontes, []);
  assert.deepEqual(p.placar, { respondido: 1, pesquisa: 0, analise: 0, hipotese: 0, naoSabemos: 0 });
  assert.deepEqual(divisoesDaPersona(p), ["cliente"]);
});

test("só com seção Persona (sem Cliente ideal) também é reconhecida", () => {
  const p = persona("## 2. Persona: a Ana\n\n- Contexto: mora longe (hipótese).\n");
  assert.equal(p.persona?.nome, "a Ana");
  assert.equal(p.persona?.campos.contexto?.texto, "mora longe");
  assert.equal(p.cabecalho.empresa, null);
});

test("rótulo desconhecido vai para extras e rótulo repetido não some", () => {
  const p = persona(
    "## Persona: Teste\n\n- Contexto: primeiro (hipótese)\n- Contexto: segundo (dossiê 1)\n- Cor favorita: azul (relato do dono, 2026-10-01)\n",
  );
  assert.equal(p.persona?.campos.contexto?.texto, "primeiro");
  assert.deepEqual(p.persona?.extras.map((e) => [e.rotulo, e.item.texto]), [["Contexto", "segundo"], ["Cor favorita", "azul"]]);
});

test("parêntese que não é marca fica no texto", () => {
  const p = persona("## 1. Cliente ideal\n\n- Mora em Londrina (Paraná) e compra aos sábados (dossiê 2.6).\n- Prefere pão de sal (o francês) (hipótese).\n- Termina com parêntese comum (Paraná)\n");
  assert.equal(p.clienteIdeal[0].texto, "Mora em Londrina (Paraná) e compra aos sábados");
  assert.deepEqual(p.clienteIdeal[0].origens, [{ tipo: "dossie", detalhe: "2.6" }]);
  assert.equal(p.clienteIdeal[1].texto, "Prefere pão de sal (o francês)");
  assert.deepEqual(p.clienteIdeal[2], { texto: "Termina com parêntese comum (Paraná)", origens: [] });
});

test("marcas reconhecidas sem acento, sem caixa e com ponto depois", () => {
  const p = persona(
    [
      "## 1. Cliente ideal",
      "",
      "- a (DOSSIE 3.1).",
      "- b (Hipotese)",
      "- c (nao consta)",
      "- d (não consta no dossiê).",
      "- e (Proposta do time)",
      "- f (pesquisa [2])",
      "- g (dados de clientes, 2026-09-01)",
      "- h (material do dono: site novo)",
    ].join("\n"),
  );
  assert.deepEqual(p.clienteIdeal.map((i) => i.origens[0]), [
    { tipo: "dossie", detalhe: "3.1" },
    { tipo: "hipotese", detalhe: null },
    { tipo: "nao-consta", detalhe: null },
    { tipo: "nao-consta", detalhe: null },
    { tipo: "proposta", detalhe: null },
    { tipo: "pesquisa", detalhe: "[2]" },
    { tipo: "clientes", detalhe: "2026-09-01" },
    { tipo: "material", detalhe: "site novo" },
  ]);
  assert.deepEqual(p.clienteIdeal.map((i) => i.texto), ["a", "b", "c", "d", "e", "f", "g", "h"]);
});

test("objetivo com número de partes diferente de 3 fica em texto só", () => {
  const dois = persona("## Persona: A\n\n- O que quer alcançar: um; dois (hipótese)\n");
  assert.equal(dois.persona?.campos.objetivo?.partes, null);
  assert.equal(dois.persona?.campos.objetivo?.texto, "um; dois");
  const quatro = persona("## Persona: A\n\n- O que quer alcançar: um; dois; três; quatro\n");
  assert.equal(quatro.persona?.campos.objetivo?.partes, null);
  const vazia = persona("## Persona: A\n\n- O que quer alcançar: um; ; três\n");
  assert.equal(vazia.persona?.campos.objetivo?.partes, null);
});

test("tabela de consciência torta: nível fora de 1 a 5, sem número, linha curta e sem separador", () => {
  const p = persona(
    [
      "## 1. Cliente ideal",
      "",
      "- Alguém (hipótese)",
      "",
      "## 3. Nível de consciência por segmento",
      "",
      "| Segmento | Nível | Sinal | Comunicação |",
      "|---|---|---|---|",
      "| Seis | 6 acima | s1 | c1 |",
      "| Sem número | conhece tudo | s2 | c2 |",
      "| Curta | 2 sente a dor |",
      "| | 3 vazia | x | y |",
      "| Só nome |",
    ].join("\n"),
  );
  // linha com número de colunas diferente do cabeçalho (4) é descartada
  assert.deepEqual(p.consciencia.map((c) => [c.segmento, c.nivel]), [["Seis", null], ["Sem número", null]]);
  assert.equal(p.consciencia[1].rotuloNivel, "conhece tudo");
  const sem = persona("## 1. Cliente ideal\n\n- A (hipótese)\n\n## 3. Nível de consciência por segmento\n\n| Segmento | Nível | Sinal | Comunicação |\n| Alguém | 1 não percebe | s | c |\n");
  assert.equal(sem.consciencia.length, 1);
  assert.equal(sem.consciencia[0].nivel, 1);
});

test("fonte com link que não é http(s) fica sem url", () => {
  const p = persona(
    [
      "## 1. Cliente ideal",
      "",
      "- Alguém (hipótese)",
      "",
      "## 6. Fontes da pesquisa",
      "",
      "- [1] Boa. https://ok.exemplo.invalid/a. Acessado em 2026-10-01.",
      "- [2] Ruim. javascript:alert(1). Acessado em 2026-10-02.",
      "- [3] Outra. ftp://x.exemplo.invalid/arquivo. Acessado em 2026-10-03.",
      "- [4] Sem link nenhum.",
      "- [5] Com espaço. https://exemplo.invalid/a b",
      "- Sem número nenhum https://exemplo.invalid/c",
    ].join("\n"),
  );
  assert.deepEqual(p.fontes.map((f) => [f.n, f.url]), [
    [1, "https://ok.exemplo.invalid/a"],
    [2, null],
    [3, null],
    [4, null],
    [5, "https://exemplo.invalid/a"],
  ]);
  assert.equal(p.fontes[0].acessado, "2026-10-01");
  assert.equal(p.fontes[3].acessado, null);
  assert.ok(!p.fontes[1].titulo.includes("javascript"));
});

test("texto acima de 200 KB devolve null", () => {
  const base = "## 1. Cliente ideal\n\n- Gente do bairro (dossiê 2.4).\n";
  assert.notEqual(lerPersona(base), null);
  const gigante = base + "x".repeat(TETO_TEXTO_BYTES);
  assert.equal(lerPersona(gigante), null);
});

test("item gigante é cortado com reticências, e a marca do fim ainda vale", () => {
  const p = persona(`## 1. Cliente ideal\n\n- ${"a".repeat(5000)} (dossiê 2.4)\n`);
  assert.ok(p.clienteIdeal[0].texto.length <= 1200);
  assert.ok(p.clienteIdeal[0].texto.endsWith("…"));
  assert.deepEqual(p.clienteIdeal[0].origens, [{ tipo: "dossie", detalhe: "2.4" }]);
});

test("listas passam de 40 itens e são cortadas em 40", () => {
  const linhas = Array.from({ length: 60 }, (_, i) => `- item ${i} (hipótese)`).join("\n");
  const p = persona(`## 1. Cliente ideal\n\n${linhas}\n`);
  assert.equal(p.clienteIdeal.length, 40);
  assert.equal(p.placar.hipotese, 40);
});

test("seção dentro de bloco de código não vira seção", () => {
  const p = persona("## 1. Cliente ideal\n\n- Um (hipótese)\n\n```\n## 5. O que ainda não sabemos\n| a | b | c |\n```\n");
  assert.deepEqual(p.lacunas, []);
});

test("CRLF funciona igual a LF", () => {
  const a = persona(PERSONA_COMPLETA);
  const b = persona(PERSONA_COMPLETA.replace(/\n/g, "\r\n"));
  assert.deepEqual(b, a);
});

test("listas de ids e rótulos cobrem tudo que a tela precisa", () => {
  assert.deepEqual(DIVISOES_PERSONA.map((d) => d.id), [
    "descobertas", "retrato", "cliente", "forcas", "escolha", "palavras", "consciencia", "plano", "nao-cliente", "falta", "fontes",
  ]);
  assert.equal(DIVISOES_PERSONA.find((d) => d.id === "descobertas")?.rotulo, "Descobertas");
  assert.equal(DIVISOES_PERSONA.find((d) => d.id === "plano")?.rotulo, "O que fazer");
  assert.equal(ROTULOS_ORIGEM.analise, "Análise do especialista");
  assert.ok(DIVISOES_PERSONA.every((d) => d.rotulo.length > 0));
  assert.equal(ROTULOS_CAMPOS.dores, "O que incomoda hoje");
  assert.equal(ROTULOS_CAMPOS.jornada, "Caminho até a compra");
  assert.equal(ROTULOS_ORIGEM["nao-consta"], "Não sabemos");
  assert.equal(ROTULOS_ORIGEM.relato, "Você contou");
  assert.equal(Object.keys(ROTULOS_ORIGEM).length, 9);
});

// ---------------------------------------------------------------------------
// Molde do especialista (spec 2026-11-18): oferta em foco, Descobertas, Plano de mensagem, marca (análise: ...)
// ---------------------------------------------------------------------------

const PERSONA_ESPECIALISTA = `# Cliente ideal e persona - Oficina Boa Roda

- Estado: rascunho
- Versão: 2.0 (2026-11-18)
- Oferta em foco: revisão completa com orçamento na hora (dossiê B3)
- Origem da persona: primeira versão, montada do que o dono respondeu e do que é público na internet; nenhum cliente foi ouvido.
- Fontes usadas: dossiê; pesquisa pública (2 fontes)

## 1. Cliente ideal

- Dono de carro com mais de cinco anos de uso (dossiê B5a).
- Escolhe pela confiança, não pelo menor preço (análise: dossiê B5b + pesquisa [2]).

## 2. Persona: o motorista cuidadoso

- Nome do arquétipo: o motorista cuidadoso (proposta do time: não é uma pessoa real).
- Faixa de idade: 35 a 55 anos (dossiê B5a).
- Contexto: usa o carro todo dia para trabalhar (dossiê B5a).
- O que empurra (dores): medo de ficar parado na estrada (pesquisa [1]).

## 3. Nível de consciência por segmento

| Segmento | Nível | Sinal que mostra | O que a comunicação deve fazer |
|---|---|---|---|
| Motorista de aplicativo | 4 conhece a empresa | Pergunta preço no WhatsApp (dossiê C2) | Mandar o orçamento na hora (análise: dossiê C2 + pesquisa [1]) |

## 4. Quem não é o cliente ideal

- Quem só quer o preço mais baixo da cidade (dossiê C6).

## 5. Descobertas

| Descoberta | O que você disse | O que o mercado mostra | O que fazer |
|---|---|---|---|
| O cliente tem medo de ser enganado no orçamento (análise: dossiê B8 + pesquisa [2]) | O cliente pede o preço antes de tudo (dossiê B8) | As avaliações reclamam de orçamento que muda no fim (pesquisa [2]) | Mandar foto da peça e o orçamento por escrito antes do serviço (análise: pesquisa [2]) |
| Quem volta é quem foi bem atendido na primeira vez (Analise: relato 2026-11-10) | Volta a cada seis meses (relato do dono, 2026-11-10) | Nada encontrado sobre isso (não consta) | Ligar seis meses depois para lembrar da revisão (hipótese) |

## 6. Plano de mensagem

- Promessa central: revisão sem surpresa no preço (análise: dossiê B8 + pesquisa [2]).
- Provas: doze anos no mesmo endereço (dossiê D6).
- Onde e quando falar: no WhatsApp, logo depois do primeiro contato (dossiê C1).
- Garantia: três meses em toda peça trocada (dossiê D7).

| Dúvida do cliente | Resposta pronta |
|---|---|
| E se o preço mudar no meio do serviço? (dossiê C7) | Nada muda sem você aprovar por escrito (análise: dossiê C10 + pesquisa [2]) |
| Quanto tempo fico sem o carro? (hipótese) | A revisão sai no mesmo dia, se o carro chegar até as nove (dossiê C10) |

## 7. O que ainda não sabemos

| Lacuna | Pergunta para fechar | Quem responde |
|---|---|---|
| Como resolvia antes | Onde levava o carro antes de vir para cá? | dono |

## 8. Fontes da pesquisa

- [1] Avaliações de oficinas do bairro. https://mapas.exemplo.invalid/oficinas. Acessado em 2026-11-12.
- [2] Reclamações de orçamento em oficinas. https://reclama.exemplo.invalid/oficinas. Acessado em 2026-11-12.

## Anexo: o que o dono disse na montagem

- 2026-11-10 | Pergunta do time: quando volta? | Resposta do dono: "A cada seis meses."
`;

test("especialista: oferta em foco no cabeçalho, sem a marca", () => {
  const { cabecalho } = persona(PERSONA_ESPECIALISTA);
  assert.equal(cabecalho.ofertaEmFoco, "revisão completa com orçamento na hora");
  assert.equal(cabecalho.empresa, "Oficina Boa Roda");
  assert.match(cabecalho.origemPersona ?? "", /^primeira versão, montada do que o dono respondeu/);
});

test("especialista: marca (análise: ...) vira origem analise com o detalhe depois de 'análise:'", () => {
  const p = persona(PERSONA_ESPECIALISTA);
  assert.deepEqual(p.clienteIdeal[1], {
    texto: "Escolhe pela confiança, não pelo menor preço",
    origens: [{ tipo: "analise", detalhe: "dossiê B5b + pesquisa [2]" }],
  });
  assert.deepEqual(p.consciencia[0].comunicacao.origens, [{ tipo: "analise", detalhe: "dossiê C2 + pesquisa [1]" }]);
  // sem acento e com maiúscula também vale
  assert.deepEqual(p.descobertas[1].descoberta.origens, [{ tipo: "analise", detalhe: "relato 2026-11-10" }]);
});

test("especialista: descobertas em 4 colunas, cada uma com texto e origem", () => {
  const { descobertas } = persona(PERSONA_ESPECIALISTA);
  assert.equal(descobertas.length, 2);
  assert.deepEqual(descobertas[0], {
    descoberta: { texto: "O cliente tem medo de ser enganado no orçamento", origens: [{ tipo: "analise", detalhe: "dossiê B8 + pesquisa [2]" }] },
    voceDisse: { texto: "O cliente pede o preço antes de tudo", origens: [{ tipo: "dossie", detalhe: "B8" }] },
    mercadoMostra: { texto: "As avaliações reclamam de orçamento que muda no fim", origens: [{ tipo: "pesquisa", detalhe: "[2]" }] },
    oQueFazer: { texto: "Mandar foto da peça e o orçamento por escrito antes do serviço", origens: [{ tipo: "analise", detalhe: "pesquisa [2]" }] },
  });
  assert.deepEqual(descobertas[1].voceDisse.origens, [{ tipo: "relato", detalhe: "2026-11-10" }]);
  assert.deepEqual(descobertas[1].mercadoMostra.origens, [{ tipo: "nao-consta", detalhe: null }]);
  assert.deepEqual(descobertas[1].oQueFazer.origens, [{ tipo: "hipotese", detalhe: null }]);
});

test("especialista: plano de mensagem com promessa, provas, onde e quando, dúvidas e extra", () => {
  const { plano } = persona(PERSONA_ESPECIALISTA);
  assert.ok(plano);
  assert.deepEqual(plano.promessa, { texto: "revisão sem surpresa no preço", origens: [{ tipo: "analise", detalhe: "dossiê B8 + pesquisa [2]" }] });
  assert.deepEqual(plano.provas, { texto: "doze anos no mesmo endereço", origens: [{ tipo: "dossie", detalhe: "D6" }] });
  assert.deepEqual(plano.ondeQuando, { texto: "no WhatsApp, logo depois do primeiro contato", origens: [{ tipo: "dossie", detalhe: "C1" }] });
  assert.deepEqual(plano.extras, [{ rotulo: "Garantia", item: { texto: "três meses em toda peça trocada", origens: [{ tipo: "dossie", detalhe: "D7" }] } }]);
  assert.equal(plano.duvidas.length, 2);
  assert.deepEqual(plano.duvidas[0], {
    duvida: { texto: "E se o preço mudar no meio do serviço?", origens: [{ tipo: "dossie", detalhe: "C7" }] },
    resposta: { texto: "Nada muda sem você aprovar por escrito", origens: [{ tipo: "analise", detalhe: "dossiê C10 + pesquisa [2]" }] },
  });
  assert.deepEqual(plano.duvidas[1].duvida.origens, [{ tipo: "hipotese", detalhe: null }]);
});

test("especialista: lacunas (seção 7) e fontes (seção 8) achadas pelo título", () => {
  const p = persona(PERSONA_ESPECIALISTA);
  assert.deepEqual(p.lacunas, [{ lacuna: "Como resolvia antes", pergunta: "Onde levava o carro antes de vir para cá?", quem: "dono" }]);
  assert.deepEqual(p.fontes.map((f) => [f.n, f.url]), [
    [1, "https://mapas.exemplo.invalid/oficinas"],
    [2, "https://reclama.exemplo.invalid/oficinas"],
  ]);
  // "Faixa de idade" não é campo do molde da tela: vai para os extras do Retrato, sem sumir
  assert.deepEqual(p.persona?.extras.map((e) => e.rotulo), ["Faixa de idade"]);
});

test("especialista: placar com os 5 números conferidos à mão", () => {
  // Cliente ideal: respondido 1, análise 1. Persona: arquétipo (proposta) hipótese, faixa e contexto respondido, dores pesquisa.
  // Consciência: sinal respondido, comunicação análise. Não cliente: respondido 1.
  // Descobertas: linha 1 análise, respondido, pesquisa, análise; linha 2 análise, respondido, não consta, hipótese.
  // Plano: promessa análise; provas, onde e quando e garantia respondido; dúvidas: respondido + análise, hipótese + respondido.
  // Lacunas: 1.
  assert.deepEqual(persona(PERSONA_ESPECIALISTA).placar, {
    respondido: 1 + 2 + 1 + 1 + 2 + 3 + 2,
    pesquisa: 1 + 1,
    analise: 1 + 1 + 3 + 1 + 1,
    hipotese: 1 + 1 + 1,
    naoSabemos: 1 + 1,
  });
});

test("especialista: divisões novas na ordem fixa (descobertas primeiro, plano depois de consciência)", () => {
  assert.deepEqual(divisoesDaPersona(persona(PERSONA_ESPECIALISTA)), [
    "descobertas", "retrato", "cliente", "forcas", "consciencia", "plano", "nao-cliente", "falta", "fontes",
  ]);
});

test("documento sem as partes novas: descobertas vazia, plano null, sem oferta em foco", () => {
  for (const doc of [PERSONA_COMPLETA, PERSONA_PADARIA, PERSONA_MOLDE_NOVO]) {
    const p = persona(doc);
    assert.deepEqual(p.descobertas, []);
    assert.equal(p.plano, null);
    assert.equal(p.cabecalho.ofertaEmFoco, null);
    assert.equal(p.placar.analise, 0);
    const d = divisoesDaPersona(p);
    assert.ok(!d.includes("descobertas") && !d.includes("plano"));
  }
});

test("plano só com dúvidas aparece; plano vazio existe mas não vira divisão; descoberta sem frase é ignorada", () => {
  const base = "## 1. Cliente ideal\n\n- Alguém (hipótese)\n\n";
  const soDuvidas = persona(`${base}## 6. Plano de mensagem\n\n| Dúvida do cliente | Resposta pronta |\n|---|---|\n| Demora? | Não (dossiê C10) |\n`);
  assert.ok(soDuvidas.plano);
  assert.equal(soDuvidas.plano.promessa, null);
  assert.deepEqual(soDuvidas.plano.duvidas[0].duvida, { texto: "Demora?", origens: [] });
  assert.ok(divisoesDaPersona(soDuvidas).includes("plano"));
  const vazio = persona(`${base}## 6. Plano de mensagem\n\nEm montagem.\n`);
  assert.deepEqual(vazio.plano, { promessa: null, provas: null, ondeQuando: null, duvidas: [], extras: [] });
  assert.ok(!divisoesDaPersona(vazio).includes("plano"));
  const torta = persona(`${base}## 5. Descobertas\n\n| Descoberta | O que você disse | O que o mercado mostra | O que fazer |\n|---|---|---|---|\n| | a | b | c |\n| Curta (análise: dossiê B1) |\n`);
  // sem frase na conclusão sai; linha com menos colunas que o cabeçalho (4) é descartada
  assert.equal(torta.descobertas.length, 0);
});

// ---------------------------------------------------------------------------
// Revisão de código: entrada não confiável (texto escrito por IA)
// ---------------------------------------------------------------------------

function emMenosDe(ms: number, fn: () => void) {
  const t = performance.now();
  fn();
  const gasto = performance.now() - t;
  assert.ok(gasto < ms, `levou ${Math.round(gasto)} ms (limite ${ms})`);
}
const ESPACOS = " ".repeat(190 * 1024);

test("tempo linear: título # e ## com 190 KB de espaços resolvem em menos de 500 ms", () => {
  emMenosDe(500, () => lerPersona(`# a${ESPACOS}b\n\n## 1. Cliente ideal\n\n- x (hipótese)\n`));
  emMenosDe(500, () => lerPersona(`## 1. Cliente ideal\n\n- x (hipótese)\n\n## a${ESPACOS}b\n\n- y\n`));
  emMenosDe(500, () => lerPersona(`# ${ESPACOS}\n## 1. Cliente ideal\n\n- x (hipótese)\n`));
});

test("tempo linear: item de lista, tabela e fonte com 190 KB de espaços ou pontos", () => {
  emMenosDe(500, () => lerPersona(`## 1. Cliente ideal\n\n- a${ESPACOS}b\n- c${"." .repeat(100000)}d\n`));
  emMenosDe(500, () => lerPersona(`## 1. Cliente ideal\n\n- x (hipótese)\n\n## 3. Nível de consciência\n\n| Segmento | Nível |\n|---|---|\n| a${ESPACOS}b | 2 |\n`));
  emMenosDe(500, () => lerPersona(`## 1. Cliente ideal\n\n- x (hipótese)\n\n## 8. Fontes\n\n- [1] a${ESPACOS}b https://x.exemplo/a\n`));
  emMenosDe(500, () => lerPersona(`## 2. Persona: Ana\n\n- Objetivo: a${ESPACOS}b\n- Contexto: ${"(".repeat(90000)}\n`));
});

test("barra invertida antes do pipe fica dentro da célula e não desloca as colunas", () => {
  const p = persona(
    [
      "## 1. Cliente ideal",
      "",
      "- Alguém (hipótese)",
      "",
      "## 3. Nível de consciência por segmento",
      "",
      "| Segmento | Nível | Sinal | Comunicação |",
      "|---|---|---|---|",
      "| Pequeno \\| médio | 2 sente a dor | tem \\| não tem (hipótese) | falar claro (hipótese) |",
      "",
      "## 5. Descobertas",
      "",
      "| Descoberta | O que você disse | O que o mercado mostra | O que fazer |",
      "|---|---|---|---|",
      "| A \\| B (hipótese) | disse \\| outra (dossiê B1) | mostra \\| outra (pesquisa [1]) | agir \\| já (hipótese) |",
      "| Linha com 3 | x | y |",
      "| Linha com 5 | x | y | z | w |",
      "",
      "## 6. Plano de mensagem",
      "",
      "| Dúvida do cliente | Resposta pronta |",
      "|---|---|",
      "| E se \\| quando? (hipótese) | Sempre \\| ou nunca (hipótese) |",
      "| Torta | a | b |",
      "",
      "## 7. O que ainda não sabemos",
      "",
      "| Lacuna | Pergunta para fechar | Quem responde |",
      "|---|---|---|",
      "| L \\| M | P \\| Q | dono \\| time |",
      "| Curta | só duas |",
    ].join("\n"),
  );
  assert.equal(p.consciencia.length, 1);
  assert.equal(p.consciencia[0].segmento, "Pequeno | médio");
  assert.equal(p.consciencia[0].nivel, 2);
  assert.equal(p.consciencia[0].sinal.texto, "tem | não tem");
  assert.equal(p.consciencia[0].sinal.origens[0].tipo, "hipotese");
  assert.equal(p.consciencia[0].comunicacao.texto, "falar claro");
  assert.equal(p.descobertas.length, 1);
  assert.equal(p.descobertas[0].descoberta.texto, "A | B");
  assert.equal(p.descobertas[0].voceDisse.texto, "disse | outra");
  assert.equal(p.descobertas[0].voceDisse.origens[0].tipo, "dossie");
  assert.equal(p.descobertas[0].mercadoMostra.origens[0].tipo, "pesquisa");
  assert.equal(p.descobertas[0].oQueFazer.texto, "agir | já");
  assert.equal(p.plano?.duvidas.length, 1);
  assert.equal(p.plano?.duvidas[0].duvida.texto, "E se | quando?");
  assert.equal(p.plano?.duvidas[0].resposta.texto, "Sempre | ou nunca");
  assert.deepEqual(p.lacunas, [{ lacuna: "L | M", pergunta: "P | Q", quem: "dono | time" }]);
});

test("célula que termina em barra invertida antes do pipe final não perde a coluna", () => {
  const p = persona("## 1. Cliente ideal\n\n- A (hipótese)\n\n## 7. O que ainda não sabemos\n\n| Lacuna | Pergunta | Quem |\n|---|---|---|\n| a | b | c \\||\n");
  assert.deepEqual(p.lacunas, [{ lacuna: "a", pergunta: "b", quem: "c |" }]);
});

test("Cliente ideal com sufixo no título (ICP) é lida; Cliente ideal e persona não é a seção", () => {
  const icp = persona("## 1. Cliente ideal (ICP)\n\n- Dono de oficina (dossiê B1)\n");
  assert.equal(icp.clienteIdeal.length, 1);
  assert.equal(icp.clienteIdeal[0].texto, "Dono de oficina");
  assert.equal(persona("## Cliente ideal: quem é\n\n- A (hipótese)\n").clienteIdeal.length, 1);
  assert.equal(lerPersona("## Cliente ideal e persona\n\n- A (hipótese)\n"), null);
  assert.equal(lerPersona("## Cliente idealizado\n\n- A (hipótese)\n"), null);
});

test("nome da persona: aceita dois-pontos, hífen, meia-risca e travessão; sem separador não há nome", () => {
  assert.equal(persona("## 2. Persona — Ana\n\n- Contexto: x (hipótese)\n").persona?.nome, "Ana");
  assert.equal(persona("## 2. Persona – Ana\n\n- Contexto: x (hipótese)\n").persona?.nome, "Ana");
  assert.equal(persona("## 2. Persona - Ana\n\n- Contexto: x (hipótese)\n").persona?.nome, "Ana");
  assert.equal(persona("## 2. Persona: Ana\n\n- Contexto: x (hipótese)\n").persona?.nome, "Ana");
  assert.equal(persona("## Persona principal\n\n- Contexto: x (hipótese)\n").persona?.nome, null);
  assert.equal(persona("## 2. Persona\n\n- Contexto: x (hipótese)\n").persona?.nome, null);
});

test("fontes: texto depois do link é o título; data brasileira vira ISO; esquema estranho some do título com link", () => {
  const p = persona(
    [
      "## 1. Cliente ideal",
      "",
      "- Alguém (hipótese)",
      "",
      "## 8. Fontes da pesquisa",
      "",
      "- [1] https://x.exemplo — Título da página",
      "- [2] https://y.exemplo - Outro título, acessado em 01/11/2026",
      "- [3] Título bom javascript:alert(1) https://z.exemplo",
      "- [4] https://w.exemplo — javascript:alert(2)",
      "- [5] Cinco. https://v.exemplo. Acessado em 2026-10-05.",
    ].join("\n"),
  );
  assert.deepEqual(p.fontes.map((f) => [f.n, f.titulo, f.url, f.acessado]), [
    [1, "Título da página", "https://x.exemplo", null],
    [2, "Outro título", "https://y.exemplo", "2026-11-01"],
    [3, "Título bom", "https://z.exemplo", null],
    [4, "https://w.exemplo", "https://w.exemplo", null],
    [5, "Cinco", "https://v.exemplo", "2026-10-05"],
  ]);
  assert.ok(p.fontes.every((f) => !/javascript/i.test(f.titulo)));
});
