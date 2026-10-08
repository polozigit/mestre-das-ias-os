import assert from "node:assert/strict";
import test from "node:test";

import {
  autostartInstalled,
  buildLaunchAgentPlist,
  buildPlan,
  buildWindowsStartupScript,
  collectEnvironment,
  encodeWindowsScript,
  launchctlCommands,
  runAutostart,
  stableNodePath,
} from "../src/autostart.mjs";

const MAC_NODE = "/opt/homebrew/bin/node";
const MAC_ROOT = "/Users/aluna/empresa/sistemas/whatsapp";
const WIN_NODE = "C:\\Program Files\\nodejs\\node.exe";
const WIN_ROOT = "C:\\Users\\aluna\\empresa\\sistemas\\whatsapp";

const macPlan = (action, extra = {}) => buildPlan({
  action, platform: "darwin", homeDirectory: "/Users/aluna", environment: { PATH: "/usr/bin:/bin" },
  nodePath: MAC_NODE, rootDir: MAC_ROOT, uid: 501, ...extra,
});
const winPlan = (action, extra = {}) => buildPlan({
  action, platform: "win32", homeDirectory: "C:\\Users\\aluna",
  environment: { APPDATA: "C:\\Users\\aluna\\AppData\\Roaming" }, nodePath: WIN_NODE, rootDir: WIN_ROOT, ...extra,
});

