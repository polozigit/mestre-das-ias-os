import assert from "node:assert/strict";
import test from "node:test";

import { nodeMajor, summarizePreflight } from "../src/preflight.mjs";

test("preflight aceita Node 20 sem exigir Docker e informa a RAM", () => {
  const result = summarizePreflight({ platform: "win32", nodeVersion: "v20.19.0", totalMemoryMb: 4096, freeMemoryMb: 1500 });
  assert.equal(nodeMajor("v20.19.0"), 20);
  assert.equal(result.ready, true);
  assert.equal(result.totalMemoryMb, 4096);
  assert.equal(result.freeMemoryMb, 1500);
  assert.equal("dockerInstalled" in result, false);
});

test("preflight explica apenas o bloqueio real", () => {
  const result = summarizePreflight({ platform: "darwin", nodeVersion: "v18.0.0" });
  assert.equal(result.ready, false);
  assert.deepEqual(result.actions, ["Instalar Node.js 20 ou superior."]);
});
