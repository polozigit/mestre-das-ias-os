import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hojeSaoPauloISO } from "@/lib/hoje";
import { contarCanceladas, montarCronograma, passoAtual } from "@/lib/cronograma";
import { buscarItensCronograma } from "@/lib/cronograma-dados";
import { TEXTOS_DO_PLANO } from "@/lib/plano-mestre";
import { anexarTextosDoPlano } from "@/lib/plano-textos";
import { Empty } from "@/components/ui/Empty";
import { LinhaDoTempo } from "@/components/cronograma/LinhaDoTempo";
import { PassoAPasso } from "@/components/cronograma/PassoAPasso";

export const metadata = { title: "Cronograma" };

type Busca = { [chave: string]: string | string[] | undefined };

/**
 * Cronograma do curso e dos 90 dias. Atividade cancelada fica escondida; "Mostrar canceladas"
 * (?canceladas=1, um link, sem JavaScript) traz de volta, riscada.
 */
export default async function PaginaCronograma({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;
  const bruto = Array.isArray(busca.canceladas) ? busca.canceladas[0] : busca.canceladas;
  const mostrarCanceladas = bruto === "1";

  const supabase = await createClient();
  // Instrução, comando e prova vêm do banco; "por que importa" e "passo a passo" só existem no arquivo do plano.
  const itens = anexarTextosDoPlano(await buscarItensCronograma(supabase, { comTextos: true }), TEXTOS_DO_PLANO);
  const trilhas = montarCronograma(itens, hojeSaoPauloISO());
  const vazio = trilhas.every((t) => t.fases.every((f) => f.itens.length === 0));
  const canceladas = contarCanceladas(trilhas);
  // Só o próximo passo do aluno (o do curso enquanto houver pendência, depois o dos 90 dias) nasce aberto.
  const abertoId = passoAtual(trilhas)?.item.tarefa_id;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg-1">Cronograma</h1>
          <p className="mt-1 text-sm text-fg-3">O passo a passo do curso de 3 dias e o plano de 90 dias, fase por fase.</p>
        </div>
        {canceladas > 0 && (
          <Link
            href={mostrarCanceladas ? "/cronograma" : "/cronograma?canceladas=1"}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-acento-texto hover:underline md:min-h-0"
          >
            {mostrarCanceladas ? "Esconder canceladas" : `Mostrar canceladas (${canceladas})`}
          </Link>
        )}
      </div>
      {vazio ? (
        <Empty
          icon={CalendarRange}
          title="O cronograma ainda não foi carregado"
          description="O plano do curso entra no sistema durante a instalação. Peça à sua IA para refazer a instalação (nada é duplicado)."
        />
      ) : (
        trilhas.map((t) =>
          t.trilha === "curso" ? (
            <PassoAPasso key={t.trilha} trilha={t} mostrarCanceladas={mostrarCanceladas} abertoId={abertoId} />
          ) : (
            <LinhaDoTempo key={t.trilha} trilha={t} mostrarCanceladas={mostrarCanceladas} abertoId={abertoId} />
          ),
        )
      )}
    </div>
  );
}
