/**
 * Remonta a cada troca de página (é o que o `template` do Next faz, ao contrário do `layout`): a
 * página nova chega de leve em vez de piscar no lugar. Só CSS (`.entrada-pagina` em globals.css).
 * Mudar só a query (?trilha=, ?sistema=1) não remonta: filtro e aba não repetem a entrada.
 */
export default function ModeloDaPagina({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="entrada-pagina">{children}</div>;
}
