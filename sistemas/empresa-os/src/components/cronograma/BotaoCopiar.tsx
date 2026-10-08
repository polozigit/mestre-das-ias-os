"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  AVISO_DO_BOTAO,
  copiarTexto,
  MS_DO_AVISO_DE_COPIA,
  ROTULO_DO_BOTAO,
  type EstadoDaCopia,
} from "@/lib/copiar";

/**
 * Botão "Copiar" do texto pronto pra colar na IA. Avisa "Copiado" por 2 segundos (e um leitor de tela
 * anuncia o mesmo). Se o navegador recusar a cópia, diz isso em vez de fingir que deu certo.
 */
export function BotaoCopiar({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<EstadoDaCopia>("parado");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copiar() {
    const ok = await copiarTexto(texto);
    setEstado(ok ? "copiado" : "falhou");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setEstado("parado"), MS_DO_AVISO_DE_COPIA);
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={copiar} className="min-h-11 md:min-h-0">
        {estado === "copiado" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        {ROTULO_DO_BOTAO[estado]}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {AVISO_DO_BOTAO[estado]}
      </span>
    </>
  );
}
