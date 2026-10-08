import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ESTADO } from "@/components/painel/CardAgente";
import { nomeAmigavel } from "@/lib/agentes/nome";
import { hrefArtefato, type ArtefatoCard } from "@/lib/catalogo/catalogo";

/** Card de uma skill ou workflow. O card inteiro leva ao detalhe. Nome amigável na frente, técnico embaixo. */
export function CardArtefato({ artefato }: { artefato: ArtefatoCard }) {
  const estado = ESTADO[artefato.estado];
  return (
    <Link href={hrefArtefato(artefato.tipo, artefato.nome)} className="group flex rounded-lg">
      <Card className="flex w-full flex-col transition-colors group-hover:bg-bg-sutil">
        <CardBody className="flex flex-1 flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words font-display text-base font-bold text-fg-1">
                {nomeAmigavel(artefato.nome, artefato.time)}
              </h3>
              <p className="mt-0.5 break-all font-mono text-[11px] text-fg-4">{artefato.nome}</p>
            </div>
            <Pill tone={estado.tom} dot>
              {estado.rotulo}
            </Pill>
          </div>
          {artefato.resumo && <p className="line-clamp-3 break-words text-sm text-fg-2">{artefato.resumo}</p>}
        </CardBody>
      </Card>
    </Link>
  );
}
