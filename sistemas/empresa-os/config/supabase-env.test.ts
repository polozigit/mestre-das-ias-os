import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chavePublicaSupabase,
  envPublicoDoBuild,
  ErroConfigSupabase,
  lerConfigPublica,
  lerConfigPublicaOuNada,
  mensagemFaltaConfig,
  NOMES_CHAVE_PUBLICA,
  NOMES_URL,
  urlSupabase,
} from "./supabase-env.mjs";
import {
  chaveSecretaSupabase,
  lerConfigServico,
  mensagemFaltaConfigServico,
  NOMES_CHAVE_SECRETA,
} from "./supabase-env-servidor.mjs";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

// Valores de mentira, montados em partes pra nenhum scanner de segredo achar que é chave.
const URL_A = "https://aaaa" + ".supabase.co";
const URL_B = "https://bbbb" + ".supabase.co";
const PUB_A = "publica-" + "a";
const PUB_B = "publica-" + "b";
const SEC_A = "secreta-" + "a";
const SEC_B = "secreta-" + "b";

// ---------------------------------------------------------------- nomes aceitos

test("a lista de nomes aceitos tem os dois nomes de cada variável, o antigo primeiro", () => {
  assert.deepEqual([...NOMES_URL], ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);
  assert.deepEqual([...NOMES_CHAVE_PUBLICA], ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"]);
  assert.deepEqual([...NOMES_CHAVE_SECRETA], ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]);
});

test("nomes antigos continuam funcionando (quem já roda não muda)", () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: URL_A,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: PUB_A,
    SUPABASE_SERVICE_ROLE_KEY: SEC_A,
  };
  assert.deepEqual(lerConfigPublica(env), { url: URL_A, chavePublica: PUB_A });
  assert.deepEqual(lerConfigServico(env), { url: URL_A, chaveSecreta: SEC_A });
});

test("nomes novos da integração Supabase -> Vercel funcionam (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY)", () => {
  const env = { SUPABASE_URL: URL_B, SUPABASE_PUBLISHABLE_KEY: PUB_B, SUPABASE_SECRET_KEY: SEC_B };
  assert.deepEqual(lerConfigPublica(env), { url: URL_B, chavePublica: PUB_B });
  assert.deepEqual(lerConfigServico(env), { url: URL_B, chaveSecreta: SEC_B });
});

test("com os dois nomes preenchidos, o antigo (primeiro da lista) vence", () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: URL_A,
    SUPABASE_URL: URL_B,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: PUB_A,
    SUPABASE_PUBLISHABLE_KEY: PUB_B,
    SUPABASE_SERVICE_ROLE_KEY: SEC_A,
    SUPABASE_SECRET_KEY: SEC_B,
  };
  assert.equal(urlSupabase(env), URL_A);
  assert.equal(chavePublicaSupabase(env), PUB_A);
  assert.equal(chaveSecretaSupabase(env), SEC_A);
});

test("nome vazio ou só com espaço não conta: cai pro outro nome", () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_URL: `  ${URL_B}\n`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "   ",
    SUPABASE_PUBLISHABLE_KEY: PUB_B,
  };
  assert.equal(urlSupabase(env), URL_B);
  assert.equal(chavePublicaSupabase(env), PUB_B);
});

test("misturar um nome antigo com um novo também funciona", () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: URL_A, SUPABASE_PUBLISHABLE_KEY: PUB_B };
  assert.deepEqual(lerConfigPublica(env), { url: URL_A, chavePublica: PUB_B });
});

// ---------------------------------------------------------------- erro claro

test("faltando tudo: o erro diz os DOIS nomes aceitos de cada variável", () => {
  assert.throws(
    () => lerConfigPublica({}),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroConfigSupabase);
      for (const nome of [...NOMES_URL, ...NOMES_CHAVE_PUBLICA]) {
        assert.ok(erro.message.includes(nome), `a mensagem não cita ${nome}: ${erro.message}`);
      }
      return true;
    },
  );
});

test("faltando só a chave pública: a mensagem cita a chave e não reclama da URL", () => {
  assert.throws(
    () => lerConfigPublica({ SUPABASE_URL: URL_B }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroConfigSupabase);
      assert.ok(erro.message.includes("SUPABASE_PUBLISHABLE_KEY"));
      assert.ok(!erro.message.includes("a URL do projeto"), erro.message);
      return true;
    },
  );
});

