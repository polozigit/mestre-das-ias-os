import { formatarDataHora, tempoRelativo } from "@/lib/format";

/**
 * Tempo relativo ("há 3 min.") com hidratação segura.
 *
 * `tempoRelativo` arredonda a distância até agora, e "agora" no servidor não é
 * "agora" na hidratação. Basta o arredondamento cruzar a metade do minuto entre
 * os dois para o servidor mandar "há 2 min." e o client renderizar "há 3 min." —
 * texto diferente no mesmo nó, que é o React #418. Com uma lista de dezenas de
 * itens a chance de pelo menos um cruzar deixa de ser desprezível.
 *
 * `suppressHydrationWarning` é o mecanismo do React para conteúdo legitimamente
 * dependente de tempo: silencia a comparação nesse nó, sem esconder o valor nem
 * adiar nada para depois do mount. Vale só um nível de profundidade, então o
 * texto tem que ser filho DIRETO deste span.
 *
 * O `title` (dica ao passar o mouse) traz a data e a hora certas em dia/mês/ano ("12/05/2026, 14:30"):
 * o texto relativo arredonda, a dica conta a verdade.
 */
export function TempoRelativo({
  iso,
  className,
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  return (
    <span className={className} title={iso ? formatarDataHora(iso) : undefined} suppressHydrationWarning>
      {tempoRelativo(iso)}
    </span>
  );
}
