import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getStateDirectory } from "./local-paths.mjs";

// Qual IA o pacote usa (MCP do WhatsApp e resposta do @ia): Codex ou Claude Code.
// Decide por QUEM esta rodando, nunca por arquivo da Casa (a Casa do kit tem AGENTS.md/.codex
// E CLAUDE.md/.claude; a regra antiga escolhia "claude" num computador so com Codex: spawn claude ENOENT).
// Ordem: POLOZI_IA_CLIENTE > escolha gravada > o que existe no PATH (os dois: o que roda agora; padrao codex).
export const CLIENTES = ["codex", "claude"];
export const CLIENTE_PADRAO = "codex";
export const ARQUIVO_PREFERENCIA = "cliente-ia";

// Variaveis que cada cliente poe nos comandos que ele executa (as duas presentes = sessao aninhada: ninguem).
// Claude Code: CLAUDECODE=1 (code.claude.com/docs/en/env-vars).
// Codex: CODEX_THREAD_ID / CODEX_SESSION_ID (openai/codex, codex-rs/core/src/exec_env.rs).
export const SINAIS_DO_CLIENTE = {
  claude: ["CLAUDECODE"],
  codex: ["CODEX_THREAD_ID", "CODEX_SESSION_ID"],
};

export function normalizeClient(value) {
  const client = String(value ?? "").trim().toLowerCase();
  return CLIENTES.includes(client) ? client : null;
}

export function otherClient(client) {
  return client === "claude" ? "codex" : "claude";
}

// A escolha fica na pasta de estado (fora da Casa: e deste computador, nao vai para o git).
export function preferenceFile(environment = process.env) {
  return path.join(getStateDirectory(environment), ARQUIVO_PREFERENCIA);
}

export function readPreference(environment = process.env, read = (file) => readFileSync(file, "utf8")) {
  try {
    return normalizeClient(read(preferenceFile(environment)));
  } catch {
    return null;
  }
}

export function writePreference(client, environment = process.env, write = (file, text) => {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, text, { mode: 0o600 });
}) {
  const valid = normalizeClient(client);
  if (!valid) throw new Error(`Cliente invalido: ${client}. Use codex ou claude.`);
  write(preferenceFile(environment), `${valid}\n`);
  return valid;
}

// Procura o executavel no PATH sem rodar nada (no Windows tambem .cmd/.exe do PATHEXT).
export function findInPath(name, { environment = process.env, platform = process.platform, exists = existsSync } = {}) {
  const windows = platform === "win32";
  const separator = windows ? ";" : ":";
  const join = windows ? path.win32.join : path.posix.join;
  const pathValue = environment.PATH ?? environment.Path ?? "";
  const extensions = windows
    ? ["", ...String(environment.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)]
    : [""];
  for (const directory of String(pathValue).split(separator).filter(Boolean)) {
    for (const extension of extensions) {
      if (exists(join(directory, `${name}${extension}`))) return true;
    }
  }
  return false;
}

export function availableClients(options = {}) {
  return CLIENTES.filter((client) => findInPath(client, options));
}

// O cliente que esta executando este comando agora (pela variavel que ele poe no ambiente).
export function runningClient(environment = process.env) {
  const found = CLIENTES.filter((client) => SINAIS_DO_CLIENTE[client].some((name) => environment[name]));
  return found.length === 1 ? found[0] : null;
}

// Devolve { client, origem } para a saida do `npm run conectar` explicar a escolha.
export function resolveClient({
  environment = process.env,
  platform = process.platform,
  exists = existsSync,
  read,
} = {}) {
  const forced = normalizeClient(environment.POLOZI_IA_CLIENTE);
  if (forced) return { client: forced, origem: "variavel" };
  const saved = readPreference(environment, read);
  if (saved) return { client: saved, origem: "escolha_gravada" };
  const available = availableClients({ environment, platform, exists });
  if (available.length === 1) return { client: available[0], origem: "path" };
  // Os dois no PATH (ou nenhum, ex.: PATH curto): vale quem esta rodando este comando.
  const running = runningClient(environment);
  if (running) return { client: running, origem: "rodando_agora" };
  return { client: CLIENTE_PADRAO, origem: available.length === 2 ? "padrao_os_dois" : "padrao_nenhum_no_path" };
}

export function detectClient(environment = process.env, options = {}) {
  return resolveClient({ environment, ...options }).client;
}

// Erro de "executavel nao encontrado" ao abrir o cliente: vale tentar o outro.
export function isMissingCommand(error) {
  return error?.code === "ENOENT" || /\bENOENT\b/.test(String(error?.message || ""));
}
