import { closeSync, writeSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runningAssistantPid } from "./assistant-process.mjs";
import { autostartInstalled, runAutostart } from "./autostart.mjs";
import { isConnected, logout, openLogForAppend, ownPhone, waitForConnection } from "./engine-client.mjs";
import { availableClients, normalizeClient, resolveClient, writePreference } from "./cliente-ia.mjs";
import { installMcp } from "./install-mcp.mjs";
import { getStateDirectory } from "./local-paths.mjs";
import { summarizePreflight } from "./preflight.mjs";
import { run } from "./process.mjs";
import { loadSupabaseCredentials } from "./registro-supabase.mjs";
import { oldStackRunning, retireEvolution } from "./retire-evolution.mjs";
import { setupEngine } from "./setup.mjs";
import { startBackground } from "./start-background.mjs";

// `npm run conectar`: UM comando que deixa o WhatsApp pronto (dependencias, motor, QR, inicio
// automatico, MCP e assistente @ia). Idempotente: pula o que ja esta pronto. Imprime so o resultado
// (CHAVE=valor) para a IA do aluno gastar poucos tokens; a saida do npm vai para um log.
//
// IMPORTANTE: antes do `npm ci` este arquivo so pode importar modulos SEM dependencia do npm
// (a pagina do QR usa `qrcode`, entao e carregada depois, sob demanda).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const USO = "Uso: npm run conectar [-- --cliente codex|claude --reconectar --sem-autostart --sem-mcp --dry-run]";
export const PROXIMO = 'Pergunte "@ia ..." na conversa com voce mesmo; para testar o envio, peca para a IA mandar uma mensagem de teste (ela pede ENVIAR)';
export const FLAGS = ["reconectar", "sem-autostart", "sem-mcp", "dry-run"];

const ASSISTANT_WAIT_MS = 12000;
const STOP_WAIT_MS = 5000;
const OWNER_RETRIES = 5;
const MOTIVO_MAX = 160;

// `npm run conectar --reconectar` (sem o `--`) o npm come a flag e a entrega como npm_config_*.
// `--cliente codex|claude` (ou `--cliente=codex`) escolhe a IA e grava a escolha neste computador.
export function parseFlags(argv = [], environment = process.env) {
  const flags = { cliente: null };
  for (const name of FLAGS) {
    flags[name] = environment[`npm_config_${name.replace(/-/g, "_")}`] === "true";
  }
  if (environment.npm_config_cliente) flags.cliente = parseClient(environment.npm_config_cliente);
  const args = argv.map(String);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--cliente" || arg.startsWith("--cliente=")) {
      flags.cliente = parseClient(arg.includes("=") ? arg.slice("--cliente=".length) : args[(index += 1)]);
      continue;
    }
    const name = arg.replace(/^--/, "");
    if (!arg.startsWith("--") || !FLAGS.includes(name)) throw new Error(`Opcao desconhecida: ${arg}`);
    flags[name] = true;
  }
  return flags;
}

function parseClient(value) {
  const client = normalizeClient(value);
  if (!client) throw new Error(`Cliente invalido: ${value ?? "(vazio)"}. Use --cliente codex ou --cliente claude.`);
  return client;
}

// MCP no cliente escolhido e em todo outro que estiver instalado (o aluno pode abrir qualquer um).
export function mcpTargets(client, available = []) {
  return [...new Set([client, ...available])];
}

// Uma linha, sem chave/hex longo e sem quebra: a saida vai para a conversa da IA.
export function curto(text, max = MOTIVO_MAX) {
  const clean = String(text ?? "")
    .replace(/[0-9a-f]{32,}/gi, "***")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

export function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 4 ? `...${digits.slice(-4)}` : "indisponivel";
}

class StepError extends Error {
  constructor(etapa, motivo, sugestao) {
    super(motivo);
    this.etapa = etapa;
    this.sugestao = sugestao;
  }
}

async function step(etapa, sugestao, action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof StepError) throw error;
    throw new StepError(etapa, curto(error?.message || error), sugestao);
  }
}

