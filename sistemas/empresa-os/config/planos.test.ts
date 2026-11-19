import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROTULO_ABA } from "../src/lib/marca.ts";

const m = JSON.parse(readFileSync(new URL("./planos/mestre.json", import.meta.url), "utf8"));
const FASES: Record<string, string[]> = {
  curso: ["D1", "D2", "D3"],
  plano90: ["clareza", "fundacao", "ativacao", "aplicacao", "escala"],
};

test("cada etapa tem trilha e fase válidas (CHECK ck_plano_etapa_fase_da_trilha)", () => {
  for (const e of m.etapas) assert.ok(FASES[e.trilha]?.includes(e.fase), `${e.chave}: ${e.trilha}/${e.fase}`);
});

test("ordens e chaves únicas; depende_de resolve dentro do modelo", () => {
  const etapas = m.etapas.map((e: { ordem: number }) => e.ordem);
  assert.equal(new Set(etapas).size, etapas.length);
  const chaves = new Set<string>();
  let total = 0;
  for (const e of m.etapas) for (const a of e.atividades) { chaves.add(a.chave); total++; }
  assert.equal(chaves.size, total, "chave de atividade repetida no modelo");
  for (const e of m.etapas) for (const a of e.atividades) if (a.depende_de) assert.ok(chaves.has(a.depende_de), a.chave);
});

test("chave da tarefa gerada casa o CHECK de public.tarefas.chave", () => {
  const re = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
  for (const e of m.etapas) for (const a of e.atividades) assert.match(`${e.trilha}.${e.fase.toLowerCase()}.${a.chave}`, re);
});

test("toda atividade tem instrução (NOT NULL no banco)", () => {
  for (const e of m.etapas) for (const a of e.atividades) assert.ok(a.instrucao?.trim(), a.chave);
});

// --- Passo a passo da instalação: os 9 passos abrem o Dia 1, nesta ordem (o WhatsApp foi para o Dia 2 na versão 13;
// "Conferir os times" e "Primeiro time respondendo" saíram na versão 14) ---
type Atividade = { chave: string; ordem: number; titulo: string; instrucao: string; prova?: string; depende_de?: string; feita_na_instalacao?: boolean };
const PASSOS = ["contas", "conectores", "config-codex", "clonar-repo", "instalador", "banco", "sistema-no-ar", "dossie-persona-marca", "sistema-com-marca"];
const FEITOS_PELA_INSTALACAO = PASSOS.slice(0, 6); // contas ... banco; "sistema no ar" só com a prova do /login (plano-reconciliar: siteNoAr)
const d1: Atividade[] = m.etapas.find((e: { fase: string; trilha: string }) => e.trilha === "curso" && e.fase === "D1").atividades;
const todas: Atividade[] = m.etapas.flatMap((e: { atividades: Atividade[] }) => e.atividades);
const doDia = (fase: string): Atividade[] => m.etapas.find((e: { fase: string; trilha: string }) => e.trilha === "curso" && e.fase === fase).atividades;

test("a versão do modelo subiu: a 1, a 2 e a 3 já foram carregadas com outro hash e o banco recusa mudar versão carregada", () => {
  // 6 = o comando do dossiê, persona e marca passou a chamar o instalador e a pasta do clone ganhou o nome do sistema
  // (2ª rodada da revisão final, 08/10). 7 = o comando do clone cita a URL exata do repositório-modelo (09/10).
  // 8 = o passo "Configurar o Codex" liga o Acesso total, o Computer Use e o Chrome como navegador padrão (08/10).
  // 9 = o instalador cria e segue sozinho, sem esperar "pode criar" (teste real, 08/10).
  // Quem muda o conteúdo do plano sobe a versão E este número, junto.
  // 10 = "Configurar o Codex" é com o professor, antes do instalador, e o sistema no ar não tem QA de tela (08/10).
  // 11 = atividade sistema-com-marca: mockup claro e escuro aprovado antes de aplicar a marca (09/10).
  // 13 = decisão do Polozi (17/11/2026): o WhatsApp sai do Dia 1 e abre o Dia 2; o Dia 2 ganha a cadeia de skills
  // do Instagram (pesquisa, roteiro, template, imagens, publicar, workflow) e a skill da área; rotinas e times nas
  // áreas vão para o Dia 3.
  // 14 = decisões do Polozi em 18/11/2026. Dia 1: saem "Conferir os times e chamar o primeiro" e "Primeiro time
  // respondendo". Dia 2: quatro passos com subpassos dentro (campo passos): WhatsApp; workflow de carrossel para
  // Instagram (as quatro skills, o template e a skill que liga tudo); orçamento em formato de site no ChatGPT Sites,
  // com a automação por e-mail e WhatsApp (ideia I40, comando C30 da turma de outubro); skill de um processo interno.
  // 15 = confirmado pelo Polozi em 18/11/2026 ("Sim, os três"). Dia 2: "E-mail e Google Drive" logo depois do
  // WhatsApp, com a rotina do e-mail urgente (ideia I42). Dia 3: "Auto-melhoria (Loop Engineering)" (ideia I41) e
  // "Controlar o Codex pelo celular" (passo a passo capturado em 18/11/2026, PR 1854) fecham o dia.
  // 16 = ditado pelo Polozi em 19/11/2026. Dia 1: sai "Provar o gate do Dia 1" e o dossiê entra pelo arquivo
  // baixado do app do aluno. Dia 2: o orçamento em site sobe para antes do workflow de carrossel e o processo
  // interno ganha o subpasso de dizer em quantas skills se divide. Dia 3: começa por "Ensinar o cérebro qual
  // modelo usar" (comando C04 de outubro), ganha "Conectar a ElevenLabs", o time autoral vira "Criar um time de
  // agentes" a partir de um processo que se repete, sai "Times nas áreas" e o plano de 90 dias fecha o dia.
  // 17 = auditoria do kit montado (19/11/2026): "Ensinar o cérebro" passa pela skill de regra, que é o único caminho
  // para mudar o AGENTS.md, e o passo do instalador não manda mais esperar um "pode criar" que ninguém pede.
  assert.ok(m.versao >= 17);
});

