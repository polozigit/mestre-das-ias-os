import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { NOT_CONNECTED_MESSAGE, sendText, waitForConnection } from "../src/engine-client.mjs";
import { createEngineClient, createServer } from "../src/mcp-server.mjs";

const READ_TOOLS = ["whatsapp_connection_status", "whatsapp_check_number", "whatsapp_group_list", "whatsapp_group_info"];
const WRITE_TOOLS = [
  "whatsapp_send_text", "whatsapp_send_media", "whatsapp_send_poll", "whatsapp_react", "whatsapp_group_create",
  "whatsapp_group_update", "whatsapp_group_participants", "whatsapp_group_leave", "whatsapp_group_delete",
];

test("servidor MCP anuncia status, leituras e as ferramentas de escrita (todas com ENVIAR)", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/mcp-server.mjs"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client({ name: "polozi-whatsapp-test", version: "0.1.0" });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [...READ_TOOLS, ...WRITE_TOOLS, "whatsapp_group_invite"].sort());
    for (const name of WRITE_TOOLS) {
      const tool = tools.find((item) => item.name === name);
      assert.equal(tool.inputSchema.properties.confirmation?.const, "ENVIAR", `${name} exige ENVIAR`);
      assert.ok(tool.inputSchema.required.includes("confirmation"), `${name}: confirmation obrigatorio`);
      assert.equal(tool.annotations.readOnlyHint, false, name);
      assert.match(tool.description, /somente apos o usuario confirmar/i, `${name}: descricao manda confirmar antes`);
    }
    for (const name of READ_TOOLS) {
      const tool = tools.find((item) => item.name === name);
      assert.equal(tool.inputSchema?.properties?.confirmation, undefined, `${name} nao pede confirmacao`);
      assert.equal(tool.annotations.readOnlyHint, true, name);
    }
    const sendTool = tools.find((tool) => tool.name === "whatsapp_send_text");
    assert.equal(sendTool?.annotations?.destructiveHint, true);
    // revogar o link muda o grupo (ENVIAR); so obter nao pede nada: por isso confirmation e opcional no schema
    const invite = tools.find((tool) => tool.name === "whatsapp_group_invite");
    assert.equal(invite.annotations.readOnlyHint, false);
    assert.ok(!invite.inputSchema.required?.includes("confirmation"));
  } finally {
    await client.close();
  }
});

test("envio exige confirmacao ENVIAR e passa origem mcp ao motor", async () => {
  const calls = [];
  const client = createEngineClient({
    ensure: async () => ({ apiKey: "k", baseUrl: "http://127.0.0.1:1" }),
    status: async () => ({ connected: true, loggedIn: true }),
    send: async (config, phone, text, origem) => { calls.push({ config, phone, text, origem }); return { id: "WAID9" }; },
  });
  const server = createServer(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "polozi-whatsapp-test", version: "0.1.0" });
  await server.connect(serverTransport);
  await mcp.connect(clientTransport);
  try {
    const refused = await mcp.callTool({ name: "whatsapp_send_text", arguments: { phone: "5511900000001", text: "oi", confirmation: "SIM" } });
    assert.equal(refused.isError, true);
    assert.equal(calls.length, 0);

    const accepted = await mcp.callTool({ name: "whatsapp_send_text", arguments: { phone: "5511900000001", text: "oi", confirmation: "ENVIAR" } });
    assert.equal(accepted.content[0].text, "WHATSAPP_SEND_ACCEPTED=WAID9");
    assert.deepEqual(calls.map(({ phone, text, origem }) => ({ phone, text, origem })), [{ phone: "5511900000001", text: "oi", origem: "mcp" }]);

    const status = await mcp.callTool({ name: "whatsapp_connection_status", arguments: {} });
    assert.equal(status.content[0].text, "WHATSAPP_CONNECTION=CONNECTED");
  } finally {
    await mcp.close();
  }
});

async function connectWith(client) {
  const server = createServer(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "polozi-whatsapp-test", version: "0.1.0" });
  await server.connect(serverTransport);
  await mcp.connect(clientTransport);
  return mcp;
}

test("desconectado: status e envio dizem em linguagem simples para pedir a reconexao", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ connected: false, loggedIn: false, paired: false }) });
  const config = { apiKey: "k", baseUrl: "http://127.0.0.1:1" };
  const mcp = await connectWith(createEngineClient({
    ensure: async () => config,
    status: (cfg) => waitForConnection(cfg, { fetchImpl }),
    send: (cfg, phone, text, origem) => sendText(cfg, phone, text, origem, fetchImpl),
  }));
  try {
    const status = await mcp.callTool({ name: "whatsapp_connection_status", arguments: {} });
    assert.match(status.content[0].text, /^WHATSAPP_CONNECTION=NOT_CONNECTED\n/);
    assert.ok(status.content[0].text.includes(NOT_CONNECTED_MESSAGE));
    assert.match(status.content[0].text, /reconecta meu WhatsApp/);

    const sent = await mcp.callTool({ name: "whatsapp_send_text", arguments: { phone: "5511900000001", text: "oi", confirmation: "ENVIAR" } });
    assert.equal(sent.isError, true);
    assert.ok(sent.content[0].text.includes(NOT_CONNECTED_MESSAGE));
  } finally {
    await mcp.close();
  }
});

