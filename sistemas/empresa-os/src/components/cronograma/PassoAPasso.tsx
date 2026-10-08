import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { Pill } from "@/components/ui/Pill";
import { StatusPill } from "@/components/tarefas/pills";
import { cn } from "@/lib/utils";
import { FECHADA, itensVisiveis, numerarPassos, type TrilhaResumo } from "@/lib/cronograma";
import { hrefTarefa } from "@/lib/tarefas/grupos";
import type { TarefaStatus } from "@/types/database";
import { ComoFazerRecolhivel } from "./ComoFazer";

/**
 * Passo a passo do curso: uma lista só, numerada, na ordem do plano (Dia 1 > Dia 2 > Dia 3), com o
 * status de cada passo e o PRÓXIMO destacado. Cada passo abre o detalhe da tarefa (como fazer e prova).
 * Cada passo pendente traz o "Como fazer" recolhido (aberto no passo `abertoId`): o que fazer, por que
 * importa, passo a passo, o texto pronto pra colar na IA e como saber que ficou pronto. Passo concluído
 * ou cancelado não repete isso na lista (o detalhe da tarefa continua tendo tudo).
 * Passo cancelado só aparece quando o dono pede ("mostrar canceladas"); aí vem riscado e sem número.
 */
export function PassoAPasso({
  trilha,
  mostrarCanceladas = false,
  abertoId,
}: {
  trilha: TrilhaResumo;
  mostrarCanceladas?: boolean;
  /** Passo que já nasce com o "Como fazer" aberto: o próximo passo do aluno (`passoAtual`). */
  abertoId?: string;
}) {
  const numeros = numerarPassos(trilha);
  const feitas = trilha.fases.reduce((s, f) => s + f.feitas, 0);
  const total = trilha.fases.reduce((s, f) => s + f.total, 0);
  const proximo = trilha.proximo;
  const fases = trilha.fases.map((f) => ({ ...f, visiveis: itensVisiveis(f.itens, mostrarCanceladas) }));
  return (
    <section className="flex flex-col gap-4">
      <KpiCard label={`${trilha.rotulo}: passo a passo`} value={`${trilha.pct}%`} progress={trilha.pct} delta={{ value: `${feitas} de ${total}`, trend: "flat" }} />

      {proximo && (
        <Link
          href={hrefTarefa(proximo.tarefa_id, proximo.trilha)}
          className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-md border border-acento bg-acento-suave p-4 hover:bg-bg-sutil"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-acento-texto">
              Próximo passo · {numeros.get(proximo.tarefa_id)} de {numeros.size}
            </p>
            <p className="mt-0.5 text-base font-semibold text-fg-1">{proximo.titulo}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-acento-texto">
            Ver como fazer
            <ArrowRight size={16} aria-hidden />
          </span>
        </Link>
      )}

      <div className="flex flex-col gap-4">
        {fases.map((f) => (
          <div key={f.fase} className="flex min-w-0 flex-col gap-2 rounded-md border border-borda bg-bg-elevada p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg-1">{f.rotulo}</h3>
              <div className="flex items-center gap-2">
                {f.atrasadas > 0 && <Pill tone="danger">{f.atrasadas} atrasada{f.atrasadas > 1 ? "s" : ""}</Pill>}
                <p className="text-xs text-fg-3">{f.feitas} de {f.total} concluídos</p>
              </div>
            </div>
            {f.visiveis.length === 0 ? (
              <p className="text-xs text-fg-4">Sem passos neste dia.</p>
            ) : (
              <ol className="flex flex-col gap-1">
                {f.visiveis.map((i) => {
                  const numero = numeros.get(i.tarefa_id);
                  const eProximo = proximo?.tarefa_id === i.tarefa_id;
                  const feito = i.status === "CONCLUIDA";
                  return (
                    <li key={i.tarefa_id}>
                      <Link
                        href={hrefTarefa(i.tarefa_id, i.trilha)}
                        aria-current={eProximo ? "step" : undefined}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-md border px-2 py-1 text-sm hover:bg-bg-sutil",
                          eProximo ? "border-acento bg-acento-suave" : "border-transparent",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            feito ? "bg-ok-suave text-ok" : eProximo ? "bg-acento text-fg-sobre-acento" : "bg-bg-sutil text-fg-3",
                          )}
                        >
                          {feito ? <Check size={14} aria-label="Concluído" /> : (numero ?? "–")}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 leading-snug",
                            feito || i.status === "CANCELADA" ? "text-fg-3" : "text-fg-1",
                            eProximo && "font-semibold",
                            i.status === "CANCELADA" && "line-through",
                          )}
                        >
                          {i.titulo}
                        </span>
                        <span className="shrink-0">
                          <StatusPill status={i.status as TarefaStatus} />
                        </span>
                      </Link>
                      {i.textos && !FECHADA.has(i.status) && (
                        <ComoFazerRecolhivel textos={i.textos} aberto={i.tarefa_id === abertoId} className="pl-12 pr-2" />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
