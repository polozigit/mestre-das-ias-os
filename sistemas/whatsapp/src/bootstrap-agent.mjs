import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPreflight } from "./preflight.mjs";
import { run } from "./process.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const preflight = await getPreflight();
console.log(`PREFLIGHT=${JSON.stringify(preflight)}`);
if (!preflight.ready) {
  console.log("AGENT_ACTION_REQUIRED=Instale ou abra os itens indicados por PREFLIGHT e execute este comando novamente.");
  process.exit(2);
}

await run("npm", ["ci"], { cwd: ROOT });
await run(process.execPath, [path.join(ROOT, "src", "setup.mjs")], { cwd: ROOT });

console.log("AGENT_HANDOFF=O motor local esta no ar. Execute npm run start:qr e aguarde a pessoa ler o QR na pagina local.");