const GROUP = "120363000000000000@g.us";
const PHONE = "5511988887777";

// Cada ferramenta de escrita com argumentos validos e a chamada que ela deve fazer ao motor.
const WRITE_CASES = [
  ["whatsapp_send_media", { destino: PHONE, caminho: "/tmp/a.pdf", tipo: "document", legenda: "oi", nome_arquivo: "a.pdf" }, "sendMedia"],
  ["whatsapp_send_poll", { destino: GROUP, pergunta: "Almoco?", opcoes: ["Sim", "Nao"], multipla: true }, "sendPoll"],
  ["whatsapp_react", { destino: PHONE, id: "ABCD1234", emoji: "👍" }, "sendReaction"],
  ["whatsapp_group_create", { nome: "Equipe", participantes: [PHONE] }, "createGroup"],
  ["whatsapp_group_update", { grupo: GROUP, nome: "Novo", descricao: "", so_admin_envia: true }, "updateGroupSubject"],
  ["whatsapp_group_participants", { grupo: GROUP, acao: "add", participantes: [PHONE] }, "updateGroupParticipants"],
  ["whatsapp_group_leave", { grupo: GROUP }, "leaveGroup"],
  ["whatsapp_group_delete", { grupo: GROUP }, "deleteGroup"],
  ["whatsapp_group_invite", { grupo: GROUP, revogar: true }, "revokeGroupInvite"],
];

function recordingApi() {
  const calls = [];
  const record = (name, result = { id: "WAID1" }) => async (...args) => { calls.push([name, ...args.slice(1)]); return result; };
  const api = {
    sendMedia: record("sendMedia"), sendPoll: record("sendPoll"), sendReaction: record("sendReaction"),
    checkNumber: record("checkNumber", { numero: PHONE, existe: true }),
    listGroups: record("listGroups", { grupos: [{ id: GROUP, nome: "Equipe", participantes: 3, souAdmin: true }] }),
    getGroup: record("getGroup", { id: GROUP, nome: "Equipe", descricao: "", participantes: 2, souAdmin: true, soAdminEnvia: false, soAdminEdita: true, membros: [{ id: "1", numero: PHONE, admin: "admin" }] }),
    createGroup: record("createGroup", { id: GROUP, nome: "Equipe", participantes: 1 }),
    updateGroupSubject: record("updateGroupSubject", { ok: true }),
    updateGroupDescription: record("updateGroupDescription", { ok: true }),
    updateGroupSettings: record("updateGroupSettings", { ok: true }),
    updateGroupParticipants: record("updateGroupParticipants", { acao: "add", resultados: [], ok: 1, falhas: 0 }),
    getGroupInvite: record("getGroupInvite", { codigo: "ABC", link: "https://chat.whatsapp.com/ABC" }),
    revokeGroupInvite: record("revokeGroupInvite", { codigo: "NOVO", link: "https://chat.whatsapp.com/NOVO" }),
    leaveGroup: record("leaveGroup", { saiu: true }),
    deleteGroup: record("deleteGroup", { removidos: 2, restantes: 0, saiu: true }),
  };
  return { calls, api };
}

async function connectRecording() {
  const { calls, api } = recordingApi();
  const sends = [];
  const mcp = await connectWith(createEngineClient({
    ensure: async () => ({ apiKey: "k", baseUrl: "http://127.0.0.1:1" }),
    status: async () => ({ connected: true, loggedIn: true }),
    send: async (config, phone, text, origem) => { sends.push({ phone, text, origem }); return { id: "WAID9" }; },
    api,
  }));
  return { mcp, calls, sends };
}

test("toda ferramenta que envia ou altera recusa sem ENVIAR e nao fala com o motor", async () => {
  const { mcp, calls, sends } = await connectRecording();
  try {
    for (const [name, args] of WRITE_CASES) {
      for (const confirmation of [undefined, "SIM", "enviar", ""]) {
        const result = await mcp.callTool({ name, arguments: confirmation === undefined ? args : { ...args, confirmation } });
        assert.equal(result.isError, true, `${name} com confirmation=${JSON.stringify(confirmation)}`);
      }
    }
    const text = await mcp.callTool({ name: "whatsapp_send_text", arguments: { phone: GROUP, text: "oi" } });
    assert.equal(text.isError, true);
    assert.equal(calls.length, 0);
    assert.equal(sends.length, 0);
  } finally {
    await mcp.close();
  }
});

