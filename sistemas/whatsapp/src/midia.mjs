import path from "node:path";

// Midia enviada pelo motor: tipo, extensoes aceitas, mimetype e tamanho maximo.
// Sem ffmpeg: o motor nao converte nada. Nota de voz (voice) so aceita OGG com Opus.
export const TIPOS = ["image", "video", "audio", "voice", "document"];

const MB = 1024 * 1024;
export const LIMITE_BYTES = {
  image: 16 * MB,
  video: 64 * MB,
  audio: 64 * MB,
  voice: 64 * MB,
  document: 100 * MB,
};
export const MAX_LEGENDA = 1024;
export const MAX_NOME_ARQUIVO = 200;

const OGG_OPUS = "audio/ogg; codecs=opus";
const EXTENSOES = {
  image: { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" },
  video: { ".mp4": "video/mp4", ".mov": "video/quicktime", ".3gp": "video/3gpp" },
  audio: { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav", ".ogg": OGG_OPUS, ".opus": OGG_OPUS },
  voice: { ".ogg": OGG_OPUS, ".opus": OGG_OPUS },
};
const DOCUMENTOS = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".zip": "application/zip",
};

// Devolve { mimetype, extensao } ou lanca Error com a explicacao em portugues simples.
export function describeMedia(tipo, caminho) {
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo invalido. Use: ${TIPOS.join(", ")}.`);
  const extensao = path.extname(String(caminho || "")).toLowerCase();
  if (tipo === "document") {
    return { mimetype: DOCUMENTOS[extensao] || "application/octet-stream", extensao };
  }
  const aceitas = EXTENSOES[tipo];
  if (aceitas[extensao]) return { mimetype: aceitas[extensao], extensao };
  if (tipo === "voice") {
    throw new Error(`Nota de voz precisa ser OGG com Opus (.ogg ou .opus), mas o arquivo e ${extensao || "sem extensao"}. O motor nao converte audio: envie como tipo audio (chega como arquivo de audio comum) ou converta o arquivo para OGG/Opus antes.`);
  }
  throw new Error(`Formato ${extensao || "sem extensao"} nao aceito para ${tipo}. Aceitos: ${Object.keys(aceitas).join(", ")}.`);
}

export function limiteLegivel(tipo) {
  return `${LIMITE_BYTES[tipo] / MB} MB`;
}

export function sanitizeFileName(name) {
  const clean = String(name || "").replace(/[\\/\u0000-\u001f]/g, "_").trim();
  return clean.slice(0, MAX_NOME_ARQUIVO);
}

// Texto que vai para o registro quando nao ha legenda.
export function marcador(tipo, nomeArquivo) {
  if (tipo === "document") return `[documento: ${nomeArquivo}]`;
  if (tipo === "image") return "[imagem]";
  if (tipo === "video") return "[video]";
  if (tipo === "voice") return "[nota de voz]";
  return "[audio]";
}
