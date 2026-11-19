import type { ReactNode } from "react";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import {
  ROTULOS_NIVEL,
  ROTULOS_ORIGEM,
  type DescobertaPersona,
  type DuvidaPersona,
  type FontePersona,
  type ItemPersona,
  type LacunaPersona,
  type OrigemPersona,
  type PlacarPersona,
  type SegmentoConsciencia,
  type TipoOrigem,
} from "@/lib/persona-dados";

/*
 * Peças da persona em blocos. Tudo roda no servidor e todo texto do documento entra como texto do React.
 * Só classes semânticas do tema (nenhuma cor literal): o claro e o escuro vêm do theme.css.
 */

export const SEM_DADO = "Ainda não sabemos.";

const TOM_ORIGEM: Record<TipoOrigem, PillTone> = {
  dossie: "info",
  relato: "info",
  material: "brand",
  analise: "brand",
  pesquisa: "neutral",
  clientes: "neutral",
  hipotese: "warning",
  proposta: "warning",
  "nao-consta": "neutral",
};

/** Os selos de origem de um item, um por origem, na ordem do documento. */
export function Selos({ origens }: { origens: OrigemPersona[] }) {
  if (origens.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {origens.map((o, i) => (
        <Pill key={`${o.tipo}-${i}`} tone={TOM_ORIGEM[o.tipo]} className="px-2 py-0 text-[11px]">
          <span className="sr-only">Origem: </span>
          {ROTULOS_ORIGEM[o.tipo]}
        </Pill>
      ))}
    </span>
  );
}

/** Texto discreto para campo sem dado. Nunca se inventa conteúdo no lugar. */
export function SemDado() {
  return <p className="text-sm italic text-fg-3">{SEM_DADO}</p>;
}

/** O texto de um item e os selos dele embaixo; item vazio diz que ainda não sabemos. */
export function TextoComSelos({ item, className }: { item: ItemPersona | null; className?: string }) {
  if (!item || item.texto === "") return <SemDado />;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <p className="min-w-0 break-words text-sm leading-relaxed text-fg-1">{item.texto}</p>
      <Selos origens={item.origens} />
    </div>
  );
}

/** Cartão de um campo: rótulo e texto com selos. */
export function CartaoCampo({ rotulo, item }: { rotulo: string; item: ItemPersona | null }) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-borda-suave bg-bg-elevada p-5">
      <h4 className="text-sm font-semibold text-fg-1">{rotulo}</h4>
      <TextoComSelos item={item} />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Placar
// ---------------------------------------------------------------------------

const ITENS_PLACAR: ReadonlyArray<{ chave: keyof PlacarPersona; rotulo: string }> = [
  { chave: "respondido", rotulo: "Você respondeu" },
  { chave: "pesquisa", rotulo: "Pesquisa na internet" },
  { chave: "analise", rotulo: "Análise do especialista" },
  { chave: "hipotese", rotulo: "Hipótese" },
  { chave: "naoSabemos", rotulo: "Ainda não sabemos" },
];

