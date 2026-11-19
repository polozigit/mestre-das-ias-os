"use client";

import Link from "next/link";
import { LogoMarca } from "@/components/marca/LogoMarca";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { nomeSistema } from "../../../config/empresa";
import { usePermissions } from "@/lib/auth/PermissionsProvider";
import { NAV_GRUPOS, filtrarNav, itemAtivo } from "@/lib/nav";
import { grupoDaBusca } from "@/lib/tarefas/grupos";
import { CHAVE_SIDEBAR } from "@/lib/tema";
import { cn } from "@/lib/utils";
import { useMobileNav } from "./MobileNavProvider";
import { gavetaInerte, QUERY_DESKTOP } from "./gaveta";

const EVENTO_SIDEBAR = "empresa-os-sidebar-change";

// Lê o estado recolhido direto de <html data-sidebar> (fonte única, setada pelo
// script do <head>). useSyncExternalStore evita mismatch de hidratação.
function assinar(callback: () => void) {
  window.addEventListener(EVENTO_SIDEBAR, callback);
  return () => window.removeEventListener(EVENTO_SIDEBAR, callback);
}
function foto() {
  return document.documentElement.dataset.sidebar === "collapsed";
}
function fotoServidor() {
  return false;
}

// Desktop (lg+) ou celular, pelo mesmo breakpoint das classes `lg:`. No servidor assume desktop:
// sem JavaScript o menu do desktop segue clicável; no celular a gaveta fica inerte assim que hidrata.
function assinarDesktop(callback: () => void) {
  const m = window.matchMedia(QUERY_DESKTOP);
  m.addEventListener("change", callback);
  return () => m.removeEventListener("change", callback);
}
function fotoDesktop() {
  return window.matchMedia(QUERY_DESKTOP).matches;
}
function fotoDesktopServidor() {
  return true;
}

