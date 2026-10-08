/**
 * Saudação por hora do dia, SEMPRE no fuso de São Paulo — o servidor pode
 * rodar em UTC e "18h" lá é "15h" aqui; sem a âncora de fuso o "Boa noite"
 * chegaria 3 horas adiantado. Sem import de runtime de propósito: este
 * arquivo roda direto no node --test (alias "@/" não resolve lá).
 */

const HORA_SP = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: "America/Sao_Paulo",
});

/** "Bom dia" (5h–11h), "Boa tarde" (12h–17h), "Boa noite" (18h–4h). */
export function saudacao(agora: Date = new Date()): string {
  const hora = Number(HORA_SP.format(agora));
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** "Marcos Paulo da Silva" → "Marcos". Nome vazio devolve o original. */
export function primeiroNome(nomeCompleto: string): string {
  const primeiro = nomeCompleto.trim().split(/\s+/)[0];
  return primeiro || nomeCompleto;
}
