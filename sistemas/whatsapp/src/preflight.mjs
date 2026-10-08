import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function nodeMajor(version) {
  return Number(String(version).replace(/^v/, "").split(".")[0]);
}

// So Node e requisito. A RAM e informativa: o motor local usa ~100 a 150 MB.
export function summarizePreflight({ platform, nodeVersion, totalMemoryMb = 0, freeMemoryMb = 0 }) {
  const actions = [];
  if (nodeMajor(nodeVersion) < 20) actions.push("Instalar Node.js 20 ou superior.");

  return {
    platform,
    nodeVersion,
    totalMemoryMb,
    freeMemoryMb,
    ready: actions.length === 0,
    actions,
  };
}

export async function getPreflight() {
  return summarizePreflight({
    platform: process.platform,
    nodeVersion: process.version,
    totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await getPreflight();
  console.log(`PREFLIGHT=${JSON.stringify(result)}`);
  console.log(result.ready ? "PREFLIGHT_READY=sim" : "PREFLIGHT_READY=nao");
}
