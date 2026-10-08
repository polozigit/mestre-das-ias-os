import Link from "next/link";
import { Activity, ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { requireAcesso } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Empty } from "@/components/ui/Empty";
import { Timeline, TimelineGroup } from "@/components/ui/Timeline";
import { ItemAtividade } from "@/components/painel/ItemAtividade";
import { LinkBotao } from "@/components/painel/LinkBotao";
import { agruparPorDia, TIPOS_DE_SISTEMA_PARA_FILTRO } from "@/components/painel/atividade-helpers";
import { buscarNomesDosAutores } from "@/components/painel/atividade-dados";

const POR_PAGINA = 30;

type FiltroQuem = "humanos" | "ias" | null;

/** Monta a URL preservando filtro + eventos de sistema + página (trocar de filtro volta pra página 1). */
function montarHref(quem: FiltroQuem, pagina: number, sistema: boolean): string {
  const params = new URLSearchParams();
  if (quem) params.set("quem", quem);
  if (sistema) params.set("sistema", "1");
  if (pagina > 1) params.set("pagina", String(pagina));
  const query = params.toString();
  return query ? `/atividade?${query}` : "/atividade";
}

function primeiroValor(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Linha do tempo completa da empresa, paginada (30 por página) e filtrável
 * por quem fez: pessoas (usuario_id) ou IAs (agente_id). Os eventos de sistema
 * (o banco e a instalação gravando sozinhos: "Empresa criada", "Proteção de dados
 * ligada"...) ficam escondidos; o link "Mostrar eventos do sistema" (?sistema=1) traz
 * de volta. O filtro roda na consulta, pra página continuar cheia e a paginação certa.
 */
export default async function PaginaAtividade({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  await requireAcesso("atividade");
  const busca = await searchParams;

  const pagina = Math.max(1, Number.parseInt(primeiroValor(busca.pagina) ?? "1", 10) || 1);
  const quemBruto = primeiroValor(busca.quem);
  const quem: FiltroQuem =
    quemBruto === "humanos" || quemBruto === "ias" ? quemBruto : null;
  const mostrarSistema = primeiroValor(busca.sistema) === "1";

  const supabase = await createClient();
  const de = (pagina - 1) * POR_PAGINA;

  // Pede 1 linha a mais que a página: se ela vier, existe página mais antiga
  // (sem pagar um count exato em tabela que só cresce).
  let consulta = supabase
    .from("atividade")
    .select("*")
    .order("quando", { ascending: false })
    .order("id", { ascending: false })
    .range(de, de + POR_PAGINA);
  if (quem === "humanos") consulta = consulta.not("usuario_id", "is", null);
  if (quem === "ias") consulta = consulta.not("agente_id", "is", null);
  if (!mostrarSistema) consulta = consulta.not("tipo", "in", TIPOS_DE_SISTEMA_PARA_FILTRO);

  // Erro real (outage, RLS quebrada) estoura pro error boundary do (app) —
  // Empty é só pra zero-linhas legítimo, nunca disfarce de falha.
  const { data, error } = await consulta;
  if (error) throw error;
  const todas = data ?? [];
  const temMaisAntigas = todas.length > POR_PAGINA;
  const linhas = todas.slice(0, POR_PAGINA);

  const nomes = await buscarNomesDosAutores(supabase, linhas);
  const grupos = agruparPorDia(linhas);

  const filtros: { valor: FiltroQuem; rotulo: string }[] = [
    { valor: null, rotulo: "Tudo" },
    { valor: "humanos", rotulo: "Pessoas" },
    { valor: "ias", rotulo: "IAs" },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg-1">Atividade</h1>
          <p className="mt-1 text-sm text-fg-3">
            Tudo que pessoas, IAs e o sistema fizeram, do mais recente pro mais antigo.
          </p>
        </div>

        {/* Filtro por URL (links, não estado client): dá pra compartilhar e o voltar do navegador funciona */}
        <nav
          aria-label="Filtrar por quem fez"
          className="inline-flex items-center gap-1 rounded-md bg-bg-sutil p-1"
        >
          {filtros.map((filtro) => {
            const ativo = filtro.valor === quem;
            return (
              <Link
                key={filtro.rotulo}
                href={montarHref(filtro.valor, 1, mostrarSistema)}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  // min-h-11 = alvo de toque de 44px no celular; no desktop
                  // volta ao visual compacto do segmented control.
                  "inline-flex min-h-11 items-center rounded-sm px-3 py-1 text-xs font-semibold transition-colors md:min-h-0",
                  ativo
                    ? "bg-bg-elevada text-fg-1 shadow-[var(--sombra-sm)]"
                    : "text-fg-3 hover:text-fg-1",
                )}
              >
                {filtro.rotulo}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Só faz sentido sem o filtro de quem fez: evento de sistema não tem autor pessoa nem IA. */}
      {quem === null && (
        <Link
          href={montarHref(quem, 1, !mostrarSistema)}
          className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-acento-texto hover:underline md:min-h-0"
        >
          {mostrarSistema ? "Esconder eventos do sistema" : "Mostrar eventos do sistema"}
        </Link>
      )}

      {linhas.length === 0 ? (
        pagina > 1 ? (
          <Empty
            icon={SearchX}
            title="Não existe nada tão antigo assim"
            description="Esta página está além do fim da linha do tempo."
            action={<LinkBotao href={montarHref(quem, 1, mostrarSistema)}>Voltar às mais recentes</LinkBotao>}
          />
        ) : (
          <Empty
            icon={Activity}
            title={quem ? "Nada por aqui com esse filtro" : "Nenhuma atividade ainda"}
            description={
              quem === "humanos"
                ? "Nenhuma ação de pessoa registrada até agora."
                : quem === "ias"
                  ? // Honesto com o v1: nenhum caminho de HOJE grava linha com
                    // agente — o registro automático chega com o time de sistema.
                    "As ações das IAs passam a aparecer aqui quando o time de sistema da empresa começar a registrar os trabalhos delas. Por enquanto esta aba fica vazia mesmo."
                  : "Cada ação de pessoas e IAs vira uma linha aqui. É a memória da empresa."
            }
            action={
              quem ? (
                <LinkBotao href={montarHref(null, 1, mostrarSistema)}>Ver tudo</LinkBotao>
              ) : mostrarSistema ? undefined : (
                <LinkBotao href={montarHref(null, 1, true)}>Mostrar eventos do sistema</LinkBotao>
              )
            }
          />
        )
      ) : (
        <>
          <Timeline>
            {grupos.map((grupo) => (
              <TimelineGroup key={grupo.rotulo} label={grupo.rotulo}>
                {grupo.linhas.map((linha, i) => (
                  <ItemAtividade
                    key={linha.id}
                    linha={linha}
                    nomes={nomes}
                    isLast={i === grupo.linhas.length - 1}
                  />
                ))}
              </TimelineGroup>
            ))}
          </Timeline>

          <div className="flex items-center justify-between gap-3 border-t border-borda-suave pt-4">
            {pagina > 1 ? (
              <LinkBotao href={montarHref(quem, pagina - 1, mostrarSistema)}>
                <ChevronLeft size={16} />
                Mais recentes
              </LinkBotao>
            ) : (
              <span aria-hidden />
            )}
            <span className="text-xs tabular-nums text-fg-4">Página {pagina}</span>
            {temMaisAntigas ? (
              <LinkBotao href={montarHref(quem, pagina + 1, mostrarSistema)}>
                Mais antigas
                <ChevronRight size={16} />
              </LinkBotao>
            ) : (
              <span aria-hidden />
            )}
          </div>
        </>
      )}
    </div>
  );
}