test("plist do macOS roda o node absoluto no login, sem KeepAlive e sem matar o assistente filho", () => {
  const { content, file } = macPlan("ligar");
  assert.equal(file, "/Users/aluna/Library/LaunchAgents/com.polozi.whatsapp-local.plist");
  assert.match(content, /<key>Label<\/key>\s*<string>com\.polozi\.whatsapp-local<\/string>/);
  assert.match(content, new RegExp(`<array>\\s*<string>${MAC_NODE}</string>\\s*<string>${MAC_ROOT}/src/start-background\\.mjs</string>\\s*</array>`));
  assert.match(content, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(content, /<key>AbandonProcessGroup<\/key>\s*<true\/>/);
  assert.doesNotMatch(content, /KeepAlive/);
  assert.match(content, new RegExp(`<key>WorkingDirectory</key>\\s*<string>${MAC_ROOT}</string>`));
  assert.match(content, /<key>StandardOutPath<\/key>\s*<string>\/Users\/aluna\/Library\/Application Support\/Polozi\/whatsapp-local\/autostart\.log<\/string>/);
  assert.match(content, /<key>StandardErrorPath<\/key>\s*<string>[^<]*autostart\.log<\/string>/);
});

test("o caminho do node e o do processo que liga, nunca so a palavra node", () => {
  const plan = buildPlan({ action: "ligar", platform: "darwin", homeDirectory: "/Users/aluna", environment: {}, rootDir: MAC_ROOT, uid: 501 });
  assert.ok(plan.content.includes(`<string>${process.execPath}</string>`));
  assert.ok(!plan.content.includes("<string>node</string>"));
  const win = buildPlan({ action: "ligar", platform: "win32", homeDirectory: "C:\\Users\\aluna", environment: {}, rootDir: WIN_ROOT });
  assert.ok(win.content.includes(`"${process.execPath}"`));
});

test("o PATH de quem liga vai pro plist (launchd nao herda), sem lixo do npm run", () => {
  const variables = collectEnvironment({
    environment: { PATH: "/x/whatsapp/node_modules/.bin:/Users/aluna/.local/bin:/usr/bin:/usr/bin", POLOZI_IA_CLIENTE: "claude", OUTRA: "nao" },
    nodePath: MAC_NODE,
    platform: "darwin",
  });
  assert.equal(variables.PATH, "/opt/homebrew/bin:/Users/aluna/.local/bin:/usr/bin");
  assert.equal(variables.POLOZI_IA_CLIENTE, "claude");
  assert.equal("OUTRA" in variables, false);
  const plist = macPlan("ligar", { environment: { PATH: "/Users/aluna/.local/bin", WHATSAPP_LOCAL_STATE_DIR: "/tmp/estado" } }).content;
  assert.match(plist, /<key>PATH<\/key>\s*<string>\/opt\/homebrew\/bin:\/Users\/aluna\/\.local\/bin<\/string>/);
  assert.match(plist, /<key>WHATSAPP_LOCAL_STATE_DIR<\/key>\s*<string>\/tmp\/estado<\/string>/);
  assert.equal("PATH" in collectEnvironment({ environment: { PATH: "C:\\x" }, nodePath: WIN_NODE, platform: "win32" }), false);
});

test("caracteres especiais no caminho saem escapados no plist", () => {
  const plist = buildLaunchAgentPlist({ nodePath: "/a&b/node", scriptPath: "/s<t>", workingDirectory: "/w", logFile: "/l" });
  assert.match(plist, /<string>\/a&amp;b\/node<\/string>/);
  assert.match(plist, /<string>\/s&lt;t&gt;<\/string>/);
});

test("comandos do launchctl: bootstrap no dominio gui/<uid> e bootout; fallback load/unload", () => {
  const plan = macPlan("ligar");
  assert.deepEqual(plan.commands.load, ["launchctl", "bootstrap", "gui/501", "/Users/aluna/Library/LaunchAgents/com.polozi.whatsapp-local.plist"]);
  assert.deepEqual(plan.commands.unload, ["launchctl", "bootout", "gui/501/com.polozi.whatsapp-local"]);
  assert.deepEqual(plan.commands.loadFallback.slice(0, 2), ["launchctl", "load"]);
  assert.deepEqual(plan.commands.unloadFallback.slice(0, 2), ["launchctl", "unload"]);
  assert.deepEqual(plan.steps.map((step) => step.argv[2]), ["gui/501/com.polozi.whatsapp-local", "gui/501"]);
  assert.equal(launchctlCommands({ uid: 7, plistPath: "/p" }).print[2], "gui/7/com.polozi.whatsapp-local");
});

test("script do Windows roda o node absoluto oculto (estilo 0, sem esperar) na pasta Inicializar", () => {
  const { content, file } = winPlan("ligar");
  assert.equal(file, "C:\\Users\\aluna\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Polozi WhatsApp local.vbs");
  assert.ok(content.includes(`shell.Run """${WIN_NODE}"" ""${WIN_ROOT}\\src\\start-background.mjs""", 0, False`));
  assert.ok(content.includes(`shell.CurrentDirectory = "${WIN_ROOT}"`));
  assert.ok(content.includes("\r\n"));
  assert.doesNotMatch(content, /schtasks/i);
});

test("script do Windows repassa variaveis e aspas ficam dobradas", () => {
  const script = buildWindowsStartupScript({ nodePath: "C:\\n.exe", scriptPath: "C:\\s.mjs", workingDirectory: "C:\\w", environmentVariables: { POLOZI_IA_CLIENTE: "codex" } });
  assert.ok(script.includes('env("POLOZI_IA_CLIENTE") = "codex"'));
});

test("caminho com acento no Windows grava UTF-16 com BOM; ASCII segue texto", () => {
  assert.equal(encodeWindowsScript("abc"), "abc");
  const encoded = encodeWindowsScript("C:\\Users\\João");
  assert.deepEqual([...encoded.subarray(0, 2)], [0xff, 0xfe]);
  assert.equal(encoded.subarray(2).toString("utf16le"), "C:\\Users\\João");
});

test("Windows ligar roda o script uma vez; desligar so remove o arquivo", () => {
  assert.deepEqual(winPlan("ligar").steps[0].argv.slice(0, 2), ["wscript.exe", "//B"]);
  assert.deepEqual(winPlan("desligar").steps, []);
  assert.equal(winPlan("desligar").content, null);
});

test("plataforma sem suporte e acao invalida falham", () => {
  assert.throws(() => buildPlan({ action: "ligar", platform: "linux" }), /macOS e Windows/);
  assert.throws(() => macPlan("explodir"), /Uso/);
});

function fakeSystem(overrides = {}) {
  const calls = { commands: [], writes: [], removes: [], dirs: [], logs: [] };
  return {
    calls,
    options: {
      platform: "darwin", homeDirectory: "/Users/aluna", environment: { PATH: "/usr/bin" }, nodePath: MAC_NODE, rootDir: MAC_ROOT, uid: 501,
      runCommand: async (argv) => { calls.commands.push(argv); return { ok: true, output: "" }; },
      write: async (file, content, kind) => { calls.writes.push({ file, content, kind }); },
      remove: async (file) => { calls.removes.push(file); },
      makeStateDirectory: (directory) => { calls.dirs.push(directory); },
      exists: () => true,
      assistantPid: async () => 0,
      log: (line) => calls.logs.push(line),
      ...overrides,
    },
  };
}

test("--dry-run imprime plist e comandos e nao mexe em nada", async () => {
  const { calls, options } = fakeSystem();
  assert.equal(await runAutostart("ligar", { ...options, dryRun: true }), 0);
  assert.equal(calls.commands.length, 0);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.dirs.length, 0);
  const out = calls.logs.join("\n");
  assert.match(out, /AUTOSTART_DRY_RUN=sim/);
  assert.match(out, /<key>RunAtLoad<\/key>/);
  assert.match(out, /AUTOSTART_COMANDO=launchctl bootstrap gui\/501 /);

  const win = fakeSystem({ platform: "win32", homeDirectory: "C:\\Users\\aluna", environment: { APPDATA: "C:\\A" }, nodePath: WIN_NODE, rootDir: WIN_ROOT });
  await runAutostart("ligar", { ...win.options, dryRun: true });
  assert.match(win.calls.logs.join("\n"), /shell\.Run/);
  assert.equal(win.calls.writes.length, 0);

  const off = fakeSystem();
  await runAutostart("desligar", { ...off.options, dryRun: true });
  assert.equal(off.calls.removes.length, 0);
  assert.equal(off.calls.commands.length, 0);
  assert.match(off.calls.logs.join("\n"), /AUTOSTART_REMOVERIA=.*\.plist/);
});

