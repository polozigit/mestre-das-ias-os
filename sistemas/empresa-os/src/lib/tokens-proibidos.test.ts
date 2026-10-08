import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("../", import.meta.url).pathname; // src/
// layout.tsx raiz fica fora do scan: `viewport.themeColor` é metadado do navegador e exige hex.
const EXCECOES = [join(RAIZ, "app", "layout.tsx")];
const PROIBIDO =
  /\b(?:ink|orange)-\d{2,3}\b|\bborder-border\b|\bbg-bg-(?:subtle|elevated)\b|-(?:soft|ink)\b|fg-on-orange|["'`\[(]#[0-9a-fA-F]{3,8}\b/; // cor literal: após aspas ou [ ( (valor arbitrário do Tailwind); ignora "React #418" em comentário

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) && !n.endsWith(".test.ts") ? [p] : [];
  });
}

test("componentes não usam token do CRM nem cor literal", () => {
  const achados = arquivos(RAIZ)
    .filter((f) => !EXCECOES.includes(f))
    .flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .map((l, i) => [f, i + 1, l] as const)
        .filter(([, , l]) => PROIBIDO.test(l)),
    );
  assert.deepEqual(achados.map(([f, n]) => `${f}:${n}`), []);
});