test("lerConfigPublicaOuNada não lança: devolve undefined no que falta", () => {
  assert.deepEqual(lerConfigPublicaOuNada({}), { url: undefined, chavePublica: undefined });
  assert.deepEqual(lerConfigPublicaOuNada({ SUPABASE_URL: URL_B }), { url: URL_B, chavePublica: undefined });
});

test("service-role faltando: o erro cita os dois nomes da chave de serviço e o da URL", () => {
  assert.throws(
    () => lerConfigServico({}),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroConfigSupabase);
      for (const nome of [...NOMES_URL, ...NOMES_CHAVE_SECRETA]) {
        assert.ok(erro.message.includes(nome), `a mensagem não cita ${nome}: ${erro.message}`);
      }
      return true;
    },
  );
});

test("nenhuma mensagem de erro repete valor de variável", () => {
  const env = { SUPABASE_URL: URL_B, SUPABASE_SECRET_KEY: "" };
  assert.throws(() => lerConfigPublica(env), (erro: unknown) => !(erro as Error).message.includes(URL_B));
  assert.throws(() => lerConfigServico({ SUPABASE_SECRET_KEY: SEC_B }), (erro: unknown) => !(erro as Error).message.includes(SEC_B));
  assert.ok(!mensagemFaltaConfig({ url: true, chavePublica: true }).includes("https://"));
  assert.ok(!mensagemFaltaConfigServico({ url: true, chaveSecreta: true }).includes("https://"));
});

// ---------------------------------------------------------------- navegador (next.config)

test("envPublicoDoBuild: nome novo vira o NEXT_PUBLIC_ que o navegador lê", () => {
  assert.deepEqual(envPublicoDoBuild({ SUPABASE_URL: URL_B, SUPABASE_PUBLISHABLE_KEY: PUB_B }), {
    NEXT_PUBLIC_SUPABASE_URL: URL_B,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: PUB_B,
  });
});

test("envPublicoDoBuild: sem variável nenhuma não define nada (comportamento de antes)", () => {
  assert.deepEqual(envPublicoDoBuild({}), {});
});

