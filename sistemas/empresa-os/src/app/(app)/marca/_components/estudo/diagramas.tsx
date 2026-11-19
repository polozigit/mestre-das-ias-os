import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROXIMIDADE_ZONA,
  ROTULOS_DEGRAU,
  ROTULOS_ESTADO,
  ROTULOS_FUNCAO,
  ROTULOS_ZONA,
  juntarComE,
  type CapForcas,
  type CapSabe,
  type EstadoCaminho,
  type FuncaoCompra,
  type Papel,
  type Peso,
  type PontoCaminho,
  type Posicao,
  type Zona,
} from "@/lib/persona-estudo";
import { Marca, ROTULO, Rotulado } from "./pecas";

/*
 * Os diagramas do estudo. Cada um tem a descrição em texto (aria-label ou o próprio texto da lista) e só usa
 * `style` para posição ou tamanho calculado de dado já validado (a posição 0 a 100 de um ponto, o tamanho de
 * um anel).
 */

const arred = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Anéis: quem pesa na compra
// ---------------------------------------------------------------------------

const FORCA_FUNCAO: Record<FuncaoCompra, number> = { decide: 3, influencia: 2, usa: 1 };

const ANEL_FUNCAO: Record<FuncaoCompra, string> = {
  decide: "border-solid border-fg-1",
  influencia: "border-dashed border-alerta",
  usa: "border-dotted border-fg-3",
};

const AMOSTRA_FUNCAO: Record<FuncaoCompra, string> = {
  decide: "bg-acento",
  influencia: "border-[1.5px] border-dashed border-alerta",
  usa: "border-[1.5px] border-dotted border-fg-3",
};

const ondeNoAnel = (nivel: number) => (nivel === 0 ? "no centro" : `no anel ${nivel}`);

/** Descrição em texto dos anéis, do centro para fora. */
export function descricaoDosAneis(papeis: Papel[]): string {
  const ordem = [...papeis].sort((a, b) => a.nivel - b.nivel);
  return `Quem pesa na compra: ${ordem.map((p) => `${ondeNoAnel(p.nivel)}, ${p.papel}, que ${ROTULOS_FUNCAO[p.funcao]}`).join("; ")}.`;
}

export function Aneis({ papeis }: { papeis: Papel[] }) {
  const maior = Math.max(...papeis.map((p) => p.nivel));
  const centro = 28;
  const tamanho = (n: number) => (maior === 0 ? 44 : centro + ((100 - centro) * n) / maior);
  const niveis = Array.from({ length: maior + 1 }, (_, n) => n);
  const doNivel = (n: number) => papeis.filter((p) => p.nivel === n);
  const funcaoForte = (ps: Papel[]): FuncaoCompra =>
    ps.reduce<FuncaoCompra>((f, p) => (FORCA_FUNCAO[p.funcao] > FORCA_FUNCAO[f] ? p.funcao : f), "usa");

  return (
    <div role="img" aria-label={descricaoDosAneis(papeis)} className="relative mx-auto aspect-square w-full max-w-[22rem]">
      {[...niveis].reverse().map((n) => {
        const s = tamanho(n);
        const ps = doNivel(n);
        if (n === 0) {
          return (
            <div
              key={n}
              className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-acento p-2 text-center"
              style={{ width: `${s}%`, height: `${s}%` }}
            >
              <span className="line-clamp-3 text-[12px] font-semibold leading-tight text-fg-sobre-acento">{juntarComE(ps.map((p) => p.papel))}</span>
            </div>
          );
        }
        return (
          <div
            key={n}
            className={cn("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border", ps.length > 0 ? ANEL_FUNCAO[funcaoForte(ps)] : "border-borda")}
            style={{ width: `${s}%`, height: `${s}%` }}
          />
        );
      })}
      {niveis
        .filter((n) => n > 0 && doNivel(n).length > 0)
        .map((n) => {
          // no meio da faixa entre este anel e o de dentro
          const topo = (100 - tamanho(n)) / 2 + (tamanho(n) - tamanho(n - 1)) / 4;
          return (
            <span
              key={`r${n}`}
              className="absolute left-1/2 line-clamp-2 max-w-[46%] -translate-x-1/2 -translate-y-1/2 text-center text-[11.5px] leading-tight text-fg-2"
              style={{ top: `${arred(topo)}%` }}
            >
              {juntarComE(doNivel(n).map((p) => p.papel))}
            </span>
          );
        })}
    </div>
  );
}

