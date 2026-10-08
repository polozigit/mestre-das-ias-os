"use client";

import { useId, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { CardAgente, type UltimaExecucao } from "@/components/painel/CardAgente";
import { CardArtefato } from "@/components/catalogo/CardArtefato";
import type { AgenteLinha } from "@/lib/agentes/agrupar";
import {
  camposDoAgente,
  camposDoArtefato,
  contarItens,
  filtrarGruposPorBusca,
  type GrupoDeItens,
} from "@/lib/catalogo/busca";
import type { ArtefatoCard } from "@/lib/catalogo/catalogo";

const TITULO_DO_GRUPO = "text-[11px] font-bold uppercase tracking-widest text-fg-4";
const GRADE = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";

/**
 * Caixa de busca + resultado. O filtro roda aqui no navegador sobre o que a página já trouxe (não vai
 * ao banco): digitou, a lista encolhe; apagou, ela volta inteira.
 */
function ComBusca<T>({
  grupos,
  camposDe,
  renderItem,
  buscaInicial,
}: {
  grupos: GrupoDeItens<T>[];
  camposDe: (item: T) => readonly (string | null | undefined)[];
  renderItem: (item: T) => React.ReactNode;
  buscaInicial: string;
}) {
  const idDoCampo = useId();
  const [busca, setBusca] = useState(buscaInicial);
  const visiveis = filtrarGruposPorBusca(grupos, busca, camposDe);
  const total = contarItens(visiveis);
  const buscando = busca.trim() !== "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idDoCampo} className="sr-only">
          Buscar por nome ou descrição
        </label>
        <div className="relative max-w-md">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-4" />
          <input
            id={idDoCampo}
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou descrição"
            autoComplete="off"
            className="h-11 w-full rounded-md border border-borda bg-bg-elevada pl-9 pr-3 text-sm text-fg-1 placeholder:text-fg-4 md:h-10"
          />
        </div>
        <p role="status" aria-live="polite" className="min-h-4 text-xs text-fg-3">
          {buscando ? `${total} ${total === 1 ? "resultado" : "resultados"}` : ""}
        </p>
      </div>

      {visiveis.length === 0 ? (
        <Empty
          icon={SearchX}
          title="Nada encontrado"
          description="Nenhum item combina com o que você digitou. Tente outra palavra."
          action={
            <Button type="button" size="sm" onClick={() => setBusca("")} className="min-h-11 md:min-h-0">
              Limpar busca
            </Button>
          }
        />
      ) : (
        visiveis.map((grupo) => (
          <section key={grupo.time} className="flex flex-col gap-3">
            <h2 className={TITULO_DO_GRUPO}>{grupo.time}</h2>
            <div className={GRADE}>{grupo.itens.map(renderItem)}</div>
          </section>
        ))
      )}
    </div>
  );
}

/**
 * Lista de agentes com busca. `execucoes` e `cargos` chegam prontos do servidor, por id do agente:
 * `execucoes === null` esconde o bloco de execução (sem permissão para ver execuções).
 * `buscaInicial` só serve a quem precisa abrir a lista já filtrada (os testes); a tela usa o padrão vazio.
 */
export function ListaDeAgentes({
  grupos,
  execucoes,
  cargos,
  buscaInicial = "",
}: {
  grupos: { time: string; agentes: AgenteLinha[] }[];
  execucoes: Record<string, UltimaExecucao | null> | null;
  cargos: Record<string, string>;
  buscaInicial?: string;
}) {
  return (
    <ComBusca
      buscaInicial={buscaInicial}
      grupos={grupos.map((g) => ({ time: g.time, itens: g.agentes }))}
      camposDe={camposDoAgente}
      renderItem={(agente) => (
        <CardAgente
          key={agente.id}
          agente={agente}
          execucao={execucoes ? (execucoes[agente.id] ?? null) : undefined}
          cargo={cargos[agente.id] ?? null}
        />
      )}
    />
  );
}

/** Lista de skills ou workflows com busca. */
export function ListaDeArtefatos({
  grupos,
  buscaInicial = "",
}: {
  grupos: GrupoDeItens<ArtefatoCard>[];
  buscaInicial?: string;
}) {
  return (
    <ComBusca
      buscaInicial={buscaInicial}
      grupos={grupos}
      camposDe={camposDoArtefato}
      renderItem={(artefato) => <CardArtefato key={artefato.id} artefato={artefato} />}
    />
  );
}
