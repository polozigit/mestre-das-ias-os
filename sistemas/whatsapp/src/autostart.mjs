import { execFile } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runningAssistantPid } from "./assistant-process.mjs";
import { getAutostartLogFile, getStateDirectory } from "./local-paths.mjs";

// Sobe o motor e o assistente quando a pessoa entra no computador (src/start-background.mjs).
// macOS: LaunchAgent do usuario. Windows: script .vbs na pasta Inicializar do usuario.
// Nao usamos schtasks /SC ONLOGON no Windows: sem elevacao ele recusa (acesso negado) para usuario comum.
// A pasta Inicializar e do proprio usuario, nao pede administrador e nao abre janela (wscript, estilo oculto).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const START_BACKGROUND_PATH = path.join(ROOT, "src", "start-background.mjs");

export const LAUNCH_AGENT_LABEL = "com.polozi.whatsapp-local";
export const WINDOWS_STARTUP_FILE = "Polozi WhatsApp local.vbs";
export const USO = "Uso: npm run autostart:ligar | autostart:desligar | autostart:status (opcao --dry-run em ligar e desligar)";

// Variaveis de ambiente que o login precisa repetir quando a pessoa as usa.
const PASSTHROUGH_VARIABLES = [
  "WHATSAPP_LOCAL_STATE_DIR",
  "WHATSAPP_LOCAL_PORT",
  "POLOZI_CASA_DIR",
  "POLOZI_CASA_ENV",
  "POLOZI_IA_CLIENTE",
  "POLOZI_IA_FERRAMENTAS",
];

export function platformKind(platform) {
  return platform === "darwin" ? "macos" : platform === "win32" ? "windows" : null;
}

function xmlEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function vbsString(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

// Homebrew guarda o node numa pasta com a versao (Cellar/node/25.x): apos um upgrade o caminho some e o
// login para de funcionar sem aviso. Se um atalho estavel aponta para o mesmo binario, usa o atalho.
export function stableNodePath(nodePath, { platform = process.platform, candidates = ["/opt/homebrew/bin/node", "/usr/local/bin/node"], real = realpathSync } = {}) {
  if (platformKind(platform) !== "macos") return nodePath;
  try {
    const target = real(nodePath);
    return candidates.find((candidate) => { try { return real(candidate) === target; } catch { return false; } }) || nodePath;
  } catch {
    return nodePath;
  }
}

// O launchd nao herda o PATH do terminal: sem o PATH de quem ligou, o assistente nao acha claude/codex.
export function collectEnvironment({ environment, nodePath, platform }) {
  const variables = {};
  for (const name of PASSTHROUGH_VARIABLES) {
    if (environment[name]) variables[name] = environment[name];
  }
  if (platformKind(platform) === "macos") {
    const entries = [path.dirname(nodePath), ...String(environment.PATH || "").split(":")]
      .filter((entry) => entry && !/node_modules\/\.bin|node-gyp-bin/.test(entry));
    variables.PATH = [...new Set(entries)].join(":");
  }
  return variables;
}

// Sem KeepAlive: start-background termina logo depois de deixar o assistente rodando solto
// (AbandonProcessGroup impede o launchd de matar esse processo filho quando o job acaba).
export function buildLaunchAgentPlist({ label = LAUNCH_AGENT_LABEL, nodePath, scriptPath, workingDirectory, logFile, environmentVariables = {} }) {
  const variables = Object.entries(environmentVariables)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `    <key>${xmlEscape(name)}</key>\n    <string>${xmlEscape(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodePath)}</string>
    <string>${xmlEscape(scriptPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(workingDirectory)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>AbandonProcessGroup</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(logFile)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${variables}
  </dict>
</dict>
</plist>
`;
}

export function buildWindowsStartupScript({ nodePath, scriptPath, workingDirectory, environmentVariables = {} }) {
  const lines = [
    "' Polozi WhatsApp local: inicia o motor e o assistente ao entrar no Windows, sem janela.",
    'Set shell = CreateObject("WScript.Shell")',
    `shell.CurrentDirectory = ${vbsString(workingDirectory)}`,
    'Set env = shell.Environment("Process")',
    ...Object.entries(environmentVariables).map(([name, value]) => `env(${vbsString(name)}) = ${vbsString(value)}`),
    `shell.Run ${vbsString(`"${nodePath}" "${scriptPath}"`)}, 0, False`,
  ];
  return `${lines.join("\r\n")}\r\n`;
}

// O wscript le .vbs como ANSI: com acento no caminho (ex.: C:\Users\Joao) grava UTF-16 com BOM.
export function encodeWindowsScript(content) {
  return /[^\x00-\x7f]/.test(content) ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, "utf16le")]) : content;
}