test("o Dia 1 são os 9 passos da instalação, na ordem do manual, e nada mais: o gate saiu (decisão de 19/11/2026)", () => {
  assert.deepEqual([...d1].sort((a, b) => a.ordem - b.ordem).map((a) => a.chave), PASSOS);
  assert.ok(!todas.some((a) => a.chave === "gate-d1"), "Provar o gate do Dia 1 saiu do plano");
  assert.doesNotMatch(JSON.stringify(doDia("D1")), /eixo A|gate do Dia 1/i, "o Dia 1 não fala mais em gate nem em eixo");
});

test("Dia 1 sem os passos dos times: conferir os times e primeiro time respondendo saíram (decisão de 18/11/2026)", () => {
  const chaves = todas.map((a) => a.chave);
  for (const fora of ["times", "primeiro-time"]) assert.ok(!chaves.includes(fora), `${fora} saiu do plano`);
  for (const a of todas) assert.ok(!a.depende_de || chaves.includes(a.depende_de), `${a.chave} depende de ${a.depende_de}, que não existe`);
});

test("passo da instalação não é duplicado: nenhum item antigo (casa, dossie) sobrou e o WhatsApp aparece uma vez só, abrindo o Dia 2", () => {
  const chaves = todas.map((a) => a.chave);
  for (const velha of ["casa", "dossie"]) assert.ok(!chaves.includes(velha), `${velha} foi fundido num dos 10 passos`);
  assert.equal(chaves.filter((c) => c === "whatsapp").length, 1);
  assert.ok(!d1.some((a) => a.chave === "whatsapp"), "o WhatsApp saiu do Dia 1 (decisão de 17/11/2026)");
  assert.equal([...doDia("D2")].sort((a, b) => a.ordem - b.ordem)[0].chave, "whatsapp", "o WhatsApp abre o Dia 2");
});

// --- Dia 2 e Dia 3 (versões 13, 14 e 15): a ordem é a que o Polozi ensina em sala ---
const CADEIA_DO_DIA_2 = ["whatsapp", "email-drive", "orcamento-site", "workflow-instagram", "processo-interno"];
// quem espera quem no Dia 2: a rotina do e-mail avisa pelo WhatsApp; o orçamento e o workflow não esperam ninguém;
// o processo interno repete o caminho do carrossel (skill por etapa e workflow), por isso vem depois dele
const DEPENDE_NO_DIA_2: Record<string, string | undefined> = { whatsapp: undefined, "email-drive": "whatsapp", "orcamento-site": undefined, "workflow-instagram": undefined, "processo-interno": "workflow-instagram" };
const ORDEM_DO_DIA_3 = ["modelo", "codex-celular", "rotinas", "elevenlabs", "fabrica", "auto-melhoria", "plano90"];
type ComSubpassos = { titulo: string; comando: string; instrucao: string; passos: string[]; prova: string };
const doDia2 = (c: string) => doDia("D2").find((a) => a.chave === c)! as unknown as ComSubpassos;
const doDia3 = (c: string) => doDia("D3").find((a) => a.chave === c)! as unknown as ComSubpassos & { executor_padrao: string; depende_de?: string };
const naOrdem = (passos: string[], trechos: string[]) => {
  const pos = trechos.map((t) => passos.findIndex((p) => p.includes(t)));
  return pos.every((i) => i >= 0) && pos.every((i, n) => n === 0 || pos[n - 1] < i);
};

test("Dia 2: cinco passos, nesta ordem: WhatsApp, e-mail e Google Drive, orçamento em site, workflow de carrossel e processo interno", () => {
  assert.deepEqual([...doDia("D2")].sort((a, b) => a.ordem - b.ordem).map((a) => a.chave), CADEIA_DO_DIA_2);
  for (const c of CADEIA_DO_DIA_2) assert.equal(doDia("D2").find((a) => a.chave === c)!.depende_de, DEPENDE_NO_DIA_2[c], c);
});

