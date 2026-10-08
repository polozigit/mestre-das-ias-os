import { backupCodexConfig } from "./codex-config-backup.mjs";
import { run } from "./process.mjs";

for (const [client, args] of [
  ["codex", ["mcp", "remove", "polozi-whatsapp-local"]],
  ["claude", ["mcp", "remove", "polozi-whatsapp-local", "-s", "user"]],
]) {
  if (client === "codex") {
    const backupPath = await backupCodexConfig();
    if (backupPath) console.log(`CODEX_CONFIG_BACKUP=${backupPath}`);
  }
  try {
    await run(client, args);
    console.log(`WAHA_MCP_REMOVED=${client}`);
  } catch {
    console.log(`WAHA_MCP_NOT_PRESENT=${client}`);
  }
}
