import { spawn } from "node:child_process";

// No Windows, npm/codex/claude sao atalhos .cmd e nao abrem sem shell (Node >= 20.12).
// So esses nomes fixos passam por shell, com cada argumento entre aspas.
const NEEDS_SHELL = /^(npm|npx|codex|claude)(\.cmd)?$/i;
export const quote = (value) => (/[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value);

export function needsShell(command) {
  return process.platform === "win32" && NEEDS_SHELL.test(command);
}

export function run(command, args, { cwd, env = process.env, capture = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const shell = needsShell(command);
    const child = spawn(command, shell ? args.map(quote) : args, {
      cwd,
      env,
      shell,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ code, stdout, stderr });
        return;
      }
      reject(new Error(`${command} terminou com codigo ${code}. ${stderr.trim()}`));
    });
  });
}

export function commandExists(command) {
  return run(command, ["--version"], { capture: true })
    .then(() => true)
    .catch(() => false);
}
