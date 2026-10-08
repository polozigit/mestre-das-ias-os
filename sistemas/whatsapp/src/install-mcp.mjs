import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { backupCodexConfig } from "./codex-config-backup.mjs";
import { run } from "./process.mjs";

// Caminho absoluto resolvido a partir da localizacao real deste arquivo
// (sistemas/whatsapp/src/), nao do diretorio de onde o comando foi chamado.
const SERVER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "mcp-server.mjs");
export const MCP_NAME = "polozi-whatsapp";
export const MCP_CLIENTS = ["codex", "claude"];

// Registra o MCP no cliente. Nao substitui nada: se ja existe, devolve "ja_existia".
// `quiet` captura a saida do cliente (o `npm run conectar` nao imprime nada alem do resultado).
export async function installMcp(client, {
  runCommand = run,
  backup = backupCodexConfig,
  serverPath = SERVER_PATH,
  quiet = false,
  onBackup = () => {},
} = {}) {
  if (!MCP_CLIENTS.includes(client)) throw new Error(`Cliente invalido: ${client}. Use codex ou claude.`);

  try {
    await runCommand(client, ["mcp", "get", MCP_NAME], { capture: true });
    return "ja_existia";
  } catch {}

  if (client === "codex") {
    const backupPath = await backup();
    if (backupPath) onBackup(backupPath);
  }

  const args = client === "claude"
    ? ["mcp", "add", "--scope", "user", MCP_NAME, "--", "node", serverPath]
    : ["mcp", "add", MCP_NAME, "--", "node", serverPath];
  await runCommand(client, args, { capture: quiet });
  return "instalado";
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const client = process.argv[2];
  if (!MCP_CLIENTS.includes(client)) {
    console.error("Uso: npm run install:codex ou npm run install:claude");
    process.exit(1);
  }
  const result = await installMcp(client, { onBackup: (file) => console.log(`CODEX_CONFIG_BACKUP=${file}`) });
  if (result === "ja_existia") {
    console.error(`MCP_INSTALL_ERROR=${MCP_NAME} ja existe. Nenhuma configuracao foi substituida.`);
    process.exit(1);
  }
  console.log(`MCP_INSTALLED=${MCP_NAME}`);
}
