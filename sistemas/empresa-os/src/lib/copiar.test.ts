import test from "node:test";
import assert from "node:assert/strict";
import { AVISO_DO_BOTAO, copiarTexto, MS_DO_AVISO_DE_COPIA, ROTULO_DO_BOTAO } from "./copiar.ts";

test("copia pela área de transferência do navegador e devolve true", async () => {
  const copiados: string[] = [];
  const ok = await copiarTexto("Me ajude a criar as contas.\nUma de cada vez.", {
    clipboard: { writeText: async (t) => void copiados.push(t) },
  });
  assert.equal(ok, true);
  assert.deepEqual(copiados, ["Me ajude a criar as contas.\nUma de cada vez."]);
});

test("a área de transferência recusa (sem https, sem permissão): cai no plano B e copia mesmo assim", async () => {
  const copiados: string[] = [];
  const ok = await copiarTexto("texto", {
    clipboard: { writeText: async () => Promise.reject(new Error("NotAllowedError")) },
    copiarPorSelecao: (t) => (copiados.push(t), true),
  });
  assert.equal(ok, true);
  assert.deepEqual(copiados, ["texto"]);
});

test("navegador sem a API moderna usa só o plano B", async () => {
  const ok = await copiarTexto("texto", { clipboard: null, copiarPorSelecao: () => true });
  assert.equal(ok, true);
});

test("sem nenhum dos dois, não finge: devolve false", async () => {
  assert.equal(await copiarTexto("texto", {}), false);
  assert.equal(await copiarTexto("texto", { clipboard: null, copiarPorSelecao: null }), false);
});

test("plano B que falha ou lança também devolve false, nunca estoura", async () => {
  assert.equal(await copiarTexto("texto", { copiarPorSelecao: () => false }), false);
  assert.equal(
    await copiarTexto("texto", { copiarPorSelecao: () => { throw new Error("execCommand"); } }),
    false,
  );
  assert.equal(
    await copiarTexto("texto", {
      clipboard: { writeText: async () => Promise.reject(new Error("recusou")) },
      copiarPorSelecao: () => false,
    }),
    false,
  );
});

test("quando a API moderna funciona, o plano B nem é tentado", async () => {
  let chamou = false;
  await copiarTexto("texto", {
    clipboard: { writeText: async () => undefined },
    copiarPorSelecao: () => ((chamou = true), true),
  });
  assert.equal(chamou, false);
});

test('o botão diz "Copiar", depois "Copiado" por 2 segundos, ou avisa que não conseguiu', () => {
  assert.deepEqual(ROTULO_DO_BOTAO, { parado: "Copiar", copiado: "Copiado", falhou: "Não consegui copiar" });
  assert.equal(MS_DO_AVISO_DE_COPIA, 2000);
});

test("o leitor de tela anuncia o mesmo que o botão mostra, e parado não anuncia nada", () => {
  assert.deepEqual(AVISO_DO_BOTAO, {
    parado: "",
    copiado: "Texto copiado",
    falhou: "Não foi possível copiar. Selecione o texto e copie.",
  });
});
