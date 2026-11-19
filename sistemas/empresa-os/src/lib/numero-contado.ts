/**
 * O valor de um KpiCard pode contar de 0 até o número? Só quando é um inteiro simples, sozinho ou
 * seguido de "%": o contador do CSS (`counter()`) não escreve separador de milhar, vírgula nem moeda,
 * então "R$ 1.234,50" e "12.345" ficam parados, do jeito que chegaram.
 */
export type NumeroContado = { ate: number; sufixo: string };

const LIMITE = 9999;

export function numeroContado(valor: string | number): NumeroContado | null {
  const texto = String(valor).trim();
  const partes = /^(\d{1,4})(%?)$/.exec(texto);
  if (!partes) return null;
  const ate = Number(partes[1]);
  // Zero não conta nada e "007" perderia os zeros da frente no contador.
  if (ate === 0 || ate > LIMITE || String(ate) !== partes[1]) return null;
  return { ate, sufixo: partes[2] };
}
