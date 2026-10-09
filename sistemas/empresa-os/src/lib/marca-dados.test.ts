import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  arquivoLogoValido,
  arquivosDeLogo,
  dividirSecoes,
  divisoesComConteudo,
  extrairBloco,
  juntarMarca,
  lerBloco,
  normalizarTitulo,
  pilhaDaFamilia,
  razaoTexto,
  urlGoogleFonts,
  validarBloco,
  type DadosIdentidade,
  type DadosLogo,
  type DadosVoz,
  linkDoMaterial,
  hexDaCor,
} from "./marca-dados.ts";

const IDENTIDADE = {
  documento: "identidade",
  versao: 1,
  personalidade: { palavras: ["acolhedora", "direta"], arquetipo: { principal: "Prestativo", secundario: null } },
  cores: [
    { nome: "Azul Mar", hex: "#1F4E79", funcao: "principal", origem: "logo" },
    { nome: "Areia", hex: "#F4EBD9", funcao: "fundo", origem: "site" },
  ],
  pares: [{ texto: "Azul Mar", fundo: "Areia", razao: 8.1, uso: "texto" }],
  tipografia: [{ uso: "titulos", familia: "Montserrat", pesos: [700, 600], fonte: "google", licenca: "OFL", origem: "site" }],
  materiais: [{ n: 1, tipo: "site", alvo: "https://exemplo.com.br", visto_em: "2026-10-08" }],
};
const VOZ = {
  documento: "voz",
  versao: 1,
  escalas: [
    { eixo: "formal-casual", posicao: 4, origem: "dossie" },
    { eixo: "serio-engracado", posicao: 2, origem: "persona" },
    { eixo: "respeitoso-irreverente", posicao: 1, origem: "proposta" },
    { eixo: "factual-entusiasmado", posicao: 3, origem: "dossie" },
  ],
  palavras: ["próxima", "clara"],
  anti: ["fria", "exagerada"],
};
const LOGO = {
  documento: "logo",
  versao: 1,
  arquivos: [
    { papel: "principal", arquivo: "empresa/marca/logo/logo-principal.png" },
    { papel: "icone", arquivo: "empresa/marca/logo/logo-icone.png" },
  ],
};

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const comBloco = (obj: unknown, antes = "## Dados para o sistema\n\n") => `${antes}\`\`\`marca-dados\n${JSON.stringify(obj)}\n\`\`\`\n`;
/** Muda o bloco de identidade com `f` e diz se a validação recusou. */
const recusa = (f: (b: typeof IDENTIDADE) => void) => {
  const b = clone(IDENTIDADE);
  f(b);
  return validarBloco(b) === null;
};

test("extrairBloco: acha o JSON do bloco cercado e ignora outros blocos de código", () => {
  const texto = `# T\n\n\`\`\`json\n{"a":1}\n\`\`\`\n\n${comBloco(LOGO)}`;
  assert.deepEqual(JSON.parse(extrairBloco(texto)!), LOGO);
  assert.equal(extrairBloco("sem bloco aqui"), null);
});

test("extrairBloco: bloco maior que 32 KB é recusado", () => {
  const grande = `\`\`\`marca-dados\n{"x":"${"a".repeat(33 * 1024)}"}\n\`\`\``;
  assert.equal(extrairBloco(grande), null);
});

test("lerBloco: os três documentos válidos passam e saem na forma esperada", () => {
  const i = lerBloco(comBloco(IDENTIDADE)) as DadosIdentidade;
  assert.equal(i.documento, "identidade");
  assert.equal(i.cores[0].hex, "#1F4E79");
  assert.deepEqual(i.tipografia[0].pesos, [600, 700], "pesos saem ordenados");
  const v = lerBloco(comBloco(VOZ)) as DadosVoz;
  assert.equal(v.escalas.length, 4);
  assert.deepEqual(v.anti, ["fria", "exagerada"]);
  const l = lerBloco(comBloco(LOGO)) as DadosLogo;
  assert.equal(l.arquivos[1].papel, "icone");
});

test("lerBloco: JSON quebrado, versão errada e documento desconhecido viram null sem lançar", () => {
  assert.equal(lerBloco("```marca-dados\n{nao e json\n```"), null);
  assert.equal(lerBloco(comBloco({ ...IDENTIDADE, versao: 2 })), null);
  assert.equal(lerBloco(comBloco({ documento: "outro", versao: 1 })), null);
  assert.equal(lerBloco(comBloco([1, 2])), null);
  assert.equal(lerBloco(comBloco(null)), null);
});