export function launchAgentFile(homeDirectory) {
  return path.posix.join(homeDirectory, "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);
}

export function windowsStartupFile(environment, homeDirectory) {
  const appData = environment.APPDATA || path.win32.join(homeDirectory, "AppData", "Roaming");
  return path.win32.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", WINDOWS_STARTUP_FILE);
}

// Leitura pura (nao mexe no sistema): o inicio automatico esta instalado neste computador?
export function autostartInstalled({
  platform = process.platform,
  homeDirectory = os.homedir(),
  environment = process.env,
  exists = existsSync,
} = {}) {
  const kind = platformKind(platform);
  if (!kind) return { supported: false, installed: false, file: "" };
  const file = kind === "macos" ? launchAgentFile(homeDirectory) : windowsStartupFile(environment, homeDirectory);
  return { supported: true, installed: exists(file), file };
}

export function launchctlCommands({ uid, plistPath, label = LAUNCH_AGENT_LABEL }) {
  const domain = `gui/${uid}`;
  return {
    load: ["launchctl", "bootstrap", domain, plistPath],
    loadFallback: ["launchctl", "load", "-w", plistPath],
    unload: ["launchctl", "bootout", `${domain}/${label}`],
    unloadFallback: ["launchctl", "unload", plistPath],
    print: ["launchctl", "print", `${domain}/${label}`],
  };
}

// Plano puro (nao mexe no sistema): arquivo, conteudo e comandos de cada acao por plataforma.
export function buildPlan({
  action,
  platform = process.platform,
  homeDirectory = os.homedir(),
  environment = process.env,
  nodePath = process.execPath,
  rootDir = ROOT,
  uid = process.getuid?.(),
}) {
  const kind = platformKind(platform);
  if (!kind) throw new Error("Inicio automatico so existe para macOS e Windows.");
  if (!["ligar", "desligar", "status"].includes(action)) throw new Error(USO);

  const scriptPath = (kind === "windows" ? path.win32 : path.posix).join(rootDir, "src", "start-background.mjs");
  const stateDirectory = getStateDirectory(environment, platform, homeDirectory);
  const environmentVariables = collectEnvironment({ environment, nodePath, platform });

  if (kind === "macos") {
    const file = launchAgentFile(homeDirectory);
    const commands = launchctlCommands({ uid, plistPath: file });
    return {
      kind,
      action,
      file,
      stateDirectory,
      commands,
      content: action === "ligar"
        ? buildLaunchAgentPlist({
          nodePath,
          scriptPath,
          workingDirectory: rootDir,
          logFile: getAutostartLogFile(environment, platform, homeDirectory),
          environmentVariables,
        })
        : null,
      steps: action === "ligar"
        // bootout antes: bootstrap de um servico ja carregado falha.
        ? [{ argv: commands.unload, tolerate: true }, { argv: commands.load, fallback: commands.loadFallback }]
        : action === "desligar" ? [{ argv: commands.unload, fallback: commands.unloadFallback, tolerate: true }] : [],
    };
  }

  const file = windowsStartupFile(environment, homeDirectory);
  return {
    kind,
    action,
    file,
    stateDirectory,
    commands: {},
    content: action === "ligar"
      ? buildWindowsStartupScript({ nodePath, scriptPath, workingDirectory: rootDir, environmentVariables })
      : null,
    // Depois de gravar, roda o script uma vez para nao precisar sair e entrar de novo.
    steps: action === "ligar" ? [{ argv: ["wscript.exe", "//B", "//Nologo", file] }] : [],
  };
}

const defaultRunCommand = (argv) => new Promise((resolvePromise) => {
  execFile(argv[0], argv.slice(1), { windowsHide: true }, (error, stdout, stderr) => {
    resolvePromise({ ok: !error, output: `${stdout || ""}${stderr || ""}`.trim() });
  });
});

const quoteForDisplay = (argv) => argv.map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(" ");

export async function runAutostart(action, {
  dryRun = false,
  platform = process.platform,
  homeDirectory = os.homedir(),
  environment = process.env,
  nodePath = stableNodePath(process.execPath, { platform }),
  rootDir = ROOT,
  uid = process.getuid?.(),
  runCommand = defaultRunCommand,
  write = async (file, content, kind) => {
    mkdirSync(path.dirname(file), { recursive: true });
    await writeFile(file, kind === "windows" ? encodeWindowsScript(content) : content, { mode: 0o644 });
  },
  remove = (file) => rm(file, { force: true }),
  exists = existsSync,
  makeStateDirectory = (directory) => mkdirSync(directory, { recursive: true, mode: 0o700 }),
  assistantPid = () => runningAssistantPid({ environment }),
  log = console.log,
} = {}) {
  const plan = buildPlan({ action, platform, homeDirectory, environment, nodePath, rootDir, uid });
  log(`AUTOSTART_PLATAFORMA=${plan.kind}`);
  log(`AUTOSTART_ARQUIVO=${plan.file}`);

  if (action === "status") {
    const installed = exists(plan.file);
    log(`AUTOSTART=${installed ? "LIGADO" : "DESLIGADO"}`);
    if (plan.kind === "macos") {
      log(`AUTOSTART_CARREGADO=${installed && (await runCommand(plan.commands.print)).ok ? "sim" : "nao"}`);
    }
    const pid = await assistantPid();
    log(pid ? `WHATSAPP_LIVE_ASSISTANT=RODANDO pid=${pid}` : "WHATSAPP_LIVE_ASSISTANT=PARADO");
    return 0;
  }

  if (dryRun) {
    log("AUTOSTART_DRY_RUN=sim");
    if (action === "ligar") {
      log("AUTOSTART_CONTEUDO_INICIO");
      log(plan.content.trimEnd());
      log("AUTOSTART_CONTEUDO_FIM");
    } else {
      log(`AUTOSTART_REMOVERIA=${plan.file}`);
    }
    for (const step of plan.steps) {
      log(`AUTOSTART_COMANDO=${quoteForDisplay(step.argv)}`);
      if (step.fallback) log(`AUTOSTART_COMANDO_ALTERNATIVO=${quoteForDisplay(step.fallback)}`);
    }
    return 0;
  }

  if (action === "ligar") {
    makeStateDirectory(plan.stateDirectory);
    await write(plan.file, plan.content, plan.kind);
  }
  for (const step of plan.steps) {
    let result = await runCommand(step.argv);
    if (!result.ok && step.fallback) result = await runCommand(step.fallback);
    if (!result.ok && !step.tolerate) {
      log(`AUTOSTART_ERRO=${quoteForDisplay(step.argv)} falhou: ${result.output || "sem detalhe"}`);
      return 1;
    }
  }
  if (action === "desligar") await remove(plan.file);

  log(`AUTOSTART=${action === "ligar" ? "LIGADO" : "DESLIGADO"}`);
  if (action === "desligar") log("AUTOSTART_NOTA=O assistente que ja esta rodando continua ate o computador reiniciar; para parar agora execute npm run stop:assistant.");
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [action, ...flags] = process.argv.slice(2);
  try {
    if (flags.some((flag) => flag !== "--dry-run")) throw new Error(USO);
    process.exitCode = await runAutostart(action, { dryRun: flags.includes("--dry-run") });
  } catch (error) {
    console.error(`AUTOSTART_ERRO=${error.message}`);
    process.exitCode = 1;
  }
}