/** Legenda dos anéis: cada papel com função, anel, texto e selo. */
export function LegendaDosAneis({ papeis }: { papeis: Papel[] }) {
  return (
    <ul className="mt-5 grid gap-4">
      {[...papeis]
        .sort((a, b) => a.nivel - b.nivel)
        .map((p, i) => (
          <li key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-3">
            <span aria-hidden className={cn("mt-1 size-3.5 rounded-full", AMOSTRA_FUNCAO[p.funcao])} />
            <div className="min-w-0">
              <p className="break-words text-fg-1">
                <span className="font-semibold">{p.papel}</span>
                <span className="text-fg-3">
                  {" "}
                  {ROTULOS_FUNCAO[p.funcao]}, {ondeNoAnel(p.nivel)}
                </span>
              </p>
              {p.texto && <p className="mt-0.5 break-words text-fg-2">{p.texto}</p>}
              <Marca origem={p.origem} />
            </div>
          </li>
        ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Balança: empurra e segura
// ---------------------------------------------------------------------------

const ROTULO_INCLINACAO: Record<CapForcas["inclinacao"], string> = {
  segura: "Balança pendendo para o lado que segura",
  empurra: "Balança pendendo para o lado que empurra",
  equilibrio: "Balança em equilíbrio",
};

function Prato({ lado, pesos, maisPesado }: { lado: "empurra" | "segura"; pesos: Peso[]; maisPesado: boolean }) {
  const empurra = lado === "empurra";
  return (
    <div className={cn("min-w-0 pt-4 motion-safe:transition-[margin]", maisPesado && "mt-6")}>
      <h3 className={cn("font-display text-[clamp(1.5rem,4cqi,2.25rem)] font-normal leading-none", empurra ? "text-ok" : "text-erro")}>
        {empurra ? "Empurra" : "Segura"}
      </h3>
      <p className="mt-1.5 text-[13px] leading-snug text-fg-3">{empurra ? "incômodo de hoje e atração pelo novo" : "medo da mudança e costume"}</p>
      <ul className="mt-3.5 grid gap-2">
        {pesos.map((p, i) => (
          <li
            key={i}
            className={cn(
              "min-w-0 rounded-md p-2.5 text-[14px] leading-snug text-fg-1 @md:p-3 @md:text-[14.5px]",
              p.ausente ? "border-[1.5px] border-dashed border-ok" : empurra ? "bg-ok-suave" : "bg-erro-suave",
              p.peso === 3 && "font-semibold",
            )}
          >
            <span aria-hidden className="mb-1.5 flex gap-0.5">
              {[1, 2, 3].map((k) => (
                <span key={k} className={cn("h-1 w-3 rounded-sm", k <= p.peso ? (empurra ? "bg-ok" : "bg-erro") : "bg-borda")} />
              ))}
            </span>
            <span className="block break-words">{p.texto}</span>
            <span className="sr-only">Peso {p.peso} de 3.</span>
            {p.ausente && <span className="mt-1 block text-[13px] font-normal text-fg-2">peso que existe e não está sendo usado</span>}
            <Marca origem={p.origem} className="font-normal" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Balanca({ forcas }: { forcas: CapForcas }) {
  const [yE, yS] = forcas.inclinacao === "segura" ? [22, 50] : forcas.inclinacao === "empurra" ? [50, 22] : [36, 36];
  return (
    <div>
      <svg viewBox="0 0 600 72" role="img" aria-label={ROTULO_INCLINACAO[forcas.inclinacao]} className="block h-auto w-full text-fg-1">
        <line x1="40" y1={yE} x2="560" y2={yS} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M300 36 L286 70 L314 70 Z" fill="currentColor" />
        <circle cx="40" cy={yE} r="6" className="fill-ok" />
        <circle cx="560" cy={yS} r="6" className="fill-erro" />
      </svg>
      <div className="-mt-1.5 grid grid-cols-2 gap-3 @2xl:gap-14">
        <Prato lado="empurra" pesos={forcas.empurra} maisPesado={forcas.inclinacao === "empurra"} />
        <Prato lado="segura" pesos={forcas.segura} maisPesado={forcas.inclinacao === "segura"} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Caminho até a compra
// ---------------------------------------------------------------------------

const PONTO_ESTADO: Record<EstadoCaminho, string> = {
  atua: "border-fg-1 bg-fg-1",
  fora: "border-fg-1 bg-bg",
  vazamento: "border-erro bg-erro",
};

/** Colunas da trilha deitada (no computador), uma por ponto: classes fixas para o Tailwind achar. */
const COLUNAS: Record<number, string> = {
  3: "@3xl:grid-cols-3",
  4: "@3xl:grid-cols-4",
  5: "@3xl:grid-cols-5",
  6: "@3xl:grid-cols-6",
  7: "@3xl:grid-cols-7",
  8: "@3xl:grid-cols-8",
};

export function Caminho({ pontos }: { pontos: PontoCaminho[] }) {
  return (
    <>
      <ol className={cn("mt-5 grid @3xl:gap-4", COLUNAS[pontos.length])}>
        {pontos.map((p, i) => (
          <li key={i} className="relative min-w-0 pb-7 pl-9 @3xl:pb-0 @3xl:pl-0 @3xl:pt-9">
            {i < pontos.length - 1 && (
              <span
                aria-hidden
                className="absolute -bottom-1.5 left-[7px] top-1.5 w-0.5 bg-borda @3xl:-right-4 @3xl:bottom-auto @3xl:left-4 @3xl:top-[7px] @3xl:h-0.5 @3xl:w-auto"
              />
            )}
            <span aria-hidden className={cn("absolute left-0 top-1 size-4 rounded-full border-2 @3xl:top-0", PONTO_ESTADO[p.estado])} />
            <h4 className="break-words text-[15px] font-semibold leading-snug text-fg-1">{p.etapa}</h4>
            <span className="sr-only">Situação: {ROTULOS_ESTADO[p.estado]}</span>
            <p className="mt-1.5 break-words text-[14.5px] leading-snug text-fg-2">{p.texto}</p>
            {p.alerta && (
              <p className="mt-2.5 flex gap-1.5 text-[13.5px] font-medium leading-snug text-fg-1">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-erro" />
                <span className="min-w-0 break-words">{p.alerta}</span>
              </p>
            )}
            <Marca origem={p.origem} />
          </li>
        ))}
      </ol>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-fg-3">
        {(["atua", "fora", "vazamento"] as const).map((e) => (
          <li key={e} className="inline-flex items-center gap-2">
            <span aria-hidden className={cn("size-3 rounded-full border-2", PONTO_ESTADO[e])} />
            {ROTULOS_ESTADO[e]}
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mapa de posição
// ---------------------------------------------------------------------------

export function descricaoDoMapa(p: Posicao): string {
  const pontos = p.pontos
    .map((x) => `${x.nome}${x.nosso ? ", você" : ""}: ${x.x} de 100 na horizontal e ${x.y} na vertical`)
    .join("; ");
  return `Mapa de posição. Horizontal: de ${p.eixo_x.esq} a ${p.eixo_x.dir}. Vertical: de ${p.eixo_y.baixo} a ${p.eixo_y.cima}. ${pontos}.`;
}

export function Mapa({ posicao }: { posicao: Posicao }) {
  return (
    <div role="img" aria-label={descricaoDoMapa(posicao)} className="relative aspect-square w-full max-w-[26rem] overflow-hidden rounded-lg border border-borda bg-bg">
      <span aria-hidden className="absolute right-0 top-0 h-1/2 w-1/2 bg-acento-suave" />
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-borda" />
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-borda" />
      <span className="absolute left-3.5 top-3 max-w-[45%] text-[10.5px] font-semibold uppercase leading-tight tracking-wider text-fg-3">{posicao.eixo_y.cima}</span>
      <span className="absolute bottom-3 left-3.5 max-w-[45%] text-[10.5px] font-semibold uppercase leading-tight tracking-wider text-fg-3">{posicao.eixo_y.baixo}</span>
      <span className="absolute left-3.5 top-[calc(50%+0.5rem)] max-w-[45%] text-[10.5px] font-semibold uppercase leading-tight tracking-wider text-fg-3">{posicao.eixo_x.esq}</span>
      <span className="absolute right-3.5 top-[calc(50%+0.5rem)] max-w-[45%] text-right text-[10.5px] font-semibold uppercase leading-tight tracking-wider text-fg-3">{posicao.eixo_x.dir}</span>
      {posicao.pontos.map((p) => {
        // perto da borda, o nome vai para dentro do quadro em vez de sair dele
        const alinhamento = p.x < 20 ? "-translate-x-[9px] items-start text-left" : p.x > 80 ? "-translate-x-[calc(100%-9px)] items-end text-right" : "-translate-x-1/2 items-center text-center";
        return (
          <div
            key={p.nome}
            className={cn("absolute flex -translate-y-[9px] gap-1", p.y < 15 ? "flex-col-reverse -translate-y-[calc(100%-9px)]" : "flex-col", alinhamento)}
            style={{ left: `${p.x}%`, top: `${100 - p.y}%` }}
          >
            <span aria-hidden className={cn("rounded-full border-2", p.nosso ? "size-[18px] border-acento bg-acento" : "m-[3px] size-3 border-fg-2 bg-bg")} />
            <span className={cn("max-w-28 text-[11.5px] leading-tight", p.nosso ? "text-[12.5px] font-bold text-fg-1" : "font-medium text-fg-2")}>{p.nome}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zonas: onde está
// ---------------------------------------------------------------------------

const BORDA_ZONA: Record<number, string> = { 4: "border-fg-1", 3: "border-fg-2", 2: "border-fg-3", 1: "border-fg-4" };

export function Zonas({ zonas }: { zonas: Zona[] }) {
  return (
    <>
      <div aria-hidden className="mb-2.5 hidden items-center gap-3 text-[12.5px] font-medium text-fg-3 @3xl:flex">
        <span>Mais perto de você</span>
        <span className="h-0.5 flex-1 bg-linear-to-r from-fg-1 to-borda" />
        <span>Mais longe</span>
      </div>
      <div className="grid @3xl:grid-cols-4 @3xl:gap-5">
        {zonas.map((z) => {
          const perto = PROXIMIDADE_ZONA[z.tipo];
          return (
            <div key={z.tipo} className={cn("min-w-0 border-t-2 py-6", BORDA_ZONA[perto])}>
              <span aria-hidden className="mb-2.5 flex gap-1">
                {[1, 2, 3, 4].map((k) => (
                  <span key={k} className={cn("h-1 w-4 rounded-sm", k <= perto ? "bg-fg-1" : "bg-borda")} />
                ))}
              </span>
              <h3 className="font-display text-[1.4rem] font-normal leading-tight text-fg-1">{ROTULOS_ZONA[z.tipo]}</h3>
              <ul className="mt-3.5 grid gap-3">
                {z.lugares.map((l, i) => (
                  <li key={i} className="break-words text-[14.5px] leading-snug text-fg-1">
                    {l.texto}
                    <Marca origem={l.origem} className="mt-1.5" />
                  </li>
                ))}
              </ul>
              <Rotulado rotulo="Como chegar" className="mt-4 rounded-md bg-bg-sutil p-3.5 text-sm text-fg-1">
                {z.como_chegar}
              </Rotulado>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Escada: o quanto já sabe
// ---------------------------------------------------------------------------

/** Recuo de cada degrau: classes fixas (celular e computador). */
const RECUO = ["ml-0", "ml-2 @3xl:ml-[7%]", "ml-4 @3xl:ml-[14%]", "ml-6 @3xl:ml-[21%]", "ml-8 @3xl:ml-[28%]"] as const;

export function Escada({ sabe }: { sabe: CapSabe }) {
  return (
    <ol className="grid gap-2.5">
      {sabe.degraus.map((d, i) => {
        const foco = d.nivel === sabe.foco;
        return (
          <li
            key={d.nivel}
            className={cn(
              "grid min-w-0 gap-2.5 rounded-md p-5 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] @3xl:gap-6",
              RECUO[i],
              foco ? "bg-acento text-fg-sobre-acento" : "bg-bg-sutil text-fg-1",
            )}
          >
            <div className="min-w-0">
              <div className="flex items-baseline gap-3">
                <span className={cn("font-display text-3xl leading-none", foco ? "text-fg-sobre-acento/70" : "text-fg-3")}>{d.nivel}</span>
                <h3 className="font-display text-xl font-medium leading-tight tracking-[-0.01em]">{ROTULOS_DEGRAU[d.nivel]}</h3>
              </div>
              {foco && (
                <span className="mt-2.5 inline-flex rounded-pill bg-fg-sobre-acento px-2 py-1 text-[11.5px] font-semibold leading-none text-acento">maior oportunidade</span>
              )}
              <p className={cn("mt-2 break-words text-sm", foco ? "text-fg-sobre-acento" : "text-fg-2")}>{d.sinal}</p>
              {d.onde && (
                <p className={cn("mt-2.5 inline-block break-words border-b text-[13px] font-semibold", foco ? "border-fg-sobre-acento/50" : "border-fg-4")}>
                  <span className="sr-only">Onde está: </span>
                  {d.onde}
                </p>
              )}
            </div>
            <div className="min-w-0 text-[15px]">
              <span className={cn(ROTULO, "mb-1 block", foco && "text-fg-sobre-acento/70")}>O que dizer</span>
              <p className="break-words">{d.o_que_dizer}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
