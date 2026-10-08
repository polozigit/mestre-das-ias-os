/**
 * Lógica pura de Markdown.tsx (pacote/playbook) — sem React. `realce()`, no
 * componente, aplica `chipsDeTexto` recursivamente em toda folha de texto de
 * uma árvore já renderizada pelo react-markdown. Sem esta guarda, ele
 * reprocessa nós que JÁ chamam realce() sozinhos ou que JÁ SÃO um chip,
 * produzindo chip dentro de chip (docs/superpowers/specs/2026-09-28-organograma-painel-design-criterios.md,
 * critério C7, correção P0-2).
 */
export function devePularRealce(
  tipo: unknown,
  props: Record<string, unknown> | null | undefined,
): boolean {
  // Elemento cujo tipo não é string (o Renderer de p/li/strong/etc. criado
  // por R(tag) em Markdown.tsx) já chama realce() nos próprios filhos —
  // reprocessar aqui duplicaria o trabalho e quebraria de novo o texto que
  // já virou chip.
  if (typeof tipo !== "string") return true;
  // Elemento HTML que já É um chip de marca (criado por chipsDeTexto,
  // marcado com data-marca) — reprocessar o texto de dentro dele encaixaria
  // um 2º chip dentro do 1º.
  return !!props && Object.prototype.hasOwnProperty.call(props, "data-marca");
}
