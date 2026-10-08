#!/usr/bin/env python3
"""revisao.py: gera a revisao semanal das tarefas em Markdown (limpar, atualizar, prioridades, pontos, criar).

Uso: python3 revisao.py gerar --tarefas ARQ|--pasta-tasks PASTA [--hoje AAAA-MM-DD] [--saida ARQ.md] [--substituir]
A semana revisada sao os 7 dias que terminam em hoje, com o nome da semana ISO de hoje.
Sem --saida imprime o Markdown. Com --saida grava o arquivo (cria as pastas) e imprime o caminho;
se o arquivo ja existe, recusa (nao sobrescreve) a menos que venha --substituir.
Todo numero sai das tarefas lidas; secao sem nada diz "nada".
Saida: 0 ok, 1 recusou (arquivo ja existe), 2 uso errado. So stdlib, sem rede.
"""
from __future__ import annotations

import argparse
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pmo-quadro" / "scripts"))
import nucleo as n  # noqa: E402


def _lista(linhas: list[str]) -> list[str]:
    return linhas or ["- nada"]


def _linha_andando(t: dict, hoje) -> str:
    dias, aprox = n.idade_dias(t, hoje)
    return f"- {t['titulo']} ({n.responsavel(t)}), há {dias} {'dia' if dias == 1 else 'dias'}{' aprox.' if aprox else ''}"


def gerar_markdown(ts: list[dict], hoje) -> str:
    semana = n.semana_iso(hoje)
    inicio = hoje - timedelta(days=6)
    mapa = n.mapa_por_id(ts)
    L = [f"# Revisão da semana {semana}", "",
         f"Gerado em {hoje.isoformat()} pelo time PMO. Números calculados das tarefas; nada inventado.", ""]

    L += ["## Limpar", "",
          "Tarefas criadas nos últimos 7 dias que precisam de uma decisão (sem critério de pronto ou sem responsável):"]
    sujas = []
    for t in ts:
        criada = n.parse_data(t.get("criada_em"))
        if t["trilha"] != "trabalho" or not n.aberta(t) or criada is None or not inicio <= criada <= hoje:
            continue
        faltas = []
        if not (t.get("criterio_pronto") or "").strip():
            faltas.append("sem critério de pronto")
        if n.responsavel(t) == n.SEM_RESPONSAVEL:
            faltas.append("sem responsável")
        if faltas:
            sujas.append(f"- {t['titulo']}: {'; '.join(faltas)}")
    L += _lista(sujas) + [""]

    concluidas = [t for t in ts if n.concluida_na_janela(t, hoje)]
    andando = [t for t in ts if t["status"] == "EM_ANDAMENTO"]
    paradas = [t for t in ts if n.aberta(t) and t["status"] != "BACKLOG"
               and (a := n.parse_data(t.get("atualizada_em"))) is not None and (hoje - a).days > 7]
    atrasadas = [t for t in ts if n.atrasada(t, hoje)]
    bloqueadas = [t for t in ts if n.aberta(t) and n.bloqueada(t, mapa)]
    planejadas = [t for t in ts if (t.get("metadata") or {}).get("semana") == semana and t["status"] != "CANCELADA"]
    feitas = [t for t in planejadas if t["status"] == "CONCLUIDA"]

    L += ["## Atualizar", "", f"Concluídas nos últimos 7 dias (vazão): {len(concluidas)}"]
    L += _lista([f"- {t['titulo']} ({n.responsavel(t)})" for t in concluidas]) + [""]
    L += [f"Em andamento: {len(andando)}"]
    L += _lista([_linha_andando(t, hoje) for t in andando]) + [""]
    L += [f"Paradas (abertas, fora do backlog, sem atualização há mais de 7 dias): {len(paradas)}"]
    L += _lista([f"- {t['titulo']} ({n.responsavel(t)}), {n.ROTULO[t['status']]}" for t in paradas]) + [""]
    L += [f"Atrasadas: {len(atrasadas)}"]
    L += _lista([f"- {t['titulo']} ({n.responsavel(t)}), prazo {n.fmt_dm(n.prazo_efetivo(t))}" for t in atrasadas]) + [""]
    L += [f"Bloqueadas: {len(bloqueadas)}"]
    L += _lista([f"- {t['titulo']} ({n.responsavel(t)}), espera \"{mapa[t['depende_de']]['titulo']}\"" for t in bloqueadas]) + [""]
    if planejadas:
        L += [f"Planejado x feito na semana {semana}: {len(feitas)} concluídas de {len(planejadas)} planejadas"]
        L += [f"- {t['titulo']} ({n.ROTULO[t['status']]})" for t in planejadas] + [""]
    else:
        L += [f"Planejado x feito na semana {semana}: nada planejado", ""]

    L += ["## Prioridades do trimestre", "", "Plano de 90 dias (Rocks do 1º trimestre):"]
    fases = n.rocks_plano90(ts, hoje)
    L += _lista([f"- Fase {n.ROTULO_FASE[r['fase']]} (nível alvo {r['nivel_alvo']}): {r['situacao']}, "
                 f"{r['concluidas']} de {r['total']} concluídas, prazo {n.fmt_dm(r['prazo'])}" for r in fases]) + [""]
    L += ["Prioridades abertas que você escreveu (Rock):"]
    rocks = n.rocks_abertos(ts)
    L += _lista([f"- {t['titulo']} ({n.responsavel(t)}), prazo {n.fmt_dm(n.prazo_efetivo(t))}: "
                 f"{'fora do trilho' if n.atrasada(t, hoje) else 'no trilho'}" for t in rocks]) + [""]

    L += ["## Pontos", ""]
    pts_semana = sum(n.pontos_da_tarefa(t) for t in concluidas)
    pts_total = sum(n.pontos_da_tarefa(t) for t in ts)
    L += [f"Pontos da semana (últimos 7 dias): {pts_semana}", f"Pontos no total: {pts_total}"]
    L += (["- nada pontuado ainda"] if pts_total == 0 else []) + [""]

    L += ["## Criar (próxima semana)", "", "Topo da fila, o que dá pra puxar agora:"]
    topo = n.fila(ts, hoje)[:5]
    L += _lista([f"{i}. {t['titulo']} ({n.responsavel(t)}): {n.motivo_fila(t, hoje)}" for i, t in enumerate(topo, 1)]) + [""]

    L += ["## Para a retrospectiva", "",
          "Regras e processo se discutem na $polozi-retrospectiva; esta revisão é só das tarefas.", ""]
    return "\n".join(L)


def gerar(args) -> None:
    ts, hoje = n.tarefas_da_entrada(args), n.hoje_da_entrada(args)
    texto = gerar_markdown(ts, hoje)
    if not args.saida:
        print(texto)
        return
    destino = Path(args.saida)
    if destino.exists() and not args.substituir:
        raise n.Recusa(f"o arquivo {destino} já existe e não vou sobrescrever; use --substituir se for a mesma semana refeita")
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(texto, encoding="utf-8")
    print(destino)


def main(argv: list[str]) -> None:
    p = argparse.ArgumentParser(prog="revisao.py", description="Revisão semanal do time PMO")
    sub = p.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gerar", help="gera a revisão da semana")
    n.adicionar_entrada(g)
    g.add_argument("--saida", metavar="ARQ.md")
    g.add_argument("--substituir", action="store_true")
    gerar(p.parse_args(argv))


if __name__ == "__main__":
    sys.exit(n.main_wrapper(main))
