import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { TempoRelativo } from "@/components/ui/TempoRelativo";
import { formatarDataHora } from "@/lib/format";
import type { AgenteLinha } from "@/lib/agentes/agrupar";
import { nomeAmigavel, rotuloEsforco, rotuloModelo } from "@/lib/agentes/nome";

export type UltimaExecucao = { veredito: string; resumo: string | null; terminado_em: string };

export const ESTADO: Record<AgenteLinha["estado"], { rotulo: string; tom: PillTone }> = {
  instalado: { rotulo: "Instalado", tom: "success" },
  disponivel: { rotulo: "Disponível", tom: "neutral" },
  aposentado: { rotulo: "Aposentado", tom: "neutral" },
};

/**
 * Card de um agente. `execucao === undefined` esconde o bloco de execução
 * (sem permissão execucoes.read); `null` mostra "Ainda não trabalhou.".
 * `cargo` só vem quando o usuário pode ver o organograma.
 * O card inteiro leva à página do agente (`/agentes/<name>`). O nome amigável vai na frente e o
 * nome técnico (o que se usa pra chamar o agente) em texto secundário.
 */
export function CardAgente({
  agente,
  execucao,
  cargo,
}: {
  agente: AgenteLinha;
  execucao?: UltimaExecucao | null;
  cargo?: string | null;
}) {
  const estado = ESTADO[agente.estado];
  return (
    <Link
      href={`/agentes/${encodeURIComponent(agente.name)}`}
      className="group flex rounded-lg"
    >
      <Card className="flex w-full flex-col transition-colors group-hover:bg-bg-sutil">
        <CardBody className="flex flex-1 flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words font-display text-base font-bold text-fg-1">
                {nomeAmigavel(agente.name, agente.time)}
              </h3>
              <p className="mt-0.5 break-all font-mono text-[11px] text-fg-4">{agente.name}</p>
              {cargo && (
                <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-acento-texto">
                  {cargo}
                </p>
              )}
            </div>
            <Pill tone={estado.tom} dot>
              {estado.rotulo}
            </Pill>
          </div>

          {agente.descricao_curta && (
            <p className="break-words text-sm text-fg-2">{agente.descricao_curta}</p>
          )}

          {(agente.tier || agente.esforco) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {agente.tier && <Pill tone="brand">{rotuloModelo(agente.tier)}</Pill>}
              {agente.esforco && <Pill tone="neutral">Esforço {rotuloEsforco(agente.esforco)}</Pill>}
            </div>
          )}

          {execucao !== undefined && (
            <p className="mt-auto border-t border-borda-suave pt-3 text-xs text-fg-3">
              {execucao ? (
                <>
                  {execucao.resumo ?? "Última execução"}{" "}
                  <span
                    title={formatarDataHora(execucao.terminado_em)}
                    className="whitespace-nowrap text-fg-4"
                  >
                    · <TempoRelativo iso={execucao.terminado_em} /> · {execucao.veredito}
                  </span>
                </>
              ) : (
                "Ainda não trabalhou."
              )}
            </p>
          )}
        </CardBody>
      </Card>
    </Link>
  );
}
