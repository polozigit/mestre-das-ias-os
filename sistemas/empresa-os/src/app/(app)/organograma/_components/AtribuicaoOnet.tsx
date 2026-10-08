import { partesDoCredito, type CreditoOnet } from "@/lib/organograma/onet";

/** Crédito da licença O*NET (CC BY 4.0), sempre visível junto do conteúdo que o usa.
 * O texto vem do dado (ver lib/organograma/onet.ts); aqui só vira link. */
export function AtribuicaoOnet({ credito }: { credito: CreditoOnet }) {
  const partes = partesDoCredito(credito.texto);
  return (
    <p data-atribuicao-onet className="max-w-[90ch] border-t border-borda-suave pt-3 text-xs text-fg-3">
      <span className="font-semibold text-fg-2">Crédito: </span>
      {partes ? (
        <>
          {partes[0]}
          <a
            href={credito.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-acento-texto underline underline-offset-2"
          >
            {partes[1]}
          </a>
          {partes[2]}
        </>
      ) : (
        credito.texto
      )}
    </p>
  );
}
