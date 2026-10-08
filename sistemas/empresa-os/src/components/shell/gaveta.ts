/**
 * A gaveta do menu no celular fica fora da tela quando fechada, mas continuaria
 * no tab order (teclado e leitor de tela entrariam em links invisíveis).
 * `inert` tira a gaveta fechada do foco e da árvore de acessibilidade.
 * No desktop (lg+) o menu é uma coluna fixa: SEMPRE interativo.
 */
export const QUERY_DESKTOP = "(min-width: 1024px)";

export function gavetaInerte(aberta: boolean, desktop: boolean): boolean {
  return !desktop && !aberta;
}
