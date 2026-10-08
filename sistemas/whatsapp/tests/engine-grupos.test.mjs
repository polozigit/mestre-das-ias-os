import assert from "node:assert/strict";
import test from "node:test";

import { GROUP_ID, groupMetadata, OTHER_GROUP_ID, startEngine } from "./engine-harness.mjs";

const post = (call, route, body = {}) => call(route, { method: "POST", body });
const enc = encodeURIComponent;

async function connected(t, options) {
  const harness = await startEngine(options);
  t.after(() => harness.engine.shutdown());
  harness.sock = await harness.connect();
  return harness;
}

const json = async (response) => response.json();

test("lista os grupos em ordem de nome, com participantes e se sou admin", async (t) => {
  const { call } = await connected(t);
  const { grupos } = await json(await call("/groups"));
  assert.deepEqual(grupos, [
    { id: OTHER_GROUP_ID, nome: "Antigo", participantes: 3, souAdmin: false },
    { id: GROUP_ID, nome: "Equipe", participantes: 3, souAdmin: true },
  ]);
});

test("info do grupo: dados, regras e membros (numero quando o WhatsApp informa)", async (t) => {
  const { call, sock } = await connected(t);
  const info = await json(await call(`/groups/${enc(GROUP_ID)}`));
  assert.deepEqual(sock.calls.at(-1), ["groupMetadata", GROUP_ID]);
  assert.equal(info.nome, "Equipe");
  assert.equal(info.descricao, "Grupo da equipe");
  assert.equal(info.souAdmin, true);
  assert.equal(info.soAdminEdita, true);
  assert.equal(info.soAdminEnvia, false);
  assert.deepEqual(info.membros, [
    { id: "5511900000001", numero: "5511900000001", admin: "admin" },
    { id: "5511911110001", numero: "5511911110001", admin: "superadmin" },
    { id: "10000000000077", numero: "5511911110002", admin: null },
  ]);
  const sameWithoutSuffix = await json(await call("/groups/120363000000000000"));
  assert.equal(sameWithoutSuffix.id, GROUP_ID, "o id tambem vale sem o @g.us");
});

test("id de grupo invalido vira 400 antes de falar com o WhatsApp", async (t) => {
  const { call, sock } = await connected(t);
  for (const [method, route] of [
    ["GET", "/groups/abc"], ["GET", "/groups/5511988887777@s.whatsapp.net"], ["POST", "/groups/12345/subject"],
    ["POST", "/groups/abc/delete"], ["POST", "/groups/abc/leave"], ["GET", "/groups/abc/invite"], ["POST", "/groups/abc/participants"],
  ]) {
    const response = await call(route, { method, body: method === "POST" ? {} : undefined });
    assert.equal(response.status, 400, `${method} ${route}`);
    assert.match((await json(response)).error, /Id de grupo invalido/);
  }
  assert.equal(sock.calls.length, 0);
});

test("grupos sem sessao conectada respondem 409", async (t) => {
  const { engine, call } = await startEngine();
  t.after(() => engine.shutdown());
  assert.equal((await call("/groups")).status, 409);
  assert.equal((await post(call, `/groups/${enc(GROUP_ID)}/leave`)).status, 409);
});

test("criar grupo: valida nome e participantes e chama groupCreate com os jids", async (t) => {
  const { call, sock } = await connected(t);
  const response = await post(call, "/groups", { nome: "  Clientes VIP ", participantes: ["5511911110001", "5511911110002", "5511911110001"] });
  assert.deepEqual(await json(response), { id: GROUP_ID, nome: "Clientes VIP", participantes: 2 });
  assert.deepEqual(sock.calls.at(-1), ["groupCreate", "Clientes VIP", ["5511911110001@s.whatsapp.net", "5511911110002@s.whatsapp.net"]]);

  const before = sock.calls.length;
  for (const [body, pattern] of [
    [{ participantes: ["5511911110001"] }, /nome do grupo/],
    [{ nome: "x".repeat(101), participantes: ["5511911110001"] }, /nome do grupo/],
    [{ nome: "Grupo" }, /ao menos um numero/],
    [{ nome: "Grupo", participantes: [] }, /ao menos um numero/],
    [{ nome: "Grupo", participantes: ["123"] }, /Numero invalido/],
    [{ nome: "Grupo", participantes: Array.from({ length: 257 }, (_, n) => `55119${String(10000000 + n)}`) }, /No maximo 256/],
  ]) {
    const bad = await post(call, "/groups", body);
    assert.equal(bad.status, 400, JSON.stringify(body).slice(0, 60));
    assert.match((await json(bad)).error, pattern);
  }
  assert.equal(sock.calls.length, before);
});