test("com ENVIAR cada ferramenta de escrita chama o motor com a origem mcp", async () => {
  const { mcp, calls, sends } = await connectRecording();
  try {
    for (const [name, args, call] of WRITE_CASES) {
      const result = await mcp.callTool({ name, arguments: { ...args, confirmation: "ENVIAR" } });
      assert.notEqual(result.isError, true, `${name}: ${result.content[0].text}`);
      assert.ok(calls.some((item) => item[0] === call), `${name} deveria chamar ${call}`);
    }
    assert.deepEqual(calls.find((item) => item[0] === "sendMedia")[1], { destino: PHONE, caminho: "/tmp/a.pdf", tipo: "document", legenda: "oi", nomeArquivo: "a.pdf", origem: "mcp" });
    assert.deepEqual(calls.find((item) => item[0] === "sendPoll")[1], { destino: GROUP, pergunta: "Almoco?", opcoes: ["Sim", "Nao"], multipla: true, origem: "mcp" });
    assert.deepEqual(calls.find((item) => item[0] === "updateGroupSettings").slice(1), [GROUP, { soAdminEnvia: true, soAdminEdita: undefined }]);
    const group = await mcp.callTool({ name: "whatsapp_send_text", arguments: { phone: GROUP, text: "Bom dia", confirmation: "ENVIAR" } });
    assert.equal(group.content[0].text, "WHATSAPP_SEND_ACCEPTED=WAID9");
    assert.deepEqual(sends, [{ phone: GROUP, text: "Bom dia", origem: "mcp" }]);
  } finally {
    await mcp.close();
  }
});

test("leituras funcionam sem confirmacao: lista, info, conferir numero e obter link", async () => {
  const { mcp, calls } = await connectRecording();
  try {
    const list = await mcp.callTool({ name: "whatsapp_group_list", arguments: {} });
    assert.equal(list.content[0].text, `WHATSAPP_GROUPS=1\n${GROUP} | Equipe | participantes=3 | admin=sim`);
    const info = await mcp.callTool({ name: "whatsapp_group_info", arguments: { grupo: GROUP } });
    assert.match(info.content[0].text, /^WHATSAPP_GROUP=120363000000000000@g\.us\nnome=Equipe/);
    assert.match(info.content[0].text, /5511988887777 \(admin\)/);
    const check = await mcp.callTool({ name: "whatsapp_check_number", arguments: { numero: PHONE } });
    assert.equal(check.content[0].text, `WHATSAPP_NUMBER=${PHONE}\nWHATSAPP_EXISTS=sim`);
    const invite = await mcp.callTool({ name: "whatsapp_group_invite", arguments: { grupo: GROUP } });
    assert.equal(invite.content[0].text, "WHATSAPP_GROUP_INVITE=https://chat.whatsapp.com/ABC");
    assert.deepEqual(calls.map((item) => item[0]), ["listGroups", "getGroup", "checkNumber", "getGroupInvite"]);
  } finally {
    await mcp.close();
  }
});

test("entradas invalidas sao recusadas antes de chegar ao motor", async () => {
  const { mcp, calls } = await connectRecording();
  try {
    const bad = [
      ["whatsapp_send_media", { destino: "123", caminho: "/a.pdf", tipo: "document" }],
      ["whatsapp_send_media", { destino: PHONE, caminho: "/a.pdf", tipo: "gif" }],
      ["whatsapp_send_poll", { destino: PHONE, pergunta: "x", opcoes: ["so uma"] }],
      ["whatsapp_group_info", { grupo: "abc" }],
      ["whatsapp_group_delete", { grupo: PHONE }],
      ["whatsapp_group_participants", { grupo: GROUP, acao: "ban", participantes: [PHONE] }],
      ["whatsapp_group_create", { nome: "x", participantes: [] }],
      ["whatsapp_send_text", { phone: "11900000001", text: "oi" }],
    ];
    for (const [name, args] of bad) {
      const result = await mcp.callTool({ name, arguments: { ...args, confirmation: "ENVIAR" } });
      assert.equal(result.isError, true, name);
    }
    assert.equal(calls.length, 0);
  } finally {
    await mcp.close();
  }
});

test("erro do motor chega como texto com a chave do grupo e isError", async () => {
  const { api } = recordingApi();
  const mcp = await connectWith(createEngineClient({
    ensure: async () => ({ apiKey: "k", baseUrl: "http://127.0.0.1:1" }),
    api: { ...api, deleteGroup: async () => { throw new Error("Voce nao e administrador"); } },
  }));
  try {
    const result = await mcp.callTool({ name: "whatsapp_group_delete", arguments: { grupo: GROUP, confirmation: "ENVIAR" } });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, "WHATSAPP_GROUP_ERROR=Voce nao e administrador");
  } finally {
    await mcp.close();
  }
});
