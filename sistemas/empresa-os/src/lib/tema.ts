export type Preferencia = "claro" | "escuro" | "sistema";
export const CHAVE_TEMA = "empresa-os-tema";
export const CHAVE_SIDEBAR = "empresa-os-sidebar";

export function lerPreferencia(v: string | null | undefined): Preferencia {
  return v === "claro" || v === "escuro" || v === "sistema" ? v : "sistema";
}
export function resolverTema(p: Preferencia, sistemaEscuro: boolean): "light" | "dark" {
  if (p === "claro") return "light";
  if (p === "escuro") return "dark";
  return sistemaEscuro ? "dark" : "light";
}
export function proximaPreferencia(p: Preferencia): Preferencia {
  return p === "claro" ? "escuro" : p === "escuro" ? "sistema" : "claro";
}
/** Inline no <head>: roda antes do primeiro paint (sem piscar). localStorage pode lançar. */
export const SCRIPT_TEMA = `(function(){var d=document.documentElement;var p="sistema";try{p=localStorage.getItem("${CHAVE_TEMA}")||"sistema";}catch(e){}if(p!=="claro"&&p!=="escuro")p="sistema";var esc=p==="escuro"||(p==="sistema"&&window.matchMedia("(prefers-color-scheme: dark)").matches);d.dataset.theme=esc?"dark":"light";d.dataset.temaPref=p;try{d.dataset.sidebar=localStorage.getItem("${CHAVE_SIDEBAR}")==="collapsed"?"collapsed":"expanded";}catch(e){d.dataset.sidebar="expanded";}})();`;
