import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { conectar, curto, dependenciesStale, installDependencies, maskPhone, parseFlags } from "../src/conectar.mjs";

const API_KEY = "a".repeat(64);
const PHONE = "5547991911800";
const config = { apiKey: API_KEY, baseUrl: "http://127.0.0.1:1" };
const CONNECTED = { connected: true, loggedIn: true, ownPhone: PHONE, paired: true };
const NOT_PAIRED = { connected: false, loggedIn: false, ownPhone: "", paired: false };
const PAIRED_DOWN = { connected: false, loggedIn: false, ownPhone: "", paired: true };

// Todas as dependencias injetadas: sem rede, sem WhatsApp, sem tocar no computador.
function harness({
  statuses = [CONNECTED],
  stale = false,
  autostart = { supported: true, installed: true },
  client = "claude",
  mcp = "instalado",
  pids = [4242],
  fail = {},
  nodeVersion = "v22.1.0",
  registro = true,
} = {}) {
  const calls = [];
  const lines = [];
  const queue = [...statuses];
  const pidQueue = [...pids];
  const record = (name, error) => async (...args) => {
    calls.push(name);
    if (fail[name]) throw new Error(fail[name]);
    return error?.(...args);
  };
  const overrides = {
    environment: {},
    platform: "darwin",
    nodeVersion,
    log: (line) => lines.push(line),
    sleep: async () => {},
    dependenciesStale: async () => stale,
    installDependencies: record("npm-ci"),
    setupEngine: record("motor", () => config),
    getStatus: async () => { calls.push("status"); return queue.length > 1 ? queue.shift() : queue[0]; },
    resetSession: record("reset"),
    pair: async (_config, { onReady }) => {
      calls.push("qr");
      if (fail.qr) throw new Error(fail.qr);
      onReady("http://127.0.0.1:8787");
    },
    autostartState: () => autostart,
    autostartLigar: record("autostart-ligar"),
    detectClient: () => client,
    installMcp: record("mcp", () => mcp),
    assistantPid: async () => { calls.push("pid"); return pidQueue.length > 1 ? pidQueue.shift() : pidQueue[0]; },
    startAssistant: record("assistente"),
    registroConfigurado: async () => registro,
  };
  return { calls, lines, overrides, text: () => lines.join("\n") };
}

const run = (h, argv = []) => conectar(argv, h.overrides);
const count = (h, name) => h.calls.filter((call) => call === name).length;

test("ja conectado: pula o QR, nao reinstala nada e imprime so o resultado", async () => {
  const h = harness();
  assert.equal(await run(h), 0);
  assert.equal(count(h, "qr"), 0);
  assert.equal(count(h, "reset"), 0);
  assert.equal(count(h, "npm-ci"), 0);
  assert.equal(count(h, "autostart-ligar"), 0);
  assert.equal(count(h, "assistente"), 0);
  assert.deepEqual(h.lines.slice(0, 6), [
    "CONECTAR=OK",
    "WHATSAPP=CONECTADO",
    "NUMERO=...1800",
    "INICIO_AUTOMATICO=ligado",
    "MCP=claude:ok",
    "REGISTRO_BANCO=configurado",
  ]);
  assert.equal(h.lines.length, 7);
  assert.match(h.lines[6], /^PROXIMO=Pergunte "@ia \.\.\." na conversa com voce mesmo; para testar o envio, peca para a IA mandar uma mensagem de teste \(ela pede ENVIAR\)$/);
});

test("saida final tem no maximo 7 linhas e nunca o numero inteiro nem a chave", async () => {
  const h = harness({ mcp: "ja_existia" });
  await run(h);
  assert.ok(h.lines.length <= 7, `linhas: ${h.lines.length}`);
  assert.ok(h.lines.every((line) => /^[A-Z_]+=/.test(line)), "so linhas CHAVE=valor");
  assert.doesNotMatch(h.text(), new RegExp(PHONE));
  assert.doesNotMatch(h.text(), new RegExp(API_KEY));
  assert.match(h.text(), /NUMERO=\.\.\.1800/);
  assert.match(h.text(), /MCP=claude:ja_existia/);
});

