"use client";

import { useCallback, useMemo, useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { montarArvore, resumo } from "@/lib/organograma/arvore";
import type { OrgApqc, OrgNo, OrgPasso, OrgRaia } from "@/lib/organograma/tipos";
import { ocupacaoPorCargo } from "@/lib/organograma/ocupacao";
import type { Ocupante } from "@/lib/organograma/ocupacao";
import { Palco } from "./Palco";
import { PainelCargo } from "./PainelCargo";
import { PacoteCargo } from "./PacoteCargo";
import { Workflows } from "./Workflows";
import { IndiceCargo } from "./IndiceCargo";

type Vista = "organograma" | "workflows";

function Stat({ valor, rotulo }: { valor: string | number; rotulo: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-xl tabular-nums text-fg-1">{valor}</span>
      <span className="text-[12px] uppercase tracking-wide text-fg-3">{rotulo}</span>
    </div>
  );
}

export function OrganogramaView({
  nos,
  raias,
  passos,
  apqc,
  ocupacao,
}: {
  nos: OrgNo[];
  raias: OrgRaia[];
  passos: OrgPasso[];
  apqc: OrgApqc[];
  ocupacao: Ocupante[];
}) {
  const ocupacaoMap = useMemo(() => ocupacaoPorCargo(ocupacao), [ocupacao]);
  const indice = useMemo(() => montarArvore(nos), [nos]);
  const apqcMap = useMemo(() => new Map(apqc.map((a) => [a.codigo, a.nome_pt])), [apqc]);
  const stats = useMemo(() => resumo(nos), [nos]);

  const [vista, setVista] = useState<Vista>("organograma");
  const [focoId, setFocoId] = useState<string>(indice.raiz?.no_id ?? "");
  const [playbookAlvo, setPlaybookAlvo] = useState<string | null>(null);
  // referência estável: o efeito de PacoteCargo depende dela
  const limparPlaybookAlvo = useCallback(() => setPlaybookAlvo(null), []);

  const foco = indice.porId.get(focoId) ?? indice.raiz;

  function focarCargoSlug(cargoSlug: string) {
    const alvo = Array.from(indice.porId.values()).find((n) => n.tipo !== "area" && n.slug === cargoSlug);
    if (!alvo) return;
    setFocoId(alvo.no_id);
    setVista("organograma");
  }

  function abrirPlaybook(pacoteSlug: string, slug: string) {
    const alvo = Array.from(indice.porId.values()).find((n) => n.pacote?.slug === pacoteSlug);
    if (!alvo) return;
    setFocoId(alvo.no_id);
    setVista("organograma");
    setPlaybookAlvo(slug);
  }

  if (!indice.raiz) {
    return null; // page.tsx já trata a lista vazia com o Empty state
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={[
            { value: "organograma", label: "Organograma" },
            { value: "workflows", label: "Workflows" },
          ]}
          value={vista}
          onChange={setVista}
          size="touch"
        />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-8">
        <Stat valor={stats.cargos} rotulo="cargos" />
        <Stat valor={stats.pessoas} rotulo="pessoas" />
        <Stat valor={stats.processos} rotulo="processos" />
        <Stat valor={stats.horasMes.toLocaleString("pt-BR")} rotulo="h/mês" />
        <Stat valor={`${stats.comSalario}/${stats.cargos}`} rotulo="com salário de mercado" />
      </div>

      {vista === "organograma" && (
        <div className="flex flex-col gap-5">
          <Palco indice={indice} focoId={foco?.no_id ?? focoId} onFoco={setFocoId} />
          {foco && <IndiceCargo no={foco} />}
          {foco && (
            <PainelCargo
              no={foco}
              apqc={apqcMap}
              ocupacao={ocupacaoMap.get(foco.slug)}
              onAbrirPlaybook={abrirPlaybook}
            />
          )}
          {foco && (
            <PacoteCargo
              key={foco.no_id}
              no={foco}
              apqc={apqcMap}
              focarPlaybookSlug={playbookAlvo}
              onFocado={limparPlaybookAlvo}
              onFocarCargo={focarCargoSlug}
            />
          )}
        </div>
      )}

      {vista === "workflows" && (
        <Workflows
          raias={raias}
          passos={passos}
          onVerCargo={focarCargoSlug}
          onAbrirPlaybook={abrirPlaybook}
        />
      )}
    </div>
  );
}
