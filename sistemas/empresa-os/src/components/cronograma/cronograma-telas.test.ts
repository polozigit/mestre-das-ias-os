import test from "node:test";
import assert from "node:assert/strict";
import { lerFonte } from "../../lib/fonte-para-teste.ts";

/*
 * O node --test não lê JSX, então a fiação das telas do Cronograma é conferida pelo código-fonte:
 * cada regra de tela que a lógica pura (plano-textos.ts, cronograma.ts) decide tem que estar LIGADA
 * nos componentes. A lógica em si é testada em src/lib/*.test.ts.
 */
const ler = (rel: string) => lerFonte(new URL(rel, import.meta.url));
const comoFazer = ler("./ComoFazer.tsx");
const botao = ler("./BotaoCopiar.tsx");
const passo = ler("./PassoAPasso.tsx");
const linha = ler("./LinhaDoTempo.tsx");
const pagina = ler("../../app/(app)/cronograma/page.tsx");
const detalhe = ler("../../app/(app)/tarefas/[id]/page.tsx");

test("Como fazer desenha os 5 blocos pelo plano de blocos (nada de campo fixo no JSX)", () => {
  assert.match(comoFazer, /blocosDaAtividade\(textos\)/);
  for (const tipo of ["instrucao", "passos", "comando"]) assert.match(comoFazer, new RegExp(`case "${tipo}"`));
  assert.match(comoFazer, /bloco\.titulo/);
});

test("passo a passo é lista numerada de verdade (<ol>), um <li> por passo", () => {
  assert.match(comoFazer, /<ol className="[^"]*list-decimal/);
  assert.match(comoFazer, /bloco\.itens\.map\(/);
});

test("o texto pronto vai num bloco de código com o botão Copiar ligado ao mesmo texto", () => {
  assert.match(comoFazer, /<pre [^>]*>\s*<code>\{bloco\.texto\}<\/code>\s*<\/pre>/);
  assert.match(comoFazer, /<BotaoCopiar texto=\{bloco\.texto\} \/>/);
});

test("o botão Copiar é componente de navegador, copia pelo helper e mostra o texto de cada estado", () => {
  assert.match(botao, /^"use client";/);
  assert.match(botao, /await copiarTexto\(texto\)/);
  assert.match(botao, /\{ROTULO_DO_BOTAO\[estado\]\}/);
  assert.match(botao, /role="status"/);
  assert.match(botao, /\{AVISO_DO_BOTAO\[estado\]\}/);
  assert.match(botao, /setTimeout\(\(\) => setEstado\("parado"\), MS_DO_AVISO_DE_COPIA\)/);
  assert.match(botao, /clearTimeout/);
  assert.doesNotMatch(botao, /"Copiado"|"Copiar"/);
});

test("o 'Como fazer' recolhível abre só no próximo passo do aluno (passoAtual) e fecha nos outros", () => {
  assert.match(comoFazer, /<details open=\{aberto\}/);
  assert.match(comoFazer, /Como fazer\s*<\/summary>/);
  assert.match(passo, /<ComoFazerRecolhivel textos=\{i\.textos\} aberto=\{i\.tarefa_id === abertoId\}/);
  assert.match(linha, /<ComoFazerRecolhivel textos=\{i\.textos\} aberto=\{i\.tarefa_id === abertoId\}/);
  assert.match(pagina, /const abertoId = passoAtual\(trilhas\)\?\.item\.tarefa_id;/);
  assert.match(pagina, /abertoId=\{abertoId\}/);
});

test("passo concluído ou cancelado não repete o 'Como fazer' na lista (o detalhe da tarefa continua tendo tudo)", () => {
  for (const fonte of [passo, linha]) assert.match(fonte, /\{i\.textos && !FECHADA\.has\(i\.status\) && \(/);
});

test("passo a passo e linha do tempo escondem as canceladas por padrão (itensVisiveis) e usam o link com a trilha", () => {
  for (const fonte of [passo, linha]) {
    assert.match(fonte, /mostrarCanceladas = false/);
    assert.match(fonte, /itensVisiveis\(f\.itens, mostrarCanceladas\)/);
    assert.match(fonte, /hrefTarefa\(/);
    assert.doesNotMatch(fonte, /href=\{`\/tarefas\/\$\{/);
  }
});

test("a página do Cronograma tem o 'Mostrar canceladas' por link (?canceladas=1), só aparece se existir cancelada", () => {
  assert.match(pagina, /bruto === "1"/);
  assert.match(pagina, /Mostrar canceladas \(\$\{canceladas\}\)/);
  assert.match(pagina, /Esconder canceladas/);
  assert.match(pagina, /\{canceladas > 0 && \(/);
  assert.match(pagina, /mostrarCanceladas=\{mostrarCanceladas\}/);
});

test("a página do Cronograma junta o texto do banco com o do arquivo do plano antes de desenhar", () => {
  assert.match(pagina, /buscarItensCronograma\(supabase, \{ comTextos: true \}\)/);
  assert.match(pagina, /anexarTextosDoPlano\([\s\S]*?, TEXTOS_DO_PLANO\)/);
});

test("o detalhe da tarefa usa o mesmo 'Como fazer' (banco + plano pela chave) em vez de blocos próprios", () => {
  assert.match(detalhe, /mesclarTextos\(instrucao, tarefa\.chave \? TEXTOS_DO_PLANO\.get\(tarefa\.chave\) : undefined\)/);
  assert.match(detalhe, /<ComoFazer textos=\{textos\} \/>/);
  assert.doesNotMatch(detalhe, /Prova de que ficou pronto/);
});

test("os textos novos da tela não têm travessão", () => {
  for (const fonte of [comoFazer, botao]) assert.doesNotMatch(fonte, /—/);
});
