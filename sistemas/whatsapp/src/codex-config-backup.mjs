import { copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// `codex mcp add` e `codex mcp remove` reescrevem o config.toml inteiro
// (nao fazem patch cirurgico). Antes de qualquer comando que toque nesse
// arquivo, guardamos uma copia para permitir reverter manualmente.
export function getCodexConfigPath(homeDirectory = os.homedir()) {
  return path.join(homeDirectory, ".codex", "config.toml");
}

export async function backupCodexConfig(homeDirectory = os.homedir()) {
  const configPath = getCodexConfigPath(homeDirectory);
  const backupPath = `${configPath}.bak-${Date.now()}`;
  try {
    await copyFile(configPath, backupPath);
    return backupPath;
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}
