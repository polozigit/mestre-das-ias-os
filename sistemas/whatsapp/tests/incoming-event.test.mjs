import assert from "node:assert/strict";
import test from "node:test";

import { commandFromText, extractIncomingTestMessage, extractLiveAssistantCommand } from "../src/incoming-event.mjs";

const event = (data) => JSON.stringify({ event: "message", data });

test("aceita somente uma mensagem nova do proprio numero no modo de teste", () => {
  const raw = event({ id: "m1", remoteJid: "5511900000001@s.whatsapp.net", fromMe: false, text: "teste de recebimento" });
  assert.deepEqual(extractIncomingTestMessage(raw, "5511900000001"), { id: "m1", text: "teste de recebimento", length: 20, fromMe: false });
  assert.equal(extractIncomingTestMessage(raw, "5511900000099"), null);
});

test("aceita o eco de teste marcado como enviado pelo proprio usuario", () => {
  const raw = event({ id: "m2", remoteJid: "10000000000001@lid", fromMe: true, text: "teste" });
  assert.deepEqual(extractIncomingTestMessage(raw, "5511900000001"), { id: "m2", text: "teste", length: 5, fromMe: true });
});

test("o assistente vivo exige o comando explicito @ia ou @polozi", () => {
  const accepted = event({ id: "abc", remoteJid: "10000000000001@lid", fromMe: true, text: "@polozi qual e o proximo passo?" });
  assert.deepEqual(extractLiveAssistantCommand(accepted), { id: "abc", conversationId: "10000000000001@lid", question: "qual e o proximo passo?" });
  assert.deepEqual(
    extractLiveAssistantCommand(event({ id: "ia", remoteJid: "10000000000001@lid", fromMe: true, text: "@IA agenda amanha" })),
    { id: "ia", conversationId: "10000000000001@lid", question: "agenda amanha" },
  );
  assert.equal(extractLiveAssistantCommand(event({ id: "def", remoteJid: "x@lid", fromMe: true, text: "mensagem comum" })), null);
  assert.equal(extractLiveAssistantCommand(event({ id: "ghi", remoteJid: "x@lid", fromMe: true, text: "@ia" })), null);
});

test("commandFromText devolve a pergunta ou null", () => {
  assert.equal(commandFromText("@ia ativar"), "ativar");
  assert.equal(commandFromText("  @polozi  oi "), "oi");
  assert.equal(commandFromText("@ia"), null);
  assert.equal(commandFromText("fale com @ia"), null);
  assert.equal(commandFromText(undefined), null);
});

test("nao devolve conteudo nem aceita eventos invalidos", () => {
  assert.equal(extractIncomingTestMessage("nao-json", "5511900000001"), null);
  assert.equal(extractIncomingTestMessage(event({ remoteJid: "5511900000001@s.whatsapp.net", text: "" }), "5511900000001"), null);
  assert.equal(extractIncomingTestMessage(JSON.stringify({ event: "outro", data: { text: "x", fromMe: true } }), "5511900000001"), null);
  assert.equal(extractLiveAssistantCommand(JSON.stringify({ data: { text: "@ia oi" } })), null);
});

test("evento com anexo: guarda so tipo, caminho, nome e erro; audio sem legenda nao e comando", () => {
  const withFile = event({ id: "p", remoteJid: "x@lid", fromMe: true, text: "@ia resume", anexo: { tipo: "pdf", caminho: "/m/a.pdf", nome: "a.pdf", extra: "ignorado" } });
  assert.deepEqual(extractLiveAssistantCommand(withFile), { id: "p", conversationId: "x@lid", question: "resume", anexo: { tipo: "pdf", caminho: "/m/a.pdf", nome: "a.pdf" } });
  const audio = event({ id: "a", remoteJid: "x@lid", fromMe: true, text: "", anexo: { tipo: "audio" } });
  assert.equal(extractLiveAssistantCommand(audio), null, "audio nao vira comando: o motor ja o ignora e o assistente nao responde");
  assert.equal(extractLiveAssistantCommand(event({ id: "n", remoteJid: "x@lid", fromMe: true, text: "", anexo: { tipo: "pdf" } })), null, "anexo sem pergunta nao e comando");
  assert.equal(extractLiveAssistantCommand(event({ id: "n", remoteJid: "x@lid", fromMe: true, text: "@ia oi", anexo: "texto" })).anexo, undefined);
});

test("o teste de recebimento ignora eventos de anexo", () => {
  const raw = event({ id: "p", remoteJid: "5511900000001@s.whatsapp.net", fromMe: false, text: "@ia oi", anexo: { tipo: "pdf", caminho: "/m/a.pdf" } });
  assert.equal(extractIncomingTestMessage(raw, "5511900000001"), null);
});
