import assert from "node:assert/strict";
import { test } from "node:test";

import { devePularRealce } from "./markdown.ts";

test("devePularRealce: elemento HTML comum (tipo string) sem data-marca NAO pula — realce processa o texto de dentro", () => {
  assert.equal(devePularRealce("strong", {}), false);
});

test("devePularRealce: elemento HTML comum com props null NAO pula", () => {
  assert.equal(devePularRealce("p", null), false);
});

test("devePularRealce: Renderer de componente (tipo função, não string) PULA — ele já chama realce() nos próprios filhos", () => {
  function Renderer() {
    return null;
  }
  assert.equal(devePularRealce(Renderer, {}), true);
});

test("devePularRealce: chip de marca já processado (tem data-marca) PULA — evita chip dentro de chip", () => {
  assert.equal(devePularRealce("span", { "data-marca": "" }), true);
});

test("devePularRealce: elemento HTML com outro data-* mas SEM data-marca NAO pula", () => {
  assert.equal(devePularRealce("span", { "data-playbook": "x" }), false);
});