test("Dia 2: e-mail e Google Drive são ligados e testados antes da rotina do e-mail urgente, que só lê e avisa pelo WhatsApp", () => {
  const e = doDia2("email-drive");
  assert.equal(e.titulo, "E-mail e Google Drive");
  assert.match(e.instrucao, /Gmail ou Outlook/, "quem usa Outlook liga o Outlook (turma de outubro)");
  assert.match(e.instrucao, /Google Drive/);
  assert.ok(naOrdem(e.passos, ["Ligar o e-mail:", "Ligar o Google Drive:", "Lista os meus três últimos e-mails", "Rotina do e-mail urgente:", "rode uma vez à mão", "Confira no seu WhatsApp"]), "ligar, testar e só então a rotina");
  assert.match(e.passos[0], /Plugins \(botão \+\)/);
  assert.match(e.passos[0], /senha digitada direto no site/, "senha nunca passa pelo chat");
  assert.match(e.passos[2], /Procura no meu Drive/, "o Drive também é testado");
  // a fala do Polozi (ideia I42): a rotina monitora o e-mail e manda pelo WhatsApp o que é mais importante ou urgente
  assert.match(e.comando, /rotina que monitora o meu e-mail e me manda pelo WhatsApp o que for mais importante ou urgente/);
  assert.match(e.comando, /pelo conector do meu e-mail, sem abrir o navegador/, "pelo conector, não pela aba do navegador (gasta menos)");
  assert.match(e.comando, /npm run enviar, na pasta sistemas\/whatsapp/, "o envio de rotina do pacote, que não pede ENVIAR");
  assert.match(e.comando, /me pergunte o que é urgente para mim/);
  assert.match(e.comando, /só lê e avisa: não responde, não apaga e não arquiva nenhum e-mail/, "responder, apagar e arquivar ficam de fora da aula");
  assert.match(e.comando, /modo Local e permissão de gravação só na pasta do projeto/);
  assert.match(e.prova, /aviso da rotina chegou no seu WhatsApp/);
});

test("Dia 2: o workflow de carrossel tem seis subpassos na ordem da aula e a skill só nasce depois do aprovado", () => {
  const w = doDia2("workflow-instagram");
  assert.match(w.titulo, /^Workflow de carrossel para Instagram/);
  assert.equal(w.passos.length, 6);
  const SUB = ["Skill 1, pesquisar notícias", "Skill 2, roteiro do carrossel", "Template do carrossel", "Skill 3, imagens do carrossel", "Skill 4, publicar no Instagram", "Criar o workflow"];
  SUB.forEach((s, i) => assert.ok(w.passos[i].startsWith(s), `subpasso ${i + 1} deveria ser "${s}" e é "${w.passos[i].slice(0, 40)}"`));
  for (const i of [0, 1, 3]) {
    assert.match(w.passos[i], /depois do aprovado, transforme na skill e teste/, `${SUB[i]}: a skill nasce depois do aprovado e é testada`);
  }
  assert.match(w.passos[2], /sem criar skill/, "o template é só salvo");
  assert.match(w.passos[4], /grave a tela narrando ou vá falando onde clica/);
  assert.match(w.passos[5], /chama as quatro em ordem/);
  assert.match(w.passos[5], /ainda não virou post/, "o workflow não repete notícia");
  assert.match(w.comando, /sem criar skill ainda/, "o primeiro comando só modela, não cria a skill");
  assert.match(w.instrucao, /comandos do Manual do Aluno/, "os comandos de cada subpasso ficam no manual");
});

test("Dia 2: o orçamento vira site no ChatGPT Sites com a marca e a logo do cliente, e depois fica automático por e-mail ou WhatsApp", () => {
  const orc = doDia2("orcamento-site");
  // o comando é o C30 da turma de outubro (anexa o orçamento, pesquisa as práticas, vira site com a marca)
  for (const trecho of ["Estou anexando um arquivo, que é um orçamento", "melhores práticas", "orçamento no modelo site", "identidade visual", "minha persona", "logo dele"]) {
    assert.match(orc.comando, new RegExp(trecho), `orçamento: falta "${trecho}"`);
  }
  assert.match(orc.instrucao, /ChatGPT Sites/, "a ferramenta é o ChatGPT Sites (confirmado em 18/11/2026)");
  assert.ok(naOrdem(orc.passos, ["plugin Sites está ligado", "Anexe um orçamento que você já tem", "Cole o comando abaixo", "Automatize:"]), "plugin, modelo do aluno, comando e só então a automação");
  const auto = orc.passos.find((p) => p.startsWith("Automatize:"))!;
  assert.match(auto, /por e-mail ou pelo WhatsApp/);
  assert.match(auto, /te mostrando antes de enviar/, "orçamento automático não sai sem o dono ver");
  assert.match(orc.prova, /pedido de teste, por e-mail ou pelo WhatsApp/);
});

