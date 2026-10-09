import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { lerFonte } from "../../lib/fonte-para-teste.ts";

/*
 * Fiação das telas (Tarefas, Início, Atividade, Agentes). O node --test não lê JSX, então a regra de
 * cada tela, que a lógica pura já decide e testa em src/lib/*.test.ts, é conferida aqui no código-fonte:
 * tem que estar LIGADA na página. Se alguém tirar a ligação, o teste da lógica continua verde e este
 * é o que reprova.
 */
const ler = (rel: string) => lerFonte(new URL(rel, import.meta.url));

const tarefas = ler("./tarefas/page.tsx");
const detalhe = ler("./tarefas/[id]/page.tsx");
const tabela = ler("../../components/tarefas/TarefasTable.tsx");
const card = ler("../../components/tarefas/TarefaCard.tsx");
const pills = ler("../../components/tarefas/pills.tsx");
const inicio = ler("./inicio/page.tsx");
const atividade = ler("./atividade/page.tsx");
const agentes = ler("./agentes/page.tsx");
const lista = ler("../../components/catalogo/ListaFiltravel.tsx");
const cardAgente = ler("../../components/painel/CardAgente.tsx");
const cardArtefato = ler("../../components/catalogo/CardArtefato.tsx");
const detalheArtefato = ler("../../components/catalogo/DetalheArtefato.tsx");
const tempoRelativo = ler("../../components/ui/TempoRelativo.tsx");
const marcaPagina = ler("./marca/page.tsx");
const marcaAbas = ler("./marca/_components/AbasMarca.tsx");

// --- Tarefas ---
test("Tarefas: as abas Curso / 90 dias / Trabalho acabaram, a trilha vem da URL pelo grupo", () => {
  assert.equal(existsSync(new URL("../../components/tarefas/TrilhaFiltro.tsx", import.meta.url)), false);
  assert.doesNotMatch(tarefas, /TrilhaFiltro/);
  assert.match(tarefas, /grupoDaBusca\(busca\.trilha\)/);
  assert.match(tarefas, /\.in\("trilha", \[\.\.\.trilhasDoGrupo\(grupo\)\]\)/);
});

test("Tarefas: a lista do curso segue a ordem do plano; a do dia a dia, o que mexeu por último", () => {
  assert.match(tarefas, /doGrupo\.order\("trilha", \{ ascending: true \}\)\.order\("ordem", \{ ascending: true \}\)/);
  assert.match(tarefas, /doGrupo\.order\("atualizada_em", \{ ascending: false \}\)/);
});

test("Tarefas: título e subtítulo dizem qual lista é", () => {
  assert.match(tarefas, /\{textos\.titulo\}/);
  assert.match(tarefas, /\{textos\.subtitulo\}/);
  assert.match(tarefas, /TEXTOS_DO_GRUPO\[grupo\]/);
});

