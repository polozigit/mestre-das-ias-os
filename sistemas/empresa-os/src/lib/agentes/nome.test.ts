import test from "node:test";
import assert from "node:assert/strict";
import { LEGENDA_DOS_MODELOS, nomeAmigavel, rotuloEsforco, rotuloModelo } from "./nome.ts";

test("nome amigável tira o prefixo da diretoria (o time) e vira frase com inicial maiúscula", () => {
  assert.equal(nomeAmigavel("marketing-diretor", "marketing"), "Diretor");
  assert.equal(nomeAmigavel("contratacao-auditor", "contratacao"), "Auditor");
  assert.equal(nomeAmigavel("native-ai-avaliador", "native-ai"), "Avaliador");
  assert.equal(nomeAmigavel("tecnologia-revisor-seguranca", "tecnologia"), "Revisor segurança");
});

test('nome amigável tira o "polozi-" do começo', () => {
  assert.equal(nomeAmigavel("polozi-criar-ebook", "marketing"), "Criar ebook");
  assert.equal(nomeAmigavel("polozi-gerente-de-trabalho", "sistema"), "Gerente de trabalho");
  assert.equal(nomeAmigavel("polozi-arrumar-a-casa"), "Arrumar a casa");
});

test("os dois prefixos encadeados saem juntos (polozi- e depois a diretoria)", () => {
  assert.equal(nomeAmigavel("polozi-sistema-qa", "sistema"), "QA");
  assert.equal(nomeAmigavel("polozi-marketing-diretor", "marketing"), "Diretor");
});

test("só o prefixo do COMEÇO sai: a diretoria no meio do nome fica", () => {
  assert.equal(nomeAmigavel("polozi-time-marketing", "marketing"), "Time marketing");
  assert.equal(nomeAmigavel("diretor-marketing", "marketing"), "Diretor marketing");
});

test("sem time cadastrado só o polozi- sai", () => {
  assert.equal(nomeAmigavel("marketing-diretor"), "Marketing diretor");
  assert.equal(nomeAmigavel("marketing-diretor", null), "Marketing diretor");
  assert.equal(nomeAmigavel("marketing-diretor", ""), "Marketing diretor");
});

test("nunca devolve vazio: se o nome é o próprio prefixo, usa o nome inteiro", () => {
  assert.equal(nomeAmigavel("marketing", "marketing"), "Marketing");
  assert.equal(nomeAmigavel("polozi", "sistema"), "Polozi");
  assert.equal(nomeAmigavel("polozi-", "sistema"), "Polozi");
  assert.equal(nomeAmigavel("marketing-", "marketing"), "Marketing");
});

test("palavras do kit voltam com acento e siglas em maiúscula", () => {
  assert.equal(nomeAmigavel("polozi-registrar-dossie"), "Registrar dossiê");
  assert.equal(nomeAmigavel("polozi-mestre-dos-negocios"), "Mestre dos negócios");
  assert.equal(nomeAmigavel("polozi-criar-empresa-ia"), "Criar empresa IA");
  assert.equal(nomeAmigavel("polozi-criar-cofre-github"), "Criar cofre GitHub");
  assert.equal(nomeAmigavel("polozi-buscar-versao-anterior"), "Buscar versão anterior");
});

test("ponto e sublinhado também separam palavras, e o prototype não vaza", () => {
  assert.equal(nomeAmigavel("regua.coordenador"), "Regua coordenador");
  assert.equal(nomeAmigavel("meu_fluxo.v2"), "Meu fluxo v2");
  assert.equal(nomeAmigavel("constructor-toString"), "Constructor tostring");
});

test("o nome amigável do que o kit instala nunca sai igual ao técnico nem com hífen", () => {
  for (const [nome, time] of [
    ["marketing-auditor", "marketing"],
    ["polozi-gerar-campanha", "marketing"],
    ["polozi-fabrica-arquiteto", "sistema"],
    ["pmo-conferente", "pmo"],
  ] as const) {
    const amigavel = nomeAmigavel(nome, time);
    assert.notEqual(amigavel, nome);
    assert.doesNotMatch(amigavel, /-/);
    assert.match(amigavel, /^[A-ZÀ-Ý]/);
  }
});

test("modelo por extenso com inicial maiúscula", () => {
  assert.equal(rotuloModelo("terra"), "Terra");
  assert.equal(rotuloModelo("SOL"), "Sol");
  assert.equal(rotuloModelo("luna"), "Luna");
  assert.equal(rotuloModelo(""), "");
  assert.equal(rotuloModelo(null), "");
});

test("a legenda dos modelos é uma linha só, na ordem Sol, Terra, Luna", () => {
  assert.equal(LEGENDA_DOS_MODELOS, "Sol: raciocínio alto · Terra: dia a dia · Luna: rotina barata");
  assert.doesNotMatch(LEGENDA_DOS_MODELOS, /\n/);
});

test("esforço em português; valor desconhecido passa como veio", () => {
  assert.equal(rotuloEsforco("medium"), "médio");
  assert.equal(rotuloEsforco("xhigh"), "muito alto");
  assert.equal(rotuloEsforco("high"), "alto");
  assert.equal(rotuloEsforco("low"), "baixo");
  assert.equal(rotuloEsforco("outro"), "outro");
  assert.equal(rotuloEsforco(null), "");
});

test("o time pode vir com acento, maiúscula ou espaço e o prefixo da diretoria ainda sai", () => {
  assert.equal(nomeAmigavel("contratacao-diretor", "Contratação"), "Diretor");
  assert.equal(nomeAmigavel("gestao-auditor", "gestão"), "Auditor");
  assert.equal(nomeAmigavel("native-ai-avaliador", "Native AI"), "Avaliador");
});