test("Dia 2: o processo interno é um passo só: desenhar, áudio, perguntas, em quantas skills se divide, uma skill por etapa e o workflow", () => {
  const pr = doDia2("processo-interno");
  assert.ok(naOrdem(pr.passos, ["desenhe ou escreva o passo a passo", "Grave um áudio explicando o processo em detalhes", "Cole o comando abaixo", "em quantas skills o processo se divide", "Automatize etapa por etapa", "Peça o workflow"]), "a ordem que o Polozi ditou");
  assert.match(pr.passos[4], /duas etapas já valem/, "não precisa fazer o processo inteiro em sala");
  assert.match(pr.comando, /Me faça perguntas para melhorar esse processo/, "o prompt do Polozi, literal");
  assert.match(pr.comando, /espere o meu aprovado, sem criar skill ainda/, "o processo é aprovado antes de qualquer skill");
  assert.match(pr.comando, /Com o processo aprovado, diga em quantas skills ele se divide/, "a IA diz a divisão antes de automatizar");
  assert.match(pr.comando, /espere o meu aprovado\. Só então transforme essa etapa numa skill/, "cada skill nasce depois do aprovado");
  assert.match(pr.comando, /teste com outro caso real/);
  assert.match(pr.comando, /crie um workflow: uma skill que chama as skills das etapas em ordem/);
  assert.match(pr.instrucao, /se não der tempo de fazer todas, faça duas/, "não precisa fazer o processo inteiro em sala");
  assert.match(pr.prova, /pelo menos duas etapas/);
});

test("Dia 3: começa pelo modelo, depois Codex pelo celular, rotinas, ElevenLabs, time de agentes e auto-melhoria; o plano de 90 dias fecha o dia", () => {
  assert.deepEqual([...doDia("D3")].sort((a, b) => a.ordem - b.ordem).map((a) => a.chave), ORDEM_DO_DIA_3);
  assert.ok(!todas.some((a) => a.chave === "areas"), "Times nas áreas saiu do plano");
  assert.match(doDia("D3").find((a) => a.chave === "rotinas")!.instrucao + JSON.stringify(doDia("D3").find((a) => a.chave === "rotinas")), /workflow do Instagram/);
  // nenhum passo do dia trava em outro, menos o plano de 90 dias, que vem depois do time
  for (const c of ORDEM_DO_DIA_3.slice(0, -1)) assert.equal(doDia3(c).depende_de, undefined, c);
  assert.equal(doDia3("plano90").depende_de, "fabrica");
});

test("Dia 3: ensinar o cérebro usa o comando de outubro: modelo e esforço por tarefa, maior para planejar e menor para executar", () => {
  const mo = doDia3("modelo");
  assert.equal(mo.titulo, "Ensinar o cérebro qual modelo usar");
  // a fala do Polozi na turma de outubro (comando C04, 10/10/2026)
  // o AGENTS.md do projeto só muda pela skill de regra (regra do próprio AGENTS.md): o comando chama a skill e segue com a fala dele
  assert.match(mo.comando, /^Coloca no meu AGENTS\.md para você decidir qual modelo e esforço utilizar de acordo com a tarefa/);
  assert.match(mo.comando, /Escreva essa regra como proposta em operacao\/DECISOES\.md, espere o meu aprovado e só então aplique no AGENTS\.md com \$polozi-aplicar-regra\.$/, "proposta, aprovado e só então a skill de regra (o padrão do passo dos 6 gates)");
  assert.match(mo.passos[1], /Leia a regra que a IA propôs/, "a regra é proposta e aprovada, não gravada direto");
  assert.match(mo.comando, /qualidade e também em economia de tokens/);
  assert.match(mo.comando, /Use um modelo maior para planejar e outro menor para executar/);
  assert.match(mo.comando, /Me informe quando eu estiver usando o modelo errado na tarefa/);
  assert.ok(naOrdem(mo.passos, ["cole o comando abaixo", "diga aprovado", "uma tarefa simples e depois uma de planejamento", "troque no seletor da conversa"]), "gravar a regra, aprovar, testar e usar");
  assert.match(mo.prova, /regra de escolha de modelo e esforço/);
});

test("Dia 3: a ElevenLabs entra pelo plugin, com a senha no site, e o teste é transcrever um áudio e gerar outro", () => {
  const el = doDia3("elevenlabs");
  assert.equal(el.titulo, "Conectar a ElevenLabs");
  assert.ok(naOrdem(el.passos, ["Plugins (botão +), procure ElevenLabs", "anexe um áudio curto seu", "Ouça o áudio que a IA gerou"]), "ligar, testar e conferir");
  assert.match(el.passos[0], /senha digitada direto no site/, "senha nunca passa pelo chat");
  assert.match(el.comando, /^Estou conectado na ElevenLabs pelo plugin\./);
  assert.match(el.comando, /Transcreva o áudio que eu anexei/);
  assert.match(el.comando, /gere um áudio curto/);
  assert.match(el.prova, /transcreveu um áudio seu e gerou um áudio/);
});

test("Dia 3: a auto-melhoria revisa as últimas 2 semanas, propõe skill ou agente e a rotina nunca aplica nada sem o aprovado", () => {
  const a = doDia3("auto-melhoria");
  assert.match(a.titulo, /^Auto-melhoria/);
  // a fala do Polozi (ideia I41): "verifica o meu trabalho das últimas 2 semanas, vê o que pode virar skill ou agente"
  assert.match(a.comando, /^Verifique o meu trabalho das últimas 2 semanas/);
  assert.match(a.comando, /pode virar skill ou agente/);
  assert.match(a.comando, /pedem melhoria numa skill ou num agente que já existe/, "os aprendizados também melhoram o que já existe");
  assert.match(a.comando, /com a evidência de cada item/, "proposta sem evidência não entra");
  assert.match(a.comando, /espere o meu aprovado antes de criar ou mudar qualquer coisa/);
  assert.match(a.comando, /rotina semanal que faz essa verificação sozinha/);
  assert.match(a.comando, /sem aplicar nada sem o meu aprovado/, "a rotina propõe; quem decide é o dono");
  assert.match(a.comando, /modo Local e permissão de gravação só na pasta do projeto/);
  assert.ok(naOrdem(a.passos, ["cole o comando abaixo", "Leia a lista", "diga aprovado", "Agende a rotina", "só traz propostas, sem mudar nada sozinha"]), "revisar, aprovar um item e só então agendar");
  assert.match(a.prova, /rotina semanal aparece na lista de tarefas agendadas/);
});

