import { ensureEngine, logout } from "./engine-client.mjs";

const config = await ensureEngine();
await logout(config);
console.log("LOCAL_SESSION_RESET=sim");
console.log("A sessao local anterior foi removida. Execute npm run start:qr para abrir um novo QR.");
