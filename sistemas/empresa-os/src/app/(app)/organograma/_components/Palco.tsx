"use client";

import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { caminho, rotuloCurto, type IndiceArvore } from "@/lib/organograma/arvore";
import type { OrgNo } from "@/lib/organograma/tipos";

const KIND: Record<OrgNo["tipo"], string> = {
  root: "CEO",
  cabeca: "Diretoria",
  area: "Área",
  cargo: "Cargo",
};

function meta(n: OrgNo): string {
  if (n.tipo === "area") return "";
  const partes: string[] = ["sênior"];
  if (n.vagas) partes.push(n.vagas > 1 ? `${n.vagas} vagas` : "1 vaga");
  if (n.time_total && n.time_total > (n.vagas ?? 0)) partes.push(`time de ${n.time_total}`);
  return partes.join(" · ");
}

function Trilha({ indice, focoId, onFoco }: { indice: IndiceArvore; focoId: string; onFoco: (id: string) => void }) {
  const path = caminho(indice, focoId);
  if (path.length === 0) return null;
  return (
    <nav
      id="organograma-trilha"
      aria-label="Trilha do organograma"
      className="scroll-mt-20 flex flex-wrap items-center gap-1 text-sm"
    >
      {path.map((n, i) => {
        const ultimo = i === path.length - 1;
        return (
          <span key={n.no_id} className="flex items-center gap-1">
            {ultimo ? (
              <span className="px-1 py-0.5 font-semibold text-fg-1">{rotuloCurto(n.titulo)}</span>
            ) : (
              <button
                type="button"
                onClick={() => onFoco(n.no_id)}
                className="rounded px-1 py-0.5 text-acento-texto hover:bg-acento-suave"
              >
                {rotuloCurto(n.titulo)}
              </button>
            )}
            {!ultimo && <span className="text-fg-4">›</span>}
          </span>
        );
      })}
    </nav>
  );
}

function Preview({ filhos }: { filhos: OrgNo[] }) {
  if (filhos.length === 0) return null;
  const mostrar = filhos.slice(0, 4).map((f) => rotuloCurto(f.titulo) + (f.vagas && f.vagas > 1 ? ` (${f.vagas})` : ""));
  const resto = filhos.length > 4 ? ` · +${filhos.length - 4}` : "";
  return (
    <span className="mt-auto border-t border-dashed border-borda-suave pt-1.5 text-[12px] text-fg-3">
      {mostrar.join(" · ")}
      {resto}
    </span>
  );
}

export function Palco({
  indice,
  focoId,
  onFoco,
}: {
  indice: IndiceArvore;
  focoId: string;
  onFoco: (id: string) => void;
}) {
  const chefe = indice.porId.get(focoId) ?? indice.raiz;
  if (!chefe) {
    return (
      <Card className="p-6 text-sm text-fg-3">
        Nó não encontrado no organograma.
      </Card>
    );
  }
  const path = caminho(indice, chefe.no_id);
  const pai = path.length > 1 ? path[path.length - 2] : null;
  const filhos = indice.filhos.get(chefe.no_id) ?? [];
  const isArea = chefe.tipo === "area";

  return (
    <div className="flex flex-col gap-3">
      <Trilha indice={indice} focoId={chefe.no_id} onFoco={onFoco} />
      <Card className="flex flex-col items-center gap-3 p-4 sm:p-6">
        <div
          className={cn(
            "flex w-full max-w-[460px] flex-col gap-1 rounded-lg border-2 p-4",
            isArea
              ? "border-info bg-info-suave"
              : "border-acento bg-acento-suave",
          )}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">
            {KIND[chefe.tipo]}
            {chefe.cargo_real ? ` · ${chefe.cargo_real}` : ""}
          </span>
          <span className="text-lg font-bold leading-tight text-fg-1">{chefe.titulo}</span>
          <span className="font-mono text-xs text-fg-3">{meta(chefe)}</span>
          {chefe.pacote && (
            <span className="mt-1 w-fit rounded-full bg-ok-suave px-2 py-0.5 text-[11px] font-semibold text-ok">
              pacote v{chefe.pacote.versao}
            </span>
          )}
          {pai && (
            <button
              type="button"
              onClick={() => onFoco(pai.no_id)}
              className="mt-1.5 flex w-fit items-center gap-1 self-start rounded-md border border-borda bg-bg-elevada px-2 py-1 text-xs font-medium text-fg-2 hover:border-acento hover:text-fg-1"
            >
              <ChevronUp size={13} /> subir pra {rotuloCurto(pai.titulo)}
            </button>
          )}
        </div>

        {filhos.length === 0 ? (
          <p className="py-4 text-sm text-fg-3">Não tem ninguém abaixo deste cargo.</p>
        ) : (
          <>
            <div className="h-4 w-px bg-border" aria-hidden />
            <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {filhos.map((f) => {
                const netos = indice.filhos.get(f.no_id) ?? [];
                return (
                  <button
                    key={f.no_id}
                    type="button"
                    onClick={() => onFoco(f.no_id)}
                    className={cn(
                      "relative flex min-h-[108px] flex-col gap-1 rounded-lg border p-3 text-left transition-colors hover:border-acento",
                      f.tipo === "area" ? "border-info bg-info-suave" : "border-borda bg-bg-elevada",
                    )}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">
                      {KIND[f.tipo]}
                    </span>
                    <span className="text-[13.5px] font-semibold leading-tight text-fg-1">{f.titulo}</span>
                    <span className="font-mono text-[12px] text-fg-3">{meta(f)}</span>
                    {f.pacote && (
                      <span className="w-fit rounded-full bg-ok-suave px-2 py-0.5 text-[11px] font-semibold text-ok">
                        pacote v{f.pacote.versao}
                      </span>
                    )}
                    <Preview filhos={netos} />
                    {netos.length > 0 && (
                      <span className="absolute right-2.5 top-2 font-mono text-[12px] text-acento-texto">
                        ▾ {netos.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
