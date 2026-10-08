"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import type { OrgOnda, OrgPasso, OrgRaia } from "@/lib/organograma/tipos";

type Props = {
  raias: OrgRaia[];
  passos: OrgPasso[];
  ondas: OrgOnda[];
  onVerCargo: (cargoSlug: string) => void;
  onAbrirPlaybook: (pacoteSlug: string, slug: string) => void;
};

function temGateReal(gate: string | null): boolean {
  return !!gate && !/^nenhum$/i.test(gate.trim());
}

function OndaCard({ onda, onVerCargo }: { onda: OrgOnda; onVerCargo: (slug: string) => void }) {
  const tecnica = /^E/i.test(onda.codigo);
  return (
    <article
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border border-borda bg-bg-elevada p-3 shadow-[var(--sombra-sm)]",
        tecnica && "border-dashed",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="rounded-md bg-acento px-1.5 py-0.5 font-mono text-xs font-semibold text-fg-sobre-acento">
          {onda.codigo}
        </span>
        <span className="text-[13.5px] font-semibold leading-tight text-fg-1">{onda.time}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {onda.cargos.map((c, i) =>
          c.cargo_slug ? (
            <button
              key={i}
              type="button"
              onClick={() => onVerCargo(c.cargo_slug!)}
              className="rounded-full border border-acento bg-acento-suave px-2 py-0.5 text-[11.5px] text-acento-texto"
            >
              {c.texto}
            </button>
          ) : (
            <span key={i} className="rounded-full border border-borda bg-bg-sutil px-2 py-0.5 text-[11.5px] text-fg-3">
              {c.texto}
            </span>
          ),
        )}
      </div>
      {onda.porque && (
        <p className="text-xs text-fg-3">
          <b className="font-semibold text-fg-2">Por quê: </b>
          {onda.porque}
        </p>
      )}
      {onda.depende && (
        <p className="text-xs text-fg-3">
          <b className="font-semibold text-fg-2">Depende de: </b>
          {onda.depende}
        </p>
      )}
    </article>
  );
}

type Wire = { d: string; tipo: "normal" | "loop" | "caio" };

