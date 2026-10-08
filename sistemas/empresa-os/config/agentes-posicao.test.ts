import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const organograma = JSON.parse(ler("./organograma.json"));
const mapa: Record<string, string> = JSON.parse(ler("./agentes-posicao.json")).agentes;

type Cargo = { slug: string; tipo: string; area_slug: string | null; vagas: number };
const cargos: Cargo[] = organograma.cargos;

test("agentes-posicao: todo cargo do mapa existe no organograma.json, é cargo comum e do Time de IA", () => {
  assert.ok(Object.keys(mapa).length > 0, "mapa vazio");
  for (const [agente, slug] of Object.entries(mapa)) {
    const cargo = cargos.find((c) => c.slug === slug);
    assert.ok(cargo, `${agente} -> cargo "${slug}" não existe em config/organograma.json`);
    assert.equal(cargo.tipo, "cargo", `${slug} não é cargo comum (só tipo "cargo" ganha posição)`);
    assert.equal(cargo.area_slug, "time-de-ia", `${slug} não é do Time de IA`);
  }
});

test("agentes-posicao: um agente por cargo (a posição 0 tem um ocupante só)", () => {
  const slugs = Object.values(mapa);
  assert.equal(new Set(slugs).size, slugs.length, "dois agentes no mesmo cargo");
});

test("agentes-posicao: todo agente do seed de exemplo está no mapa", () => {
  const seed = ler("../supabase/seed_exemplo.sql");
  const bloco = seed.split("INSERT INTO public.agentes")[1]?.split("ON CONFLICT")[0] ?? "";
  const nomes = [...bloco.matchAll(/\('[0-9a-f-]{36}',\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(nomes.length >= 4, "não achei os agentes do seed_exemplo.sql");
  for (const nome of nomes) assert.ok(mapa[nome], `agente do seed "${nome}" sem cargo em config/agentes-posicao.json`);
});