// Compara node_modules com o package-lock.json: so reinstala quando falta ou mudou algo.
export async function dependenciesStale({ root = ROOT, readText = (file) => readFile(file, "utf8") } = {}) {
  try {
    const wanted = JSON.parse(await readText(path.join(root, "package-lock.json"))).packages || {};
    const installed = JSON.parse(await readText(path.join(root, "node_modules", ".package-lock.json"))).packages || {};
    const direct = Object.keys(JSON.parse(await readText(path.join(root, "package.json"))).dependencies || {});
    for (const name of direct) {
      if (!installed[`node_modules/${name}`]) return true;
      await readText(path.join(root, "node_modules", name, "package.json"));
    }
    return Object.entries(installed).some(([key, info]) => key && wanted[key]?.version !== info.version);
  } catch {
    return true;
  }
}

export async function installDependencies({ root = ROOT, environment = process.env, runCommand = run } = {}) {
  const logFile = path.join(getStateDirectory(environment), "conectar-npm.log");
  const fd = openLogForAppend(logFile);
  const write = (text) => writeSync(fd, `${new Date().toISOString()} ${text}\n`);
  try {
    const { stdout, stderr } = await runCommand("npm", ["ci"], { cwd: root, capture: true });
    write(`npm ci ok\n${stdout}${stderr}`);
  } catch (error) {
    write(`npm ci falhou: ${error?.message || error}`);
    throw new Error(`npm ci falhou; veja o log em ${logFile}`);
  } finally {
    closeSync(fd);
  }
}

function collectLines() {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)) };
}