test("nao conectado: abre o QR, avisa a URL e continua depois de conectar", async () => {
  const h = harness({ statuses: [NOT_PAIRED, CONNECTED] });
  assert.equal(await run(h), 0);
  assert.equal(count(h, "qr"), 1);
  assert.equal(count(h, "reset"), 0);
  assert.equal(h.lines[0], "CONECTAR=ESCANEIE_O_QR url=http://127.0.0.1:8787");
  assert.equal(h.lines[1], "CONECTAR=OK");
  assert.ok(h.lines.slice(1).length <= 7);
  assert.ok(h.calls.indexOf("qr") < h.calls.indexOf("pid"), "QR vem antes do assistente");
});

test("QR que nao conecta vira erro da etapa qr", async () => {
  const h = harness({ statuses: [NOT_PAIRED], fail: { qr: "Tempo de pareamento esgotado." } });
  assert.equal(await run(h), 1);
  assert.match(h.lines[0], /^CONECTAR=ERRO etapa=qr motivo=Tempo de pareamento esgotado\.$/);
  assert.equal(count(h, "autostart-ligar"), 0);
  assert.equal(count(h, "mcp"), 0);
});

test("liga o inicio automatico so quando esta desligado", async () => {
  const off = harness({ autostart: { supported: true, installed: false }, pids: [0, 7] });
  assert.equal(await run(off), 0);
  assert.equal(count(off, "autostart-ligar"), 1);
  assert.match(off.text(), /INICIO_AUTOMATICO=ligado/);

  const on = harness({ autostart: { supported: true, installed: true } });
  await run(on);
  assert.equal(count(on, "autostart-ligar"), 0);
  assert.match(on.text(), /INICIO_AUTOMATICO=ligado/);
});

test("--sem-autostart nao liga e informa desligado", async () => {
  const h = harness({ autostart: { supported: true, installed: false } });
  assert.equal(await run(h, ["--sem-autostart"]), 0);
  assert.equal(count(h, "autostart-ligar"), 0);
  assert.match(h.text(), /INICIO_AUTOMATICO=desligado/);
});

test("--sem-autostart nao desliga o que ja esta ligado", async () => {
  const h = harness({ autostart: { supported: true, installed: true } });
  await run(h, ["--sem-autostart"]);
  assert.match(h.text(), /INICIO_AUTOMATICO=ligado/);
});

test("sistema sem inicio automatico (nem macOS nem Windows) informa indisponivel", async () => {
  const h = harness({ autostart: { supported: false, installed: false } });
  assert.equal(await run(h), 0);
  assert.equal(count(h, "autostart-ligar"), 0);
  assert.match(h.text(), /INICIO_AUTOMATICO=indisponivel/);
});

test("npm ci so quando as dependencias faltam ou mudaram", async () => {
  const stale = harness({ stale: true });
  await run(stale);
  assert.equal(count(stale, "npm-ci"), 1);
  assert.ok(stale.calls.indexOf("npm-ci") < stale.calls.indexOf("motor"), "dependencias antes do motor");

  const fresh = harness({ stale: false });
  await run(fresh);
  assert.equal(count(fresh, "npm-ci"), 0);
});

test("npm ci que falha nao joga a saida do npm no terminal e para antes do motor", async () => {
  const h = harness({ stale: true, fail: { "npm-ci": "npm ci falhou; veja o log em /x/conectar-npm.log" } });
  assert.equal(await run(h), 1);
  assert.match(h.lines[0], /^CONECTAR=ERRO etapa=dependencias motivo=npm ci falhou; veja o log em \/x\/conectar-npm\.log$/);
  assert.equal(count(h, "motor"), 0);
});

test("MCP: instala no cliente detectado, respeita ja existente e --sem-mcp", async () => {
  const novo = harness({ client: "codex", mcp: "instalado" });
  await run(novo);
  assert.match(novo.text(), /MCP=codex:ok/);

  const existente = harness({ client: "claude", mcp: "ja_existia" });
  assert.equal(await run(existente), 0);
  assert.match(existente.text(), /MCP=claude:ja_existia/);

  const pulado = harness({ client: "codex" });
  assert.equal(await run(pulado, ["--sem-mcp"]), 0);
  assert.equal(count(pulado, "mcp"), 0);
  assert.match(pulado.text(), /MCP=codex:pulado/);
});