test("Dia 3: o Codex pelo celular segue as telas capturadas: Conexões, QR code lido pelo celular e chat novo no projeto", () => {
  const c = doDia3("codex-celular");
  assert.equal(c.titulo, "Controlar o Codex pelo celular");
  assert.equal(c.executor_padrao, "pessoa", "é o aluno que clica; a IA não tem o que fazer aqui");
  assert.ok(naOrdem(c.passos, ["em Programação, clique em Conexões", "Ligue Permitir conexões", "Conectar computador", "Conexão estabelecida", "toque no lápis", "Envie o pedido abaixo pelo celular"]), "a ordem das telas");
  assert.match(c.passos[1], /QR code, que é segredo e não se mostra para ninguém/);
  assert.match(c.passos[1], /manter o computador ativo/);
  assert.match(c.passos[2], /com o mesmo login/);
  assert.match(c.passos[2], /Escanear código QR/);
  assert.match(c.passos[5], /ligado e na internet/);
  assert.match(c.passos[5], /no Windows, desbloqueado e sem suspensão/);
  assert.match(c.comando, /^Estou falando pelo celular\./, "o comando é o pedido de teste enviado do celular");
  assert.match(c.prova, /pedido enviado pelo celular foi respondido pelo Codex do computador/);
});

test("cada passo do curso (Dia 1 ao Dia 3) tem título curto, instrução de 1 a 2 frases e prova", () => {
  for (const a of [...doDia("D1"), ...doDia("D2"), ...doDia("D3")]) {
    const c = a.chave;
    assert.ok(a.titulo.length <= 40, `${c}: título longo (${a.titulo.length})`);
    assert.ok(a.prova?.trim(), `${c}: sem prova`);
    const frases = a.instrucao.split(/(?<=[.!?])\s+/).filter(Boolean);
    assert.ok(frases.length >= 1 && frases.length <= 2, `${c}: ${frases.length} frases`);
  }
});

// A única URL que o aluno cola: o repositório-modelo do curso (a conta dona dele tem "polozi" no nome).
const URL_MODELO = "https://github.com/polozigit/mestre-das-ias-os";

test("texto do aluno não cita a Polozi (só o nome da habilidade que ele digita, como polozi-instalador, e a URL exata do repositório-modelo)", () => {
  for (const a of todas) assert.doesNotMatch(JSON.stringify(a).split(URL_MODELO).join("").replace(/polozi-[a-z-]+/gi, ""), /polozi/i, a.chave);
});

test("cada passo depende do anterior (a ordem do manual vira a ordem das dependências)", () => {
  PASSOS.forEach((c, i) => {
    const a = d1.find((x) => x.chave === c)!;
    assert.equal(a.depende_de, i === 0 ? undefined : PASSOS[i - 1], c);
  });
});

test("a instalação prova só contas até banco (6 passos); sistema no ar, dossiê/persona/marca, sistema com a marca e times ficam abertos", () => {
  assert.deepEqual(todas.filter((a) => a.feita_na_instalacao === true).map((a) => a.chave), FEITOS_PELA_INSTALACAO);
});

// --- Cada atividade se explica sozinha: o que é, por que importa, passo a passo, prova e o prompt pronto ---
// `comando` é coluna do banco (carregar_modelo_plano a grava e a tela de Tarefas a mostra); `por_que` e `passos`
// são campos opcionais do arquivo que a carga ainda ignora (sem coluna): ficam aqui até a migration que os guarda.
type Explicada = Atividade & { objetivo?: string; por_que?: string; passos?: string[]; comando?: string };
const explicadas: Explicada[] = todas as Explicada[];
const frasesDe = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean);
const textoDoAluno = (a: Explicada) => [a.titulo, a.objetivo, a.instrucao, a.por_que, ...(a.passos ?? []), a.comando, a.prova].filter(Boolean).join("\n");
const atividade = (chave: string) => explicadas.find((a) => a.chave === chave)!;

