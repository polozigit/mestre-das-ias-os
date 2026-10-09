import { Pill, type PillTone } from "@/components/ui/Pill";
import { BotaoCopiar } from "@/components/cronograma/BotaoCopiar";
import {
  hexDaCor,
  pilhaDaFamilia,
  razaoTexto,
  type CorMarca,
  type DadosIdentidade,
  type EscalaVoz,
  type EixoVoz,
  type FonteMarca,
  type FuncaoCor,
  type Origem,
  type PapelLogo,
  type ParContraste,
  type UsoFonte,
} from "@/lib/marca-dados";

/*
 * Peças visuais da identidade da marca. Tudo roda no servidor (só o botão Copiar é do navegador).
 * Regra de cor: classes semânticas do tema em tudo. A ÚNICA exceção é a amostra da cor DA MARCA DO ALUNO,
 * que entra em `style` com HEX que já passou em ^#[0-9A-F]{6}$ (lib/marca-dados.ts) e é conferido de novo
 * antes de chegar aqui. Família de fonte idem: só o que passou em ^[A-Za-z0-9 ]{1,40}$.
 */

const SELO: Record<Origem, { rotulo: string; tom: PillTone }> = {
  dossie: { rotulo: "Dossiê", tom: "info" },
  persona: { rotulo: "Persona", tom: "info" },
  site: { rotulo: "Site", tom: "brand" },
  instagram: { rotulo: "Instagram", tom: "brand" },
  apresentacao: { rotulo: "Apresentação", tom: "brand" },
  logo: { rotulo: "Logo", tom: "brand" },
  pesquisa: { rotulo: "Pesquisa", tom: "neutral" },
  proposta: { rotulo: "Proposta do time", tom: "warning" },
  hipotese: { rotulo: "Hipótese", tom: "warning" },
};

/** Selo de origem de um item estruturado. Sem origem, nada. */
export function SeloOrigem({ origem }: { origem: Origem | null }) {
  if (!origem) return null;
  const s = SELO[origem];
  return (
    <Pill tone={s.tom} className="px-2 py-0 text-[11px]">
      <span className="sr-only">Origem: </span>
      {s.rotulo}
    </Pill>
  );
}

// ---------------------------------------------------------------------------
// Personalidade
// ---------------------------------------------------------------------------