/** Sidebar recolhível no desktop; gaveta (aberta pelo hambúrguer da TopBar) no celular. */
export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { open, setOpen } = useMobileNav();
  const { pode } = usePermissions();
  const grupos = filtrarNav(NAV_GRUPOS, pode);
  const recolhida = useSyncExternalStore(assinar, foto, fotoServidor);
  const desktop = useSyncExternalStore(assinarDesktop, fotoDesktop, fotoDesktopServidor);

  // A lista de tarefas aberta (dia a dia ou curso) vem da query `trilha`: os dois itens de tarefas
  // dividem o mesmo caminho e só um deles acende por vez.
  const grupoAberto = grupoDaBusca(searchParams.get("trilha") ?? undefined);

  // Fecha a gaveta ao navegar (celular), inclusive entre duas listas do mesmo caminho (?trilha=).
  // No desktop a Sidebar é estática.
  const rotaAtual = `${pathname}?${searchParams.toString()}`;
  useEffect(() => {
    setOpen(false);
  }, [rotaAtual, setOpen]);

  // Nome do item no menu recolhido. Fica FORA do <aside>, em posição fixa: dentro dele o balão era
  // cortado pela rolagem do <nav> e ficava atrás da tela (e o transform do aside prende o `fixed`).
  const [dica, setDica] = useState<{ rotulo: string; top: number; left: number } | null>(null);
  function mostrarDica(el: HTMLElement, rotulo: string) {
    if (!recolhida || !desktop) return;
    const r = el.getBoundingClientRect();
    setDica({ rotulo, top: r.top + r.height / 2, left: r.right + 10 });
  }
  useEffect(() => {
    setDica(null);
  }, [rotaAtual, recolhida, desktop]);

  // Marca do item da página: UM elemento só, que desliza de um item ao outro (continuidade entre
  // telas) em vez de o fundo apagar num e acender no outro. Vai direto no estilo, sem re-render.
  // No clique ela já desliza para o item clicado, antes de o servidor responder.
  const navRef = useRef<HTMLElement>(null);
  const marcaRef = useRef<HTMLSpanElement>(null);
  const posicionarMarca = useCallback((alvo?: HTMLElement | null) => {
    const nav = navRef.current;
    const marca = marcaRef.current;
    if (!nav || !marca) return;
    const item = alvo ?? nav.querySelector<HTMLElement>('.sidebar-link[aria-current="page"]');
    if (!item) {
      marca.style.opacity = "0";
      delete nav.dataset.marca;
      return;
    }
    const primeira = nav.dataset.marca !== "on";
    // Primeira medida (ou volta de página sem item no menu): aparece no lugar, sem viajar do topo.
    if (primeira) marca.style.transitionProperty = "opacity";
    marca.style.height = `${item.offsetHeight}px`;
    marca.style.transform = `translateY(${item.offsetTop}px)`;
    marca.style.opacity = "1";
    nav.dataset.marca = "on";
    if (primeira) {
      void marca.offsetHeight;
      marca.style.transitionProperty = "";
    }
  }, []);
  useLayoutEffect(() => {
    posicionarMarca();
  }, [rotaAtual, recolhida, desktop, grupos.length, posicionarMarca]);
  // Fonte carregou ou a janela mudou: a altura dos itens pode mudar, a marca acompanha.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(() => posicionarMarca());
    observador.observe(nav);
    return () => observador.disconnect();
  }, [posicionarMarca]);

  function alternar() {
    const el = document.documentElement;
    const proximo = el.dataset.sidebar === "collapsed" ? "expanded" : "collapsed";
    el.dataset.sidebar = proximo;
    try {
      localStorage.setItem(CHAVE_SIDEBAR, proximo);
    } catch {
      /* localStorage indisponível: segue só com o atributo */
    }
    window.dispatchEvent(new Event(EVENTO_SIDEBAR));
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-fg-1/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[var(--sidebar-active-w)] shrink-0 flex-col border-r border-borda bg-bg-elevada transition-transform duration-[360ms] ease-saida",
          "lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 lg:transition-[width] lg:duration-[360ms]",
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        )}
        aria-label="Navegação principal"
        inert={gavetaInerte(open, desktop)}
      >
        {/* Logo da empresa + só "OS" ao lado: a logo já traz o nome, então o nome completo do
            sistema não se repete aqui. */}
        <div className="sidebar-header flex h-[var(--topbar-h)] items-center gap-1.5 overflow-hidden border-b border-borda-suave px-4">
          <LogoMarca alt={nomeSistema} width={112} height={28} priority className="sidebar-logo h-6 w-auto shrink-0 object-contain object-left" />
          <span aria-hidden="true" className="sidebar-wordmark text-sm font-semibold tracking-tight text-fg-1">
            OS
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="ml-auto grid size-8 place-items-center rounded-md text-fg-2 hover:bg-bg-sutil lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav ref={navRef} onScroll={() => setDica(null)} className="relative flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
          <span ref={marcaRef} aria-hidden="true" className="sidebar-marca" />
          {grupos.map((grupo) => (
            <div key={grupo.id} className="flex flex-col gap-1">
              {grupo.titulo && (
                <p className="sidebar-group-title px-2 text-[10px] font-bold uppercase tracking-wider text-fg-4">
                  {grupo.titulo}
                </p>
              )}
              {grupo.itens.map((item) => {
                const ativo = itemAtivo(item, pathname, grupoAberto);
                const Icone = item.icone;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={(e) => {
                      setOpen(false);
                      // Clique com tecla abre outra aba: a página daqui não muda, a marca fica.
                      if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) posicionarMarca(e.currentTarget);
                    }}
                    onMouseEnter={(e) => mostrarDica(e.currentTarget, item.label)}
                    onMouseLeave={() => setDica(null)}
                    onFocus={(e) => mostrarDica(e.currentTarget, item.label)}
                    onBlur={() => setDica(null)}
                    aria-label={item.label}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "sidebar-link flex min-h-10 items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-fg-2 transition-colors duration-200 hover:bg-bg-sutil hover:text-fg-1",
                      ativo && "bg-acento-suave font-semibold text-acento-texto hover:bg-acento-suave",
                    )}
                  >
                    <Icone size={16} className={cn("shrink-0", ativo ? "text-acento" : "text-fg-3")} />
                    <span className="sidebar-label flex-1 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer hidden items-center justify-end border-t border-borda-suave px-4 py-3 lg:flex">
          <button
            type="button"
            onClick={alternar}
            aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
            title={recolhida ? "Expandir menu" : "Recolher menu"}
            className="grid size-8 shrink-0 place-items-center rounded-md text-fg-2 transition-colors hover:bg-bg-sutil hover:text-fg-1"
          >
            {recolhida ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      </aside>

      {dica && (
        <span
          role="tooltip"
          style={{ top: dica.top, left: dica.left }}
          className="surgir pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap [--origem:left_center] rounded-md bg-fg-1 px-2.5 py-1.5 text-xs font-medium text-bg shadow-lg"
        >
          {dica.rotulo}
        </span>
      )}
    </>
  );
}
