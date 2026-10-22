import test from "node:test";
import assert from "node:assert/strict";
import { filtrarConversas, permiteAcao, rascunhoValido, tipoDoArquivo, estadoLegivel } from "./modelo.ts";
import { moduloDaRota } from "../auth/permissoes.ts";

const conversas = [
  { id: "a", conta_id: "um", nome: "Ágata", jid: "123@s.whatsapp.net", grupo: false, estado: "aberta", responsavel_id: "eu", nao_lidas: 2, ultima_em: "2026-10-21T12:00:00Z", ultima_mensagem: "Cotação", versao: 3 },
  { id: "b", conta_id: "dois", nome: "Equipe", jid: "456@g.us", grupo: true, estado: "pendente", responsavel_id: null, nao_lidas: 0, ultima_em: "2026-10-21T13:00:00Z", ultima_mensagem: "Reunião", versao: 1 },
  { id: "c", conta_id: "um", nome: "Bruno", jid: "789@s.whatsapp.net", grupo: false, estado: "resolvida", responsavel_id: "outro", nao_lidas: 1, ultima_em: "2026-10-20T13:00:00Z", ultima_mensagem: "Ok", versao: 2 },
];
test("combina conta, busca sem acento, estado, responsável e não lidas", () => {
  assert.deepEqual(filtrarConversas(conversas, { conta: "um", busca: "agata", estado: "aberta", responsavel: "minhas", naoLidas: true, grupos: false }, "eu").map(x => x.id), ["a"]);
});
test("fila sem responsável e grupos não inclui atendimentos individuais", () => {
  assert.deepEqual(filtrarConversas(conversas, { responsavel: "sem", grupos: true }, "eu").map(x => x.id), ["b"]);
});
test("conversas mais recentes vêm primeiro sem alterar a origem", () => {
  assert.deepEqual(filtrarConversas(conversas, {}, "eu").map(x => x.id), ["b", "a", "c"]);
  assert.equal(conversas[0].id, "a");
});
test("capacidade ausente ou falsa bloqueia ação e capacidade declarada libera", () => {
  assert.equal(permiteAcao(undefined, "edit"), false);
  assert.equal(permiteAcao({ edit: false }, "edit"), false);
  assert.equal(permiteAcao({ edit: true }, "edit"), true);
});
test("nova mensagem ou mudança de política impede aprovação do rascunho", () => {
  assert.equal(rascunhoValido({ estado: "pendente", conversa_versao: 3, politica_versao: 2 }, 3, 2), true);
  assert.equal(rascunhoValido({ estado: "pendente", conversa_versao: 3, politica_versao: 2 }, 4, 2), false);
  assert.equal(rascunhoValido({ estado: "pendente", conversa_versao: 3, politica_versao: 2 }, 3, 3), false);
  assert.equal(rascunhoValido({ estado: "aprovado", conversa_versao: 3, politica_versao: 2 }, 3, 2), false);
});
test("identifica arquivos e mantém incerto diferente de enviado", () => {
  assert.equal(tipoDoArquivo("application/pdf"), "document");
  assert.equal(tipoDoArquivo("image/webp"), "image");
  assert.equal(tipoDoArquivo("audio/webm"), "audio");
  assert.equal(tipoDoArquivo("video/mp4"), "video");
  assert.match(estadoLegivel("incerto"), /confirmado/i);
  assert.equal(estadoLegivel("pendente"), "Na fila");
});
test("configuração de números exige módulo específico mesmo abaixo de configurações", () => {
  assert.equal(moduloDaRota("/configuracoes/whatsapp"), "whatsapp");
  assert.equal(moduloDaRota("/mensagens/abc"), "mensagens");
});