export function Personalidade({ dados }: { dados: NonNullable<DadosIdentidade["personalidade"]> }) {
  return (
    <div className="flex flex-col gap-4">
      {dados.palavras.length > 0 && (
        <ul aria-label="Palavras de personalidade" className="flex flex-wrap gap-2">
          {dados.palavras.map((p) => (
            <li key={p} className="rounded-full bg-acento-suave px-4 py-1.5 text-base font-semibold text-acento-texto">
              {p}
            </li>
          ))}
        </ul>
      )}
      {dados.arquetipo && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <div className="flex flex-1 flex-col gap-1 rounded-lg border border-borda-suave bg-bg-elevada p-4">
            <span className="eyebrow">Arquétipo principal</span>
            <span className="font-display text-xl font-bold text-fg-1">{dados.arquetipo.principal}</span>
            <span>
              <SeloOrigem origem="proposta" />
            </span>
          </div>
          {dados.arquetipo.secundario && (
            <div className="flex flex-1 flex-col gap-1 rounded-lg border border-borda-suave bg-bg-elevada p-4">
              <span className="eyebrow">Arquétipo secundário</span>
              <span className="font-display text-xl font-bold text-fg-1">{dados.arquetipo.secundario}</span>
              <span>
                <SeloOrigem origem="proposta" />
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export type LogoParaTela = { papel: PapelLogo; url: string };

const ROTULO_PAPEL: Record<PapelLogo, string> = {
  principal: "Principal",
  icone: "Ícone",
  claro: "Versão clara",
  escuro: "Versão escura",
  svg: "Vetor (SVG)",
};

export function GradeLogos({ logos }: { logos: LogoParaTela[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {logos.map((l, i) => (
        <li key={`${l.papel}-${i}`} className="flex flex-col gap-2">
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-borda-suave">
            <figure className="m-0 flex h-36 flex-col bg-[var(--neutro-25)] sm:h-44">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.url} alt={`Logo, ${ROTULO_PAPEL[l.papel].toLowerCase()}`} className="min-h-0 flex-1 object-contain p-4" />
              <figcaption className="px-2 pb-1.5 text-center text-[11px] text-[var(--neutro-500)]">sobre claro</figcaption>
            </figure>
            <figure className="m-0 flex h-36 flex-col bg-[var(--neutro-900)] sm:h-44">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.url} alt="" aria-hidden className="min-h-0 flex-1 object-contain p-4" />
              <figcaption className="px-2 pb-1.5 text-center text-[11px] text-[var(--neutro-300)]">sobre escuro</figcaption>
            </figure>
          </div>
          <p className="text-sm font-semibold text-fg-1">{ROTULO_PAPEL[l.papel]}</p>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------

const ROTULO_FUNCAO: Record<FuncaoCor, string> = {
  principal: "Principal",
  apoio: "Apoio",
  destaque: "Destaque",
  fundo: "Fundo",
  texto: "Texto",
  neutro: "Neutro",
};

export function GradeCores({ cores }: { cores: CorMarca[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cores.map((c) => {
        const hex = hexDaCor(cores, c.nome);
        if (!hex) return null;
        return (
          <li key={c.nome} className="flex flex-col overflow-hidden rounded-lg border border-borda-suave bg-bg-elevada">
            <div aria-hidden className="h-28" style={{ backgroundColor: hex }} />
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-base font-semibold text-fg-1">{c.nome}</p>
                <Pill>{ROTULO_FUNCAO[c.funcao]}</Pill>
              </div>
              <div className="flex items-center justify-between gap-2">
                <code className="font-mono text-sm text-fg-2">{hex}</code>
                <BotaoCopiar texto={hex} />
              </div>
              <div>
                <SeloOrigem origem={c.origem} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ParesDeContraste({ pares, cores }: { pares: ParContraste[]; cores: CorMarca[] }) {
  const prontos = pares.flatMap((p) => {
    const texto = hexDaCor(cores, p.texto);
    const fundo = hexDaCor(cores, p.fundo);
    return texto && fundo ? [{ ...p, hexTexto: texto, hexFundo: fundo }] : [];
  });
  if (prontos.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-fg-1">Pares que funcionam</h4>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {prontos.map((p) => (
          <li key={`${p.texto}-${p.fundo}`} className="flex flex-col gap-2">
            <div
              role="img"
              aria-label={`${p.texto} sobre ${p.fundo}, contraste ${razaoTexto(p.razao)}, ${p.uso === "texto" ? "serve para texto" : "só para destaque"}`}
              className="grid h-20 place-items-center rounded-md border border-borda-suave font-display text-3xl font-bold"
              style={{ backgroundColor: p.hexFundo, color: p.hexTexto }}
            >
              <span aria-hidden>Aa</span>
            </div>
            <p className="text-xs leading-snug text-fg-3">
              {p.texto} sobre {p.fundo}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-fg-1">{razaoTexto(p.razao)}</span>
              <Pill tone={p.uso === "texto" ? "success" : "neutral"} className="px-2 py-0 text-[11px]">
                {p.uso === "texto" ? "texto" : "só destaque"}
              </Pill>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tipografia
// ---------------------------------------------------------------------------

const ROTULO_USO_FONTE: Record<UsoFonte, string> = { titulos: "Títulos", texto: "Texto corrido", reserva: "Reserva" };
const ROTULO_FONTE: Record<FonteMarca["fonte"], string> = {
  google: "Google Fonts",
  sistema: "Fonte do sistema",
  outra: "Fonte própria (não carregada aqui)",
};

export function AmostrasTipografia({ fontes }: { fontes: FonteMarca[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {fontes.map((f) => {
        const pilha = pilhaDaFamilia(f.familia);
        return (
          <li key={`${f.uso}-${f.familia}`} className="flex flex-col gap-3 rounded-lg border border-borda-suave bg-bg-elevada p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="eyebrow">{ROTULO_USO_FONTE[f.uso]}</span>
              <SeloOrigem origem={f.origem} />
            </div>
            <p aria-hidden className="text-6xl leading-none text-fg-1" style={{ fontFamily: pilha, fontWeight: f.pesos[f.pesos.length - 1] ?? 400 }}>
              Aa
            </p>
            <p className="text-xl font-semibold text-fg-1" style={{ fontFamily: pilha }}>
              {f.familia}
            </p>
            <p className="text-sm text-fg-2" style={{ fontFamily: pilha }}>
              ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
            </p>
            {f.pesos.length > 0 && (
              <ul className="flex flex-col gap-1">
                {f.pesos.map((p) => (
                  <li key={p} className="flex items-baseline gap-3 text-base text-fg-1" style={{ fontFamily: pilha, fontWeight: p }}>
                    <span className="w-9 shrink-0 font-sans text-xs font-normal tabular-nums text-fg-3">{p}</span>
                    Um texto na letra da marca
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-fg-3">
              {ROTULO_FONTE[f.fonte]} · licença {f.licenca === "sistema" ? "do sistema" : f.licenca}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Voz
// ---------------------------------------------------------------------------

const POLOS: Record<EixoVoz, [string, string]> = {
  "formal-casual": ["Formal", "Casual"],
  "serio-engracado": ["Sério", "Engraçado"],
  "respeitoso-irreverente": ["Respeitoso", "Irreverente"],
  "factual-entusiasmado": ["Factual", "Entusiasmado"],
};

function leitura(posicao: number, [a, b]: [string, string]): string {
  if (posicao === 3) return "No meio do caminho";
  const polo = posicao < 3 ? a : b;
  return `${posicao === 1 || posicao === 5 ? "Bem" : "Mais"} ${polo.toLowerCase()}`;
}

export function TrilhosDeVoz({ escalas }: { escalas: EscalaVoz[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {escalas.map((e) => {
        const polos = POLOS[e.eixo];
        const dita = leitura(e.posicao, polos);
        return (
          <li key={e.eixo} className="flex flex-col gap-3 rounded-lg border border-borda-suave bg-bg-elevada p-4">
            <div className="flex items-center justify-between gap-2 text-sm font-semibold text-fg-1">
              <span>{polos[0]}</span>
              <SeloOrigem origem={e.origem} />
              <span>{polos[1]}</span>
            </div>
            <div
              role="img"
              aria-label={`${polos[0]} a ${polos[1]}: posição ${e.posicao} de 5. ${dita}.`}
              className="relative mx-3 h-6"
            >
              <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-borda" />
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-borda" style={{ left: `${(n - 1) * 25}%` }} />
              ))}
              <span
                className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-acento shadow-[var(--sombra-sm)] ring-4 ring-acento-suave"
                style={{ left: `${(e.posicao - 1) * 25}%` }}
              />
            </div>
            <p className="text-center text-xs text-fg-3">
              {dita} <span className="tabular-nums">({e.posicao} de 5)</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function PalavrasDeTom({ palavras, anti }: { palavras: string[]; anti: string[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {palavras.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-fg-1">Soamos</h4>
          <ul className="flex flex-wrap gap-2">
            {palavras.map((p) => (
              <li key={p}>
                <Pill tone="success" className="px-3 py-1 text-sm">
                  {p}
                </Pill>
              </li>
            ))}
          </ul>
        </div>
      )}
      {anti.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-fg-1">Nunca soamos</h4>
          <ul className="flex flex-wrap gap-2">
            {anti.map((p) => (
              <li key={p}>
                <Pill tone="danger" className="px-3 py-1 text-sm">
                  <span aria-hidden>×</span> {p}
                </Pill>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