/** 5 números: 2 colunas no celular (o último ocupa a linha inteira) e 5 a partir do tablet. */
export function Placar({ placar }: { placar: PlacarPersona }) {
  return (
    <dl aria-label="De onde vem cada item" className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {ITENS_PLACAR.map((i, n) => (
        <div
          key={i.chave}
          className={cn(
            "flex flex-col-reverse justify-end gap-1 rounded-lg border border-borda-suave bg-bg-elevada px-4 py-3",
            n === ITENS_PLACAR.length - 1 && "col-span-2 md:col-span-1",
          )}
        >
          <dt className="text-xs leading-snug text-fg-3">{i.rotulo}</dt>
          <dd className="font-display text-2xl font-bold tabular-nums text-fg-1">{placar[i.chave]}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Descobertas e plano de mensagem
// ---------------------------------------------------------------------------

/** Um par rótulo e item dentro de um cartão (dt e dd). */
function ParRotulado({ rotulo, item, className }: { rotulo: string; item: ItemPersona | null; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <dt className="text-sm font-semibold text-fg-1">{rotulo}</dt>
      <dd>
        <TextoComSelos item={item} />
      </dd>
    </div>
  );
}

/**
 * Cartão de uma descoberta: a conclusão como título do cartão, na fonte de título; embaixo, o que o dono disse e o
 * que o mercado mostra (lado a lado a partir do tablet, empilhado no celular); por fim, a ação.
 */
export function CartaoDescoberta({ d }: { d: DescobertaPersona }) {
  return (
    <li className="flex flex-col gap-5 rounded-lg border border-t-2 border-borda-suave border-t-acento bg-bg-elevada p-5 sm:p-6">
      <div className="flex flex-col gap-2">
        <h4 className="min-w-0 break-words font-display text-xl font-bold leading-snug text-balance text-fg-1 sm:text-2xl">{d.descoberta.texto}</h4>
        <Selos origens={d.descoberta.origens} />
      </div>
      <dl className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ParRotulado rotulo="O que você disse" item={d.voceDisse} className="rounded-md border border-borda-suave p-4" />
          <ParRotulado rotulo="O que o mercado mostra" item={d.mercadoMostra} className="rounded-md border border-borda-suave p-4" />
        </div>
        <div className="flex flex-col gap-1.5 border-t border-borda-suave pt-4">
          <dt className="text-sm font-semibold text-acento-texto">O que fazer</dt>
          <dd>
            <TextoComSelos item={d.oQueFazer} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** A promessa central em destaque, com rótulo e selos. */
export function Promessa({ item }: { item: ItemPersona }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-t-2 border-borda-suave border-t-acento bg-bg-elevada p-5 sm:p-6">
      <h4 className="text-sm font-semibold text-fg-2">Promessa central</h4>
      <p className="min-w-0 break-words font-display text-xl font-bold leading-snug text-balance text-fg-1 sm:text-2xl">{item.texto}</p>
      <Selos origens={item.origens} />
    </div>
  );
}

/** Dúvidas do cliente, cada uma com a resposta pronta embaixo: um par legível por linha, não uma tabela. */
export function ListaDuvidas({ duvidas }: { duvidas: DuvidaPersona[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-fg-1">Dúvidas do cliente e respostas prontas</h4>
      <ul className="flex flex-col divide-y divide-borda-suave rounded-lg border border-borda-suave bg-bg-elevada">
        {duvidas.map((d, i) => (
          <li key={`${i}-${d.duvida.texto}`} className="px-5 py-4">
            <dl className="flex max-w-3xl flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <dt className="text-xs font-semibold text-fg-3">Dúvida do cliente</dt>
                <dd className="flex flex-col gap-2">
                  <p className="min-w-0 break-words text-base font-semibold leading-snug text-fg-1">{d.duvida.texto}</p>
                  <Selos origens={d.duvida.origens} />
                </dd>
              </div>
              <div className="flex flex-col gap-1.5">
                <dt className="text-xs font-semibold text-fg-3">Resposta pronta</dt>
                <dd>
                  <TextoComSelos item={d.resposta} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compra e trava
// ---------------------------------------------------------------------------

/** Uma das colunas de forças: título no tom, borda de cima no tom, campos em linhas. */
export function ColunaForcas({
  titulo,
  tom,
  campos,
}: {
  titulo: string;
  tom: "ok" | "erro";
  campos: ReadonlyArray<{ rotulo: string; item: ItemPersona | null }>;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-t-2 border-borda-suave bg-bg-elevada",
        tom === "ok" ? "border-t-ok" : "border-t-erro",
      )}
    >
      <h4 className={cn("px-5 pt-4 pb-1 text-base font-semibold", tom === "ok" ? "text-ok" : "text-erro")}>{titulo}</h4>
      <dl className="flex flex-col divide-y divide-borda-suave">
        {campos.map((c) => (
          <div key={c.rotulo} className="flex flex-col gap-1.5 px-5 py-4">
            <dt className="text-sm font-semibold text-fg-1">{c.rotulo}</dt>
            <dd>
              <TextoComSelos item={c.item} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Palavras do cliente
// ---------------------------------------------------------------------------

export function Citacoes({ citacoes, origens }: { citacoes: string[]; origens: OrigemPersona[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {citacoes.map((c, i) => (
        <li key={`${i}-${c}`} className="flex flex-col gap-3 rounded-lg border border-borda-suave bg-bg-elevada p-5">
          <blockquote className="m-0 min-w-0 break-words font-display text-xl font-semibold leading-snug text-balance text-fg-1">
            <span aria-hidden className="text-fg-4">“</span>
            {c}
            <span aria-hidden className="text-fg-4">”</span>
          </blockquote>
          <Selos origens={origens} />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Consciência
// ---------------------------------------------------------------------------

/** Trilho de 5 pontos preenchido até o nível. */
export function TrilhoNivel({ nivel }: { nivel: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div aria-hidden className="relative flex h-6 items-center justify-between">
      <div aria-hidden className="absolute inset-x-1.5 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-borda" />
      <div
        aria-hidden
        className="absolute left-1.5 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-acento"
        style={{ width: `calc((100% - 0.75rem) * ${(nivel - 1) / 4})` }}
      />
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden
          className={cn(
            "relative size-3 rounded-full",
            n <= nivel ? "bg-acento" : "border-2 border-borda bg-bg-elevada",
            n === nivel && "ring-4 ring-acento-suave",
          )}
        />
      ))}
    </div>
  );
}

export function CartaoSegmento({ s }: { s: SegmentoConsciencia }) {
  return (
    <li className="flex flex-col gap-4 rounded-lg border border-borda-suave bg-bg-elevada p-5">
      <h4 className="min-w-0 break-words text-base font-semibold text-fg-1">{s.segmento}</h4>
      {s.nivel !== null ? (
        <div className="flex flex-col gap-2">
          <TrilhoNivel nivel={s.nivel} />
          <p className="text-sm text-fg-2">
            <span className="font-semibold tabular-nums text-fg-1">Nível {s.nivel} de 5:</span> {ROTULOS_NIVEL[s.nivel]}
          </p>
        </div>
      ) : (
        s.rotuloNivel && <p className="text-sm text-fg-2">Nível: {s.rotuloNivel}</p>
      )}
      <dl className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <dt className="eyebrow">Sinal que mostra</dt>
          <dd>
            <TextoComSelos item={s.sinal} />
          </dd>
        </div>
        <div className="flex flex-col gap-1.5">
          <dt className="eyebrow">O que dizer</dt>
          <dd>
            <TextoComSelos item={s.comunicacao} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

// ---------------------------------------------------------------------------
// O que falta e fontes
// ---------------------------------------------------------------------------

export function CartaoLacuna({ l }: { l: LacunaPersona }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-borda-suave bg-bg-elevada p-5">
      <h4 className="min-w-0 break-words text-sm font-semibold text-fg-1">{l.lacuna}</h4>
      {l.pergunta && (
        <p className="min-w-0 break-words text-sm text-fg-2">
          <span className="font-semibold text-fg-1">Pergunta para fechar:</span> {l.pergunta}
        </p>
      )}
      {l.quem && <p className="text-xs text-fg-3">Quem responde: {l.quem}</p>}
    </li>
  );
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

export function ListaFontes({ fontes }: { fontes: FontePersona[] }) {
  return (
    <ul className="flex flex-col divide-y divide-borda-suave rounded-lg border border-borda-suave bg-bg-elevada">
      {fontes.map((f) => (
        <li key={f.n} className="flex min-w-0 flex-col gap-0.5 px-5 py-3 text-sm sm:flex-row sm:items-baseline sm:gap-3">
          <span className="tabular-nums text-fg-3">[{f.n}]</span>
          {f.url ? (
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 min-w-0 items-center break-words text-acento-texto underline underline-offset-2 sm:min-h-0"
            >
              {f.titulo}
            </a>
          ) : (
            <span className="min-w-0 break-words text-fg-1">{f.titulo}</span>
          )}
          {f.acessado && <span className="shrink-0 text-xs text-fg-3 sm:ml-auto">visto em {dataBr(f.acessado)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Grade simples de cartões: 1 coluna no celular. */
export function Grade({ colunas = 2, children }: { colunas?: 2 | 3; children: ReactNode }) {
  return <ul className={cn("grid min-w-0 grid-cols-1 gap-4", colunas === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>{children}</ul>;
}