test("nome, descricao e regras do grupo", async (t) => {
  const { call, sock } = await connected(t);
  const base = `/groups/${enc(GROUP_ID)}`;
  assert.equal((await post(call, `${base}/subject`, { nome: " Novo nome " })).status, 200);
  assert.equal((await post(call, `${base}/description`, { descricao: "Regras da casa" })).status, 200);
  assert.equal((await post(call, `${base}/description`, { descricao: "" })).status, 200);
  assert.equal((await post(call, `${base}/settings`, { soAdminEnvia: true, soAdminEdita: false })).status, 200);
  assert.equal((await post(call, `${base}/settings`, { soAdminEnvia: false })).status, 200);
  assert.deepEqual(sock.calls, [
    ["groupUpdateSubject", GROUP_ID, "Novo nome"],
    ["groupUpdateDescription", GROUP_ID, "Regras da casa"],
    ["groupUpdateDescription", GROUP_ID, undefined],
    ["groupSettingUpdate", GROUP_ID, "announcement"],
    ["groupSettingUpdate", GROUP_ID, "unlocked"],
    ["groupSettingUpdate", GROUP_ID, "not_announcement"],
  ]);

  const before = sock.calls.length;
  for (const [route, body, pattern] of [
    ["subject", { nome: "" }, /novo nome/],
    ["description", {}, /Informe a descricao/],
    ["description", { descricao: "x".repeat(2049) }, /2048/],
    ["settings", {}, /soAdminEnvia/],
    ["settings", { soAdminEnvia: "sim" }, /true ou false/],
  ]) {
    const bad = await post(call, `${base}/${route}`, body);
    assert.equal(bad.status, 400, `${route} ${JSON.stringify(body)}`);
    assert.match((await json(bad)).error, pattern);
  }
  assert.equal(sock.calls.length, before);
});

test("participantes: add, remove, promote e demote devolvem o resultado por numero", async (t) => {
  const { call } = await connected(t, {
    socketOptions: { overrides: { groupParticipantsUpdate: async (id, jids) => jids.map((jid, n) => ({ status: n === 1 ? "403" : "200", jid })) } },
  });
  const base = `/groups/${enc(GROUP_ID)}/participants`;
  const result = await json(await post(call, base, { acao: "add", participantes: ["5511911110001", "5511911110002"] }));
  assert.deepEqual(result, {
    acao: "add",
    resultados: [{ participante: "5511911110001", status: "200" }, { participante: "5511911110002", status: "403" }],
    ok: 1,
    falhas: 1,
  });
  for (const acao of ["remove", "promote", "demote"]) assert.equal((await post(call, base, { acao, participantes: ["5511911110001"] })).status, 200);

  for (const [body, pattern] of [
    [{ acao: "ban", participantes: ["5511911110001"] }, /Acao invalida/],
    [{ acao: "add" }, /ao menos um numero/],
    [{ acao: "add", participantes: ["abc"] }, /Numero invalido/],
  ]) {
    const bad = await post(call, base, body);
    assert.equal(bad.status, 400);
    assert.match((await json(bad)).error, pattern);
  }
});

test("participantes: manda os jids certos para o WhatsApp", async (t) => {
  const { call, sock } = await connected(t);
  await post(call, `/groups/${enc(GROUP_ID)}/participants`, { acao: "promote", participantes: ["5511911110002"] });
  assert.deepEqual(sock.calls.at(-1), ["groupParticipantsUpdate", GROUP_ID, ["5511911110002@s.whatsapp.net"], "promote"]);
});

test("link de convite: obter e revogar", async (t) => {
  const { call, sock } = await connected(t);
  const base = `/groups/${enc(GROUP_ID)}/invite`;
  assert.deepEqual(await json(await call(base)), { codigo: "CODIGOATUAL", link: "https://chat.whatsapp.com/CODIGOATUAL" });
  assert.deepEqual(await json(await post(call, base)), { codigo: "CODIGONOVO", link: "https://chat.whatsapp.com/CODIGONOVO" });
  assert.deepEqual(sock.calls.map((item) => item[0]), ["groupInviteCode", "groupRevokeInvite"]);

  const none = await connected(t, { socketOptions: { overrides: { groupInviteCode: async () => undefined } } });
  const response = await none.call(base);
  assert.equal(response.status, 502);
  assert.match((await json(response)).error, /administrador/);
});

