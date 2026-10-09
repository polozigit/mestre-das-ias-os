import assert from "node:assert/strict";
import test from "node:test";

import { OLD_MCP, PROJECT, oldStackRunning, retireEvolution } from "../src/retire-evolution.mjs";

const docker = (stdout) => async (command, args) => {
  assert.equal(command, "docker");
  assert.ok(args.includes(`label=com.docker.compose.project=${PROJECT}`), "filtra so o projeto da pilha antiga");
  return { stdout };
};

test("pilha antiga: so conta como rodando se ha container do projeto compose antigo", async () => {
  assert.equal(await oldStackRunning({ hasCommand: async () => true, runCommand: docker("abc123\n") }), true);
  assert.equal(await oldStackRunning({ hasCommand: async () => true, runCommand: docker("") }), false);
  assert.equal(await oldStackRunning({ hasCommand: async () => false, runCommand: async () => assert.fail("sem docker nao consulta") }), false);
  assert.equal(await oldStackRunning({ hasCommand: async () => true, runCommand: async () => { throw new Error("daemon parado"); } }), false);
});

test("retire: derruba o projeto antigo, mantem volumes e tira o MCP antigo dos dois clientes", async () => {
  const calls = [];
  const lines = [];
  await retireEvolution({
    hasCommand: async () => true,
    runCommand: async (command, args) => { calls.push([command, ...args].join(" ")); return { stdout: "" }; },
    backup: async () => "",
    log: (line) => lines.push(line),
  });
  assert.ok(calls.includes(`docker compose -p ${PROJECT} down`));
  assert.ok(!calls.some((call) => call.includes("--volumes")));
  assert.ok(calls.includes(`codex mcp remove ${OLD_MCP}`));
  assert.ok(calls.includes(`claude mcp remove ${OLD_MCP} -s user`));
  assert.ok(lines.includes("EVOLUTION_VOLUMES=MANTIDOS"));
});
