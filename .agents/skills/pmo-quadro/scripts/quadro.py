#!/usr/bin/env python3
"""quadro.py: ve o quadro de tarefas e monta o SQL de abrir, mover e ajustar tarefa.
So fala com o banco quando o comando pede (--gravar-em na consulta, --gravar no abrir/mover/ajustar), pelo
Supabase CLI ligado ao projeto (pasta --sistema); sem isso so imprime o SQL.

Uso: python3 quadro.py <consulta | ver | fila | achar | abrir | mover | ajustar> [opcoes]
  consulta [--gravar-em ARQ [--sistema DIR]]
                                 sem opcao imprime o SELECT que le as tarefas; com --gravar-em le do banco e salva em ARQ
  ver     --tarefas ARQ|--pasta-tasks PASTA [--hoje AAAA-MM-DD]
  fila    --tarefas ARQ|--pasta-tasks PASTA [--hoje ...] [--limite N]
  achar   --tarefas ARQ (--titulo TRECHO | --pessoa TRECHO)   id da tarefa ou da pessoa (saida 1 se nao achar)
  abrir   --tarefas ARQ --titulo T --criterio C [--objetivo O] [--dono-id UUID] [--prazo AAAA-MM-DD]
          [--tipo acao|rock] [--prioridade alta|normal|baixa] [--rock-id UUID]
  mover   --tarefas ARQ --id UUID --para STATUS [--hoje ...] [--agora ISO] [--conferido "CONFERE ..."]
          [--passar-do-limite MOTIVO]
  ajustar --tarefas ARQ --id UUID [--prioridade P] [--prazo DATA|nenhum] [--dono-id UUID|nenhum]
          [--semana AAAA-Www|nenhuma] [--tipo acao|rock] [--titulo T] [--criterio C]
abrir, mover e ajustar imprimem UM comando SQL (com a linha do tempo junto); com --gravar [--sistema DIR] o proprio
script grava no banco e confere ("Gravado: <id>"; resultado vazio = recusa, nada mudou). Padrao de --sistema: sistemas/empresa-os.
Saida: 0 ok, 1 o PMO recusou (a regra nao deixa), 2 uso errado.
So stdlib, sem rede.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nucleo as n  # noqa: E402


def _marcas(t: dict, mapa: dict, hoje) -> str:
    m = []
    if n.atrasada(t, hoje):
        m.append("[atrasada]")
    if n.aberta(t) and n.bloqueada(t, mapa):
        m.append("[bloqueada]")
    if n.e_rock(t):
        m.append("[Rock]")
    if n.prioridade(t) == "alta":
        m.append("[prioridade alta]")
    return (" " + " ".join(m)) if m else ""


def _idade(t: dict, hoje) -> str:
    dias, aprox = n.idade_dias(t, hoje)
    return f" há {dias} {'dia' if dias == 1 else 'dias'}" + (" aprox." if aprox else "")


SISTEMA_PADRAO = "sistemas/empresa-os"


def cmd_consulta(args) -> None:
    if not args.gravar_em:
        print(n.SQL_LEITURA)
        return
    linhas = n.executar_sql(n.SQL_LEITURA, Path(args.sistema))
    destino = Path(args.gravar_em)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(linhas, ensure_ascii=False), encoding="utf-8")
    print(f"Li {len(n.carregar_tarefas(json.dumps(linhas)))} tarefas em {destino}.")


def _saida(sql: str, args) -> None:
    """Sem --gravar imprime o SQL (quem roda e o agente). Com --gravar executa e so diz "Gravado" se o banco devolveu a linha."""
    if not args.gravar:
        print(sql)
        return
    linhas = n.executar_sql(sql, Path(args.sistema))
    if not linhas: raise n.Recusa("não gravou: a tarefa mudou desde a última leitura ou outra gravação chegou ao limite antes; leia o quadro de novo")  # noqa: E701,E501
    print(f"Gravado: {linhas[0].get('tarefa_id')}")


def cmd_ver(args) -> None:
    ts, hoje = n.tarefas_da_entrada(args), n.hoje_da_entrada(args)
    mapa = n.mapa_por_id(ts)
    saida = [f"# Quadro de {hoje.strftime('%d/%m/%Y')}", ""]
    colunas = (("BACKLOG", "Backlog"), ("EM_ANDAMENTO", "Em andamento"), ("REVISAO", "Revisão"),
               ("CONCLUIDA", "Concluída (últimos 7 dias)"))
    for status, nome in colunas:
        itens = [t for t in ts if t["status"] == status]
        if status == "CONCLUIDA":
            itens = [t for t in itens if n.concluida_na_janela(t, hoje)]
        saida.append(f"## {nome} ({len(itens)})")
        for t in itens:
            extra = _idade(t, hoje) if status == "EM_ANDAMENTO" else ""
            saida.append(f"- {t['titulo']} ({n.responsavel(t)}){_marcas(t, mapa, hoje)}{extra}")
        if not itens:
            saida.append("- nada")
        saida.append("")
    # conta por id (dois "João" diferentes nao se somam); o nome so rotula
    andando = [t for t in ts if t["status"] == "EM_ANDAMENTO"]
    por_chave = Counter(n.chave_responsavel(t) for t in andando)
    nomes = {n.chave_responsavel(t): n.responsavel(t) for t in andando}
    repetidos = {v for v in nomes.values() if list(nomes.values()).count(v) > 1}
    contagem = Counter({(f"{nomes[k]} (id {k})" if nomes[k] in repetidos else nomes[k]): q
                        for k, q in por_chave.items()})
    if contagem:
        pessoas = ", ".join(
            f"{nome} {qtd}" + (f" (acima do limite de {n.LIMITE_EM_ANDAMENTO})" if qtd > n.LIMITE_EM_ANDAMENTO else "")
            for nome, qtd in sorted(contagem.items(), key=lambda kv: (-kv[1], kv[0])))
    else:
        pessoas = "ninguém"
    saida.append(f"Em andamento por pessoa: {pessoas}")
    print("\n".join(saida))


def cmd_fila(args) -> None:
    ts, hoje = n.tarefas_da_entrada(args), n.hoje_da_entrada(args)
    if args.limite < 1:
        raise n.ErroUso("--limite precisa ser 1 ou mais")
    topo = n.fila(ts, hoje)[: args.limite]
    saida = ["# Fila: o que pode ser puxado agora", ""]
    for i, t in enumerate(topo, 1):
        saida.append(f"{i}. {t['titulo']} ({n.responsavel(t)}): {n.motivo_fila(t, hoje)}")
    if not topo:
        saida.append("Fila vazia: nada pra puxar agora.")
    print("\n".join(saida))


def _achar(ts: list[dict], id_: str) -> dict:
    for t in ts:
        if str(t.get("id")).lower() == id_:
            return t
    raise n.Recusa(f"não achei a tarefa {id_} no resultado lido; leia o quadro de novo")


def _sem_acento(s: str) -> str:
    import unicodedata
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def cmd_achar(args) -> None:
    """Acha o id pelo trecho do titulo (tarefa) ou do nome (pessoa), sem diferenciar acento e maiuscula."""
    ts = n.tarefas_da_entrada(args)
    if bool(args.titulo) == bool(args.pessoa):
        raise n.ErroUso("passe exatamente um: --titulo TRECHO ou --pessoa TRECHO")
    if args.titulo:
        alvo = _sem_acento(args.titulo)
        achadas = [t for t in ts if alvo in _sem_acento(t.get("titulo") or "")]
        if not achadas: raise n.Recusa(f'nenhuma tarefa com "{args.titulo}" no título; leia o quadro de novo ou use outro trecho')  # noqa: E701,E501
        for t in achadas:
            print(f'{t["id"]} | {t["titulo"]} | {n.ROTULO[t["status"]]} | {n.responsavel(t)}')
        return
    alvo = _sem_acento(args.pessoa)
    pessoas = sorted({(t["dono_id"], t["dono_nome"]) for t in ts
                      if t.get("dono_id") and t.get("dono_nome") and alvo in _sem_acento(t["dono_nome"])})
    if not pessoas: raise n.Recusa(f'nenhuma pessoa com "{args.pessoa}" no nome entre os responsáveis das tarefas lidas')  # noqa: E701,E501
    for id_, nome in pessoas:
        print(f"{id_} | {nome}")


def cmd_abrir(args) -> None:
    ts = n.tarefas_da_entrada(args)
    criterio = (args.criterio or "").strip()
    if not criterio: raise n.Recusa("tarefa sem critério de pronto não abre: diga como vamos saber que acabou")  # noqa: E701
    if args.tipo == "rock" and not args.prazo: raise n.Recusa("Rock sem prazo não abre: dê a data final do trimestre (--prazo)")  # noqa: E701
    if args.tipo == "rock" and len(n.rocks_abertos(ts)) >= n.MAX_ROCKS_ABERTOS: raise n.Recusa(f"já existem {n.MAX_ROCKS_ABERTOS} prioridades do trimestre abertas: feche ou cancele uma antes de abrir outra")  # noqa: E701,E501
    meta = {"prioridade": args.prioridade}
    if args.rock_id:
        rock = next((t for t in ts if str(t.get("id")).lower() == n.validar_uuid(args.rock_id)), None)
        if rock is None or not n.e_rock(rock) or not n.aberta(rock): raise n.Recusa("--rock-id precisa apontar pra uma prioridade do trimestre (Rock) que ainda está aberta")  # noqa: E701,E501
        meta["rock_id"] = n.validar_uuid(args.rock_id)
    campos = {"titulo": args.titulo, "criterio_pronto": criterio, "tipo": args.tipo, "metadata": meta}
    if args.objetivo:
        campos["objetivo"] = args.objetivo
    if args.dono_id:
        campos["dono_id"] = args.dono_id
    if args.prazo:
        campos["prazo"] = args.prazo
    rotulo = "a prioridade do trimestre" if args.tipo == "rock" else "a tarefa"
    guardas = [n.guarda_max_rocks()] if args.tipo == "rock" else []
    if args.rock_id:  # a prioridade-mae tem de estar aberta no banco, nao so no arquivo
        guardas.append(f"exists (select 1 from public.tarefas r where r.id = '{n.validar_uuid(args.rock_id)}' and r.tipo = 'rock' and r.status not in ('CONCLUIDA', 'CANCELADA'))")
    guarda = " and ".join(guardas) or None
    _saida(n.sql_insert(campos, f'PMO criou {rotulo} "{args.titulo}".', guarda=guarda), args)


def _uuid_ou_null(v) -> str:
    return f"'{n.validar_uuid(v)}'::uuid" if v else "NULL::uuid"


def _responsavel_confirmado(t: dict) -> list:
    """A guarda do limite conta pelo responsavel LIDO; o WHERE confirma que no banco ainda e esse."""
    def lit(v):
        return f"'{n.validar_uuid(v)}'::uuid" if v else "NULL::uuid"
    return [f"dono_id is not distinct from {lit(t.get('dono_id'))}",
            f"agente_id is not distinct from {lit(t.get('agente_id'))}"]


def cmd_mover(args) -> None:
    ts, hoje = n.tarefas_da_entrada(args), n.hoje_da_entrada(args)
    id_ = n.validar_uuid(args.id)
    if args.para not in n.STATUS:
        raise n.ErroUso(f'status "{args.para}" não existe; use um de: {", ".join(n.STATUS)}')
    agora = args.agora or datetime.now(timezone.utc).isoformat(timespec="seconds")
    if n.parse_dt(agora) is None:
        raise n.ErroUso(f'--agora "{agora}" fora do formato ISO 8601')
    t = _achar(ts, id_)
    atual, mapa = t["status"], n.mapa_por_id(ts)
    if args.para not in n.TRANSICOES[atual]: raise n.Recusa(f"não dá pra mover de {n.ROTULO[atual]} pra {n.ROTULO[args.para]}")  # noqa: E701
    mudancas, extras = {"status": args.para}, []
    descricao = f'PMO moveu "{t["titulo"]}" de {n.ROTULO[atual]} pra {n.ROTULO[args.para]}.'
    if args.para == "EM_ANDAMENTO":
        dep = mapa.get(t.get("depende_de"))
        if n.bloqueada(t, mapa): raise n.Recusa(f'tarefa bloqueada: antes precisa terminar "{dep["titulo"]}"')  # noqa: E701
        quem, chave = n.responsavel(t), n.chave_responsavel(t)
        em_andamento = sum(1 for x in ts if x["status"] == "EM_ANDAMENTO" and n.chave_responsavel(x) == chave and x is not t)
        motivo = (args.passar_do_limite or "").strip()
        if not motivo:
            extras.append(n.guarda_limite_em_andamento(id_, t.get("dono_id"), t.get("agente_id")))  # o banco reconta na hora de gravar
        # bloqueio conferido no banco: a dependencia lida tem de ser a mesma e estar fechada (ou nao existir)
        extras.append(f"depende_de is not distinct from {_uuid_ou_null(t.get('depende_de'))}")
        extras.append("not exists (select 1 from public.tarefas d where d.id = tarefas.depende_de and d.status not in ('CONCLUIDA', 'CANCELADA'))")
        if em_andamento >= n.LIMITE_EM_ANDAMENTO and not motivo: raise n.Recusa(f"{quem} já tem {em_andamento} tarefas em andamento (limite {n.LIMITE_EM_ANDAMENTO}): escolha uma pra voltar pro backlog ou termine uma antes")  # noqa: E701,E501
        if em_andamento >= n.LIMITE_EM_ANDAMENTO:
            descricao += f" Passou do limite: {motivo}."
        if "iniciada_em" not in t["metadata"]:
            mudancas["metadata"] = {"iniciada_em": agora}
    if args.para == "CONCLUIDA":
        exige_prova = t["trilha"] == "plano90" or n.e_rock(t)
        # a linha inteira do pmo-conferente: CONFERE <id desta tarefa> <hoje>; CONFERE de outra tarefa ou de outro dia nao vale
        partes = (args.conferido or "").split()
        confere = (len(partes) == 3 and partes[0] == "CONFERE" and partes[1].lower() == id_
                   and partes[2] == hoje.isoformat())
        if exige_prova and not confere: raise n.Recusa(f'tarefa do plano de 90 dias ou prioridade do trimestre só conclui com a linha "CONFERE {id_} {hoje.isoformat()}" do pmo-conferente (--conferido)')  # noqa: E701,E501
        if exige_prova:
            descricao += " Conferido pelo pmo-conferente."
            # o CONFERE vale para o criterio e a prova que o conferente viu: se mudaram no banco, nao grava
            extras.append(f"criterio_pronto is not distinct from {n.sql_texto(t.get('criterio_pronto'))}")
            extras.append(f"prova is not distinct from {n.sql_texto(t.get('prova'))}")
        mudancas["concluida_em"] = "now()"
    if n.e_rock(t) and not n.aberta(t) and args.para in ("BACKLOG", "EM_ANDAMENTO"):
        if len(n.rocks_abertos(ts)) >= n.MAX_ROCKS_ABERTOS: raise n.Recusa(f"já existem {n.MAX_ROCKS_ABERTOS} prioridades do trimestre abertas: feche ou cancele uma antes de reabrir esta")  # noqa: E701,E501
        extras.append(n.guarda_max_rocks())  # reabrir Rock conta no maximo de 7, conferido no banco
    if atual == "CONCLUIDA":
        mudancas["concluida_em"] = None
    extras.extend(_responsavel_confirmado(t))  # toda decisao acima usou o responsavel lido: no banco tem de ser o mesmo
    _saida(n.sql_update(id_, atual, mudancas, "tarefa_movida", descricao, t["trilha"], t["tipo"], tuple(extras)), args)


def cmd_ajustar(args) -> None:
    ts = n.tarefas_da_entrada(args)
    id_ = n.validar_uuid(args.id)
    mud, meta, partes = {}, {}, []
    if args.prioridade:
        meta["prioridade"] = args.prioridade
        partes.append(f"prioridade {args.prioridade}")
    if args.prazo is not None:
        mud["prazo"] = None if args.prazo == "nenhum" else n.validar_data(args.prazo)
        partes.append("prazo removido" if args.prazo == "nenhum" else f"prazo {args.prazo}")
    if args.dono_id is not None:
        mud["dono_id"] = None if args.dono_id == "nenhum" else n.validar_uuid(args.dono_id)
        partes.append("sem responsável" if args.dono_id == "nenhum" else "responsável trocado")
    if args.semana is not None:
        if args.semana != "nenhuma" and not re.fullmatch(r"\d{4}-W\d{2}", args.semana):
            raise n.ErroUso(f'semana "{args.semana}" fora do formato AAAA-Www (exemplo 2026-W41) ou "nenhuma"')
        meta["semana"] = None if args.semana == "nenhuma" else args.semana
        partes.append("fora da semana" if args.semana == "nenhuma" else f"semana {args.semana}")
    if args.tipo:
        mud["tipo"] = args.tipo
        partes.append(f"tipo {args.tipo}")
    if args.titulo is not None:
        mud["titulo"] = args.titulo
        partes.append("título novo")
    if args.criterio is not None:
        if not args.criterio.strip(): raise n.Recusa("critério de pronto não pode ficar vazio")  # noqa: E701
        mud["criterio_pronto"] = args.criterio.strip()
        partes.append("critério de pronto novo")
    if meta:
        mud["metadata"] = meta
    if not mud:
        raise n.ErroUso("nada pra mudar: passe ao menos uma opção (--prioridade, --prazo, --dono-id, --semana, --tipo, --titulo, --criterio)")
    t = _achar(ts, id_)
    if not n.aberta(t): raise n.Recusa("tarefa já concluída ou cancelada: reabra antes de ajustar")  # noqa: E701
    if args.tipo == "acao" and n.e_rock(t): raise n.Recusa("prioridade do trimestre não vira tarefa comum (pularia a conferência): se desistiu dela, cancele")  # noqa: E701,E501
    if args.criterio is not None and (t["trilha"] == "plano90" or n.e_rock(t)): raise n.Recusa("o critério de pronto de tarefa do plano de 90 dias ou de prioridade do trimestre não muda aqui (é o que o pmo-conferente confere): cancele e abra outra")  # noqa: E701,E501
    if args.tipo == "rock" and t["trilha"] in ("curso", "plano90"): raise n.Recusa("tarefa do curso ou do plano de 90 dias não vira prioridade do trimestre")  # noqa: E701,E501
    if args.tipo == "rock" and not n.e_rock(t) and len(n.rocks_abertos(ts)) >= n.MAX_ROCKS_ABERTOS: raise n.Recusa(f"já existem {n.MAX_ROCKS_ABERTOS} prioridades do trimestre abertas: feche ou cancele uma antes")  # noqa: E701,E501
    prazo_final = mud["prazo"] if "prazo" in mud else t.get("prazo")
    if (args.tipo or t["tipo"]) == "rock" and not prazo_final: raise n.Recusa("Rock precisa de prazo: dê a data final do trimestre")  # noqa: E701
    rock_sem_prazo_novo = (args.tipo or t["tipo"]) == "rock" and "prazo" not in mud
    descricao = f'PMO ajustou "{t["titulo"]}": {"; ".join(partes)}.'
    extras = [n.guarda_max_rocks()] if args.tipo == "rock" and not n.e_rock(t) else []
    if "dono_id" in mud and t["status"] == "EM_ANDAMENTO":
        # chave nova = dono novo, senao o agente da tarefa, senao "sem responsavel" (igual a chave_responsavel)
        nova_chave = n.chave_responsavel({**t, "dono_id": mud["dono_id"]})
        if nova_chave != n.chave_responsavel(t):
            ja_tem = sum(1 for x in ts if x["status"] == "EM_ANDAMENTO" and n.chave_responsavel(x) == nova_chave and x is not t)
            if ja_tem >= n.LIMITE_EM_ANDAMENTO: raise n.Recusa(f"o novo responsável já tem {ja_tem} tarefas em andamento (limite {n.LIMITE_EM_ANDAMENTO}): volte esta pro backlog antes de trocar o responsável")  # noqa: E701,E501
            extras.append(n.guarda_limite_em_andamento(id_, mud["dono_id"], t.get("agente_id")))  # o banco reconta pelo responsavel novo
    _saida(n.sql_update(id_, t["status"], mud, "tarefa_ajustada", descricao, t["trilha"], t["tipo"],
                        tuple(extras + _responsavel_confirmado(t) + (["prazo is not null"] if rock_sem_prazo_novo else []))), args)


def _opcoes_gravar(parser) -> None:
    parser.add_argument("--gravar", action="store_true", help="grava no banco em vez de imprimir o SQL")
    parser.add_argument("--sistema", metavar="DIR", default=SISTEMA_PADRAO, help="pasta do sistema com o Supabase ligado")


def main(argv: list[str]) -> None:
    p = argparse.ArgumentParser(prog="quadro.py", description="Quadro de tarefas do time PMO")
    sub = p.add_subparsers(dest="cmd", required=True)
    consulta = sub.add_parser("consulta", help="imprime o SELECT que le as tarefas (ou grava o resultado com --gravar-em)")
    consulta.add_argument("--gravar-em", metavar="ARQ", help="le do banco e grava o resultado neste arquivo")
    consulta.add_argument("--sistema", metavar="DIR", default=SISTEMA_PADRAO, help="pasta do sistema com o Supabase ligado")
    ver = sub.add_parser("ver", help="mostra o quadro")
    n.adicionar_entrada(ver)
    fila = sub.add_parser("fila", help="o que pode ser puxado agora")
    n.adicionar_entrada(fila)
    fila.add_argument("--limite", type=int, default=10)
    achar = sub.add_parser("achar", help="id da tarefa (por trecho do título) ou da pessoa (por trecho do nome)")
    n.adicionar_entrada(achar, so_arquivo=True)
    achar.add_argument("--titulo")
    achar.add_argument("--pessoa")
    abrir = sub.add_parser("abrir", help="SQL pra abrir tarefa ou Rock")
    n.adicionar_entrada(abrir, so_arquivo=True)
    abrir.add_argument("--titulo", required=True)
    abrir.add_argument("--criterio", default="")
    abrir.add_argument("--objetivo")
    abrir.add_argument("--dono-id")
    abrir.add_argument("--prazo")
    abrir.add_argument("--tipo", choices=("acao", "rock"), default="acao")
    abrir.add_argument("--prioridade", choices=n.PRIORIDADES, default="normal")
    abrir.add_argument("--rock-id")
    _opcoes_gravar(abrir)
    mover = sub.add_parser("mover", help="SQL pra mudar a coluna da tarefa")
    n.adicionar_entrada(mover, so_arquivo=True)
    mover.add_argument("--id", required=True)
    mover.add_argument("--para", required=True)
    mover.add_argument("--agora")
    mover.add_argument("--conferido")
    mover.add_argument("--passar-do-limite")
    _opcoes_gravar(mover)
    ajustar = sub.add_parser("ajustar", help="SQL pra ajustar prioridade, prazo, dono, semana, tipo")
    n.adicionar_entrada(ajustar, so_arquivo=True)
    ajustar.add_argument("--id", required=True)
    ajustar.add_argument("--prioridade", choices=n.PRIORIDADES)
    ajustar.add_argument("--prazo")
    ajustar.add_argument("--dono-id")
    ajustar.add_argument("--semana")
    ajustar.add_argument("--tipo", choices=("acao", "rock"))
    ajustar.add_argument("--titulo")
    ajustar.add_argument("--criterio")
    _opcoes_gravar(ajustar)
    args = p.parse_args(argv)
    {"consulta": cmd_consulta, "ver": cmd_ver, "fila": cmd_fila, "achar": cmd_achar, "abrir": cmd_abrir, "mover": cmd_mover,
     "ajustar": cmd_ajustar}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(n.main_wrapper(main))
