import assert from "node:assert/strict";
import test from "node:test";

import { enviar, parseEnviarArgs } from "../src/enviar.mjs";

const config = { apiKey: "k", baseUrl: "http://127.0.0.1:1" };

function harness(files = {}) {
  const sent = [];
  return {
    sent,
    options: {
      ensure: async () => config,
      send: async (cfg, phone, text, origem) => { sent.push({ cfg, phone, text, origem }); return { id: "WA1" }; },
      sendFile: async (cfg, options) => { sent.push({ cfg, ...options }); return { id: "WM1" }; },
      read: async (file) => { if (!(file in files)) throw new Error("ENOENT"); return files[file]; },
    },
  };
}

test("envia o texto com origem relatorio por padrao e devolve o id", async () => {
  const { sent, options } = harness();
  assert.equal(await enviar(["5511900000001", "--texto", "Bom dia"], options), "WA1");
  assert.deepEqual(sent.map(({ phone, text, origem }) => ({ phone, text, origem })), [{ phone: "5511900000001", text: "Bom dia", origem: "relatorio" }]);
  assert.equal(sent[0].cfg, config);
});

test("--origem muda a origem registrada e valor fora da lista e recusado", async () => {
  const { sent, options } = harness();
  await enviar(["5511900000001", "--texto", "x", "--origem", "teste"], options);
  assert.equal(sent[0].origem, "teste");
  await assert.rejects(() => enviar(["5511900000001", "--texto", "x", "--origem", "spam"], options), /Origem invalida/);
});

test("--arquivo le o texto e tira BOM e quebra de linha final", async () => {
  const { sent, options } = harness({ "relatorio.txt": "\uFEFFVendas de hoje\r\n12 pedidos\r\n" });
  await enviar(["5511900000001", "--arquivo", "relatorio.txt"], options);
  assert.equal(sent[0].text, "Vendas de hoje\r\n12 pedidos");
  await assert.rejects(() => enviar(["5511900000001", "--arquivo", "nao-existe.txt"], options), /Nao foi possivel ler/);
});

test("valida numero e texto como o envio normal, sem tocar no motor", async () => {
  const { sent, options } = harness();
  await assert.rejects(() => enviar(["11900000001", "--texto", "oi"], options), /telefone brasileiro/);
  await assert.rejects(() => enviar(["5511900000001", "--texto", "   "], options), /vazia/);
  await assert.rejects(() => enviar(["5511900000001", "--texto", "x".repeat(2001)], options), /2000/);
  assert.equal(sent.length, 0);
});

test("exige numero e exatamente um entre --texto e --arquivo", async () => {
  const { options } = harness({ "a.txt": "oi" });
  await assert.rejects(() => parseEnviarArgs([], options.read), /Uso/);
  await assert.rejects(() => parseEnviarArgs(["5511900000001"], options.read), /--texto ou --arquivo/);
  await assert.rejects(() => parseEnviarArgs(["5511900000001", "--texto", "a", "--arquivo", "a.txt"], options.read), /--texto ou --arquivo/);
  await assert.rejects(() => parseEnviarArgs(["5511900000001", "--desconhecida"], options.read), /Uso/);
});

test("sem trava de destino ou volume: nao exige ENVIAR nem ser o proprio numero", async () => {
  const { sent, options } = harness();
  await enviar(["5511900000003", "--texto", "a"], options);
  await enviar(["5511900000002", "--texto", "b"], options);
  assert.equal(sent.length, 2);
});

test("desconectado: o erro do envio traz a instrucao de reconectar", async () => {
  const { NOT_CONNECTED_MESSAGE } = await import("../src/engine-client.mjs");
  const { options } = harness();
  options.send = async () => { throw new Error(NOT_CONNECTED_MESSAGE); };
  await assert.rejects(() => enviar(["5511900000001", "--texto", "oi"], options), /reconecta meu WhatsApp/);
});

const GROUP = "120363000000000000@g.us";

test("--midia envia o arquivo com tipo e legenda para numero ou grupo", async () => {
  const { sent, options } = harness();
  assert.equal(await enviar(["5511900000001", "--midia", "relatorio.pdf", "--tipo", "document", "--legenda", "Vendas de hoje", "--nome", "vendas.pdf"], options), "WM1");
  assert.equal(await enviar([GROUP, "--midia", "foto.png", "--tipo", "image", "--origem", "teste"], options), "WM1");
  assert.deepEqual(sent.map(({ destino, caminho, tipo, legenda, nomeArquivo, origem }) => ({ destino, caminho, tipo, legenda, nomeArquivo, origem })), [
    { destino: "5511900000001", caminho: "relatorio.pdf", tipo: "document", legenda: "Vendas de hoje", nomeArquivo: "vendas.pdf", origem: "relatorio" },
    { destino: GROUP, caminho: "foto.png", tipo: "image", legenda: undefined, nomeArquivo: undefined, origem: "teste" },
  ]);
});

test("texto tambem vai para grupo", async () => {
  const { sent, options } = harness();
  await enviar([GROUP, "--texto", "Bom dia"], options);
  assert.deepEqual(sent.map(({ phone, text }) => ({ phone, text })), [{ phone: GROUP, text: "Bom dia" }]);
});

test("--midia exige --tipo valido, nao mistura com texto e valida o destino", async () => {
  const { sent, options } = harness({ "a.txt": "oi" });
  await assert.rejects(() => enviar(["5511900000001", "--midia", "a.pdf"], options), /--tipo/);
  await assert.rejects(() => enviar(["5511900000001", "--midia", "a.pdf", "--tipo", "gif"], options), /--tipo/);
  await assert.rejects(() => enviar(["5511900000001", "--midia", "a.pdf", "--tipo", "document", "--texto", "x"], options), /nao use --texto/);
  await assert.rejects(() => enviar(["5511900000001", "--texto", "x", "--tipo", "image"], options), /so valem junto com --midia/);
  await assert.rejects(() => enviar(["5511900000001", "--arquivo", "a.txt", "--legenda", "x"], options), /so valem junto com --midia/);
  await assert.rejects(() => enviar(["123", "--midia", "a.pdf", "--tipo", "document"], options), /telefone brasileiro/);
  assert.equal(sent.length, 0);
});

test("voice e audio sao tipos aceitos pelo comando", async () => {
  const { sent, options } = harness();
  for (const tipo of ["voice", "audio", "video"]) await enviar(["5511900000001", "--midia", `a.${tipo}`, "--tipo", tipo], options);
  assert.deepEqual(sent.map((item) => item.tipo), ["voice", "audio", "video"]);
});
