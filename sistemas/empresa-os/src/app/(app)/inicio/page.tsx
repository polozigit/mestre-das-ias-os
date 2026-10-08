import Link from "next/link";
import { Activity, KanbanSquare, Network, Palette, Sparkles } from "lucide-react";
import { requireAcesso } from "@/lib/auth/guards";
import { pode } from "@/lib/auth/permissoes";
import { ESTADO_INSTALADO } from "@/lib/agentes/agrupar";
import { formatarData } from "@/lib/format";
import { hojeSaoPauloISO } from "@/lib/hoje";
import { estaAtrasada, montarCronograma, passoAtual, ROTULO_FASE } from "@/lib/cronograma";
import { buscarItensCronograma } from "@/lib/cronograma-dados";
import { hrefTarefa } from "@/lib/tarefas/grupos";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { KpiCard } from "@/components/ui/KpiCard";
import { Pill } from "@/components/ui/Pill";
import { Timeline } from "@/components/ui/Timeline";
import { ItemAtividade } from "@/components/painel/ItemAtividade";
import { LinkBotao } from "@/components/painel/LinkBotao";
import { buscarNomesDosAutores } from "@/components/painel/atividade-dados";
import { TIPOS_DE_SISTEMA_PARA_FILTRO } from "@/components/painel/atividade-helpers";
import { SaudacaoAoVivo } from "@/components/painel/SaudacaoAoVivo";
import { primeiroNome } from "@/components/painel/saudacao";

/* Fora do componente: a regra de pureza do React barra Date.now() no corpo
   do render (mesmo em server component); ler o relógio numa função nomeada é
   o padrão aceito — a página é dinâmica por request de qualquer jeito. */
function inicioDaJanelaDe7Dias(): string {
  return new Date(Date.now() - 7 * 86_400_000).toISOString();
}

type Busca = { [chave: string]: string | string[] | undefined };

/**
 * Início: saudação + 3 números que importam + as últimas coisas que
 * aconteceram. As queries chegam filtradas pela RLS (permissao por modulo); KPI de
 * modulo sem permissao nao aparece (nada de 0 enganoso).
 * Os eventos de sistema (o banco e a instalação gravando sozinhos) ficam escondidos; o link
 * "Mostrar eventos do sistema" (?sistema=1) traz de volta.
 */