test("toda atividade traz por que importa (uma frase), passo a passo de 3 a 6 passos, prova e o comando pronto", () => {
  assert.ok(explicadas.length >= 36, "o plano perdeu atividades");
  for (const a of explicadas) {
    assert.ok(a.objetivo?.trim(), `${a.chave}: sem objetivo`);
    assert.ok(a.prova?.trim(), `${a.chave}: sem prova`);
    assert.ok(a.por_que?.trim(), `${a.chave}: sem por_que`);
    assert.equal(frasesDe(a.por_que!).length, 1, `${a.chave}: por_que tem de ser UMA frase`);
    assert.ok(Array.isArray(a.passos) && a.passos.length >= 3 && a.passos.length <= 6, `${a.chave}: passos precisa ter de 3 a 6 itens`);
    for (const p of a.passos!) assert.ok(typeof p === "string" && p.trim() && p.length <= 240, `${a.chave}: passo vazio ou longo demais`);
    assert.ok(a.comando?.trim(), `${a.chave}: sem comando (o prompt pronto para colar)`);
    assert.ok(a.comando!.length <= 700, `${a.chave}: comando longo demais para colar (${a.comando!.length})`);
  }
});

test("o vocabulário do aluno não tem Casa, Empresa OS nem fábrica (o sistema, <Nome> OS)", () => {
  // O nome da habilidade que ele digita (polozi-arrumar-a-casa) não conta: é identificador, não texto.
  const limpo = (t: string) => t.replace(/polozi-[a-z-]+/gi, "");
  const proibido = (t: string) => /\bCasa\b/.test(limpo(t)) || /Empresa OS|f[áa]brica/i.test(limpo(t));
  for (const e of m.etapas) assert.ok(!proibido([e.titulo, e.objetivo].join("\n")), `etapa ${e.chave}: vocabulário antigo`);
  for (const a of explicadas) assert.ok(!proibido(textoDoAluno(a)), `${a.chave}: vocabulário antigo (Casa, Empresa OS ou fábrica)`);
});