test("rejeita HEX inválido (minúsculo, curto, com alfa, sem #, com injeção)", () => {
  for (const hex of ["#1f4e79", "#1F4E7", "#1F4E79FF", "1F4E79", "red", '#1F4E79"; background:url(x)']) {
    assert.ok(recusa((b) => (b.cores[0].hex = hex)), hex);
  }
});

test("rejeita função de cor fora da lista e nome de cor repetido", () => {
  assert.ok(recusa((b) => (b.cores[0].funcao = "primaria")));
  assert.ok(recusa((b) => (b.cores[1].nome = "Azul Mar")));
});

test("rejeita família com caractere perigoso, vazia ou com mais de 40 letras", () => {
  for (const familia of ["Mont<script>", "Mont<b", "Mont>", 'Mont"serrat', "Mont;serrat", "", "A".repeat(41), "Mont&family=Evil", " Montserrat"]) {
    assert.ok(recusa((b) => (b.tipografia[0].familia = familia)), JSON.stringify(familia));
  }
});

test("rejeita peso, fonte e licença fora do contrato; mais de 2 famílias fora a reserva", () => {
  assert.ok(recusa((b) => (b.tipografia[0].pesos = [650])));
  assert.ok(recusa((b) => ((b.tipografia[0] as { fonte: string }).fonte = "cdn")));
  assert.ok(recusa((b) => ((b.tipografia[0] as { licenca: string }).licenca = "paga")));
  const tres = clone(IDENTIDADE);
  tres.tipografia = ["a", "b", "c"].map((f) => ({ uso: "texto", familia: `Fonte ${f}`, pesos: [400], fonte: "google", licenca: "OFL", origem: "site" }));
  assert.equal(validarBloco(tres), null);
});

test("rejeita origem desconhecida, par com razão absurda, material com data ou tipo ruins", () => {
  assert.ok(recusa((b) => ((b.cores[0] as { origem: string }).origem = "adivinhei")));
  assert.ok(recusa((b) => (b.pares[0].razao = 40)));
  assert.ok(recusa((b) => ((b.pares[0] as { uso: string }).uso = "fundo")));
  assert.ok(recusa((b) => (b.materiais[0].visto_em = "08/10/2026")));
  assert.ok(recusa((b) => ((b.materiais[0] as { tipo: string }).tipo = "tiktok")));
  // alvo: só http(s), arquivo do projeto ou @perfil (o link da tela nunca recebe javascript: nem data:)
  assert.ok(recusa((b) => (b.materiais[0].alvo = "javascript:alert(1)")));
  assert.ok(recusa((b) => (b.materiais[0].alvo = "data:text/html,oi")));
  assert.ok(recusa((b) => (b.materiais[0].alvo = "/etc/passwd")));
  assert.ok(!recusa((b) => (b.materiais[0].alvo = "@padaria.exemplo")));
  // igual ao RE_ALVO do marca_dados.py: perfil só com letra sem acento, dígito, _ e .
  assert.ok(recusa((b) => (b.materiais[0].alvo = "@confeitaria_joão")));
  assert.ok(!recusa((b) => (b.materiais[0].alvo = "contexto/fontes-originais/apresentacao.pptx")));
});

test("rejeita eixo de voz errado, repetido, posição fora de 1 a 5 e mais de 5 palavras", () => {
  const v = (f: (b: typeof VOZ) => void) => {
    const b = clone(VOZ);
    f(b);
    return validarBloco(b) === null;
  };
  assert.ok(v((b) => ((b.escalas[0] as { eixo: string }).eixo = "alto-baixo")));
  assert.ok(v((b) => (b.escalas[1].eixo = "formal-casual")));
  for (const p of [0, 6, 2.5, -1]) assert.ok(v((b) => (b.escalas[0].posicao = p)), String(p));
  assert.ok(v((b) => (b.palavras = ["a", "b", "c", "d", "e", "f"])));
});

test("rejeita arquivo de logo fora de empresa/marca, com .. , com extensão ruim ou papel desconhecido", () => {
  const l = (arquivo: string, papel = "principal") => validarBloco({ ...clone(LOGO), arquivos: [{ papel, arquivo }] }) === null;
  assert.ok(l("empresa/marca/../../segredo.png"));
  assert.ok(l("empresa/marca/logo/a..b.png"));
  assert.ok(l("../empresa/marca/logo.png"));
  assert.ok(l("/empresa/marca/logo.png"));
  assert.ok(l("outra/pasta/logo.png"));
  assert.ok(l("empresa/marca/logo.exe"));
  assert.ok(l("empresa/marca/Logo.png"), "maiúscula fora da regex");
  assert.ok(l("empresa/marca/logo/logo.png", "banner"));
  assert.ok(!l("empresa/marca/logo/logo-principal.png"));
  assert.ok(!l("empresa/marca/logo/logo.svg", "svg"));
  assert.equal(arquivoLogoValido("empresa/marca/a b.png"), false);
});