function LanesGrid({
  raias,
  passos,
  selecionado,
  onSelecionar,
  onVerCargo,
}: {
  raias: OrgRaia[];
  passos: OrgPasso[];
  selecionado: string | null;
  onSelecionar: (codigo: string) => void;
  onVerCargo: (cargoSlug: string) => void;
}) {
  const raiasOrdenadas = useMemo(() => [...raias].sort((a, b) => a.ordem - b.ordem), [raias]);
  const raiaIndice = useMemo(() => {
    const m = new Map<string, number>();
    raiasOrdenadas.forEach((r, i) => m.set(r.chave, i));
    return m;
  }, [raiasOrdenadas]);
  const passosOrdenados = useMemo(() => [...passos].sort((a, b) => a.ordem - b.ordem), [passos]);
  const temSaidaCaio = passosOrdenados.some((p) => p.sai_caio);
  const maxCol = Math.max(0, ...passosOrdenados.map((p) => p.coluna)) + 1;

  const cells = useMemo(() => {
    const m = new Map<string, OrgPasso[]>();
    for (const p of passosOrdenados) {
      const raiaPrincipal = p.raias[0];
      const linha = raiaIndice.get(raiaPrincipal);
      if (linha == null) continue;
      const key = `${linha}/${p.coluna}`;
      const lista = m.get(key) ?? [];
      lista.push(p);
      m.set(key, lista);
    }
    return m;
  }, [passosOrdenados, raiaIndice]);

  const gridRef = useRef<HTMLDivElement>(null);
  const caioRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const [wires, setWires] = useState<Wire[]>([]);
  const [tamanho, setTamanho] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    function recalcular() {
      const grid = gridRef.current;
      if (!grid) return;
      const gb = grid.getBoundingClientRect();
      setTamanho({ w: grid.scrollWidth, h: grid.scrollHeight });
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { l: r.left - gb.left, r: r.right - gb.left, t: r.top - gb.top, b: r.bottom - gb.top, x: r.left - gb.left + r.width / 2, y: r.top - gb.top + r.height / 2 };
      };
      const novasWires: Wire[] = [];
      for (const p of passosOrdenados) {
        const elA = stepRefs.current.get(p.codigo);
        if (!elA) continue;
        const a = box(elA);
        for (const alvo of p.proximos) {
          const elB = stepRefs.current.get(alvo);
          if (!elB) continue;
          const b = box(elB);
          if (p.lacos.includes(alvo)) {
            const y = Math.max(a.b, b.b) + 18;
            novasWires.push({ tipo: "loop", d: `M${a.x},${a.b} C${a.x},${y} ${b.x},${y} ${b.x},${b.b + 2}` });
          } else {
            const mx = (a.r + b.l) / 2;
            novasWires.push({ tipo: "normal", d: `M${a.r},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.l - 2},${b.y}` });
          }
        }
        if (p.sai_caio && caioRef.current) {
          const b = box(caioRef.current);
          const mx = (a.r + b.l) / 2;
          novasWires.push({ tipo: "caio", d: `M${a.r},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.l - 2},${b.y}` });
        }
      }
      setWires(novasWires);
    }
    recalcular();
    const obs = new ResizeObserver(recalcular);
    if (gridRef.current) obs.observe(gridRef.current);
    window.addEventListener("resize", recalcular);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", recalcular);
    };
  }, [passosOrdenados, selecionado]);

  return (
    <Card className="overflow-x-auto p-3">
      <div
        ref={gridRef}
        className="relative grid min-w-max gap-x-6"
        style={{
          gridTemplateColumns: `140px repeat(${maxCol}, 148px)${temSaidaCaio ? " 150px" : ""}`,
        }}
      >
        <div style={{ gridRow: 1, gridColumn: 1 }} />
        {Array.from({ length: maxCol }, (_, i) => (
          <div
            key={i}
            style={{ gridRow: 1, gridColumn: i + 2 }}
            className="pb-1.5 text-center font-mono text-[11px] text-fg-3"
          >
            etapa {i + 1}
          </div>
        ))}
        {temSaidaCaio && (
          <div style={{ gridRow: 1, gridColumn: maxCol + 2 }} className="pb-1.5 text-center font-mono text-[11px] text-fg-3">
            depois
          </div>
        )}

        {raiasOrdenadas.map((r, i) => (
          <div
            key={r.chave}
            style={{ gridRow: i + 2, gridColumn: `2 / ${maxCol + 2}` }}
            className="border-t border-dashed border-borda-suave"
          />
        ))}
        {raiasOrdenadas.map((r, i) => (
          <div
            key={`lh-${r.chave}`}
            style={{ gridRow: i + 2, gridColumn: 1 }}
            className="sticky left-0 flex flex-col justify-center gap-0.5 border-t border-dashed border-borda-suave bg-bg-elevada py-2 pr-2 text-xs font-semibold text-fg-1"
          >
            <span>{r.nome}</span>
            {r.cargo_slug && (
              <button
                type="button"
                onClick={() => onVerCargo(r.cargo_slug!)}
                className="text-left text-[11px] font-normal text-acento-texto"
              >
                ver cargo
              </button>
            )}
          </div>
        ))}

        {Array.from(cells.entries()).map(([key, ps]) => {
          const [linha, coluna] = key.split("/").map(Number);
          return (
            <div
              key={key}
              style={{ gridRow: linha + 2, gridColumn: coluna + 2 }}
              className="z-10 my-1.5 flex flex-col gap-2 self-center"
            >
              {ps.map((p) => {
                const extra = p.raias.slice(1).map((chave) => raiasOrdenadas.find((r) => r.chave === chave)?.nome.split(" (")[0]).filter(Boolean);
                const gate = temGateReal(p.gate);
                return (
                  <button
                    key={p.codigo}
                    ref={(el) => {
                      stepRefs.current.set(p.codigo, el);
                    }}
                    type="button"
                    aria-pressed={selecionado === p.codigo}
                    onClick={() => onSelecionar(p.codigo)}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-md border-[1.5px] border-acento bg-acento-suave px-2 py-1.5 text-left",
                      gate && "shadow-[inset_0_-3px_0_var(--alerta)]",
                      selecionado === p.codigo && "bg-acento text-fg-sobre-acento",
                    )}
                  >
                    <span className={cn("font-mono text-[11px] font-semibold", selecionado === p.codigo ? "text-fg-sobre-acento" : "text-acento-texto")}>
                      {p.codigo}
                    </span>
                    <span className="text-xs font-semibold leading-tight">{p.passo}</span>
                    {extra.length > 0 && (
                      <span className={cn("text-[10.5px]", selecionado === p.codigo ? "text-fg-sobre-acento/85" : "text-fg-3")}>
                        + {extra.join(", ")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}

        {temSaidaCaio && (
          <div
            ref={caioRef}
            style={{ gridRow: `2 / ${raiasOrdenadas.length + 2}`, gridColumn: maxCol + 2 }}
            className="z-10 flex items-center self-center"
          >
            <div className="rounded-md border-[1.5px] border-info bg-info-suave px-2.5 py-2 text-xs font-semibold text-info">
              CAIO traduz em skill, workflow ou agente
            </div>
          </div>
        )}

        <svg className="pointer-events-none absolute inset-0 z-0 overflow-visible" width={tamanho.w} height={tamanho.h} aria-hidden>
          <defs>
            <marker id="fx-ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" className="fill-fg-4" />
            </marker>
            <marker id="fx-ahl" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" className="fill-alerta" />
            </marker>
            <marker id="fx-ahx" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" className="fill-info" />
            </marker>
          </defs>
          {wires.map((w, i) => (
            <path
              key={i}
              d={w.d}
              fill="none"
              strokeWidth={1.4}
              markerEnd={w.tipo === "loop" ? "url(#fx-ahl)" : w.tipo === "caio" ? "url(#fx-ahx)" : "url(#fx-ah)"}
              className={cn(
                w.tipo === "normal" && "stroke-fg-4",
                w.tipo === "loop" && "stroke-alerta [stroke-dasharray:5_4]",
                w.tipo === "caio" && "stroke-info",
              )}
            />
          ))}
        </svg>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-fg-4" /> passa o artefato
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-dashed border-alerta" /> volta (correção)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-info" /> sai do time (CAIO traduz)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-[3px] border-[1.5px] border-acento shadow-[inset_0_-2px_0_var(--alerta)]" /> tem gate de aprovação
        </span>
      </p>
    </Card>
  );
}

function PassoDetalhe({
  passo,
  raias,
  passos,
  onSelecionar,
  onVerCargo,
  onAbrirPlaybook,
}: {
  passo: OrgPasso;
  raias: OrgRaia[];
  passos: OrgPasso[];
  onSelecionar: (codigo: string) => void;
  onVerCargo: (slug: string) => void;
  onAbrirPlaybook: (pacoteSlug: string, slug: string) => void;
}) {
  const byCodigo = new Map(passos.map((p) => [p.codigo, p]));
  const vemDe = passos.filter((p) => p.proximos.includes(passo.codigo));
  const raiasDoPasso = passo.raias.map((chave) => raias.find((r) => r.chave === chave)).filter((r): r is OrgRaia => !!r);

  return (
    <Card className="grid grid-cols-1 gap-x-6 gap-y-2.5 border-t-[3px] border-t-acento p-4 md:grid-cols-2">
      <h3 className="col-span-full text-[15px] font-bold text-fg-1">
        <span className="mr-2 font-mono text-acento-texto">{passo.codigo}</span>
        {passo.passo}
      </h3>
      <div className="col-span-full flex flex-wrap gap-1.5">
        {raiasDoPasso.map((r) => (
          <button
            key={r.chave}
            type="button"
            onClick={() => r.cargo_slug && onVerCargo(r.cargo_slug)}
            disabled={!r.cargo_slug}
            className="rounded-full border border-acento bg-acento-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto disabled:opacity-60"
          >
            {r.nome}
            {r.cargo_slug ? " · ver cargo" : ""}
          </button>
        ))}
      </div>
      <dl className="m-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">Faz</dt>
        <dd className="m-0 text-sm text-fg-2">{passo.faz ?? "—"}</dd>
      </dl>
      <dl className="m-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">Entrega</dt>
        <dd className="m-0 text-sm text-fg-2">{passo.entrega ?? "—"}</dd>
      </dl>
      <dl className="col-span-full m-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">Playbook hoje</dt>
        <dd className="m-0 text-sm text-fg-2">{passo.playbook_texto ?? "a modelar"}</dd>
        {passo.playbooks.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {passo.playbooks.map((pb, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onAbrirPlaybook(pb.pacote_slug, pb.slug)}
                className="rounded-full border border-acento bg-acento-suave px-2.5 py-0.5 text-xs font-medium text-acento-texto"
              >
                abrir playbook: {pb.slug.replace(/-/g, " ")}
              </button>
            ))}
          </div>
        )}
      </dl>
      <dl className="m-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">Quem faz (texto do doc)</dt>
        <dd className="m-0 text-sm text-fg-2">{passo.quem ?? "—"}</dd>
      </dl>
      <dl className="m-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">Gate</dt>
        <dd className="m-0 text-sm text-fg-2">{passo.gate ?? "nenhum"}</dd>
      </dl>
      <div className="col-span-full flex flex-wrap items-center gap-1.5 text-xs text-fg-3">
        {vemDe.length > 0 ? (
          <>
            <span>vem de</span>
            {vemDe.map((p) => (
              <button
                key={p.codigo}
                type="button"
                onClick={() => onSelecionar(p.codigo)}
                className="rounded-md border border-borda bg-bg-sutil px-2 py-0.5 text-fg-2"
              >
                {p.codigo} {p.passo}
              </button>
            ))}
          </>
        ) : (
          <span>início do fluxo</span>
        )}
        {passo.proximos.length > 0 && (
          <>
            <span>passa pra</span>
            {passo.proximos.map((codigo) => {
              const p = byCodigo.get(codigo);
              return (
                <button
                  key={codigo}
                  type="button"
                  onClick={() => onSelecionar(codigo)}
                  className="rounded-md border border-borda bg-bg-sutil px-2 py-0.5 text-fg-2"
                >
                  {codigo} {p?.passo ?? ""}
                </button>
              );
            })}
          </>
        )}
        {passo.sai_caio && <span className="rounded-md bg-info-suave px-2 py-0.5 text-info">CAIO (tradução)</span>}
      </div>
    </Card>
  );
}

export function FluxoOndas({ raias, passos, ondas, onVerCargo, onAbrirPlaybook }: Props) {
  const passosOrdenados = useMemo(() => [...passos].sort((a, b) => a.ordem - b.ordem), [passos]);
  const [selecionado, setSelecionado] = useState<string | null>(passosOrdenados[0]?.codigo ?? null);
  const passoAtual = passosOrdenados.find((p) => p.codigo === selecionado) ?? passosOrdenados[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      {ondas.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="h5">Ondas: em que ordem os times são formados</h2>
          <p className="max-w-[92ch] text-sm text-fg-3">
            Primeiro quem forma, depois quem contrata, depois quem converte em agente; só então as áreas de
            negócio. Clique num cargo pra abrir o cartão dele no organograma.
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
            {ondas.map((o) => (
              <OndaCard key={o.codigo} onda={o} onVerCargo={onVerCargo} />
            ))}
          </div>
        </section>
      )}

      {passosOrdenados.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="h5">Workflow de modelagem de um cargo</h2>
          <p className="max-w-[92ch] text-sm text-fg-3">
            Cada raia é um papel; cada caixa passa um artefato pra próxima. Caixas na mesma coluna rodam em
            paralelo. Clique numa caixa pra ver o que faz, o que entrega, pra quem passa e quem aprova.
          </p>
          <LanesGrid
            raias={raias}
            passos={passosOrdenados}
            selecionado={selecionado}
            onSelecionar={setSelecionado}
            onVerCargo={onVerCargo}
          />
          {passoAtual && (
            <PassoDetalhe
              passo={passoAtual}
              raias={raias}
              passos={passosOrdenados}
              onSelecionar={setSelecionado}
              onVerCargo={onVerCargo}
              onAbrirPlaybook={onAbrirPlaybook}
            />
          )}
        </section>
      )}
    </div>
  );
}