test("envPublicoDoBuild: chave secreta NUNCA entra, nem com nome NEXT_PUBLIC_ (C4)", () => {
  const saida = envPublicoDoBuild({
    SUPABASE_URL: URL_B,
    SUPABASE_PUBLISHABLE_KEY: PUB_B,
    SUPABASE_SECRET_KEY: SEC_B,
    SUPABASE_SERVICE_ROLE_KEY: SEC_A,
  });
  assert.deepEqual(Object.keys(saida).sort(), ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
  assert.ok(!Object.values(saida).some((v) => v === SEC_A || v === SEC_B));
});

test("next.config.ts publica o valor das variáveis sem prefixo no pacote do navegador", async () => {
  const guardado = { ...process.env };
  try {
    for (const nome of [...NOMES_URL, ...NOMES_CHAVE_PUBLICA, ...NOMES_CHAVE_SECRETA]) delete process.env[nome];
    process.env.SUPABASE_URL = URL_B;
    process.env.SUPABASE_PUBLISHABLE_KEY = PUB_B;
    process.env.SUPABASE_SECRET_KEY = SEC_B;
    const { default: config } = (await import(`../next.config.ts?com-variaveis=${Date.now()}`)) as {
      default: { env?: Record<string, string> };
    };
    assert.deepEqual(config.env, { NEXT_PUBLIC_SUPABASE_URL: URL_B, NEXT_PUBLIC_SUPABASE_ANON_KEY: PUB_B });
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    const { default: semVariaveis } = (await import(`../next.config.ts?sem-variaveis=${Date.now()}`)) as {
      default: { env?: Record<string, string> };
    };
    assert.deepEqual(semVariaveis.env, {});
  } finally {
    for (const chave of Object.keys(process.env)) if (!(chave in guardado)) delete process.env[chave];
    Object.assign(process.env, guardado);
  }
});

// ---------------------------------------------------------------- C4: chave secreta fora do navegador

const NOMES_SECRETOS = [...NOMES_CHAVE_SECRETA];

test("C4: nenhum nome aceito com NEXT_PUBLIC_ tem SERVICE, SECRET, TOKEN ou PASSWORD; o único _KEY é o ANON_KEY", () => {
  const publicos = [...NOMES_URL, ...NOMES_CHAVE_PUBLICA, ...NOMES_SECRETOS].filter((n) => n.startsWith("NEXT_PUBLIC_"));
  assert.ok(publicos.length > 0);
  for (const nome of publicos) {
    assert.ok(!/SERVICE|SECRET|TOKEN|PASSWORD/.test(nome), `${nome} é NEXT_PUBLIC_ com nome de segredo`);
    if (nome.includes("_KEY")) assert.equal(nome, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  for (const nome of NOMES_SECRETOS) assert.ok(!nome.startsWith("NEXT_PUBLIC_"), `${nome} não pode ser público`);
});

function arquivosDe(pasta: string): string[] {
  return readdirSync(join(RAIZ, pasta)).flatMap((nome) => {
    const rel = join(pasta, nome);
    return statSync(join(RAIZ, rel)).isDirectory() ? arquivosDe(rel) : [rel];
  });
}
// import (estático ou dinâmico) do módulo do servidor; citar o nome num comentário não conta
const IMPORTA_MODULO_DO_SERVIDOR = /(?:from|import\()\s*["'][^"']*supabase-env-servidor/;
const CODIGO = (rel: string) => /\.(ts|tsx|mjs)$/.test(rel) && !/\.test\.(ts|tsx)$/.test(rel);
const DO_APP = [...arquivosDe("src"), ...arquivosDe("scripts")].filter(CODIGO);

test("C4: o que o navegador carrega (config pública, env.ts, client.ts, next.config.ts) não cita nome de chave secreta", () => {
  const publicos = ["config/supabase-env.mjs", "src/lib/supabase/env.ts", "src/lib/supabase/client.ts", "next.config.ts"];
  for (const rel of publicos) {
    const texto = ler(rel);
    for (const nome of NOMES_SECRETOS) assert.ok(!texto.includes(nome), `${rel} cita ${nome}`);
    assert.ok(!IMPORTA_MODULO_DO_SERVIDOR.test(texto), `${rel} importa o módulo do servidor`);
    assert.ok(!/NEXT_PUBLIC_[A-Z0-9_]*(SERVICE|SECRET)/.test(texto), `${rel} tem NEXT_PUBLIC_ com nome de segredo`);
  }
});

test("C4: arquivo com \"use client\" não toca chave secreta, módulo do servidor nem o service client", () => {
  const deCliente = DO_APP.filter((rel) => /^\s*(["'])use client\1/.test(ler(rel)));
  assert.ok(deCliente.length > 0, "nenhum componente de cliente achado: o teste não teria o que cobrir");
  for (const rel of deCliente) {
    const texto = ler(rel);
    for (const nome of NOMES_SECRETOS) assert.ok(!texto.includes(nome), `${rel} (use client) cita ${nome}`);
    assert.ok(!IMPORTA_MODULO_DO_SERVIDOR.test(texto), `${rel} (use client) importa o módulo do servidor`);
    assert.ok(!/lib\/supabase\/service|createServiceClient/.test(texto), `${rel} (use client) usa o service client`);
  }
});

// ---------------------------------------------------------------- um leitor só

test("todo ponto de leitura passa pelo leitor único: ninguém lê as variáveis do Supabase direto", () => {
  const leituraDireta = /process\.env\.(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)\b/;
  const achados = DO_APP.filter((rel) => leituraDireta.test(ler(rel)));
  // única exceção: as 2 leituras LITERAIS do navegador (o Next só troca process.env.NEXT_PUBLIC_X por extenso)
  assert.deepEqual(achados, [join("src", "lib", "supabase", "env.ts")]);
  const literais = ler("src/lib/supabase/env.ts").match(new RegExp(leituraDireta.source, "g")) ?? [];
  assert.deepEqual(literais.sort(), [
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "process.env.NEXT_PUBLIC_SUPABASE_URL",
  ]);
});
