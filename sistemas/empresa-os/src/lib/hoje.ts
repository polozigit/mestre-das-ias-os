/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo. Fora do render: o relógio é lido numa função nomeada. */
export function hojeSaoPauloISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
