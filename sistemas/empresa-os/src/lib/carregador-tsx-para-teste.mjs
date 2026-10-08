// SÓ PARA OS TESTES. Nenhum código do sistema importa este arquivo.
//
// O node --test lê TypeScript (tira os tipos), mas não lê JSX (.tsx) nem os atalhos "@/..." do projeto.
// Estes ganchos do Node ensinam as duas coisas, pra um teste poder DESENHAR um componente de verdade
// (react-dom/server) em vez de só conferir o código-fonte dele:
//
//   register("../../lib/carregador-tsx-para-teste.mjs", import.meta.url);
//   const { ComoFazer } = await import("./ComoFazer.tsx");
//
// O TypeScript do próprio projeto (devDependency) transpila o JSX; o bundler do Next não participa.
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const RAIZ_SRC = fileURLToPath(new URL("../", import.meta.url)); // .../src/
const EXTENSOES = [".tsx", ".ts", ".mjs", ".js"];

function ehArquivo(caminho) {
  return existsSync(caminho) && statSync(caminho).isFile();
}

/** Acha o arquivo como o bundler acharia: o caminho exato, com extensão, ou a pasta com index. */
function resolverArquivo(base) {
  if (ehArquivo(base)) return base;
  for (const ext of EXTENSOES) if (ehArquivo(base + ext)) return base + ext;
  for (const ext of EXTENSOES) if (ehArquivo(path.join(base, `index${ext}`))) return path.join(base, `index${ext}`);
  return null;
}

export async function resolve(specifier, context, seguir) {
  if (specifier === "next/image") {
    return { url: new URL("./next-image-para-teste.mjs", import.meta.url).href, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const arquivo = resolverArquivo(path.join(RAIZ_SRC, specifier.slice(2)));
    if (arquivo) return { url: pathToFileURL(arquivo).href, shortCircuit: true };
  }
  const relativo = specifier.startsWith("./") || specifier.startsWith("../");
  if (relativo && context.parentURL?.startsWith("file:") && path.extname(specifier) === "") {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    const arquivo = resolverArquivo(base);
    if (arquivo) return { url: pathToFileURL(arquivo).href, shortCircuit: true };
  }
  try {
    return await seguir(specifier, context);
  } catch (erro) {
    // O Node não completa ".js" em subcaminho de pacote ("next/link"); o bundler do Next completa.
    const subcaminhoDePacote = !relativo && !specifier.startsWith("node:") && specifier.includes("/") && path.extname(specifier) === "";
    if (erro?.code === "ERR_MODULE_NOT_FOUND" && subcaminhoDePacote) return seguir(`${specifier}.js`, context);
    throw erro;
  }
}

export async function load(url, context, seguir) {
  if (url.endsWith(".tsx")) {
    const fonte = await readFile(fileURLToPath(url), "utf8");
    const { outputText } = ts.transpileModule(fonte, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return seguir(url, context);
}
