import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ensureEngine, ensureEngineConfigFile } from "./engine-client.mjs";
import { assertOutsideRepository, getBaseUrl, getStateDirectory } from "./local-paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assertSupportedNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) throw new Error("Node.js 20 ou superior e obrigatorio.");
}

// Prepara o estado externo (motor.json) e garante o motor no ar. Idempotente.
// Usado por `npm run setup` e por `npm run conectar`.
export async function setupEngine({
  root = ROOT,
  environment = process.env,
  ensureConfig = ensureEngineConfigFile,
  ensure = ensureEngine,
} = {}) {
  assertSupportedNode();
  assertOutsideRepository(root, getStateDirectory(environment));
  await ensureConfig(environment);
  return ensure({ environment });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await setupEngine();
    console.log(`WHATSAPP_MOTOR_READY=${getBaseUrl()}`);
    console.log(`WHATSAPP_STATE_DIR=${getStateDirectory()}`);
    console.log("Proximo passo: execute npm run start:qr e escaneie o QR da pagina local.");
  } catch (error) {
    console.error(`SETUP_ERROR=${error.message}`);
    process.exit(1);
  }
}
