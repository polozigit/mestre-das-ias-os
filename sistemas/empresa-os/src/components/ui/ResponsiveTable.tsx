"use client";

import { useId, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ResponsiveColumn<T> = {
  /** Chave única da coluna. */
  key: string;
  /** Cabeçalho (vira o label `data-label` do card no mobile). */
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  /** Esconde a coluna no card mobile (mantém na tabela desktop). */
  mobileHidden?: boolean;
  /** Vira o título do card no mobile (full-width, sem label). */
  primary?: boolean;
  /** Se setado + `onSort`, a coluna é ordenável (mostra seta). */
  sortKey?: string;
  /**
   * Largura sugerida em px no desktop. Sem isso, `table` distribui o excesso
   * proporcional ao conteúdo — numa tabela de poucas colunas em tela larga,
   * pills e datas ficam boiando no meio da célula. Fixar as colunas de estado
   * devolve a folga pra coluna de texto variável (nome). Ignorado no card
   * mobile, onde a `<table>` re-layouta.
   */
  width?: number;
};

/**
 * Tabela responsiva: no mobile (<480px) vira card-stack via CSS `data-label`
 * (bloco `.rtable` em globals.css) — a `<table>` semântica fica intacta, só o
 * layout muda no breakpoint, sem useMediaQuery/JS (zero CLS, screen reader
 * mantém a semântica em >=480px).
 */
export function ResponsiveTable<T>({
  columns,
  data,
  getRowKey,
  sort,
  onSort,
  onRowClick,
  rowClassName,
  empty,
  className,
  dense = false,
}: {
  columns: ResponsiveColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  sort?: { key: string; asc: boolean };
  onSort?: (key: string) => void;
  /** Linha inteira clicável (abre drawer/navega). Também habilita Enter/Espaço via teclado. */
  onRowClick?: (row: T) => void;
  /** Classe extra por linha (ex. estado selecionado). */
  rowClassName?: (row: T) => string | undefined;
  empty?: ReactNode;
  className?: string;
  /** Fonte/padding reduzidos — tabelas com muitas colunas. */
  dense?: boolean;
}) {
  const sortSelectId = useId();

  const sortableCols = columns.filter((c) => c.sortKey);
  const showSortBar = !!onSort && sortableCols.length > 0;

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-fg-4">{empty ?? "Sem dados."}</div>
    );
  }

  return (
    <>
    {/* Ordenação no card-stack: <480px o `thead` é `display:none` (globals.css),
        então clicar em header é impossível e a tabela ficaria sem NENHUMA forma
        de ordenar no celular. Opções derivadas das próprias colunas — sem API nova. */}
    {showSortBar && (
      <div className="mb-2 flex items-center gap-2 px-4 min-[480px]:hidden">
        <label htmlFor={sortSelectId} className="sr-only">
          Ordenar por
        </label>
        <select
          id={sortSelectId}
          value={sort?.key ?? ""}
          onChange={(e) => onSort!(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md border border-borda bg-bg-elevada px-3 text-sm text-fg-2"
        >
          {!sort && <option value="">Ordenar por…</option>}
          {sortableCols.map((c) => (
            <option key={c.key} value={c.sortKey!}>
              {c.header}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => sort && onSort!(sort.key)}
          disabled={!sort}
          aria-label={
            sort?.asc
              ? "Ordem crescente — tocar para inverter"
              : "Ordem decrescente — tocar para inverter"
          }
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-borda text-fg-3 disabled:opacity-40"
        >
          {sort?.asc ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
        </button>
      </div>
    )}
    {/* overflow-x-auto SEMPRE ativo (não só <md) — tabela com muitas colunas
        precisa rolar mesmo em telas médias/desktop estreito; sem scroll nada
        além do previsível fica visível e não tem como puxar o resto. */}
    <div className={cn("rtable overflow-x-auto", className)}>
      <table className={cn("w-full", dense ? "text-[13px]" : "text-sm")}>
        <thead>
          <tr className="border-b border-borda-suave">
            {columns.map((c) => {
              const sortable = !!c.sortKey && !!onSort;
              // active SÓ quando há estado de sort ativo. Sem essa guarda, tabela
              // sem sort + coluna sem sortKey dá `undefined === undefined` => true =>
              // `sort!.asc` estoura (TypeError reading 'asc').
              const active = !!sort && sort.key === c.sortKey;
              return (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={
                    active ? (sort!.asc ? "ascending" : "descending") : undefined
                  }
                  className={cn(
                    "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-fg-4",
                    c.align === "right" ? "text-right" : "text-left",
                    active && "text-fg-1",
                  )}
                >
                  {/* Header ordenável é <button> de verdade, não <th onClick>:
                      senão não recebe foco nem responde a Enter/Espaço, e ordenar
                      fica inacessível por teclado. min-h-11 dá alvo de 44px onde
                      o thead aparece no toque. */}
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort!(c.sortKey!)}
                      className={cn(
                        "inline-flex min-h-11 select-none items-center gap-1 hover:text-fg-1 md:min-h-0",
                        c.align === "right" && "justify-end",
                      )}
                    >
                      {c.header}
                      {/* seta mostra a DIREÇÃO quando ativa (o ícone neutro não
                          diz o sentido) */}
                      {active ? (
                        sort!.asc ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                      ) : (
                        <ArrowUpDown size={10} className="text-fg-4" />
                      )}
                    </button>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        c.align === "right" && "justify-end",
                      )}
                    >
                      {c.header}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda-suave">
          {data.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              className={cn(
                "hover:bg-bg-sutil",
                onRowClick && "cursor-pointer focus-visible:bg-bg-sutil",
                rowClassName?.(row),
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={c.header}
                  data-primary={c.primary ? "" : undefined}
                  data-mobile-hidden={c.mobileHidden ? "" : undefined}
                  className={cn(
                    dense ? "px-2.5 py-2" : "px-3 py-2.5",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
