import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Registro das mensagens no Supabase do proprio aluno (contrato com a migration
// 0018_whatsapp): so mensagem ENVIADA (texto, midia e enquete, para numero ou grupo), recibos e comandos @ia do proprio chat (migrations 0018 e 0021_whatsapp_grupo).
// Regra de ouro: o registro nunca derruba o envio. Qualquer falha vira UM aviso
// no log e o motor segue. A chave nunca e impressa.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC_TIMEOUT_MS = 8000;

export const ORIGENS = ["mcp", "assistente", "teste", "relatorio", "outro"];

// Casa = dois niveis acima da raiz do pacote (<Casa>/sistemas/whatsapp/).
export function getCasaEnvFile(environment = process.env, root = ROOT) {
  if (environment.POLOZI_CASA_ENV) return environment.POLOZI_CASA_ENV;
  return path.join(path.resolve(root, "..", ".."), "credenciais", ".env");
}

export function parseDotEnv(text) {
  const values = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

export async function loadSupabaseCredentials(environment = process.env, readFileImpl = readFile, root = ROOT) {
  let text;
  try {
    text = await readFileImpl(getCasaEnvFile(environment, root), "utf8");
  } catch {
    return null;
  }
  const values = parseDotEnv(text);
  const url = (values.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = values.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && key ? { url, key } : null;
}

export function createRegistro({
  loadCredentials = () => loadSupabaseCredentials(),
  fetchImpl = fetch,
  warn = (message) => console.error(`${new Date().toISOString()} REGISTRO_AVISO=${message}`),
} = {}) {
  let credentials = null;
  const warned = new Set();

  function warnOnce(reason, message, secret = "") {
    if (warned.has(reason)) return;
    warned.add(reason);
    const clean = secret ? String(message).split(secret).join("***") : String(message);
    warn(clean.slice(0, 300));
  }

  async function rpc(name, body) {
    credentials ??= await loadCredentials();
    if (!credentials) {
      warnOnce("sem-credencial", "sem credencial do Supabase em credenciais/.env; mensagens nao serao registradas.");
      return null;
    }
    try {
      const response = await fetchImpl(`${credentials.url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: credentials.key,
          Authorization: `Bearer ${credentials.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      if (response.ok) return await response.json().catch(() => null);
      const detail = await response.json().catch(() => ({}));
      if (response.status === 404 || detail?.code === "PGRST202") {
        warnOnce("rpc-ausente", `RPC ${name} ausente no Supabase; aplique a migration 0018_whatsapp.`);
      } else if (detail?.code === "22023") {
        warnOnce(`validacao-${name}`, `a RPC ${name} recusou os dados (22023); a mensagem segue enviada, so nao foi registrada. Se for mensagem de grupo, aplique a migration 0021_whatsapp_grupo.`);
      } else {
        warnOnce(`http-${response.status}`, `Supabase respondeu ${response.status} em ${name}: ${detail?.message || "erro desconhecido"}`, credentials.key);
      }
    } catch (error) {
      warnOnce("rede", `falha de rede ao registrar no Supabase: ${error?.message || error}`, credentials.key);
    }
    return null;
  }

  return {
    registrarMensagem({ waId, direcao, telefone, texto, origem = "outro", status, erro = null, ocorridaEm = new Date() }) {
      // A RPC recusa texto vazio (e acima de 4096): nao ha o que registrar.
      if (typeof texto !== "string" || !texto.trim()) return Promise.resolve(null);
      return rpc("registrar_mensagem_whatsapp", {
        p_wa_id: waId,
        p_direcao: direcao,
        p_telefone: telefone,
        p_texto: texto,
        p_origem: ORIGENS.includes(origem) ? origem : "outro",
        p_status: status,
        p_erro: erro,
        p_ocorrida_em: ocorridaEm.toISOString(),
      });
    },
    atualizarStatus(waId, status) {
      return rpc("atualizar_status_whatsapp", { p_wa_id: waId, p_status: status });
    },
  };
}
