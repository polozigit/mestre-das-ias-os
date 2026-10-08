import { ensureEngine, waitForConnection, isConnected, ownPhone, NOT_CONNECTED_MESSAGE } from "./engine-client.mjs";
import { loadSupabaseCredentials } from "./registro-supabase.mjs";

const config = await ensureEngine();
const status = await waitForConnection(config);
console.log(`WHATSAPP_CONNECTION=${isConnected(status) ? "CONNECTED" : "NOT_CONNECTED"}`);
if (!isConnected(status)) console.log(`WHATSAPP_AVISO=${NOT_CONNECTED_MESSAGE}`);
console.log(`WHATSAPP_OWNER_CONFIGURED=${ownPhone(status) ? "sim" : "nao"}`);
// So diz se a Casa tem o banco configurado; nunca imprime URL nem chave.
console.log(`WHATSAPP_REGISTRO_BANCO=${await loadSupabaseCredentials() ? "configurado" : "sem_banco"}`);
