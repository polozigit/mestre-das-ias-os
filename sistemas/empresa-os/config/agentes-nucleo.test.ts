import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

type Agente = {
  name: string;
  time: string;
  descricao_curta: string;
  descricao: string;
  quando: string;
  tier: string;
  esforco: string;
  sandbox: string;
  skills: string[];
  estado: string;
  [chave: string]: unknown;
};

const nucleo: Agente[] = JSON.parse(ler("./agentes-nucleo.json")).agentes;
const posicao: Record<string, string> = JSON.parse(ler("./agentes-posicao.json")).agentes;

// Chaves que public.sincronizar_agentes aceita (0008): qualquer outra vira exceção no setup.
const aceitas = ["name", "time", "descricao_curta", "descricao", "quando", "tier", "modelo", "esforco", "sandbox", "skills", "estado"];

// Fonte dos dados do núcleo. O arquivo é de outro dono (plugin polozi-fundacao): só lemos.
// Fora do repositório do curso (kit do aluno) o plugin não existe e a comparação não se aplica.
const caminhoPlugin =
  "../../plugins/polozi-fundacao/skills/polozi-criar-empresa-ia/assets/agents-spec/agentes.json";
const temPlugin = existsSync(new URL(caminhoPlugin, import.meta.url));

test("agentes-nucleo: os agentes do núcleo existem, sem repetição", () => {
  assert.deepEqual(
    nucleo.map((a) => a.name).sort(),
    ["polozi-gerente-de-trabalho", "polozi-sistema-qa"],
  );
  assert.equal(new Set(nucleo.map((a) => a.name)).size, nucleo.length, "name repetido");
});

test("agentes-nucleo: só chaves que a RPC aceita, estado instalado, time sistema, sem skills", () => {
  for (const a of nucleo) {
    for (const k of Object.keys(a)) assert.ok(aceitas.includes(k), `${a.name}: chave "${k}" faria sincronizar_agentes falhar`);
    assert.equal(a.estado, "instalado", `${a.name}: estado`);
    assert.equal(a.time, "sistema", `${a.name}: time (o seed de exemplo usa "sistema")`);
    assert.deepEqual(a.skills, [], `${a.name}: skills`);
    assert.match(a.name, /^[a-z0-9-]+$/, `${a.name}: name fora do CHECK da tabela`);
    assert.ok(["terra", "sol", "luna"].includes(a.tier), `${a.name}: tier`);
    assert.ok(["low", "medium", "high", "xhigh"].includes(a.esforco), `${a.name}: esforco (a tabela não aceita minimal)`);
    assert.ok(["read-only", "workspace-write"].includes(a.sandbox), `${a.name}: sandbox`);
  }
});

test("agentes-nucleo: descricao_curta tem de 1 a 50 caracteres (CHECK da tabela agentes)", () => {
  for (const a of nucleo) {
    const n = [...a.descricao_curta].length;
    assert.ok(n >= 1 && n <= 50, `${a.name}: descricao_curta com ${n} caracteres (limite 50)`);
  }
});

// O mapa também cobre agentes de times instalados (ex.: tecnologia-*), então basta conter o núcleo.
test("agentes-nucleo: todo agente do núcleo tem cargo em config/agentes-posicao.json", () => {
  for (const a of nucleo) assert.ok(posicao[a.name], `${a.name} sem cargo em config/agentes-posicao.json`);
});

test("agentes-nucleo: campos batem com o agentes.json do plugin (acusa drift)", { skip: !temPlugin && "plugin polozi-fundacao fora deste checkout" }, () => {
  const fonte: Agente[] = JSON.parse(ler(caminhoPlugin)).agentes;
  assert.equal(fonte.length, nucleo.length, "quantidade de agentes diferente do plugin");
  for (const a of nucleo) {
    const f = fonte.find((x) => x.name === a.name);
    assert.ok(f, `${a.name} não existe no agentes.json do plugin`);
    for (const campo of ["name", "descricao", "quando", "tier", "esforco", "sandbox"] as const) {
      assert.equal(a[campo], f[campo], `${a.name}: "${campo}" divergiu do plugin — atualize config/agentes-nucleo.json`);
    }
  }
});

test("setup-inicial: sincroniza o núcleo ANTES de ocupar posições e preserva agentes de outros times", () => {
  const setup = ler("../scripts/setup-inicial.mjs");
  const sync = setup.indexOf('supabase.rpc("sincronizar_agentes"');
  const ocupa = setup.indexOf('"ocupar_posicao_agente"');
  assert.ok(sync > 0, "o setup não chama sincronizar_agentes — a tela Time de Agentes nasce vazia");
  assert.ok(ocupa > 0 && sync < ocupa, "sincronizar_agentes precisa vir antes de ocupar_posicao_agente (o passo lê os agentes instalados)");
  assert.ok(setup.includes("config/agentes-nucleo.json"), "o setup não lê config/agentes-nucleo.json");
  assert.match(
    setup,
    /\.neq\("time", "sistema"\)\s*\n\s*\.neq\("estado", "aposentado"\)/,
    "o setup não reenvia os agentes de outros times — a RPC os aposentaria",
  );
});
