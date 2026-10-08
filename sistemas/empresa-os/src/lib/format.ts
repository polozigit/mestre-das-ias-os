/* Helpers de formatação de data/hora em pt-BR, sempre no fuso de São Paulo.
   Timestamps do banco são tz-aware; forçar o timeZone evita formatar no UTC
   do servidor e exibir horário 3h atrás do real na UI. */

const SP_TZ = "America/Sao_Paulo";

const RTF = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto", style: "narrow" });

// Toda data absoluta da tela sai assim: dia/mês/ano com dois dígitos ("12/05/2026").
const DATA_BR = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric",
  timeZone: SP_TZ,
});
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit",
  timeZone: SP_TZ,
});

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converte string ISO em Date. Data "pura" (YYYY-MM-DD, coluna DATE do banco)
 * é ancorada ao MEIO-DIA UTC: sem isso, um servidor em UTC cria
 * "2026-05-12 00:00:00 UTC", que o formatter de São Paulo (UTC-3) lê como
 * "2026-05-11 21:00" e mostra o dia errado (11/05).
 */
export function parseYmd(iso: string): Date {
  if (SO_DATA.test(iso)) {
    const [ano, mes, dia] = iso.split("-").map(Number);
    return new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
  }
  return new Date(iso);
}

/** Data em dia/mês/ano: "12/05/2026" (fuso SP). Nulo ou vazio devolve o mesmo marcador de vazio dos outros formatadores. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATA_BR.format(parseYmd(iso));
}

/** Data + hora numéricas: "12/05/2026, 14:30" (fuso SP). Nulo/vazio vira "—". */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATA_HORA.format(new Date(iso));
}

/**
 * Tempo relativo curto em pt-BR: "há 3 min.", "há 2 h", "ontem", "em 2 h".
 * Acima de ~30 dias cai para a data em dia/mês/ano ("15/01/2026"): distância
 * grande em dias vira ruído. O parâmetro `agora` existe para teste determinístico.
 */
export function tempoRelativo(iso: string | null | undefined, agora = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = d.getTime() - agora.getTime();
  const diffMin = Math.round(diffMs / 60000);
  const diffH = Math.round(diffMs / 3600000);
  const diffD = Math.round(diffMs / 86400000);
  if (Math.abs(diffMin) < 60) return RTF.format(diffMin, "minute");
  if (Math.abs(diffH) < 24) return RTF.format(diffH, "hour");
  if (Math.abs(diffD) < 30) return RTF.format(diffD, "day");
  return DATA_BR.format(d);
}
