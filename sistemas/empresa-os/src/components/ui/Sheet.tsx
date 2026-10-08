import { cn } from "@/lib/utils";

/**
 * Classes do painel slide-over responsivo (CSS puro, sem lib de drawer).
 * - `>=md`: painel lateral à direita, altura cheia, desliza no eixo X.
 * - `<md`: bottom-sheet full-width, sobe de baixo (eixo Y), cantos arredondados,
 *   respeita safe-area.
 *
 * Cada drawer aplica isto no seu `<aside>` e passa a largura desktop (`mdWidth`).
 * O conteúdo interno (Cards, Pills, header) não muda.
 */
export function sheetPanelClasses(open: boolean, mdWidth = "md:w-[420px]") {
  return cn(
    "fixed z-50 flex flex-col overflow-y-auto bg-bg-elevada shadow-[var(--sombra-md)] transition-transform duration-300 ease-out motion-reduce:transition-none",
    // mobile = bottom-sheet
    "inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl border-t border-borda pb-[env(safe-area-inset-bottom)]",
    // desktop = painel lateral direito full-height
    "md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:rounded-t-none md:border-l md:border-t-0 md:pb-0 md:max-w-[90vw]",
    mdWidth,
    open
      ? "translate-y-0 md:translate-x-0"
      : "translate-y-full md:translate-x-full md:translate-y-0",
  );
}

/**
 * Backdrop do sheet — fade de opacidade nos mesmos tempos do painel.
 * Um só lugar pra cor/blur/timing; cada drawer só passa `open` + onClick.
 */
export function sheetBackdropClasses(open: boolean) {
  return cn(
    "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out motion-reduce:transition-none",
    open ? "opacity-100" : "pointer-events-none opacity-0",
  );
}

/**
 * Popover ancorado no desktop, bottom-sheet no celular — UM componente, duas
 * apresentações, só por CSS. Para filtro/menu que precisa ficar montado nos dois
 * estados (senão não há transição) e cujo conteúdo é curto.
 *
 * NÃO reusar `sheetPanelClasses` para isso: lá o `md:` vira painel lateral
 * full-height, que é errado para um filtro ancorado num botão.
 *
 * `md:inset-auto` é o reset que neutraliza `inset-x-0 bottom-0` do modo mobile.
 * O pai do popover precisa ser `relative` para o ancoramento em `md:`.
 */
export function sheetPopoverClasses(open: boolean, mdWidth = "md:w-80") {
  return cn(
    "z-50 flex flex-col overflow-hidden bg-bg-elevada shadow-[var(--sombra-md)]",
    "transition-transform duration-300 ease-out motion-reduce:transition-none",
    // <md: bottom-sheet
    "fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t border-borda pb-[env(safe-area-inset-bottom)]",
    open ? "translate-y-0" : "translate-y-full",
    // >=md: popover ancorado ao trigger
    "md:absolute md:inset-auto md:right-0 md:top-full md:mt-1 md:max-h-[26rem] md:translate-y-0",
    "md:rounded-md md:border md:border-borda md:pb-0 md:transition-opacity",
    mdWidth,
    !open && "md:pointer-events-none md:opacity-0",
  );
}

/** Alça visual do bottom-sheet no mobile (some no desktop). Inserir como 1º filho do painel. */
export function SheetGrabber() {
  return (
    <div className="flex shrink-0 justify-center pt-2 md:hidden" aria-hidden="true">
      <div className="h-1.5 w-10 rounded-full bg-borda" />
    </div>
  );
}
