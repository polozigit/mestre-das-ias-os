import test from "node:test";
import assert from "node:assert/strict";
import { formatarData, tempoRelativo } from "./format.ts";

/* Âncora fixa: os testes nunca dependem do relógio da máquina. */
const AGORA = new Date("2026-08-26T12:00:00-03:00");

test("tempoRelativo: nulo/indefinido vira travessão", () => {
  assert.equal(tempoRelativo(null, AGORA), "—");
  assert.equal(tempoRelativo(undefined, AGORA), "—");
});

test("tempoRelativo: minutos no passado", () => {
  assert.equal(tempoRelativo("2026-08-26T11:57:00-03:00", AGORA), "há 3 min.");
});

test("tempoRelativo: horas no passado", () => {
  assert.equal(tempoRelativo("2026-08-26T10:00:00-03:00", AGORA), "há 2 h");
});

test("tempoRelativo: ontem (numeric auto)", () => {
  assert.equal(tempoRelativo("2026-08-25T12:00:00-03:00", AGORA), "ontem");
});

test("tempoRelativo: futuro em horas", () => {
  assert.equal(tempoRelativo("2026-08-26T14:00:00-03:00", AGORA), "em 2 h");
});

test("tempoRelativo: acima de 30 dias cai pra data em dia/mês/ano", () => {
  assert.equal(tempoRelativo("2026-01-15T18:00:00Z", AGORA), "15/01/2026");
});

test("formatarData: dia/mês/ano com dois dígitos, nunca ISO nem mês por extenso", () => {
  assert.equal(formatarData("2026-05-12"), "12/05/2026");
  assert.equal(formatarData("2026-10-07"), "07/10/2026");
});

test("formatarData: YMD puro não rola de dia no fuso SP", () => {
  // Sem a âncora de meio-dia UTC, "2026-01-01" formataria como 31/12/2025.
  assert.equal(formatarData("2026-01-01"), "01/01/2026");
});

test("formatarData: timestamp completo formata no fuso SP", () => {
  // 02:00 UTC do dia 13 ainda é dia 12 em São Paulo (UTC-3).
  assert.equal(formatarData("2026-05-13T02:00:00Z"), "12/05/2026");
});

test("formatarData: nulo vira travessão", () => {
  assert.equal(formatarData(null), "—");
});
