import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const p = JSON.parse(readFileSync(new URL("./organograma.json", import.meta.url), "utf8"));

test("organograma.json tem exatamente 1 root e cargos com slug único", () => {
  const roots = p.cargos.filter((c: { tipo: string }) => c.tipo === "root");
  assert.equal(roots.length, 1);
  const slugs = p.cargos.map((c: { slug: string }) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("organograma.json não carrega base de especialista nem doc interno", () => {
  for (const d of p.documentos) {
    assert.ok(!["especialista", "fonte_especialista", "auditoria", "pesquisa", "frente", "gestao"].includes(d.tipo), d.caminho);
    assert.ok(!d.caminho.startsWith("12-fabrica-gurus/"), d.caminho);
  }
});
