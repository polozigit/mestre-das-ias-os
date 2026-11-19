"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Props = {
  aberto: boolean;
  titulo: string;
  /** Uma ou duas frases: o que vai acontecer e por que pela IA. */
  intro: string;
  passos: string[];
  comando: string;
  onFechar: () => void;
};

/** Pop-up com um comando para colar na IA da empresa (Codex). <dialog> nativo: foco, Esc e fundo do navegador. */
export function GuiaCodexDialog({ aberto, titulo, intro, passos, comando, onFechar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(comando);
      setCopiado(true);
      setErro("");
    } catch {
      setErro("Não deu para copiar sozinho. Selecione o texto abaixo e copie.");
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={() => {
        setCopiado(false);
        onFechar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
      aria-labelledby="guia-codex-titulo"
      className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-lg border border-borda bg-bg-elevada p-0 text-fg-1 shadow-[var(--sombra-md)] backdrop:bg-fg-1/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-borda-suave px-5 py-4">
          <div>
            <h2 id="guia-codex-titulo" className="text-base font-semibold">{titulo}</h2>
            <p className="mt-1 text-sm text-fg-3">{intro}</p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-md text-fg-2 hover:bg-bg-sutil"
          >
            <X size={16} />
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <ol className="list-decimal space-y-1.5 pl-5 text-fg-2">
            {passos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-borda bg-bg-sutil p-3 font-sans text-xs leading-relaxed text-fg-2">
            {comando}
          </pre>
          {erro && <p role="status" className="text-xs text-fg-3">{erro}</p>}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-borda-suave px-5 py-3">
          {copiado && <p role="status" className="mr-auto text-xs text-fg-3">Copiado. Cole no Codex aberto na pasta da empresa.</p>}
          <Button type="button" onClick={() => ref.current?.close()}>Fechar</Button>
          <Button type="button" variant="primary" onClick={() => void copiar()}>
            {copiado ? "Comando copiado" : "Copiar comando para o Codex"}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
