import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatarData, formatarDataHora } from "@/lib/format";
import { criterioRepeteProva, ROTULO_FASE } from "@/lib/cronograma";
import { TEXTOS_DO_PLANO } from "@/lib/plano-mestre";
import { nomeAmigavel } from "@/lib/agentes/nome";
import { blocosDaAtividade, mesclarTextos } from "@/lib/plano-textos";
import { grupoDaTrilha, hrefListaTarefas, TEXTOS_DO_GRUPO } from "@/lib/tarefas/grupos";
import { linkDaOrigem, rotuloVeioDe } from "@/lib/tarefas/rotulos";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Timeline,
  TimelineItem,
  type TimelineNodeType,
} from "@/components/ui/Timeline";
import { ComoFazer } from "@/components/cronograma/ComoFazer";
import { MoverStatusMenu } from "@/components/tarefas/MoverStatusMenu";
import { CriadaPorPill, StatusPill } from "@/components/tarefas/pills";
import type { TarefaOrigem, TarefaStatus } from "@/types/database";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cor do nó da linha do tempo por tipo de evento (tipo desconhecido = neutro). */
function tipoDoNo(tipo: string): TimelineNodeType {
  switch (tipo) {
    case "tarefa_criada":
      return "destaque";
    case "tarefa_movida":
      return "info";
    case "tarefa_editada":
      return "ok";
    default:
      return "neutro";
  }
}

const ROTULO_TRILHA: Record<string, string> = {
  curso: "Curso",
  plano90: "90 dias",
  trabalho: "Trabalho",
};