export function defaultDependencies(environment = process.env) {
  return {
    environment,
    platform: process.platform,
    nodeVersion: process.version,
    log: console.log,
    sleep: (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
    dependenciesStale: () => dependenciesStale(),
    installDependencies: () => installDependencies({ environment }),
    setupEngine: () => setupEngine({ environment }),
    getStatus: (config) => waitForConnection(config),
    resetSession: (config) => logout(config),
    async pair(config, { onReady }) {
      // Carregado aqui (e nao no topo) porque depende de `qrcode`, instalado pelo npm ci.
      const { PAIRING_PAGE_URL } = await import("./pairing-page.mjs");
      const { pairUntilConnected } = await import("./start-pairing.mjs");
      await pairUntilConnected(config, { onStarted: () => onReady(PAIRING_PAGE_URL) });
    },
    autostartState: () => autostartInstalled({ environment }),
    async autostartLigar() {
      const { lines, log } = collectLines();
      const code = await runAutostart("ligar", { environment, log });
      if (code !== 0) throw new Error(lines.find((line) => line.startsWith("AUTOSTART_ERRO=")) || "nao foi possivel ligar o inicio automatico");
    },
    resolveClient: () => resolveClient({ environment }),
    availableClients: () => availableClients({ environment }),
    savePreference: (client) => writePreference(client, environment),
    installMcp: (client) => installMcp(client, { quiet: true }),
    oldStackRunning: () => oldStackRunning(),
    async retireEvolution() {
      await retireEvolution({ log: () => {} });
    },
    assistantPid: () => runningAssistantPid({ environment }),
    stopAssistant: (pid) => { try { process.kill(pid, "SIGTERM"); } catch {} },
    async startAssistant() {
      const { lines, log } = collectLines();
      const code = await startBackground({ environment, log });
      if (code !== 0) throw new Error(lines.filter((line) => line.startsWith("WHATSAPP_")).pop() || "o assistente nao subiu");
    },
    registroConfigurado: async () => Boolean(await loadSupabaseCredentials(environment)),
  };
}

function dryRunLines({ flags, stale, escolha, targets, autostart }) {
  return [
    "CONECTAR=DRY_RUN",
    "ETAPA 1 preflight: confere Node 20+",
    `ETAPA 2 dependencias: ${stale ? "npm ci (log no estado local)" : "pula (ja instaladas)"}`,
    "ETAPA 3 motor: cria a chave local se faltar e sobe o motor",
    `ETAPA 4 whatsapp: se ja conectado pula; senao abre a pagina do QR e espera ate 15 min${flags.reconectar ? " (--reconectar: reseta sessao pareada e desconectada)" : ""}`,
    `ETAPA 5 inicio automatico: ${flags["sem-autostart"] ? "pulado (--sem-autostart)" : !autostart.supported ? "indisponivel neste sistema" : autostart.installed ? "pula (ja ligado)" : "liga"}`,
    `ETAPA 6 mcp: ${flags["sem-mcp"] ? "pulado (--sem-mcp)" : `instala em ${targets.join(" e ")} se nao existir`} (IA=${escolha.client} origem=${escolha.origem})`,
    "ETAPA 7 assistente: sobe se nao estiver rodando",
  ];
}

export async function conectar(argv = [], overrides = {}) {
  const d = { ...defaultDependencies(overrides.environment), ...overrides };
  const say = (line) => d.log(line);
  const fail = (etapa, motivo, sugestao) => {
    say(`CONECTAR=ERRO etapa=${etapa} motivo=${curto(motivo)}`);
    if (sugestao) say(`SUGESTAO=${curto(sugestao, 220)}`);
    return 1;
  };

  let flags;
  try {
    flags = parseFlags(argv, d.environment);
  } catch (error) {
    return fail("argumentos", error.message, USO);
  }

  const preflight = summarizePreflight({ platform: d.platform, nodeVersion: d.nodeVersion });
  if (!preflight.ready) {
    say("CONECTAR=FALTA_NODE");
    say("INSTRUCAO=Instale o Node.js 20 ou superior (nodejs.org), reabra o terminal e rode npm run conectar de novo.");
    return 2;
  }

  try {
    // Qual IA: --cliente > POLOZI_IA_CLIENTE > escolha gravada > PATH > quem roda agora (src/cliente-ia.mjs).
    const escolha = flags.cliente ? { client: flags.cliente, origem: "opcao" } : d.resolveClient();
    const client = escolha.client;
    const targets = mcpTargets(client, d.availableClients());

    if (flags["dry-run"]) {
      const stale = await d.dependenciesStale();
      const autostart = d.autostartState();
      for (const line of dryRunLines({ flags, stale, escolha, targets, autostart })) say(line);
      return 0;
    }

    // Grava a escolha: o assistente sobe pelo login (launchd/Inicializar), sem saber quem rodou o conectar.
    if (["opcao", "path", "rodando_agora"].includes(escolha.origem)) {
      await step("cliente", "Rode npm run conectar -- --cliente codex (ou claude) de novo.", () => d.savePreference(client));
    }
    if (flags.cliente) d.environment.POLOZI_IA_CLIENTE = client;

    await step("dependencias", "Confira a internet e o log indicado; depois rode npm run conectar de novo.", async () => {
      if (await d.dependenciesStale()) await d.installDependencies();
    });

    // Porta 8082 tomada pela pilha Docker antiga (Evolution): desmonta sozinho e tenta de novo.
    const config = await step("motor", "Porta 8082 ocupada por outro programa ou motor.log na pasta de estado; tabela de erros no GUIA-AGENTE-CODEX-CLAUDE.md.", async () => {
      try {
        return await d.setupEngine();
      } catch (error) {
        if (!(await d.oldStackRunning())) throw error;
        await d.retireEvolution();
        say("EVOLUTION_ANTIGA=DESMONTADA");
        return d.setupEngine();
      }
    });

    let status = await step("whatsapp", "Rode npm run conectar de novo.", () => d.getStatus(config));
    if (!isConnected(status)) {
      if (status?.paired === true) {
        if (!flags.reconectar) {
          throw new StepError(
            "whatsapp",
            "sessao salva, mas sem conexao (celular sem internet ou aparelho removido)",
            "Confira a internet do celular e rode de novo; se persistir: npm run conectar -- --reconectar",
          );
        }
        await step("whatsapp", "Rode npm run conectar -- --reconectar de novo.", () => d.resetSession(config));
      }
      await step("qr", "Rode npm run conectar de novo quando o celular estiver em maos (o QR vale por 15 min).", () =>
        d.pair(config, { onReady: (url) => say(`CONECTAR=ESCANEIE_O_QR url=${url}`) }));
      status = await step("whatsapp", "Rode npm run conectar de novo.", () => d.getStatus(config));
    }
    if (!isConnected(status)) throw new StepError("whatsapp", "o WhatsApp nao confirmou a conexao", "Rode npm run conectar de novo.");

    let phone = ownPhone(status);
    for (let attempt = 0; !phone && attempt < OWNER_RETRIES; attempt += 1) {
      await d.sleep(1000);
      phone = ownPhone(await d.getStatus(config));
    }

    // Inicio automatico: so liga se estiver desligado (liga motor e assistente tambem na hora).
    const autostart = d.autostartState();
    let autostartLabel = "desligado";
    let justEnabled = false;
    if (!autostart.supported) {
      autostartLabel = "indisponivel";
    } else if (autostart.installed && !(flags.cliente && !flags["sem-autostart"])) {
      autostartLabel = "ligado";
    } else if (!flags["sem-autostart"]) {
      // --cliente com o inicio automatico ja ligado: regrava para o login repetir a escolha.
      await step("autostart", "O WhatsApp ja esta conectado. Rode npm run autostart:ligar e veja o erro.", () => d.autostartLigar());
      autostartLabel = "ligado";
      justEnabled = !autostart.installed;
    }

    let mcpLabel = `${client}:pulado`;
    if (!flags["sem-mcp"]) {
      const labels = [];
      let errors = 0;
      let lastError = null;
      for (const target of targets) {
        try {
          labels.push(`${target}:${(await d.installMcp(target)) === "ja_existia" ? "ja_existia" : "ok"}`);
        } catch (error) {
          errors += 1;
          lastError = error;
          labels.push(`${target}:erro`);
        }
      }
      if (errors === targets.length) {
        throw new StepError("mcp", curto(lastError?.message || lastError), `O WhatsApp ja esta conectado. Rode npm run install:${client} e veja o erro (o comando ${client} precisa estar instalado; se for o outro, rode npm run conectar -- --cliente ${client === "codex" ? "claude" : "codex"}).`);
      }
      mcpLabel = labels.join(",");
    }

    // Recem ligado, o login ja sobe o assistente: espera antes de subir outro (evita duplicar).
    await step("assistente", "O WhatsApp ja esta conectado. Rode npm run start:background e veja o erro.", async () => {
      let pid = await d.assistantPid();
      // Escolha nova (--cliente): o assistente que ja roda guardou a antiga; reinicia.
      if (pid && flags.cliente) {
        d.stopAssistant(pid);
        for (let waited = 0; pid && waited < STOP_WAIT_MS; waited += 500) {
          await d.sleep(500);
          pid = await d.assistantPid();
        }
        if (pid) throw new Error(`o assistente antigo (pid ${pid}) nao parou`);
      }
      for (let waited = 0; !pid && justEnabled && waited < ASSISTANT_WAIT_MS; waited += 1000) {
        await d.sleep(1000);
        pid = await d.assistantPid();
      }
      if (!pid) await d.startAssistant();
    });

    const registro = await d.registroConfigurado().catch(() => false);

    say("CONECTAR=OK");
    say("WHATSAPP=CONECTADO");
    say(`NUMERO=${maskPhone(phone)}`);
    say(`INICIO_AUTOMATICO=${autostartLabel}`);
    say(`MCP=${mcpLabel}`);
    say(`REGISTRO_BANCO=${registro ? "configurado" : "sem_banco"}`);
    say(`PROXIMO=${PROXIMO}`);
    return 0;
  } catch (error) {
    if (error instanceof StepError) return fail(error.etapa, error.message, error.sugestao);
    return fail("inesperado", error?.message || error, "Rode npm run conectar de novo; se repetir, veja o GUIA-AGENTE-CODEX-CLAUDE.md.");
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await conectar(process.argv.slice(2));
}
