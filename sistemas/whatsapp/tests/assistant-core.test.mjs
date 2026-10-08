import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantHandler } from "../src/assistant-core.mjs";
import { runningAssistantPid } from "../src/assistant-process.mjs";

const event = (text, remoteJid = "10000000000001@lid") => JSON.stringify({ event: "message", data: { id: "m", remoteJid, fromMe: true, text } });

function setup({ ask } = {}) {
  const calls = { asks: [], sends: [], logs: [], errors: [] };
  const handle = createAssistantHandler({
    ask: ask || (async (history, question) => { calls.asks.push({ history, question }); return `resposta a ${question}`; }),
    send: async (text) => { calls.sends.push(text); },
    log: (line) => calls.logs.push(line),
    logError: (line) => calls.errors.push(line),
  });
  return { calls, handle };
}

test("responde direto a primeira mensagem com @ia, sem etapa de ativacao", async () => {
  const { calls, handle } = setup();
  await handle(event("@ia quantas leads ontem?"));
  assert.deepEqual(calls.sends, ["resposta a quantas leads ontem?"]);
  assert.equal(calls.asks[0].question, "quantas leads ontem?");
  assert.deepEqual(calls.logs, ["WHATSAPP_LIVE_ASSISTANT=REPLIED"]);
});

test("mensagem sem @ia ou @polozi e ignorada (bloco de notas)", async () => {
  const { calls, handle } = setup();
  await handle(event("lembrar de ligar pro fornecedor"));
  await handle(event("fale com @ia hoje"));
  await handle(event("@ia"));
  assert.equal(calls.asks.length, 0);
  assert.equal(calls.sends.length, 0);
});

test("@ia ativar nao e comando especial: vai pra IA como qualquer pergunta", async () => {
  const { calls, handle } = setup();
  await handle(event("@ia ativar"));
  assert.equal(calls.asks[0].question, "ativar");
  assert.doesNotMatch(calls.sends.join(" "), /Assistente local ativo/);
});

test("memoria curta: as perguntas seguintes recebem o historico, limitado a 6 itens", async () => {
  const { calls, handle } = setup();
  for (const n of [1, 2, 3, 4, 5]) await handle(event(`@ia pergunta ${n}`));
  assert.equal(calls.asks[0].history.length, 0);
  assert.equal(calls.asks[1].history.length, 2);
  assert.equal(calls.asks[4].history.length, 6);
  assert.equal(calls.asks[4].history[0].text, "pergunta 2");
});

test("falha da IA nao derruba a fila e e registrada", async () => {
  let n = 0;
  const { calls, handle } = setup({ ask: async () => { n += 1; if (n === 1) throw new Error("IA fora do ar"); return "ok"; } });
  await handle(event("@ia primeira"));
  await handle(event("@ia segunda"));
  assert.deepEqual(calls.errors, ["WHATSAPP_LIVE_ASSISTANT_ERROR=IA fora do ar"]);
  assert.deepEqual(calls.sends, ["ok"]);
});

test("anotacao sem @ia (inclusive \"1\" ou \"agendar\") nunca recebe resposta", async () => {
  const { calls, handle } = setup();
  for (const text of ["1", "agendar", "lembrar de pagar boleto"]) await handle(event(text));
  assert.equal(calls.sends.length, 0);
});

test("assistente rodando: pid vivo e com a linha de comando certa", async () => {
  const base = { readPid: async () => "4242\n", alive: () => true, matches: async () => true };
  assert.equal(await runningAssistantPid(base), 4242);
  assert.equal(await runningAssistantPid({ ...base, alive: () => false }), 0);
  assert.equal(await runningAssistantPid({ ...base, matches: async () => false }), 0);
  assert.equal(await runningAssistantPid({ ...base, readPid: async () => { throw new Error("ENOENT"); } }), 0);
  assert.equal(await runningAssistantPid({ ...base, readPid: async () => "abc" }), 0);
});

const attached = (anexo, text = "@ia resume") => JSON.stringify({ event: "message", data: { id: "m", remoteJid: "10000000000001@lid", fromMe: true, text, anexo } });

function setupWithAttachments({ ask } = {}) {
  const calls = { asks: [], sends: [], removed: [], errors: [] };
  const handle = createAssistantHandler({
    ask: ask || (async (history, question, extra) => { calls.asks.push({ question, extra }); return "resumo pronto"; }),
    send: async (text) => { calls.sends.push(text); },
    remove: async (file) => { calls.removed.push(file); },
    log: () => {},
    logError: (line) => calls.errors.push(line),
  });
  return { calls, handle };
}

test("PDF anexado: a IA recebe o anexo e o temporario e apagado depois da resposta", async () => {
  const { calls, handle } = setupWithAttachments();
  const anexo = { tipo: "pdf", caminho: "/estado/midia-temp/abc.pdf", nome: "contrato.pdf" };
  await handle(attached(anexo));
  assert.deepEqual(calls.asks, [{ question: "resume", extra: { anexo } }]);
  assert.deepEqual(calls.sends, ["resumo pronto"]);
  assert.deepEqual(calls.removed, ["/estado/midia-temp/abc.pdf"]);
});

test("temporario tambem e apagado quando a IA falha ou nao responde", async () => {
  const anexo = { tipo: "imagem", caminho: "/estado/midia-temp/x.png", nome: "x.png" };
  const failing = setupWithAttachments({ ask: async () => { throw new Error("IA fora do ar"); } });
  await failing.handle(attached(anexo));
  assert.deepEqual(failing.calls.removed, [anexo.caminho]);
  assert.deepEqual(failing.calls.errors, ["WHATSAPP_LIVE_ASSISTANT_ERROR=IA fora do ar"]);

  const empty = setupWithAttachments({ ask: async () => "" });
  await empty.handle(attached(anexo));
  assert.deepEqual(empty.calls.removed, [anexo.caminho]);
});

test("pergunta sem anexo nao apaga nada e nao manda anexo para a IA", async () => {
  const { calls, handle } = setupWithAttachments();
  await handle(event("@ia quantas leads?"));
  assert.deepEqual(calls.removed, []);
  assert.deepEqual(calls.asks, [{ question: "quantas leads?", extra: {} }]);
});

test("anexo com erro (grande demais, formato): explica e nao chama a IA", async () => {
  const { calls, handle } = setupWithAttachments();
  await handle(attached({ tipo: "pdf", erro: "arquivo grande demais (limite 20 MB)" }));
  assert.deepEqual(calls.sends, ["Nao consegui ler o anexo: arquivo grande demais (limite 20 MB)."]);
  assert.equal(calls.asks.length, 0);
  assert.deepEqual(calls.removed, []);
});

test("o historico lembra que a pergunta tinha anexo", async () => {
  const { calls, handle } = setupWithAttachments();
  await handle(attached({ tipo: "pdf", caminho: "/m/a.pdf", nome: "contrato.pdf" }));
  const histories = [];
  const second = createAssistantHandler({ ask: async (history) => { histories.push(history); return "ok"; }, send: async () => {}, log: () => {} });
  await second(attached({ tipo: "pdf", caminho: "/m/a.pdf", nome: "contrato.pdf" }));
  await second(event("@ia e agora?"));
  assert.equal(histories[1][0].text, "resume [anexo: contrato.pdf]");
  assert.equal(calls.asks.length, 1);
});
