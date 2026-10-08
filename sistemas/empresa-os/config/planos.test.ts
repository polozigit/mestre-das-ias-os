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

// --- Passo a passo da instalação: os 10 passos abrem o Dia 1, nesta ordem ---
type Atividade = { chave: string; ordem: number; titulo: string; instrucao: string; prova?: string; depende_de?: string; feita_na_instalacao?: boolean };
const PASSOS = ["contas", "conectores", "config-codex", "clonar-repo", "instalador", "banco", "sistema-no-ar", "dossie-persona-marca", "whatsapp", "times"];
const FEITOS_PELA_INSTALACAO = PASSOS.slice(0, 6); // contas ... banco; "sistema no ar" só com a prova do /login (plano-reconciliar: siteNoAr)
const d1: Atividade[] = m.etapas.find((e: { fase: string; trilha: string }) => e.trilha === "curso" && e.fase === "D1").atividades;
const todas: Atividade[] = m.etapas.flatMap((e: { atividades: Atividade[] }) => e.atividades);

test("a versão do modelo subiu: a 1, a 2 e a 3 já foram carregadas com outro hash e o banco recusa mudar versão carregada", () => {
  // 6 = o comando do dossiê, persona e marca passou a chamar o instalador e a pasta do clone ganhou o nome do sistema
  // (2ª rodada da revisão final, 08/10). 7 = o comando do clone cita a URL exata do repositório-modelo (09/10).
  // Quem muda o conteúdo do plano sobe a versão E este número, junto.
  assert.ok(m.versao >= 7);
});

test("os 10 passos da instalação são os 10 primeiros do Dia 1, na ordem do manual", () => {
  assert.deepEqual([...d1].sort((a, b) => a.ordem - b.ordem).slice(0, PASSOS.length).map((a) => a.chave), PASSOS);
  const ordemDe = (c: string) => d1.find((a) => a.chave === c)!.ordem;
  assert.ok(ordemDe("times") < ordemDe("primeiro-time"), "os passos atuais do D1 vêm depois dos 10");
});

test("passo da instalação não é duplicado: nenhum item antigo (casa, dossie) sobrou e o WhatsApp não está mais no Dia 2", () => {
  const chaves = todas.map((a) => a.chave);
  for (const velha of ["casa", "dossie"]) assert.ok(!chaves.includes(velha), `${velha} foi fundido num dos 10 passos`);
  assert.equal(chaves.filter((c) => c === "whatsapp").length, 1);
  assert.ok(d1.some((a) => a.chave === "whatsapp"));
});

test("cada um dos 10 passos tem título curto, instrução de 1 a 2 frases e prova", () => {
  for (const c of PASSOS) {
    const a = d1.find((x) => x.chave === c)!;
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

test("a instalação prova só contas até banco (6 passos); sistema no ar, dossiê/persona/marca, WhatsApp e times ficam abertos", () => {
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
  assert.ok(explicadas.length >= 31, "o plano perdeu atividades");
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
    for (const nome of citadas) assert.match(nome, /^(polozi|tecnologia|pmo|marketing|native-ai)-[a-z0-9-]+$/, `${a.chave}: $${nome} não é skill do kit`);
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

test("clonar a cópia já com o nome do sistema (primeiro nome da empresa mais -os): o instalador não pede pra renomear a pasta", () => {
  const c = atividade("clonar-repo");
  assert.match(c.instrucao, /primeiro nome da sua empresa mais -os/);
  assert.match(c.comando!, /primeiro nome da minha empresa em minúsculas, sem acento, mais -os/);
  assert.ok(c.passos!.some((p) => /mais -os/.test(p)), "nenhum passo diz o nome da pasta");
  assert.doesNotMatch(textoDoAluno(c), /com o nome d[ao] (sua|minha) empresa[,.]/, "a pasta não se chama só pelo nome da empresa");
});

test("clonar a cópia: o comando traz a URL exata do repositório-modelo, não 'o endereço que o professor passou'", () => {
  const c = atividade("clonar-repo");
  assert.ok(c.comando!.includes(URL_MODELO), "o comando do clone não cita a URL do repositório-modelo");
  assert.ok(c.instrucao.includes(URL_MODELO), "a instrução do clone não cita a URL do repositório-modelo");
  assert.doesNotMatch(textoDoAluno(c), /endereço que o professor/, "sobrou o endereço que o professor passou");
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

test("times: o kit novo tem quatro times e eles já vêm instalados (não são instalados um a um)", () => {
  const t = atividade("times");
  assert.ok(t.titulo.length <= 40 && !/6/.test(textoDoAluno(t)), "o título cabe em 40 e não fala em 6 times");
  for (const nome of ["Native AI", "Tecnologia", "PMO", "Marketing"]) assert.match(t.instrucao, new RegExp(nome), `times: falta ${nome}`);
  assert.match(t.instrucao, /já vêm instalados/);
  assert.match(t.prova!, /--verificar/);
  assert.doesNotMatch(textoDoAluno(t), /Pessoas|Comercial|Estratégia|Infra\b|aba Plugins/, "times: sobrou texto dos 6 times antigos");
});

test("fábrica do aluno é o time Native AI (native-ai-construir), não a Fábrica de Agentes", () => {
  const f = atividade("fabrica");
  assert.match(f.instrucao, /native-ai-construir/);
  assert.match(f.comando!, /\$native-ai-construir/);
  assert.doesNotMatch(textoDoAluno(f), /Fábrica de Agentes/i);
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
  assert.match(d.passos!.at(-1)!, /Dossiê, Persona e Identidade e voz/);
});