export default async function PaginaInicio({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;
  const brutoSistema = Array.isArray(busca.sistema) ? busca.sistema[0] : busca.sistema;
  const mostrarSistema = brutoSistema === "1";

  const sessao = await requireAcesso("inicio");
  const supabase = await createClient();

  const seteDiasAtras = inicioDaJanelaDe7Dias();

  const veCronograma = pode(sessao, "cronograma");
  const veTarefas = pode(sessao, "tarefas");
  const veAgentes = pode(sessao, "agentes");
  // Sem o módulo, a RLS devolveria 0: mostrar "0" seria enganoso, então o KPI nem aparece.
  const semContagem = Promise.resolve({ count: null, error: null });

  let consultaAtividade = supabase
    .from("atividade")
    .select("*")
    .order("quando", { ascending: false })
    .order("id", { ascending: false })
    .limit(10);
  if (!mostrarSistema) consultaAtividade = consultaAtividade.not("tipo", "in", TIPOS_DE_SISTEMA_PARA_FILTRO);

  const [abertas, concluidasNaSemana, agentesInstalados, ultimas, itens] = await Promise.all([
    veTarefas
      ? supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .not("status", "in", "(CONCLUIDA,CANCELADA)")
      : semContagem,
    veTarefas
      ? supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .eq("status", "CONCLUIDA")
          .gte("concluida_em", seteDiasAtras)
      : semContagem,
    // Mesmo estado que o "Instalados" da tela de Agentes conta (ESTADO_INSTALADO): os dois números batem.
    veAgentes
      ? supabase
          .from("agentes")
          .select("id", { count: "exact", head: true })
          .eq("estado", ESTADO_INSTALADO)
      : semContagem,
    consultaAtividade,
    // Estoura sozinho em erro de banco (ver buscarItensCronograma).
    veCronograma ? buscarItensCronograma(supabase) : Promise.resolve([]),
  ]);

  // Outage não pode fingir empresa recém-nascida: erro real estoura pro
  // error boundary do (app); Empty fica só pro zero-linhas legítimo (RLS).
  const erro =
    abertas.error ?? concluidasNaSemana.error ?? agentesInstalados.error ?? ultimas.error;
  if (erro) throw erro;

  const linhas = ultimas.data ?? [];
  const nomes = await buscarNomesDosAutores(supabase, linhas);

  const hoje = hojeSaoPauloISO();
  const trilhas = montarCronograma(itens, hoje);
  const proximoPasso = passoAtual(trilhas);
  const temPassos = trilhas.some((t) => t.fases.some((f) => f.total > 0));
  const proximas = itens
    .filter((i) => i.status !== "CONCLUIDA" && i.status !== "CANCELADA" && i.prazo_previsto_em !== null)
    .sort((a, b) => (a.prazo_previsto_em ?? "").localeCompare(b.prazo_previsto_em ?? ""))
    .slice(0, 5);
  const podeCriar = veTarefas;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg-1">
            <SaudacaoAoVivo />, {primeiroNome(sessao.nome)}
          </h1>
          <p className="mt-1 text-sm text-fg-3">
            Isto é o que anda acontecendo na sua empresa.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pode(sessao, "tarefas") && (
            <LinkBotao href="/tarefas">
              <KanbanSquare size={16} />
              Ver tarefas
            </LinkBotao>
          )}
          {pode(sessao, "atividade") && (
            <LinkBotao href="/atividade">
              <Activity size={16} />
              Ver atividade
            </LinkBotao>
          )}
          {pode(sessao, "marca") && (
            <LinkBotao href="/marca">
              <Palette size={16} />
              Marca
            </LinkBotao>
          )}
          {pode(sessao, "organograma") && (
            <LinkBotao href="/organograma">
              <Network size={16} />
              Organograma
            </LinkBotao>
          )}
        </div>
      </div>

      {(veTarefas || veAgentes) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {veTarefas && <KpiCard label="Tarefas abertas" value={abertas.count ?? 0} variant="feature" />}
          {veTarefas && <KpiCard label="Concluídas na semana" value={concluidasNaSemana.count ?? 0} />}
          {veAgentes && <KpiCard label="Agentes instalados" value={agentesInstalados.count ?? 0} />}
        </div>
      )}

      {veCronograma && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Onde você está</CardTitle>
              <Link href="/cronograma" className="text-xs font-semibold text-acento-texto hover:underline">
                Ver cronograma
              </Link>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              {proximoPasso ? (
                <Link
                  href={hrefTarefa(proximoPasso.item.tarefa_id, proximoPasso.item.trilha)}
                  className="flex min-h-11 flex-col gap-0.5 rounded-md border border-acento bg-acento-suave p-3 hover:bg-bg-sutil"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-acento-texto">
                    Próximo passo · {proximoPasso.rotuloTrilha} · {proximoPasso.numero} de {proximoPasso.total}
                  </span>
                  <span className="text-sm font-semibold text-fg-1">{proximoPasso.item.titulo}</span>
                </Link>
              ) : (
                temPassos && <p className="text-sm text-fg-3">Todos os passos do cronograma estão concluídos.</p>
              )}
              <ul className="flex flex-col gap-3">
                {trilhas.map((t) => (
                  <li key={t.trilha} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold text-fg-1">{t.rotulo}</span>
                    <span className="text-fg-3">
                      {t.faseAtual ? ROTULO_FASE[t.faseAtual] : "Sem fase em andamento"} · {t.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Próximas tarefas</CardTitle>
            </CardHeader>
            <CardBody>
              {proximas.length === 0 ? (
                <Empty
                  icon={KanbanSquare}
                  title="Nenhuma tarefa com prazo à frente"
                  description="Quando houver tarefas com prazo, as 5 mais próximas aparecem aqui."
                />
              ) : (
                <ul className="flex flex-col gap-1">
                  {proximas.map((i) => (
                    <li key={i.tarefa_id}>
                      <Link
                        href={hrefTarefa(i.tarefa_id, i.trilha)}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-sm text-fg-1 hover:bg-bg-sutil"
                      >
                        <span className="min-w-0 truncate">{i.titulo}</span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-fg-3">
                          {estaAtrasada(i, hoje) && <Pill tone="danger">atrasada</Pill>}
                          {formatarData(i.prazo_previsto_em)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Últimas atividades</CardTitle>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
            <Link
              href={mostrarSistema ? "/inicio" : "/inicio?sistema=1"}
              className="inline-flex min-h-11 items-center text-xs font-semibold text-acento-texto hover:underline md:min-h-0"
            >
              {mostrarSistema ? "Esconder eventos do sistema" : "Mostrar eventos do sistema"}
            </Link>
            {pode(sessao, "atividade") && (
              <Link
                href="/atividade"
                className="inline-flex min-h-11 items-center text-xs font-semibold text-acento-texto hover:underline md:min-h-0"
              >
                Ver tudo
              </Link>
            )}
          </div>
        </CardHeader>
        <CardBody>
          {linhas.length === 0 ? (
            <Empty
              icon={Sparkles}
              title="Sua empresa acabou de nascer"
              description="Assim que alguém (pessoa ou IA) fizer a primeira coisa, ela aparece aqui."
              action={
                podeCriar ? (
                  <LinkBotao href="/tarefas" className="mt-1">
                    Ver tarefas
                  </LinkBotao>
                ) : undefined
              }
            />
          ) : (
            <Timeline>
              {linhas.map((linha, i) => (
                <ItemAtividade
                  key={linha.id}
                  linha={linha}
                  nomes={nomes}
                  isLast={i === linhas.length - 1}
                />
              ))}
            </Timeline>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