test("comando nunca leva segredo nem manda a IA pedir senha, chave ou token no chat", () => {
  for (const a of explicadas) {
    assert.doesNotMatch(a.comando!, /sk-[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{10,}|sbp_|password\s*[:=]/i, `${a.chave}: parece segredo no comando`);
    assert.doesNotMatch(a.comando!, /\b(me\s+)?(passe|mande|envie|cole|digite)\b[^.]{0,40}\b(a\s+)?(senha|chave|token)\b/i, `${a.chave}: comando pede segredo`);
  }
  // Os passos que mexem com login, chave ou QR dizem no próprio comando que o segredo não passa pelo chat.
  for (const c of ["contas", "conectores", "banco", "whatsapp"]) {
    assert.match(atividade(c).comando!, /senha|chave|login|autoriz|QR/i, `${c}: comando devia dizer como o segredo é tratado`);
  }
});

test("cada skill citada com $ no comando tem a forma de nome de skill do kit", () => {
  for (const a of explicadas) {
    const citadas = [...a.comando!.matchAll(/\$([A-Za-z][A-Za-z0-9_-]*)/g)].map((x) => x[1]);
    for (const nome of citadas) assert.match(nome, /^(polozi|tecnologia|pmo|marketing)-[a-z0-9-]+$/, `${a.chave}: $${nome} não é skill do kit`);
  }
});

test("conectores: Supabase e Vercel no app; o GitHub é pelo gh no terminal e o conector dele é opcional", () => {
  // o AGENTS.md da Casa manda "GitHub é sempre gh, nunca o conector": o plano não pode mandar o aluno ligá-lo
  const c = atividade("conectores");
  assert.match(c.instrucao, /conectores do Supabase e da Vercel/);
  assert.match(c.instrucao, /terminal \(gh\)/);
  assert.match(c.instrucao, /conector do GitHub é opcional/);
  assert.match(c.comando!, /Supabase e da Vercel/);
  assert.match(c.prova!, /Supabase e da Vercel/);
  for (const t of [c.objetivo!, c.por_que!, c.comando!, c.prova!]) assert.doesNotMatch(t, /conector(es)? do GitHub/i, "só a instrução e os passos citam o conector do GitHub, e como opcional");
  for (const p of c.passos!) if (/conector do GitHub/i.test(p)) assert.match(p, /opcional/);
  assert.ok(!c.passos!.some((p) => /Procure o conector do GitHub|conector do GitHub e clique/i.test(p)), "nenhum passo manda ligar o conector do GitHub");
});

test("banco e sistema no ar chamam o instalador (etapas 7-banco e 8-sistema): é ele que tem o caminho de primeira vez", () => {
  // a tecnologia-mudar-banco só cobre migration nova e a tecnologia-publicar não cria o dono nem manda o convite
  for (const chave of ["banco", "sistema-no-ar"]) {
    assert.match(atividade(chave).comando!, /^\$polozi-instalador /, `${chave}: o prompt pronto tem de chamar o instalador`);
    assert.doesNotMatch(atividade(chave).comando!, /\$tecnologia-/, `${chave}: a skill de mudança não é a de primeira vez`);
  }
  // as skills de mudança seguem no plano como "daqui pra frente" (o kit promete que o plano as cita)
  assert.match(textoDoAluno(atividade("banco")), /tecnologia-mudar-banco/);
  assert.match(textoDoAluno(atividade("sistema-no-ar")), /tecnologia-publicar/);
  assert.match(atividade("banco").comando!, /Guarde as chaves sem me mostrar\./);
});

test("dossiê, persona e marca também chamam o instalador (etapas 5-dossie e 6-marca): sem ele elas ficam pendentes em operacao/INSTALACAO.md", () => {
  assert.match(atividade("dossie-persona-marca").comando!, /^\$polozi-instalador /);
});

test("baixar o zip: a pasta recebe o nome do sistema (primeiro nome da empresa mais -os): o instalador não pede pra renomear a pasta", () => {
  const c = atividade("clonar-repo");
  assert.match(c.instrucao, /primeiro nome da sua empresa mais -os/);
  assert.ok(c.passos!.some((p) => /mais -os/.test(p)), "nenhum passo diz o nome da pasta");
  assert.doesNotMatch(textoDoAluno(c), /com o nome d[ao] (sua|minha) empresa[,.]/, "a pasta não se chama só pelo nome da empresa");
});

test("baixar o zip: instrução manda baixar o zip, descompactar e abrir no Codex a pasta que tem o AGENTS.md", () => {
  const c = atividade("clonar-repo");
  assert.match(c.instrucao, /zip/);
  assert.match(c.instrucao, /descompacte/);
  assert.match(c.instrucao, /AGENTS\.md/);
  assert.match(c.instrucao, /Codex/);
  assert.ok(c.passos!.some((p) => /AGENTS\.md/.test(p)), "nenhum passo manda conferir o AGENTS.md na raiz");
  assert.match(c.prova!, /AGENTS\.md/);
});

test("baixar o zip: nem a instrução nem o comando citam a URL do repositório-modelo nem mandam clonar", () => {
  const c = atividade("clonar-repo");
  assert.ok(!c.comando!.includes(URL_MODELO), "o comando cita a URL do repositório-modelo");
  assert.ok(!c.instrucao.includes(URL_MODELO), "a instrução cita a URL do repositório-modelo");
  assert.doesNotMatch(textoDoAluno(c), /git clone|clon(e|ar)\b|polozigit/i, "sobrou clone ou o repositório-modelo");
  assert.doesNotMatch(textoDoAluno(c), /endereço que o professor/, "sobrou o endereço que o professor passou");
  assert.match(c.comando!, /AGENTS\.md/);
});

test("instalador: confiar nos hooks é em Configurações, Hooks, Confiar em tudo (o app não tem /hooks)", () => {
  const passos = atividade("instalador").passos!;
  const confiar = passos.find((p) => /confie na pasta/.test(p))!;
  assert.ok(confiar, "falta o passo de confiar na pasta");
  assert.match(confiar, /Configurações, Hooks/);
  assert.match(confiar, /Confiar em tudo/);
  assert.doesNotMatch(textoDoAluno(atividade("instalador")), /avisos de início de sessão|\/hooks/);
});

test("PMO 4: a revisão semanal é ligada na semana 1 da trilha, com prazo de 7 dias e prova de arquivo e agenda", () => {
  const clareza = m.etapas.find((e: { fase: string; trilha: string }) => e.trilha === "plano90" && e.fase === "clareza").atividades as Explicada[];
  const r = clareza.find((a) => a.chave === "ritual-semanal")!;
  assert.ok(r, "falta a atividade ritual-semanal na etapa clareza");
  assert.equal(r.ordem, Math.max(...clareza.map((a) => a.ordem)), "ritual-semanal é a última da semana 1");
  assert.equal((r as unknown as { prazo_dias: number }).prazo_dias, 7);
  assert.match(r.instrucao, /pmo-revisao-semanal/);
  assert.match(r.comando!, /\$pmo-revisao-semanal/);
  assert.match(r.prova!, /operacao\/pmo\/revisoes\//);
  assert.match(r.prova!, /agendada/);
});

test("time de agentes: nasce de um processo que se repete; a IA principal cria as skills do time, sem Native AI nem Fábrica de Agentes", () => {
  const f = atividade("fabrica");
  assert.equal(f.titulo, "Criar um time de agentes");
  assert.match(f.instrucao, /um processo ou uma necessidade que se repete na sua empresa/);
  assert.match(f.comando!, /^Cria um time de agentes para \[escreva o processo ou a necessidade que se repete\]/);
  assert.match(f.passos![0], /^Escolha um processo ou uma necessidade que se repete/);
  assert.doesNotMatch(textoDoAluno(f), /área que mais pesa|time autoral/, "o time não parte mais de uma área, e sim de um processo");
  assert.match(f.instrucao, /IA principal/);
  assert.match(f.instrucao, /\.agents\/skills\/<area>-<nome>\//);
  assert.match(f.comando!, /^Cria um time de /);
  assert.match(f.comando!, /teste cada uma com um caso real/);
  assert.match(f.comando!, /registre a área no MAPA/);
  assert.doesNotMatch(textoDoAluno(f), /Fábrica de Agentes|native-ai|Native AI|\$native/i);
  const todo = JSON.stringify(m);
  assert.doesNotMatch(todo, /native-ai|Native AI/i, "o plano do Mestre não cita mais o time Native AI");
});

test("dossiê, persona e marca chamam marketing-persona e marketing-identidade e provam pela tela Marca", () => {
  const d = atividade("dossie-persona-marca");
  for (const s of ["marketing-persona", "marketing-identidade"]) {
    assert.match(d.instrucao, new RegExp(s), `instrução sem ${s}`);
    assert.match(d.comando!, new RegExp(`\\$${s}`), `comando sem $${s}`);
  }
  assert.match(d.comando!, /\$polozi-registrar-dossie/);
  assert.match(d.prova!, /Marca/);
});

test("dossiê, persona e marca: registra o dossiê e publica, depois persona, identidade e logo (só se tiver), e a prova são os 3 documentos na tela Marca", () => {
  const d = atividade("dossie-persona-marca");
  // a ordem do fluxo é a do comando: dossiê (e publicar) -> persona -> identidade -> logo
  const ordem = ["$polozi-registrar-dossie", "publique-o no sistema", "$marketing-persona", "$marketing-identidade", "$marketing-logo"].map((t) => d.comando!.indexOf(t));
  assert.ok(ordem.every((i) => i >= 0), `comando sem algum passo do fluxo: ${ordem}`);
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, "o comando não segue a ordem dossiê, persona, identidade, logo");
  // logo é só para quem tem logo: o comando e a instrução dizem a condição, e o logo vem de uma skill (a IA nunca cria logo)
  assert.match(d.comando!, /Se eu tiver um logo, use \$marketing-logo para tratá-lo/);
  assert.match(d.instrucao, /marketing-logo/);
  assert.match(d.instrucao, /se você tem logo/);
  assert.match(d.instrucao, /polozi-registrar-dossie/);
  // o que ficou aprovado antes de o banco existir se publica depois, com a frase que a skill entende
  assert.ok(d.passos!.some((p) => p.includes('"publica a persona e a marca"')), "falta o passo do que ficou aprovado antes do banco");
  // a prova nomeia as 3 abas da tela, com os rótulos que a tela mostra de verdade
  for (const aba of Object.values(ROTULO_ABA)) assert.match(d.prova!, new RegExp(`aba ${aba}`), `a prova não cita a aba ${aba}`);
  assert.match(d.prova!, /os 3 documentos/);
  // o dossiê entra pelo arquivo que o aluno baixa do app (decisão de 18/11/2026), não mais pela transcrição do áudio
  assert.match(d.comando!, /vou anexar o arquivo do dossiê que baixei do app do aluno/);
  assert.match(d.passos![0], /dossie-completo\.md/);
  assert.match(d.passos![1], /anexe o arquivo do dossiê, ou diga em que pasta ele está/);
  assert.doesNotMatch(textoDoAluno(d), /transcrição/);
  assert.match(d.passos!.at(-1)!, /Dossiê, Persona e Identidade e voz/);
});

test("Configurar o Codex liga o Acesso total, o Computer Use e o Chrome como padrão (decisão de 08/10/2026)", () => {
  const a = todas.find((x) => x.chave === "config-codex") as Explicada;
  const texto = [a.instrucao, a.comando, a.prova, ...(a.passos ?? [])].join("\n");
  for (const termo of ["Acesso total", "Computer Use", "Google Chrome", "navegador padrão"]) assert.ok(texto.includes(termo), termo);
  assert.doesNotMatch(texto, /só dentro da pasta|pedindo a sua aprovação/);
});

test("o instalador não espera licença do aluno: cria e segue sozinho (achado A14 do teste real, 08/10/2026)", () => {
  const a = todas.find((x) => x.chave === "instalador") as Explicada;
  assert.doesNotMatch([a.instrucao, a.comando, ...(a.passos ?? [])].join("\n"), /pode criar|quando eu disser|quando você disser/);
  assert.match(a.comando!, /sem pedir licença/);
});

test("Configurar o Codex é com o professor antes do instalador, e o sistema no ar não tem QA de tela (08/10/2026)", () => {
  const c = todas.find((x) => x.chave === "config-codex") as Explicada;
  assert.match(c.instrucao, /professor/);
  assert.match(c.instrucao, /antes do instalador/);
  const s = todas.find((x) => x.chave === "sistema-no-ar") as Explicada;
  assert.doesNotMatch([s.instrucao, s.comando, ...(s.passos ?? [])].join("\n"), /testa como usuário|teste como usuário|testar a prévia/);
});

test("sistema com a marca: o comando chama a skill e manda mostrar o mockup em claro e escuro e o aluno aprovar ANTES de aplicar e de mandar o link de teste", () => {
  const a = atividade("sistema-com-marca");
  assert.match(a.comando!, /^\$tecnologia-aplicar-marca /);
  assert.match(a.comando!, /mockup/);
  assert.match(a.comando!, /mockup[^;]*em claro e escuro,? para eu aprovar/);
  const aprov = a.comando!.indexOf("aprov", a.comando!.indexOf("mockup")); // "aprovada" da identidade vem antes e não conta
  assert.ok(aprov >= 0, "o comando não pede a aprovação do mockup");
  assert.ok(aprov < a.comando!.indexOf("link de teste"), "a aprovação do mockup tem de vir antes do link de teste");
  assert.ok(a.comando!.indexOf("mockup") < aprov, "o mockup tem de vir antes da aprovação");
  assert.match(a.comando!, /publique quando eu disser sim/);
  assert.match(textoDoAluno(a), /mockup/);
  assert.match(a.passos!.join("\n"), /mockup das telas em claro e escuro/);
});
