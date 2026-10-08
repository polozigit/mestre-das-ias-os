import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CREDITO_ONET_PADRAO, creditoOnet, partesDoCredito } from "./onet.ts";
import type { OrgPacote } from "./tipos.ts";

const base = (secoes: string[], extra: Partial<OrgPacote> = {}): OrgPacote => ({
  cargo_slug: "chro",
  slug: "chro",
  versao: "1",
  data: null,
  validade: null,
  modelou: null,
  aprovou: null,
  pasta: null,
  auditoria: null,
  marcas: { VERIFIED: 0, SNIPPET: 0, premissa: 0, a_modelar: 0 },
  casos_md: null,
  secoes: secoes.map((markdown, i) => ({ titulo: `${i + 1}. Seção`, markdown })),
  playbooks: [],
  ...extra,
});

test("pacote sem O*NET não tem crédito", () => {
  assert.equal(creditoOnet(base(["Só SFIA e CBO."])), null);
});

test("pacote com a frase de crédito no dado: usa a frase DO DADO", () => {
  const frase = "O*NET 31.0 Database, USDOL/ETA, CC BY 4.0 (onetcenter.org/license_db.html), modificado pela Polozi; o USDOL/ETA não endossa este uso.";
  const c = creditoOnet(base([`- ocupação: HR Managers (11-3121.00) · crédito: ${frase}`]));
  assert.equal(c?.texto, frase);
  assert.equal(c?.url, "https://www.onetcenter.org/license_db.html");
  const outra = frase.replace("31.0", "32.1");
  assert.equal(creditoOnet(base([`crédito: ${outra}`]))?.texto, outra);
});

test("pacote que cita O*NET sem trazer a frase: cai no padrão (playbook e casos também contam)", () => {
  assert.equal(creditoOnet(base(["O*NET 15-1243.00 Database Architects."]))?.texto, CREDITO_ONET_PADRAO);
  assert.equal(creditoOnet(base(["x"], { casos_md: "ocupação O*NET 11-3021.00" }))?.texto, CREDITO_ONET_PADRAO);
});

test("partesDoCredito isola o trecho da licença pra virar link", () => {
  const p = partesDoCredito(CREDITO_ONET_PADRAO);
  assert.ok(p);
  assert.equal(p[1], "onetcenter.org/license_db.html");
  assert.equal(p.join(""), CREDITO_ONET_PADRAO);
  assert.equal(partesDoCredito("sem link"), null);
});

// Dado real (config/organograma.json, o que vai pro banco do aluno).
const dados = JSON.parse(readFileSync(new URL("../../../config/organograma.json", import.meta.url), "utf8")) as {
  pacotes: { slug: string; cargo_slug?: string; secoes: { titulo: string; markdown: string }[]; playbooks: { markdown: string }[]; casos_md: string | null }[];
};

test("dado real: todo pacote que cita O*NET ganha crédito, e o padrão é idêntico à frase do dado", () => {
  let citam = 0;
  let comFrase = 0;
  for (const p of dados.pacotes) {
    const pacote = { ...base([]), ...p, cargo_slug: p.cargo_slug ?? p.slug } as unknown as OrgPacote;
    const textos = [...p.secoes.map((s) => s.markdown), ...p.playbooks.map((x) => x.markdown), p.casos_md ?? ""];
    if (!textos.some((t) => t.includes("O*NET"))) {
      assert.equal(creditoOnet(pacote), null, p.slug);
      continue;
    }
    citam++;
    const c = creditoOnet(pacote);
    assert.ok(c, `${p.slug} cita O*NET e ficou sem crédito`);
    if (textos.some((t) => t.includes("onetcenter.org/license_db.html"))) {
      comFrase++;
      assert.equal(c.texto, CREDITO_ONET_PADRAO, `${p.slug}: frase do dado diverge do padrão`);
    }
  }
  assert.ok(citam > 0 && comFrase > 0, "dado sem conteúdo O*NET: o teste deixou de provar algo");
});
