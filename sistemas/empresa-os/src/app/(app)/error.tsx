"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";

/**
 * Error boundary do shell autenticado: banco fora do ar ou bug de render
 * caem aqui — nunca stacktrace na cara do usuário. RLS sem linhas NÃO passa
 * por aqui (segue caindo nos Empty dignos de cada página); isto é só pra
 * erro de verdade, que as páginas agora lançam em vez de engolir.
 */
export default function ErroDoApp({ reset }: { reset: () => void }) {
  return (
    <Empty
      icon={AlertTriangle}
      title="Algo deu errado"
      description="Não conseguimos carregar esta página agora. Pode ser uma instabilidade passageira — tentar de novo costuma resolver."
      action={
        <Button variant="secondary" onClick={reset} className="mt-1">
          Tentar de novo
        </Button>
      }
      className="py-24"
    />
  );
}
