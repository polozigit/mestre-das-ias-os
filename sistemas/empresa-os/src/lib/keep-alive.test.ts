import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { autorizado, tocarBanco } from "./keep-alive.ts";

const raiz = new URL("../../", import.meta.url);

test("autorizado: só com o Bearer igual ao CRON_SECRET", () => {
  assert.equal(autorizado("Bearer s3gredo-com-16-chars", "s3gredo-com-16-chars"), true);
  assert.equal(autorizado("Bearer outro", "s3gredo-com-16-chars"), false);
  assert.equal(autorizado("s3gredo-com-16-chars", "s3gredo-com-16-chars"), false);
  assert.equal(autorizado(null, "s3gredo-com-16-chars"), false);
});

test("autorizado: sem CRON_SECRET a rota recusa tudo (nunca fica aberta)", () => {
  assert.equal(autorizado("Bearer ", ""), false);
  assert.equal(autorizado("Bearer undefined", undefined), false);
  assert.equal(autorizado(null, undefined), false);
});

test("tocarBanco: leitura ok vira 200", async () => {
  assert.deepEqual(await tocarBanco(async () => ({ erro: null })), { status: 200, corpo: { ok: true } });
});

test("tocarBanco: banco recusou vira 502 sem repetir a mensagem do banco", async () => {
  const r = await tocarBanco(async () => ({ erro: "permission denied for table empresa" }));
  assert.equal(r.status, 502);
  assert.equal(r.corpo.ok, false);
  assert.ok(!JSON.stringify(r).includes("permission denied"));
});

test("tocarBanco: falha de rede vira 500", async () => {
  const r = await tocarBanco(async () => {
    throw new Error("fetch failed");
  });
  assert.equal(r.status, 500);
  assert.equal(r.corpo.ok, false);
});

test("vercel.json: um Cron diário (limite do Hobby) apontando para a rota que existe", () => {
  const config = JSON.parse(readFileSync(new URL("vercel.json", raiz), "utf8")) as {
    crons?: { path: string; schedule: string }[];
  };
  assert.deepEqual(
    config.crons?.map((c) => c.path),
    ["/api/keep-alive"],
  );
  const [minuto, hora, ...resto] = config.crons![0].schedule.split(" ");
  assert.match(minuto, /^\d+$/, "Hobby só aceita 1x por dia: minuto fixo");
  assert.match(hora, /^\d+$/, "Hobby só aceita 1x por dia: hora fixa");
  assert.deepEqual(resto, ["*", "*", "*"]);
  assert.ok(existsSync(new URL("src/app/api/keep-alive/route.ts", raiz)), "a rota do Cron sumiu");
});

test("o proxy deixa o Cron passar sem login (o Cron não segue redirect para /login)", () => {
  const fonte = readFileSync(new URL("src/lib/supabase/proxy.ts", raiz), "utf8");
  const bloco = fonte.match(/const isPublic =([\s\S]*?);/)?.[1] ?? "";
  assert.ok(bloco.includes('pathname === "/api/keep-alive"'), "isPublic sem /api/keep-alive");
});
