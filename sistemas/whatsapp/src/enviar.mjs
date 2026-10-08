import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { ensureEngine, sendMedia, sendText } from "./engine-client.mjs";
import { TIPOS } from "./midia.mjs";
import { ORIGENS } from "./registro-supabase.mjs";
import { validateDestino, validateTextMessage } from "./validation.mjs";

export const USO = `Uso: npm run enviar -- <numero-com-DDI ou id-do-grupo@g.us> --texto "mensagem" (ou --arquivo caminho.txt)
     npm run enviar -- <numero ou grupo> --midia caminho --tipo ${TIPOS.join("|")} [--legenda "texto"] [--nome nome.pdf]
     [--origem relatorio]`;

export async function parseEnviarArgs(argv, read = (file) => readFile(file, "utf8")) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        texto: { type: "string" },
        arquivo: { type: "string" },
        midia: { type: "string" },
        tipo: { type: "string" },
        legenda: { type: "string" },
        nome: { type: "string" },
        origem: { type: "string" },
      },
    });
  } catch {
    throw new Error(USO);
  }
  const { positionals, values } = parsed;
  if (positionals.length !== 1) throw new Error(USO);
  const origem = values.origem || "relatorio";
  if (!ORIGENS.includes(origem)) throw new Error(`Origem invalida. Use: ${ORIGENS.join(", ")}.`);

  if (values.midia !== undefined) {
    if (values.texto !== undefined || values.arquivo !== undefined) {
      throw new Error(`Com --midia nao use --texto nem --arquivo (a mensagem vai na --legenda). ${USO}`);
    }
    if (!values.tipo || !TIPOS.includes(values.tipo)) throw new Error(`Informe --tipo: ${TIPOS.join(", ")}. ${USO}`);
    return {
      phone: positionals[0],
      origem,
      media: { caminho: values.midia, tipo: values.tipo, legenda: values.legenda, nomeArquivo: values.nome },
    };
  }
  if (values.tipo !== undefined || values.legenda !== undefined || values.nome !== undefined) {
    throw new Error(`--tipo, --legenda e --nome so valem junto com --midia. ${USO}`);
  }
  if ((values.texto === undefined) === (values.arquivo === undefined)) {
    throw new Error(`Informe --texto ou --arquivo (um dos dois), ou --midia. ${USO}`);
  }

  let text = values.texto;
  if (values.arquivo !== undefined) {
    try {
      // Tira o BOM e as quebras de linha do fim que editores como o Bloco de Notas deixam.
      text = (await read(values.arquivo)).replace(/^\uFEFF/, "").replace(/(\r?\n)+$/, "");
    } catch {
      throw new Error(`Nao foi possivel ler o arquivo ${values.arquivo}.`);
    }
  }
  return { phone: positionals[0], text, origem };
}

// Envio sem interacao, pensado para rotinas que a pessoa monta: sem ENVIAR e sem trava de destino ou volume.
// sendText ja espera a sessao reconectar e recusa com a instrucao de reconectar se nao estiver conectada.
export async function enviar(argv, { ensure = ensureEngine, send = sendText, sendFile = sendMedia, read } = {}) {
  const { phone, text, origem, media } = await parseEnviarArgs(argv, read);
  if (media) {
    validateDestino(phone);
    const payload = await sendFile(await ensure(), { destino: phone, ...media, origem });
    return payload?.id || "aceito";
  }
  validateTextMessage(phone, text);
  const payload = await send(await ensure(), phone, text, origem);
  return payload?.id || "aceito";
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    console.log(`WHATSAPP_SEND_ACCEPTED=${await enviar(process.argv.slice(2))}`);
  } catch (error) {
    console.error(`WHATSAPP_SEND_ERROR=${error.message}`);
    process.exit(1);
  }
}
