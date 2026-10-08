import Link from "next/link";
import { KpiCard } from "@/components/ui/KpiCard";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import { FECHADA, itensVisiveis, type TrilhaResumo } from "@/lib/cronograma";
import { hrefTarefa } from "@/lib/tarefas/grupos";
import { ROTULO_STATUS } from "@/lib/tarefas/status";
import { ComoFazerRecolhivel } from "./ComoFazer";

const ROTULO: Record<string, string> = ROTULO_STATUS;

/**
 * Linha do tempo das fases da trilha de 90 dias. Cada tarefa pendente traz o "Como fazer" recolhido
 * (aberto na tarefa `abertoId`). Tarefa cancelada só aparece quando o dono pede ("mostrar canceladas").
 */
export function LinhaDoTempo({
  trilha,
  mostrarCanceladas = false,
  abertoId,
}: {
  trilha: TrilhaResumo;
  mostrarCanceladas?: boolean;
  /** Tarefa que já nasce com o "Como fazer" aberto: o próximo passo do aluno (`passoAtual`). */
  abertoId?: string;
}) {
  const feitas = trilha.fases.reduce((s, f) => s + f.feitas, 0);
  const total = trilha.fases.reduce((s, f) => s + f.total, 0);
  const fases = trilha.fases.map((f) => ({ ...f, visiveis: itensVisiveis(f.itens, mostrarCanceladas) }));
  return (
    <section className="flex flex-col gap-4">
      <KpiCard label={trilha.rotulo} value={`${trilha.pct}%`} progress={trilha.pct} delta={{ value: `${feitas} de ${total}`, trend: "flat" }} />
      <div className="grid grid-cols-1 gap-3 lg:grid-flow-col lg:auto-cols-fr">
        {fases.map((f) => (
          <div
            key={f.fase}
            className={cn(
              "flex min-w-0 flex-col gap-2 rounded-md border bg-bg-elevada p-3",
              trilha.faseAtual === f.fase ? "border-acento" : "border-borda",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg-1">{f.rotulo}</h3>
              {f.atrasadas > 0 && <Pill tone="danger">{f.atrasadas} atrasada{f.atrasadas > 1 ? "s" : ""}</Pill>}
            </div>
            <p className="text-xs text-fg-3">{f.feitas} de {f.total} concluídas</p>
            {f.visiveis.length === 0 ? (
              <p className="text-xs text-fg-4">Sem tarefas nesta fase.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {f.visiveis.map((i) => {
                  const eProximo = trilha.proximo?.tarefa_id === i.tarefa_id;
                  return (
                    <li key={i.tarefa_id}>
                      <Link
                        href={hrefTarefa(i.tarefa_id, i.trilha)}
                        aria-current={eProximo ? "step" : undefined}
                        className={cn(
                          "flex min-h-11 items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm hover:bg-bg-sutil",
                          eProximo ? "border-acento bg-acento-suave font-semibold" : "border-transparent",
                          i.status === "CONCLUIDA" || i.status === "CANCELADA" ? "text-fg-3" : "text-fg-1",
                        )}
                      >
                        <span className={cn("min-w-0 truncate", i.status === "CANCELADA" && "line-through")}>{i.titulo}</span>
                        <span className="shrink-0 text-xs text-fg-3">{ROTULO[i.status] ?? i.status}</span>
                      </Link>
                      {i.textos && !FECHADA.has(i.status) && (
                        <ComoFazerRecolhivel textos={i.textos} aberto={i.tarefa_id === abertoId} className="px-2" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