test("sair do grupo chama groupLeave", async (t) => {
  const { call, sock } = await connected(t);
  assert.deepEqual(await json(await post(call, `/groups/${enc(GROUP_ID)}/leave`)), { saiu: true });
  assert.deepEqual(sock.calls, [["groupLeave", GROUP_ID]]);
});

test("excluir grupo: remove todos os outros (em lotes) e depois sai", async (t) => {
  const extra = Array.from({ length: 60 }, (_, n) => ({ id: `55119${String(20000000 + n)}@s.whatsapp.net`, admin: null }));
  const { call, sock } = await connected(t, { socketOptions: { groups: { meta: groupMetadata({ extra }) } } });
  const result = await json(await post(call, `/groups/${enc(GROUP_ID)}/delete`));
  assert.deepEqual(result, { removidos: 62, restantes: 0, saiu: true });

  const removals = sock.calls.filter((item) => item[0] === "groupParticipantsUpdate");
  assert.deepEqual(removals.map((item) => [item[3], item[2].length]), [["remove", 50], ["remove", 12]]);
  const removed = removals.flatMap((item) => item[2]);
  assert.ok(!removed.includes("5511900000001@s.whatsapp.net"), "nunca remove a si mesmo");
  assert.ok(removed.includes("10000000000077@lid"));
  assert.deepEqual(sock.calls.at(-1), ["groupLeave", GROUP_ID], "sai por ultimo");
  assert.equal(sock.calls.filter((item) => item[0] === "groupLeave").length, 1);
});

test("excluir grupo sem ser administrador: 403 e nada e removido", async (t) => {
  const { call, sock } = await connected(t, { socketOptions: { groups: { meta: groupMetadata({ admin: false }) } } });
  const response = await post(call, `/groups/${enc(GROUP_ID)}/delete`);
  assert.equal(response.status, 403);
  assert.match((await json(response)).error, /nao e administrador/);
  assert.deepEqual(sock.calls.map((item) => item[0]), ["groupMetadata"], "so consultou: nao removeu ninguem nem saiu");
});

test("excluir grupo em que sobrou alguem (ex.: criador): nao sai e avisa", async (t) => {
  const { call, sock } = await connected(t, {
    socketOptions: {
      groups: { meta: groupMetadata() },
      overrides: { groupParticipantsUpdate: async (id, jids) => jids.map((jid) => ({ status: jid.startsWith("5511911110001") ? "403" : "200", jid })) },
    },
  });
  const result = await json(await post(call, `/groups/${enc(GROUP_ID)}/delete`));
  assert.equal(result.saiu, false);
  assert.equal(result.removidos, 1);
  assert.equal(result.restantes, 1);
  assert.match(result.aviso, /nao saiu do grupo/);
  assert.ok(!sock.calls.some((item) => item[0] === "groupLeave"));
});

test("erro do WhatsApp vira mensagem clara: 403 de permissao e 404 de grupo", async (t) => {
  const boom = (statusCode, message) => Object.assign(new Error(message), { output: { statusCode } });
  const forbidden = await connected(t, { socketOptions: { overrides: { groupUpdateSubject: async () => { throw boom(403, "forbidden"); } } } });
  const denied = await post(forbidden.call, `/groups/${enc(GROUP_ID)}/subject`, { nome: "Novo" });
  assert.equal(denied.status, 403);
  assert.match((await json(denied)).error, /administrador/);

  const missing = await connected(t, { socketOptions: { overrides: { groupMetadata: async () => { throw boom(404, "item-not-found"); } } } });
  const gone = await missing.call(`/groups/${enc(GROUP_ID)}`);
  assert.equal(gone.status, 404);
  assert.match((await json(gone)).error, /nao encontrado/);

  const broken = await connected(t, { socketOptions: { overrides: { groupFetchAllParticipating: async () => { throw new Error("rede caiu"); } } } });
  assert.equal((await broken.call("/groups")).status, 502);
});
