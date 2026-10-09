import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marca } from "./marca.ts";

const RAIZ = join(import.meta.dirname, "..");
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");

const HEX = /^#[0-9A-F]{6}$/;
const LOGO = /^\/marca\/(logo|logo-fundo-escuro)\.(png|jpg|jpeg|webp|svg)$/;
const PESO = "(:wght@[0-9]{3}(;[0-9]{3})*)?";
const FONTE = new RegExp(`^https://fonts\\.googleapis\\.com/css2\\?family=[A-Za-z0-9+]+${PESO}(&family=[A-Za-z0-9+]+${PESO})?&display=swap$`);

test("as duas cores da barra do navegador são #RRGGBB maiúsculo", () => {
  assert.match(marca.corDoNavegador.claro, HEX);
  assert.match(marca.corDoNavegador.escuro, HEX);
});

test("o logo dos dois temas casa o formato e o arquivo existe em public/", () => {
  for (const caminho of [marca.logo.fundoClaro, marca.logo.fundoEscuro]) {
    assert.match(caminho, LOGO);
    assert.ok(existsSync(join(RAIZ, "public", caminho)), `falta public${caminho}`);
  }
});

test("fontesGoogle é null ou uma URL css2 do Google Fonts por https", () => {
  if (marca.fontesGoogle !== null) assert.match(marca.fontesGoogle, FONTE);
});

test("config/marca.ts começa com o cabeçalho de arquivo gerado", () => {
  assert.equal(
    ler("config/marca.ts").split("\n")[0],
    "// Gerado por tecnologia-aplicar-marca. Não edite à mão: rode a skill de novo (ver DESIGN.md).",
  );
});

test("o layout lê a marca de config/marca.ts e não declara metadata.icons", () => {
  const layout = ler("src/app/layout.tsx");
  assert.ok(!layout.includes("icons:"), "layout.tsx não pode ter 'icons:' (o arquivo em src/app/icon.* vence)");
  assert.match(layout, /from "\.\.\/\.\.\/config\/marca"/);
});

test("existe exatamente um src/app/icon.* e o favicon antigo de public/marca saiu", () => {
  const icones = readdirSync(join(RAIZ, "src/app")).filter((n) => /^icon\./.test(n));
  assert.equal(icones.length, 1, `ícones em src/app: ${icones.join(", ")}`);
  assert.ok(!existsSync(join(RAIZ, "public/marca/favicon.svg")));
});

test("DESIGN.md abre com o front matter alpha e tem um só par de marcadores, na ordem", () => {
  const design = ler("DESIGN.md");
  assert.ok(design.startsWith("---\nversion: alpha"));
  const inicios = design.split("<!-- marca:inicio -->").length - 1;
  const fins = design.split("<!-- marca:fim -->").length - 1;
  assert.equal(inicios, 1);
  assert.equal(fins, 1);
  assert.ok(design.indexOf("<!-- marca:inicio -->") < design.indexOf("<!-- marca:fim -->"));
});

test("o LogoMarca troca o logo por tema: dark:hidden no claro e hidden dark:block no escuro", () => {
  const logo = ler("src/components/marca/LogoMarca.tsx");
  assert.ok(logo.includes("dark:hidden"));
  assert.ok(logo.includes("hidden dark:block"));
});

test("os dois blocos escuros do theme.css trazem --fg-sobre-acento e o anel de foco de duas camadas", () => {
  const css = ler("src/app/theme.css");
  assert.equal(css.split("--fg-sobre-acento: var(--neutro-900);").length - 1, 2);
  assert.ok(css.includes("--anel-foco: 0 0 0 2px var(--bg), 0 0 0 4px var(--acento);"));
});