test("assistente: nao sobe outro quando ja esta rodando e sobe quando nao esta", async () => {
  const rodando = harness({ pids: [321] });
  await run(rodando);
  assert.equal(count(rodando, "assistente"), 0);

  const parado = harness({ pids: [0] });
  assert.equal(await run(parado), 0);
  assert.equal(count(parado, "assistente"), 1);
});

test("recem ligado o inicio automatico, espera o login subir o assistente em vez de duplicar", async () => {
  const sobeSozinho = harness({ autostart: { supported: true, installed: false }, pids: [0, 0, 555] });
  await run(sobeSozinho);
  assert.equal(count(sobeSozinho, "assistente"), 0);

  const naoSobe = harness({ autostart: { supported: true, installed: false }, pids: [0] });
  assert.equal(await run(naoSobe), 0);
  assert.equal(count(naoSobe, "assistente"), 1);
});

test("sessao pareada mas desconectada: sem --reconectar nao apaga nada e diz o comando", async () => {
  const h = harness({ statuses: [PAIRED_DOWN] });
  assert.equal(await run(h), 1);
  assert.match(h.lines[0], /^CONECTAR=ERRO etapa=whatsapp motivo=sessao salva, mas sem conexao/);
  assert.match(h.lines[1], /^SUGESTAO=.*npm run conectar -- --reconectar/);
  assert.equal(count(h, "reset"), 0);
  assert.equal(count(h, "qr"), 0);
});

test("--reconectar com sessao pareada e desconectada: reseta a sessao antes do QR", async () => {
  const h = harness({ statuses: [PAIRED_DOWN, CONNECTED] });
  assert.equal(await run(h, ["--reconectar"]), 0);
  assert.ok(h.calls.indexOf("reset") !== -1 && h.calls.indexOf("reset") < h.calls.indexOf("qr"));
  assert.match(h.text(), /CONECTAR=OK/);
});

test("--reconectar com sessao ja conectada nao reseta nada", async () => {
  const h = harness();
  assert.equal(await run(h, ["--reconectar"]), 0);
  assert.equal(count(h, "reset"), 0);
  assert.equal(count(h, "qr"), 0);
});

test("--reconectar sem sessao pareada vai direto ao QR, sem reset", async () => {
  const h = harness({ statuses: [NOT_PAIRED, CONNECTED] });
  await run(h, ["--reconectar"]);
  assert.equal(count(h, "reset"), 0);
  assert.equal(count(h, "qr"), 1);
});

test("erro de etapa vira uma linha CONECTAR=ERRO mais a sugestao, exit 1, e nao segue adiante", async () => {
  const h = harness({ fail: { mcp: "spawn claude ENOENT" } });
  assert.equal(await run(h), 1);
  assert.equal(h.lines.length, 2);
  assert.match(h.lines[0], /^CONECTAR=ERRO etapa=mcp motivo=spawn claude ENOENT$/);
  assert.match(h.lines[1], /^SUGESTAO=.*npm run install:claude/);
  assert.equal(count(h, "pid"), 0, "nao sobe o assistente depois de um erro");
  assert.doesNotMatch(h.text(), /CONECTAR=OK/);
});

test("cada etapa tem seu nome no erro", async () => {
  const casos = [
    [{ fail: { motor: "porta ocupada" } }, "motor"],
    [{ autostart: { supported: true, installed: false }, fail: { "autostart-ligar": "launchctl falhou" } }, "autostart"],
    [{ pids: [0], fail: { assistente: "nao subiu" } }, "assistente"],
  ];
  for (const [options, etapa] of casos) {
    const h = harness(options);
    assert.equal(await run(h), 1, etapa);
    assert.match(h.lines[0], new RegExp(`^CONECTAR=ERRO etapa=${etapa} `), etapa);
  }
});

test("erro nunca despeja texto longo, quebra de linha nem chave", async () => {
  const h = harness({ fail: { motor: `falhou\n${"x".repeat(500)} ${API_KEY}\nmais uma linha` } });
  assert.equal(await run(h), 1);
  assert.equal(h.lines.length, 2);
  assert.ok(h.lines[0].length < 260);
  assert.doesNotMatch(h.text(), new RegExp(API_KEY));
});

