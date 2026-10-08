import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lerFonte } from "../fonte-para-teste.ts";
import { agruparPorTime, contarInstalados, ESTADO_INSTALADO, execucaoDoAgente, ultimaExecucaoPorAgente } from "./agrupar.ts";
import type { AgenteLinha } from "./agrupar.ts";

const ag = (id: string, time: string, estado: AgenteLinha["estado"] = "instalado"): AgenteLinha => ({
  id, name: id, time, descricao_curta: "x", estado, tier: "t", esforco: "e",
});

test("aposentado não aparece", () => {
  const g = agruparPorTime([ag("a", "vendas"), ag("b", "vendas", "aposentado")]);
  assert.deepEqual(g.map((x) => x.agentes.map((y) => y.id)), [["a"]]);
});

test("time só de aposentados some", () => {
  assert.deepEqual(agruparPorTime([ag("b", "vendas", "aposentado")]), []);
});

test("sistema fica por último, demais em ordem alfabética", () => {
  const g = agruparPorTime([ag("a", "sistema"), ag("b", "vendas"), ag("c", "ágil"), ag("d", "marketing")]);
  assert.deepEqual(g.map((x) => x.time), ["ágil", "marketing", "vendas", "sistema"]);
});

test("lista vazia vira []", () => {
  assert.deepEqual(agruparPorTime([]), []);
});

test("disponivel entra, preserva ordem de entrada no time", () => {
  const g = agruparPorTime([ag("z", "vendas", "disponivel"), ag("a", "vendas")]);
  assert.deepEqual(g[0].agentes.map((x) => x.id), ["z", "a"]);
});

test("execução mais recente vence, independente da ordem", () => {
  const m = ultimaExecucaoPorAgente([
    { agente: "a", terminado_em: "2026-10-02T10:00:00Z", n: 2 },
    { agente: "a", terminado_em: "2026-10-05T10:00:00Z", n: 3 },
    { agente: "a", terminado_em: "2026-10-01T10:00:00Z", n: 1 },
    { agente: "b", terminado_em: "2026-10-01T10:00:00Z", n: 9 },
  ]);
  assert.equal(m.get("a")?.n, 3);
  assert.equal(m.get("b")?.n, 9);
  assert.equal(m.size, 2);
});

test("sem execuções vira mapa vazio", () => {
  assert.equal(ultimaExecucaoPorAgente([]).size, 0);
});

test("execução do agente é achada pelo name, não pelo id", () => {
  const m = ultimaExecucaoPorAgente([{ agente: "gerente-vendas", terminado_em: "2026-10-05T10:00:00Z", n: 7 }]);
  assert.equal(execucaoDoAgente({ name: "gerente-vendas" }, m)?.n, 7);
  assert.equal(execucaoDoAgente({ name: "outro" }, m), null);
});

test("a tela usa execucaoDoAgente (chave name) e não busca o mapa por id", () => {
  const src = readFileSync(new URL("../../app/(app)/agentes/page.tsx", import.meta.url), "utf8");
  assert.match(src, /execucaoDoAgente\(agente, ultimas\)/);
  assert.doesNotMatch(src, /ultimas\.get\(/);
});

test("a tela estoura quando a leitura de v_posicao_ocupante falha (não mostra agente sem cargo calado)", () => {
  const src = readFileSync(new URL("../../app/(app)/agentes/page.tsx", import.meta.url), "utf8");
  assert.match(src, /error: erroOcupantes/);
  assert.match(src, /if \(erroOcupantes\) throw erroOcupantes;/);
});

test("contarInstalados conta só o estado instalado (disponível e aposentado ficam de fora)", () => {
  assert.equal(contarInstalados([ag("a", "vendas"), ag("b", "vendas", "disponivel"), ag("c", "vendas", "aposentado"), ag("d", "sistema")]), 2);
  assert.equal(contarInstalados([]), 0);
  assert.equal(ESTADO_INSTALADO, "instalado");
});

test("o Início e a tela de Agentes contam instalados pela MESMA regra (os dois números batem)", () => {
  const agentes = lerFonte(new URL("../../app/(app)/agentes/page.tsx", import.meta.url));
  const inicio = lerFonte(new URL("../../app/(app)/inicio/page.tsx", import.meta.url));
  assert.match(agentes, /contarInstalados\(linhas\)/);
  assert.match(inicio, /\.eq\("estado", ESTADO_INSTALADO\)/);
  assert.match(inicio, /label="Agentes instalados"/);
  assert.doesNotMatch(inicio, /Agentes ativos/);
});
