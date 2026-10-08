import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { describeMedia, LIMITE_BYTES, limiteLegivel, marcador, sanitizeFileName, TIPOS } from "../src/midia.mjs";
import { removeTemporaryMedia } from "../src/midia-temp.mjs";
import { isInsideDirectory } from "../src/local-paths.mjs";
import { isGroupId, isPhone, validateDestino } from "../src/validation.mjs";
import { makeTempDir } from "./engine-harness.mjs";

const exists = (file) => access(file).then(() => true, () => false);

test("destino: numero 55 ou id de grupo, nada mais", () => {
  for (const ok of ["5511900000001", "554733334444"]) assert.equal(isPhone(ok), true, ok);
  for (const bad of ["11900000001", "+5511900000001", "5511900000001@s.whatsapp.net", "", undefined]) assert.equal(isPhone(bad), false, String(bad));
  for (const ok of ["120363000000000000@g.us", "5511900000001-1600000000@g.us"]) assert.equal(isGroupId(ok), true, ok);
  for (const bad of ["120363000000000000", "123@g.us", "120363000000000000@s.whatsapp.net", "abc@g.us", "120363000000000000@g.us.evil", undefined]) assert.equal(isGroupId(bad), false, String(bad));
  assert.doesNotThrow(() => validateDestino("120363000000000000@g.us"));
  assert.throws(() => validateDestino("120363000000000000"), /telefone brasileiro.*grupo/);
});

test("mimetype vem da extensao e cada tipo so aceita os formatos dele", () => {
  assert.equal(describeMedia("image", "/a/Foto.JPG").mimetype, "image/jpeg");
  assert.equal(describeMedia("video", "v.mp4").mimetype, "video/mp4");
  assert.equal(describeMedia("audio", "m.mp3").mimetype, "audio/mpeg");
  assert.equal(describeMedia("audio", "m.ogg").mimetype, "audio/ogg; codecs=opus");
  assert.equal(describeMedia("voice", "nota.opus").mimetype, "audio/ogg; codecs=opus");
  assert.equal(describeMedia("document", "r.pdf").mimetype, "application/pdf");
  assert.equal(describeMedia("document", "planilha.xlsx").mimetype, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(describeMedia("document", "qualquer.xyz").mimetype, "application/octet-stream");
  assert.throws(() => describeMedia("image", "a.gif"), /\.gif nao aceito para image/);
  assert.throws(() => describeMedia("video", "a"), /sem extensao/);
  assert.throws(() => describeMedia("sticker", "a.webp"), /Tipo invalido/);
});

test("nota de voz so aceita OGG/Opus e a mensagem explica o que fazer", () => {
  for (const name of ["a.mp3", "a.m4a", "a.wav", "a"]) {
    assert.throws(() => describeMedia("voice", name), /OGG com Opus.*nao converte audio.*tipo audio/, name);
  }
});

test("limites: imagem 16 MB, video e audio 64 MB, documento 100 MB", () => {
  assert.deepEqual(LIMITE_BYTES, { image: 16 * 1024 * 1024, video: 64 * 1024 * 1024, audio: 64 * 1024 * 1024, voice: 64 * 1024 * 1024, document: 100 * 1024 * 1024 });
  assert.equal(limiteLegivel("document"), "100 MB");
  assert.deepEqual(TIPOS, ["image", "video", "audio", "voice", "document"]);
});

test("nome do arquivo e marcador do registro", () => {
  assert.equal(sanitizeFileName("../../etc/passwd"), ".._.._etc_passwd");
  assert.equal(sanitizeFileName("a\\b/c.pdf"), "a_b_c.pdf");
  assert.equal(sanitizeFileName("x".repeat(300)).length, 200);
  assert.equal(marcador("document", "vendas.pdf"), "[documento: vendas.pdf]");
  assert.equal(marcador("image"), "[imagem]");
  assert.equal(marcador("voice"), "[nota de voz]");
  assert.equal(marcador("audio"), "[audio]");
  assert.equal(marcador("video"), "[video]");
});

test("isInsideDirectory nao confunde pasta irma nem o proprio diretorio", () => {
  assert.equal(isInsideDirectory("/estado/midia-temp", "/estado/midia-temp/a.pdf"), true);
  assert.equal(isInsideDirectory("/estado/midia-temp", "/estado/midia-temp"), false);
  assert.equal(isInsideDirectory("/estado/midia-temp", "/estado/midia-temp-outra/a.pdf"), false);
  assert.equal(isInsideDirectory("/estado/midia-temp", "/estado/midia-temp/../auth/creds.json"), false);
});

test("o temporario so e apagado dentro da pasta de midia do motor", async (t) => {
  const root = await makeTempDir(t);
  const dir = path.join(root, "midia-temp");
  await mkdir(dir);
  const inside = path.join(dir, "a.pdf");
  const outside = path.join(root, "importante.txt");
  await writeFile(inside, "x");
  await writeFile(outside, "x");
  assert.equal(await removeTemporaryMedia(outside, dir), false);
  assert.equal(await removeTemporaryMedia(path.join(dir, "..", "importante.txt"), dir), false);
  assert.equal(await removeTemporaryMedia("", dir), false);
  assert.equal(await removeTemporaryMedia(undefined, dir), false);
  assert.equal(await exists(outside), true);
  assert.equal(await removeTemporaryMedia(inside, dir), true);
  assert.equal(await exists(inside), false);
  assert.equal(await removeTemporaryMedia(inside, dir), true, "apagar de novo nao e erro");
});