test("ligar grava o plist, recarrega o servico e confirma", async () => {
  const { calls, options } = fakeSystem();
  assert.equal(await runAutostart("ligar", options), 0);
  assert.equal(calls.writes[0].file, "/Users/aluna/Library/LaunchAgents/com.polozi.whatsapp-local.plist");
  assert.equal(calls.writes[0].kind, "macos");
  assert.deepEqual(calls.commands.map((argv) => argv[1]), ["bootout", "bootstrap"]);
  assert.match(calls.logs.join("\n"), /AUTOSTART=LIGADO/);
});

test("ligar usa launchctl load quando o bootstrap falha e erra se os dois falham", async () => {
  const fallbackCalls = [];
  const fallback = fakeSystem({
    runCommand: async (argv) => { fallbackCalls.push(argv[1]); return { ok: argv[1] !== "bootstrap", output: "" }; },
  });
  assert.equal(await runAutostart("ligar", fallback.options), 0);
  assert.deepEqual(fallbackCalls, ["bootout", "bootstrap", "load"]);

  const broken = fakeSystem({ runCommand: async () => ({ ok: false, output: "denied" }) });
  assert.equal(await runAutostart("ligar", broken.options), 1);
  assert.match(broken.calls.logs.join("\n"), /AUTOSTART_ERRO=.*denied/);
});

test("desligar descarrega o servico e remove o arquivo", async () => {
  const { calls, options } = fakeSystem();
  assert.equal(await runAutostart("desligar", options), 0);
  assert.deepEqual(calls.commands.map((argv) => argv[1]), ["bootout"]);
  assert.deepEqual(calls.removes, ["/Users/aluna/Library/LaunchAgents/com.polozi.whatsapp-local.plist"]);
  assert.match(calls.logs.join("\n"), /AUTOSTART=DESLIGADO/);
});

test("status informa se esta ligado, carregado e se o assistente roda", async () => {
  const on = fakeSystem({ assistantPid: async () => 4242 });
  await runAutostart("status", on.options);
  const out = on.calls.logs.join("\n");
  assert.match(out, /AUTOSTART=LIGADO/);
  assert.match(out, /AUTOSTART_CARREGADO=sim/);
  assert.match(out, /WHATSAPP_LIVE_ASSISTANT=RODANDO pid=4242/);

  const off = fakeSystem({ exists: () => false });
  await runAutostart("status", off.options);
  assert.match(off.calls.logs.join("\n"), /AUTOSTART=DESLIGADO/);
  assert.match(off.calls.logs.join("\n"), /WHATSAPP_LIVE_ASSISTANT=PARADO/);
});

test("macOS prefere o atalho estavel do node a pasta versionada do Homebrew", () => {
  const cellar = "/opt/homebrew/Cellar/node/25.9.0_2/bin/node";
  const real = (file) => ({ "/opt/homebrew/bin/node": cellar, [cellar]: cellar, "/usr/local/bin/node": "/outro/node" }[file] || (() => { throw new Error("ENOENT"); })());
  assert.equal(stableNodePath(cellar, { platform: "darwin", real }), "/opt/homebrew/bin/node");
  assert.equal(stableNodePath("/outro/bin/node", { platform: "darwin", real }), "/outro/bin/node");
  assert.equal(stableNodePath(WIN_NODE, { platform: "win32", real }), WIN_NODE);
});

test("autostartInstalled le o arquivo do login sem mexer no sistema", () => {
  const mac = autostartInstalled({ platform: "darwin", homeDirectory: "/Users/aluna", exists: (file) => file === "/Users/aluna/Library/LaunchAgents/com.polozi.whatsapp-local.plist" });
  assert.deepEqual(mac, { supported: true, installed: true, file: "/Users/aluna/Library/LaunchAgents/com.polozi.whatsapp-local.plist" });
  assert.equal(autostartInstalled({ platform: "darwin", homeDirectory: "/Users/aluna", exists: () => false }).installed, false);

  const win = autostartInstalled({ platform: "win32", homeDirectory: "C:\\Users\\aluna", environment: { APPDATA: "C:\\Users\\aluna\\AppData\\Roaming" }, exists: (file) => file.endsWith("Polozi WhatsApp local.vbs") });
  assert.equal(win.supported, true);
  assert.equal(win.installed, true);

  assert.deepEqual(autostartInstalled({ platform: "linux", exists: () => true }), { supported: false, installed: false, file: "" });
});