test("Node antigo: CONECTAR=FALTA_NODE com instrucao e exit 2, sem executar nada", async () => {
  const h = harness({ nodeVersion: "v18.19.0" });
  assert.equal(await run(h), 2);
  assert.equal(h.lines[0], "CONECTAR=FALTA_NODE");
  assert.equal(h.lines.length, 2);
  assert.deepEqual(h.calls, []);
});

test("--dry-run lista as etapas e nao executa nada", async () => {
  const h = harness({ stale: true, statuses: [NOT_PAIRED], autostart: { supported: true, installed: false }, pids: [0] });
  assert.equal(await run(h, ["--dry-run"]), 0);
  assert.deepEqual(h.calls, [], "nenhuma dependencia com efeito foi chamada");
  assert.equal(h.lines[0], "CONECTAR=DRY_RUN");
  const etapas = h.lines.filter((line) => line.startsWith("ETAPA "));
  assert.equal(etapas.length, 7);
  assert.match(h.text(), /dependencias: npm ci/);
  assert.match(h.text(), /inicio automatico: liga/);
  assert.match(h.text(), /mcp: instala no claude/);
});

test("--dry-run respeita --sem-autostart, --sem-mcp e pula o que ja esta pronto", async () => {
  const h = harness({ stale: false, autostart: { supported: true, installed: true } });
  await run(h, ["--dry-run", "--sem-mcp", "--sem-autostart"]);
  assert.match(h.text(), /dependencias: pula/);
  assert.match(h.text(), /inicio automatico: pulado \(--sem-autostart\)/);
  assert.match(h.text(), /mcp: pulado \(--sem-mcp\)/);
  assert.deepEqual(h.calls, []);
});

test("opcao desconhecida e erro de argumentos com o uso", async () => {
  const h = harness();
  assert.equal(await run(h, ["--apagar-tudo"]), 1);
  assert.match(h.lines[0], /^CONECTAR=ERRO etapa=argumentos motivo=Opcao desconhecida: --apagar-tudo$/);
  assert.match(h.lines[1], /^SUGESTAO=Uso: npm run conectar/);
  assert.deepEqual(h.calls, []);
});

test("parseFlags le a flag depois do -- e tambem a que o npm converte em npm_config_*", () => {
  assert.equal(parseFlags(["--reconectar"], {}).reconectar, true);
  assert.equal(parseFlags([], { npm_config_reconectar: "true" }).reconectar, true);
  assert.equal(parseFlags([], { npm_config_sem_autostart: "true" })["sem-autostart"], true);
  assert.equal(parseFlags([], { npm_config_sem_mcp: "" })["sem-mcp"], false);
  assert.equal(parseFlags([], {})["dry-run"], false);
  assert.throws(() => parseFlags(["reconectar"], {}), /Opcao desconhecida/);
});

test("curto mascara hex longo, tira quebra de linha e limita o tamanho", () => {
  assert.equal(curto(`a\n\nb ${"f".repeat(40)}`), "a b ***");
  assert.equal(curto("x".repeat(400)).length, 160);
  assert.equal(maskPhone("5547991911800"), "...1800");
  assert.equal(maskPhone(""), "indisponivel");
});

// --- dependencias do npm: log no estado local, nunca no terminal ---

function pacoteTemporario({ lockVersion = "1.0.0", installedVersion = "1.0.0", instalado = true, arquivoDoPacote = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "conectar-deps-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { lib: "1.0.0" } }));
  writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ packages: { "": {}, "node_modules/lib": { version: lockVersion } } }));
  if (instalado) {
    mkdirSync(path.join(root, "node_modules", "lib"), { recursive: true });
    writeFileSync(path.join(root, "node_modules", ".package-lock.json"), JSON.stringify({ packages: { "node_modules/lib": { version: installedVersion } } }));
    if (arquivoDoPacote) writeFileSync(path.join(root, "node_modules", "lib", "package.json"), "{}");
  }
  return root;
}

