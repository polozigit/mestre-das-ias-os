import { rm } from "node:fs/promises";

import { getMediaTempDirectory, isInsideDirectory } from "./local-paths.mjs";

// Apaga o arquivo temporario de uma midia recebida. So apaga dentro da pasta temporaria do motor:
// um caminho de fora (evento forjado, erro) nunca e removido.
export async function removeTemporaryMedia(file, directory = getMediaTempDirectory()) {
  if (typeof file !== "string" || !file || !isInsideDirectory(directory, file)) return false;
  await rm(file, { force: true });
  return true;
}