export default async function TarefaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Id que nem é uuid iria ao banco só pra voltar erro de sintaxe — 404 direto.
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: tarefa } = await supabase
    .from("tarefas")
    .select(
      "id, titulo, objetivo, criterio_pronto, status, origem, origem_tipo, origem_ref, trilha, fase, chave, dono_id, agente_id, branch, criada_em, concluida_em",
    )
    .eq("id", id)
    .maybeSingle();
  // Sem tarefas.read a RLS devolve vazio: "não existe" e "não é sua" são o
  // mesmo 404 — nunca uma tela de erro.
  if (!tarefa) notFound();

  const [atividadesRes, usuariosRes, agentesRes, instrucaoRes] = await Promise.all([
    supabase
      .from("atividade")
      .select("id, quando, tipo, descricao, usuario_id, agente_id")
      .eq("tarefa_id", id)
      .order("quando", { ascending: false }),
    supabase.from("usuarios").select("id, nome"),
    // Todos os agentes (não só ativos): histórico antigo precisa resolver nome
    // de agente já desligado.
    supabase.from("agentes").select("id, name, time, descricao_curta"),
    // Instrução, comando e prova existem só pra tarefa que nasceu de um plano.
    // Falha aqui não derruba o detalhe: a tarefa abre sem o bloco de instrução.
    supabase
      .schema("tarefas")
      .from("v_tarefa_com_instrucao")
      .select("instrucao, comando, prova, aula_ref, artigo_ref, prazo_previsto_em")
      .eq("tarefa_id", id)
      .maybeSingle(),
  ]);
  const instrucao = instrucaoRes.data;
  // Banco primeiro (instrução, comando, prova); "por que importa" e "passo a passo" só existem no arquivo do plano.
  const textos = mesclarTextos(instrucao, tarefa.chave ? TEXTOS_DO_PLANO.get(tarefa.chave) : undefined);
  const temInstrucao = blocosDaAtividade(textos).length > 0;
  // Tarefa de plano nasce com critério de pronto = prova: o critério some e a prova aparece em "Como fazer".
  const provaJaNoCriterio = criterioRepeteProva(textos.prova, tarefa.criterio_pronto);
  const atividades = atividadesRes.data ?? [];
  const nomeUsuario = new Map((usuariosRes.data ?? []).map((u) => [u.id, u.nome]));
  const nomeAgente = new Map((agentesRes.data ?? []).map((a) => [a.id, nomeAmigavel(a.name, a.time)]));

  const grupo = grupoDaTrilha(tarefa.trilha);
  const dono = tarefa.dono_id ? (nomeUsuario.get(tarefa.dono_id) ?? "Sem dono") : "Sem dono";
  const agenteLinha = tarefa.agente_id
    ? (agentesRes.data ?? []).find((a) => a.id === tarefa.agente_id)
    : undefined;
  const agente: React.ReactNode = tarefa.agente_id ? (
    <span>
      {agenteLinha ? nomeAmigavel(agenteLinha.name, agenteLinha.time) : "Agente removido"}
      {agenteLinha?.descricao_curta && (
        <span className="block text-xs font-normal text-fg-3">{agenteLinha.descricao_curta}</span>
      )}
    </span>
  ) : (
    "Nenhum"
  );

  // "Veio de": plano de 90 dias, conversa, ideia... Id interno nunca aparece; link de conversa vira "abrir".
  const veioDe = rotuloVeioDe(tarefa.origem_tipo, tarefa.trilha);
  const linkDaConversa = linkDaOrigem(tarefa.origem_ref);

  const meta: { rotulo: string; valor: React.ReactNode }[] = [
    { rotulo: "Dono", valor: dono },
    { rotulo: "Agente", valor: agente },
    ...(veioDe
      ? [
          {
            rotulo: "Veio de",
            valor: (
              <span>
                {veioDe}
                {linkDaConversa && (
                  <>
                    {" · "}
                    <a
                      href={linkDaConversa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-acento-texto hover:underline"
                    >
                      abrir
                    </a>
                  </>
                )}
              </span>
            ),
          },
        ]
      : []),
    ...(tarefa.branch
      ? [
          {
            rotulo: "Branch",
            valor: (
              <code className="rounded bg-bg-sutil px-1.5 py-0.5 text-xs text-fg-2">
                {tarefa.branch}
              </code>
            ),
          },
        ]
      : []),
    { rotulo: "Criada em", valor: formatarDataHora(tarefa.criada_em) },
    {
      rotulo: "Concluída em",
      valor: tarefa.concluida_em ? formatarDataHora(tarefa.concluida_em) : "Ainda não",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href={hrefListaTarefas(grupo)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-3 hover:text-fg-1"
      >
        <ArrowLeft size={16} />
        {TEXTOS_DO_GRUPO[grupo].voltar}
      </Link>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={tarefa.status as TarefaStatus} />
          <CriadaPorPill origem={tarefa.origem as TarefaOrigem} />
          {tarefa.trilha !== "trabalho" && (
            <span className="text-xs font-semibold text-fg-3">
              {ROTULO_TRILHA[tarefa.trilha] ?? tarefa.trilha}
              {tarefa.fase ? ` · ${ROTULO_FASE[tarefa.fase] ?? tarefa.fase}` : ""}
            </span>
          )}
        </div>
        <h1 className="font-display text-2xl font-bold text-fg-1">
          {tarefa.titulo}
        </h1>
        <MoverStatusMenu
          tarefaId={tarefa.id}
          status={tarefa.status as TarefaStatus}
        />
      </div>

      <Card>
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {meta.map((item) => (
              <div key={item.rotulo}>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-fg-4">
                  {item.rotulo}
                </dt>
                <dd className="mt-0.5 text-sm text-fg-1">{item.valor}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Objetivo</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="whitespace-pre-wrap text-sm text-fg-2">
            {tarefa.objetivo || "Sem objetivo registrado."}
          </p>
        </CardBody>
      </Card>

      {!provaJaNoCriterio && (
        <Card>
          <CardHeader>
            <CardTitle>Critério de pronto</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-fg-2">
              {tarefa.criterio_pronto || "Sem critério de pronto registrado."}
            </p>
          </CardBody>
        </Card>
      )}

      {temInstrucao && (
        <Card>
          <CardHeader>
            <CardTitle>Como fazer</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <ComoFazer textos={textos} />
            {(instrucao?.aula_ref || instrucao?.artigo_ref || instrucao?.prazo_previsto_em) && (
              <p className="text-xs text-fg-3">
                {[
                  instrucao.aula_ref && `Aula: ${instrucao.aula_ref}`,
                  instrucao.artigo_ref && `Artigo: ${instrucao.artigo_ref}`,
                  instrucao.prazo_previsto_em && `Prazo previsto: ${formatarData(instrucao.prazo_previsto_em)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardBody>
          {atividades.length === 0 ? (
            <p className="text-sm text-fg-4">
              Nenhuma atividade registrada pra esta tarefa.
            </p>
          ) : (
            <Timeline>
              {atividades.map((atv, indice) => {
                const autor = atv.usuario_id
                  ? (nomeUsuario.get(atv.usuario_id) ?? "Ex-membro")
                  : atv.agente_id
                    ? (nomeAgente.get(atv.agente_id) ?? "Agente")
                    : "Sistema";
                return (
                  <TimelineItem
                    key={atv.id}
                    type={tipoDoNo(atv.tipo)}
                    label={formatarDataHora(atv.quando)}
                    isLast={indice === atividades.length - 1}
                  >
                    <p className="text-sm text-fg-1">{atv.descricao}</p>
                    <p className="mt-0.5 text-xs text-fg-4">{autor}</p>
                  </TimelineItem>
                );
              })}
            </Timeline>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
