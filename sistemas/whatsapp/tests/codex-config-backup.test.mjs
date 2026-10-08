import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { backupCodexConfig, getCodexConfigPath } from "../src/codex-config-backup.mjs";

test("guarda copia do config.toml antes de mexer nele", async () => {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "polozi-codex-home-"));
  try {
    await mkdir(path.join(homeDirectory, ".codex"), { recursive: true });
    await writeFile(getCodexConfigPath(homeDirectory), "[mcp_servers.outro]\ncommand = \"outro\"\n");

    const backupPath = await backupCodexConfig(homeDirectory);
    assert.ok(backupPath.startsWith(getCodexConfigPath(homeDirectory)));
    assert.equal(await readFile(backupPath, "utf8"), "[mcp_servers.outro]\ncommand = \"outro\"\n");
  } finally {
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("nao falha quando ainda nao existe config.toml", async () => {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "polozi-codex-home-"));
  try {
    assert.equal(await backupCodexConfig(homeDirectory), "");
  } finally {
    await rm(homeDirectory, { recursive: true, force: true });
  }
});