test("dependenciesStale: em dia, sem node_modules, versao diferente e pacote apagado", async () => {
  const dirs = [];
  const check = async (options) => { const root = pacoteTemporario(options); dirs.push(root); return dependenciesStale({ root }); };
  try {
    assert.equal(await check({}), false);
    assert.equal(await check({ instalado: false }), true);
    assert.equal(await check({ lockVersion: "2.0.0" }), true);
    assert.equal(await check({ arquivoDoPacote: false }), true);
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
});

test("dependenciesStale: pacote instalado que nao esta mais no lock tambem reinstala", async () => {
  const root = pacoteTemporario();
  try {
    writeFileSync(path.join(root, "node_modules", ".package-lock.json"), JSON.stringify({
      packages: { "node_modules/lib": { version: "1.0.0" }, "node_modules/velho": { version: "9.9.9" } },
    }));
    assert.equal(await dependenciesStale({ root }), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("npm ci roda capturado (saida vai para o log do estado local, nao para o terminal)", async () => {
  const state = mkdtempSync(path.join(os.tmpdir(), "conectar-log-"));
  const chamadas = [];
  try {
    await installDependencies({
      root: "/pacote",
      environment: { WHATSAPP_LOCAL_STATE_DIR: state },
      runCommand: async (command, args, options) => {
        chamadas.push({ command, args, options });
        return { stdout: "added 175 packages", stderr: "npm warn deprecated x" };
      },
    });
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].command, "npm");
    assert.deepEqual(chamadas[0].args, ["ci"]);
    assert.equal(chamadas[0].options.capture, true);
    assert.equal(chamadas[0].options.cwd, "/pacote");
    const log = readFileSync(path.join(state, "conectar-npm.log"), "utf8");
    assert.match(log, /added 175 packages/);
    assert.match(log, /npm warn deprecated x/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test("npm ci que falha grava o detalhe no log e levanta so uma frase curta", async () => {
  const state = mkdtempSync(path.join(os.tmpdir(), "conectar-log-"));
  try {
    await assert.rejects(
      installDependencies({
        root: "/pacote",
        environment: { WHATSAPP_LOCAL_STATE_DIR: state },
        runCommand: async () => { throw new Error(`npm terminou com codigo 1. ${"erro enorme\n".repeat(200)}`); },
      }),
      (error) => {
        assert.match(error.message, /^npm ci falhou; veja o log em .*conectar-npm\.log$/);
        assert.ok(error.message.length < 300);
        return true;
      },
    );
    assert.match(readFileSync(path.join(state, "conectar-npm.log"), "utf8"), /erro enorme/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test("banco da Casa ausente aparece como sem_banco (e o erro de leitura nao derruba o comando)", async () => {
  const sem = harness({ registro: false });
  assert.equal(await run(sem), 0);
  assert.match(sem.text(), /REGISTRO_BANCO=sem_banco/);

  const quebrado = harness();
  quebrado.overrides.registroConfigurado = async () => { throw new Error("EACCES"); };
  assert.equal(await run(quebrado), 0);
  assert.match(quebrado.text(), /REGISTRO_BANCO=sem_banco/);
});

test("a primeira coisa que o conectar faz e o npm ci: nenhum import estatico dele depende de pacote do npm", () => {
  const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "src");
  const visitados = new Set();
  const pacotes = [];
  const importa = /(?:^|\n)\s*(?:import|export)\s[^"';]*?from\s*"([^"]+)"|(?:^|\n)\s*import\s*"([^"]+)"/g;
  const visita = (arquivo) => {
    if (visitados.has(arquivo)) return;
    visitados.add(arquivo);
    const texto = readFileSync(arquivo, "utf8");
    for (const match of texto.matchAll(importa)) {
      const alvo = match[1] || match[2];
      if (alvo.startsWith("node:")) continue;
      if (alvo.startsWith(".")) visita(path.resolve(path.dirname(arquivo), alvo));
      else pacotes.push(`${path.basename(arquivo)} -> ${alvo}`);
    }
  };
  visita(path.join(raiz, "conectar.mjs"));
  assert.ok(visitados.size > 5, "o grafo de imports foi percorrido");
  assert.deepEqual(pacotes, [], "no primeiro uso o node_modules ainda nao existe: a pagina do QR e carregada so depois do npm ci");
});