test("dividirSecoes: separa por ## , tira o número do título e ignora ## dentro de código", () => {
  const texto = [
    "# Título",
    "intro solta",
    "## 1. Plataforma da marca",
    "Texto um.",
    "## 4. Cores",
    "```",
    "## isto é código, não seção",
    "```",
    "Texto cores.",
    "## Anexo",
    "### O que o dono disse",
    "fala",
  ].join("\n");
  const s = dividirSecoes(texto);
  assert.deepEqual(s.map((x) => x.chave), ["plataforma da marca", "cores", "anexo"]);
  assert.deepEqual(s.map((x) => x.titulo), ["Plataforma da marca", "Cores", "Anexo"]);
  assert.match(s[1].corpo, /isto é código/);
  assert.match(s[2].corpo, /### O que o dono disse/);
});

test("normalizarTitulo: sem número, sem acento, minúsculo", () => {
  assert.equal(normalizarTitulo("2. Personalidade e Arquétipo"), "personalidade e arquetipo");
  assert.equal(normalizarTitulo("7. Aplicações"), "aplicacoes");
  assert.equal(normalizarTitulo("Dados para o sistema"), "dados para o sistema");
});

function documentos() {
  const id = `# Identidade\n\n## 1. Plataforma da marca\nPropósito claro.\n\n## 4. Cores\nTabela.\n\n## 9. Fontes\n- [1] site\n\n## Anexo\nfala\n\n${comBloco(IDENTIDADE)}`;
  const voz = `# Voz\n\n## 1. Como a marca soa\nPróxima.\n\n## 9. Fontes\n- [1] site\n\n${comBloco(VOZ)}`;
  const logo = `# Logo\n\n${comBloco(LOGO)}`;
  return [
    { id: "i", titulo: "Identidade", texto: id, publicado_em: "2026-10-08T12:00:00Z" },
    { id: "v", titulo: "Voz", texto: voz, publicado_em: "2026-10-08T11:00:00Z" },
    { id: "l", titulo: "Logo", texto: logo, publicado_em: "2026-10-08T10:00:00Z" },
  ];
}

test("juntarMarca: junta identidade + voz + logo; anexo e dados ficam fora das seções", () => {
  const m = juntarMarca(documentos())!;
  assert.ok(m.identidade && m.voz && m.logo);
  assert.deepEqual(m.identidade.secoes.map((s) => s.chave), ["plataforma da marca", "cores", "fontes"]);
  assert.deepEqual(m.voz.secoes.map((s) => s.chave), ["como a marca soa", "fontes"]);
  assert.equal(m.documentos.length, 3);
  assert.deepEqual(arquivosDeLogo(m).map((a) => a.papel), ["principal", "icone"]);
});

test("juntarMarca: documento sem bloco válido é ignorado; nenhum válido devolve null (cai no texto)", () => {
  const docs = documentos();
  docs[0] = { ...docs[0], texto: docs[0].texto.replace("#1F4E79", "azul") };
  const m = juntarMarca(docs)!;
  assert.equal(m.identidade, null);
  assert.ok(m.voz);
  assert.equal(juntarMarca([{ id: "x", titulo: "Antigo", texto: "Tom de voz: simples.", publicado_em: "2026-10-01T00:00:00Z" }]), null);
  assert.equal(juntarMarca([]), null);
});

test("arquivosDeLogo: no máximo 6, sem repetir", () => {
  const arquivos = Array.from({ length: 9 }, (_, i) => ({ papel: "principal", arquivo: `empresa/marca/logo/l${i}.png` }));
  arquivos.push({ papel: "icone", arquivo: "empresa/marca/logo/l0.png" });
  const m = juntarMarca([{ id: "l", titulo: "Logo", texto: comBloco({ ...LOGO, arquivos: arquivos.slice(0, 9) }), publicado_em: "2026-10-08T10:00:00Z" }])!;
  assert.equal(arquivosDeLogo(m).length, 6);
});

test("divisoesComConteudo: só as que têm conteúdo, na ordem fixa", () => {
  const m = juntarMarca(documentos())!;
  assert.deepEqual(divisoesComConteudo(m, true), ["personalidade", "essencia", "logo", "cores", "tipografia", "voz", "fontes"].sort((a, b) => ordem(a) - ordem(b)));
  assert.ok(!divisoesComConteudo(m, false).includes("logo"));
  assert.ok(!divisoesComConteudo(m, true).includes("imagem"));
});
function ordem(id: string) {
  return ["essencia", "personalidade", "logo", "cores", "tipografia", "imagem", "aplicacoes", "voz", "regras", "fontes"].indexOf(id);
}

test("urlGoogleFonts: monta o css2 só com família válida do Google; sem Google devolve null", () => {
  const f = (familia: string, fonte: "google" | "sistema" | "outra", pesos: number[]) => ({ uso: "titulos" as const, familia, pesos, fonte, licenca: "OFL" as const, origem: null });
  assert.equal(
    urlGoogleFonts([f("Source Sans 3", "google", [600, 400]), f("Montserrat", "google", [700, 600])]),
    "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&family=Montserrat:wght@600;700&display=swap",
  );
  assert.equal(urlGoogleFonts([f("Arial", "sistema", [400]), f("Minha", "outra", [])]), null);
  assert.equal(urlGoogleFonts([f("Mont<b", "google", [400])]), null, "família inválida nunca vira link");
  assert.equal(urlGoogleFonts([f("Lato", "google", [])]), "https://fonts.googleapis.com/css2?family=Lato&display=swap");
});

test("pilhaDaFamilia e razaoTexto", () => {
  assert.match(pilhaDaFamilia("Montserrat"), /^"Montserrat", ui-sans-serif/);
  assert.doesNotMatch(pilhaDaFamilia('x";}'), /x/);
  assert.equal(razaoTexto(11.2), "11,2:1");
  assert.equal(razaoTexto(4.72), "4,72:1");
});

test("o exemplo do seed (Padaria Exemplo) passa na validação e abre todas as divisões do plano", () => {
  const sql = readFileSync(new URL("../../supabase/seed_exemplo.sql", import.meta.url), "utf8");
  const textos = [...sql.matchAll(/\$md\$([\s\S]*?)\$md\$/g)].map((m) => m[1]);
  assert.equal(textos.length, 2, "identidade e voz");
  const docs = textos.map((texto, i) => ({ id: `s${i}`, titulo: `Seed ${i}`, texto, publicado_em: "2026-10-08T00:00:00Z" }));
  const m = juntarMarca(docs)!;
  assert.ok(m?.identidade && m.voz, "os dois blocos do seed são válidos");
  assert.equal(m.identidade.dados.cores.length, 5);
  assert.deepEqual(divisoesComConteudo(m, false), ["essencia", "personalidade", "logo", "cores", "tipografia", "imagem", "aplicacoes", "voz", "regras", "fontes"]);
  // todo par aponta para cores que existem
  const nomes = new Set(m.identidade.dados.cores.map((c) => c.nome));
  for (const p of m.identidade.dados.pares) assert.ok(nomes.has(p.texto) && nomes.has(p.fundo), `${p.texto}/${p.fundo}`);
});

test("linkDoMaterial: só http(s) vira link; arquivo do projeto, @perfil e javascript: ficam como texto", () => {
  assert.equal(linkDoMaterial("https://padaria.example"), "https://padaria.example");
  assert.equal(linkDoMaterial("http://padaria.example/sobre"), "http://padaria.example/sobre");
  assert.equal(linkDoMaterial("contexto/fontes-originais/apresentacao.pptx"), null);
  assert.equal(linkDoMaterial("@padaria"), null);
  assert.equal(linkDoMaterial("javascript:alert(1)"), null);
  assert.equal(linkDoMaterial("https://com espaço"), null);
});

test("hexDaCor: só devolve HEX que passa na regex (cor que chega ao style da tela)", () => {
  const cores = [
    { nome: "Boa", hex: "#1F4E79", funcao: "principal", origem: "logo" },
    { nome: "Ruim", hex: "red;background:url(x)", funcao: "apoio", origem: "logo" },
  ] as Parameters<typeof hexDaCor>[0];
  assert.equal(hexDaCor(cores, "Boa"), "#1F4E79");
  assert.equal(hexDaCor(cores, "Ruim"), null);
  assert.equal(hexDaCor(cores, "Nenhuma"), null);
});