test("Tarefas: 'Nova tarefa' só na lista do dia a dia (as do curso nascem do plano)", () => {
  assert.match(tarefas, /\{grupo === "trabalho" && \(\s*<NovaTarefaSheet/);
});

test("Tarefas: 'Origem' virou 'Criada por' (coluna, filtro e pílula), com 'você' e 'IA'", () => {
  assert.match(tabela, /header: "Criada por"/);
  assert.doesNotMatch(tabela, /header: "Origem"/);
  assert.match(tarefas, /Criada por: todos/);
  assert.match(tarefas, /Criada por: você/);
  assert.match(tarefas, /Criada por: IA/);
  assert.doesNotMatch(tarefas, /Todas as origens|>Humano</);
  assert.match(pills, /fraseCriadaPor\(origem\)/);
  assert.match(pills, /rotuloCriadaPor\(origem\)/);
  assert.doesNotMatch(pills, /Humano/);
  assert.match(card, /<CriadaPorPill origem=\{tarefa\.origem\} \/>/);
});

test("Tarefas: lista e quadro levam o grupo no link do detalhe, pro menu acender o item certo", () => {
  assert.match(tabela, /hrefTarefa\(t\.id, t\.trilha\)/);
  assert.match(card, /hrefTarefa\(tarefa\.id, tarefa\.trilha\)/);
  assert.match(tarefas, /trilha: t\.trilha/);
});

test("Tarefas: a lista escreve a data (dia/mês/ano) e guarda o relativo na dica, sem estourar a hidratação", () => {
  assert.match(tabela, /<span className="text-fg-3" title=\{tempoRelativo\(t\.atualizadaEm\)\} suppressHydrationWarning>\s*\{formatarData\(t\.atualizadaEm\)\}\s*<\/span>/);
  assert.match(tabela, /import \{ formatarData, tempoRelativo \} from "@\/lib\/format"/);
  assert.doesNotMatch(tabela, /TempoRelativo/);
  assert.match(card, /<TempoRelativo\s+iso=\{tarefa\.atualizadaEm\}/);
});

test("Tarefas: o alternador quadro/lista e o filtro guardam o grupo da URL", () => {
  assert.match(tarefas, /hrefListaTarefas\(grupo\)/);
  assert.match(tarefas, /hrefListaTarefas\(grupo, \{/);
  assert.match(tarefas, /\{grupo === "curso" && <input type="hidden" name="trilha" value="curso" \/>\}/);
});

test("Tarefa (detalhe): 'Criada por', 'Veio de' e a volta pra lista certa", () => {
  assert.match(detalhe, /<CriadaPorPill origem=/);
  assert.match(detalhe, /rotuloVeioDe\(tarefa\.origem_tipo, tarefa\.trilha\)/);
  assert.match(detalhe, /rotulo: "Veio de"/);
  assert.match(detalhe, /linkDaOrigem\(tarefa\.origem_ref\)/);
  assert.match(detalhe, /rel="noopener noreferrer"/);
  assert.match(detalhe, /href=\{hrefListaTarefas\(grupo\)\}/);
  assert.match(detalhe, /TEXTOS_DO_GRUPO\[grupo\]\.voltar/);
  assert.doesNotMatch(detalhe, />\s*Origem\s*</);
});

test("Tarefa (detalhe): id interno da origem nunca aparece (só o link da conversa, quando houver)", () => {
  assert.doesNotMatch(detalhe, /\{tarefa\.origem_ref\}/);
  assert.doesNotMatch(detalhe, /\{tarefa\.origem_tipo\}/);
});

test("Tarefa (detalhe): datas em dia/mês/ano e sem campo vazio com travessão", () => {
  assert.match(detalhe, /formatarDataHora\(tarefa\.criada_em\)/);
  assert.match(detalhe, /formatarData\(instrucao\.prazo_previsto_em\)/);
  assert.match(detalhe, /"Ainda não"/);
  assert.match(detalhe, /"Sem dono"/);
  assert.doesNotMatch(detalhe, /"—"/);
});

test("Tempo relativo ('há 7 min.') traz a data exata em dia/mês/ano ao passar o mouse", () => {
  assert.match(tempoRelativo, /title=\{iso \? formatarDataHora\(iso\) : undefined\}/);
});

// --- Marca ---
test("Marca: a página entrega o painel das três abas de uma vez, com o texto numa consulta só", () => {
  assert.match(marcaPagina, /abertosDasAbas\(grupos, sp\.doc\)/);
  assert.match(marcaPagina, /\.in\("id", ids\)/);
  assert.match(marcaPagina, /const paineis = montarPaineis\(grupos, abertos, textos, imagens, painelMarca, /);
  assert.match(marcaPagina, /<AbasMarca contagem=\{contagem\} hrefs=\{hrefs\} paineis=\{paineis\} \/>/);
  assert.match(marcaPagina, /const hrefs = hrefsDasAbas\(grupos, abertos\)/);
  assert.match(marcaPagina, /if \(erroTexto\) throw erroTexto/);
});

test("Marca: quem escolhe a aba é a URL, lida no navegador; a página não decide a aba", () => {
  assert.match(marcaAbas, /^"use client";/);
  assert.match(marcaAbas, /abaDaUrl\(useSearchParams\(\)\.get\("aba"\)\)/);
  assert.doesNotMatch(marcaPagina, /sp\.aba|abaDaUrl/);
});

test("Marca: o clique na aba troca na hora pelo histórico do navegador, sem pedir a página ao servidor", () => {
  assert.match(marcaAbas, /if \(!cliqueSimples\(e\)\) return;\s*e\.preventDefault\(\);/);
  assert.match(marcaAbas, /const destino = enderecoDaTroca\(aba, hrefs\[aba\], window\.location\.search\);\s*if \(destino\) window\.history\.pushState\(null, "", destino\);/);
  assert.match(marcaAbas, /onClick=\{\(e\) => trocar\(e, aba\)\}/);
  assert.doesNotMatch(marcaAbas, /useRouter|router\.push|SegmentedControl/);
});

// --- Início ---
test("Início: 'Agentes instalados' no lugar de 'Agentes ativos'", () => {
  assert.match(inicio, /label="Agentes instalados"/);
  assert.doesNotMatch(inicio, /Agentes ativos/);
});

test("Início: próximas tarefas com data em dia/mês/ano e a marca 'atrasada'", () => {
  assert.match(inicio, /formatarData\(i\.prazo_previsto_em\)/);
  assert.match(inicio, /estaAtrasada\(i, hoje\)/);
  assert.match(inicio, />atrasada</);
  assert.doesNotMatch(inicio, /\{i\.prazo_previsto_em\}/);
});

test("Início: eventos de sistema escondidos por padrão, com o link pra mostrar", () => {
  assert.match(inicio, /\.not\("tipo", "in", TIPOS_DE_SISTEMA_PARA_FILTRO\)/);
  assert.match(inicio, /\{mostrarSistema \? "Esconder eventos do sistema" : "Mostrar eventos do sistema"\}/);
  assert.match(inicio, /href=\{mostrarSistema \? "\/inicio" : "\/inicio\?sistema=1"\}/);
  assert.match(inicio, /brutoSistema === "1"/);
});

// --- Atividade ---
test("Atividade: eventos de sistema escondidos por padrão na consulta, com o link pra mostrar e a paginação lembrando", () => {
  assert.match(atividade, /if \(!mostrarSistema\) consulta = consulta\.not\("tipo", "in", TIPOS_DE_SISTEMA_PARA_FILTRO\)/);
  assert.match(atividade, /\{mostrarSistema \? "Esconder eventos do sistema" : "Mostrar eventos do sistema"\}/);
  assert.match(atividade, /<LinkBotao href=\{montarHref\(null, 1, true\)\}>Mostrar eventos do sistema<\/LinkBotao>/);
  assert.match(atividade, /\{quem === null && \(/);
  assert.match(atividade, /if \(sistema\) params\.set\("sistema", "1"\)/);
  assert.match(atividade, /montarHref\(quem, pagina - 1, mostrarSistema\)/);
  assert.match(atividade, /montarHref\(quem, pagina \+ 1, mostrarSistema\)/);
  assert.match(atividade, /montarHref\(filtro\.valor, 1, mostrarSistema\)/);
});

// --- Agentes, skills e workflows ---
test("Agentes: busca no navegador nas três listas, nome amigável na frente e legenda dos modelos", () => {
  assert.match(agentes, /<ListaDeAgentes grupos=\{grupos\}/);
  assert.match(agentes, /<ListaDeArtefatos grupos=\{gruposArtefato\}/);
  assert.match(agentes, /<p className="text-xs text-fg-3">\{LEGENDA_DOS_MODELOS\}<\/p>/);
  assert.match(lista, /^"use client";/);
  assert.match(lista, /type="search"/);
  assert.match(lista, /placeholder="Buscar por nome ou descrição"/);
  assert.match(lista, /onClick=\{\(\) => setBusca\(""\)\}[\s\S]*Limpar busca/);
  assert.match(lista, /filtrarGruposPorBusca\(grupos, busca, camposDe\)/);
  assert.match(lista, /camposDe=\{camposDoAgente\}/);
  assert.match(lista, /camposDe=\{camposDoArtefato\}/);
  assert.match(lista, /Nada encontrado/);
});

test("Agentes: o card mostra o nome amigável e o técnico em texto secundário; modelo e esforço em português", () => {
  assert.match(cardAgente, /\{nomeAmigavel\(agente\.name, agente\.time\)\}/);
  assert.match(cardAgente, /font-mono[^>]*>\{agente\.name\}</);
  assert.match(cardAgente, /rotuloModelo\(agente\.tier\)/);
  assert.match(cardAgente, /Esforço \{rotuloEsforco\(agente\.esforco\)\}/);
  assert.match(cardArtefato, /\{nomeAmigavel\(artefato\.nome, artefato\.time\)\}/);
  assert.match(cardArtefato, /font-mono[^>]*>\{artefato\.nome\}</);
});

test("Skill e workflow (detalhe): campo vazio some, nome amigável e instruções completas recolhidas", () => {
  assert.doesNotMatch(detalheArtefato, /rotuloDeclarado|não declarado/);
  assert.match(detalheArtefato, /textoDeclarado\(tipo === "skill" \? art\.quando : art\.gatilho\)/);
  assert.match(detalheArtefato, /\{quandoEChamado && \(/);
  assert.match(detalheArtefato, /\{\(le \|\| grava\) && \(/);
  assert.match(detalheArtefato, /<InstrucoesCompletas>[\s\S]*<CardConteudo[\s\S]*<CardArquivos[\s\S]*<\/InstrucoesCompletas>/);
  assert.match(detalheArtefato, /rotuloOrigem\(art\.origem\)/);
  assert.match(detalheArtefato, /\{nomeAmigavel\(art\.nome, art\.time\)\}/);
});

test("Agentes: execução e cargo chegam à lista por id; sem permissão de ver execuções o bloco some (null vira undefined)", () => {
  assert.match(agentes, /const execucoes: Record<string, UltimaExecucao \| null> \| null = ultimas \? \{\} : null;/);
  assert.match(agentes, /execucoes\[agente\.id\] = execucaoDoAgente\(agente, ultimas\)/);
  assert.match(lista, /execucao=\{execucoes \? \(execucoes\[agente\.id\] \?\? null\) : undefined\}/);
  assert.match(lista, /cargo=\{cargos\[agente\.id\] \?\? null\}/);
});
