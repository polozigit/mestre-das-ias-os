import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gavetaInerte, QUERY_DESKTOP } from "./gaveta.ts";

test("celular com a gaveta fechada: inerte (links fora do tab order)", () => {
  assert.equal(gavetaInerte(false, false), true);
});

test("celular com a gaveta aberta: interativa", () => {
  assert.equal(gavetaInerte(true, false), false);
});

test("desktop: sempre interativa, aberta ou não", () => {
  assert.equal(gavetaInerte(false, true), false);
  assert.equal(gavetaInerte(true, true), false);
});

test("o breakpoint de desktop é o lg do Tailwind (as classes lg: da Sidebar)", () => {
  assert.equal(QUERY_DESKTOP, "(min-width: 1024px)");
});

test("a Sidebar aplica inert com gavetaInerte no <aside>", () => {
  const fonte = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
  assert.match(fonte, /<aside[^>]*inert=\{gavetaInerte\(open, desktop\)\}/);
});
