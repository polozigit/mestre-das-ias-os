import { TimelineItem } from "@/components/ui/Timeline";
import { TempoRelativo } from "@/components/ui/TempoRelativo";
import { formatarDataHora } from "@/lib/format";
import {
  nomeDoEvento,
  tipoDoNo,
  type LinhaAtividade,
  type NomesResolvidos,
} from "./atividade-helpers";

/**
 * Uma linha da linha do tempo — compartilhada entre Início (últimas 10) e
 * Atividade (paginada). Nó colorido por autor: humano = destaque, IA = info,
 * sistema = neutro.
 */
export function ItemAtividade({
  linha,
  nomes,
  isLast,
}: {
  linha: LinhaAtividade;
  nomes: NomesResolvidos;
  isLast?: boolean;
}) {
  return (
    <TimelineItem type={tipoDoNo(linha)} isLast={isLast}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-fg-1">
          {nomeDoEvento(linha, nomes)}
        </span>
        {/* title com a data completa: o tempo relativo arredonda, o hover conta a verdade */}
        <span title={formatarDataHora(linha.quando)} className="text-xs text-fg-4">
          <TempoRelativo iso={linha.quando} />
        </span>
      </div>
      <p className="mt-0.5 break-words text-sm text-fg-2">{linha.descricao}</p>
    </TimelineItem>
  );
}
