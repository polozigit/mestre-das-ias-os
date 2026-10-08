#!/usr/bin/env python3
"""semana.py: propoe a semana: o que ja esta andando mais o topo da fila, ate a capacidade de cada pessoa.

Uso: python3 semana.py planejar --tarefas ARQ|--pasta-tasks PASTA [--hoje AAAA-MM-DD] [--capacidade N] [--json]
  --capacidade N  itens por pessoa na semana (padrao 5; o que ja esta andando conta)
  --json          imprime so {"semana": "AAAA-Www", "ids": [...]} (o agente usa pra marcar com quadro.py ajustar --semana)
So propoe: nao grava nada. O dono aprova, e ai o agente marca cada tarefa.
Saida: 0 ok, 2 uso errado. So stdlib, sem rede.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pmo-quadro" / "scripts"))
import nucleo as n  # noqa: E402


def montar(ts: list[dict], hoje, capacidade: int):
    """Devolve (grupos, ids): grupos = {responsavel: [(tarefa, 'continua'|'entra')]}."""
    mapa = n.mapa_por_id(ts)
    grupos: dict[str, list] = {}
    for t in ts:
        if t["status"] in ("EM_ANDAMENTO", "REVISAO"):
            grupos.setdefault(n.responsavel(t), []).append((t, "continua"))
    for t in n.fila(ts, hoje):
        itens = grupos.setdefault(n.responsavel(t), [])
        if len(itens) < capacidade:
            itens.append((t, "entra"))
    grupos = {k: v for k, v in grupos.items() if v}
    ids = [t["id"] for itens in grupos.values() for t, _ in itens]
    return grupos, ids, mapa


def planejar(args) -> None:
    ts, hoje = n.tarefas_da_entrada(args), n.hoje_da_entrada(args)
    if args.capacidade < 1:
        raise n.ErroUso("--capacidade precisa ser 1 ou mais")
    semana = n.semana_iso(hoje)
    grupos, ids, mapa = montar(ts, hoje, args.capacidade)
    if args.json:
        print(json.dumps({"semana": semana, "ids": ids}, ensure_ascii=False))
        return
    seg = hoje - timedelta(days=hoje.weekday())
    dom = seg + timedelta(days=6)
    saida = [f"# Semana {semana} (seg {seg:%d/%m} a dom {dom:%d/%m})", ""]
    ordem = sorted(grupos, key=lambda k: (k == n.SEM_RESPONSAVEL, k))
    for quem in ordem:
        saida.append("## Sem responsável (decida quem faz)" if quem == n.SEM_RESPONSAVEL else f"## {quem}")
        for t, como in grupos[quem]:
            if como == "continua":
                dias, aprox = n.idade_dias(t, hoje)
                detalhe = f"continua, {n.ROTULO[t['status']]}" + (f" há {dias} dias{' aprox.' if aprox else ''}" if t["status"] == "EM_ANDAMENTO" else "")
            else:
                detalhe = f"entra da fila: {n.motivo_fila(t, hoje)}"
            saida.append(f"- {t['titulo']} ({detalhe})")
        saida.append("")
    if not grupos:
        saida += ["Nada pra propor: sem tarefa andando e fila vazia.", ""]
    atrasadas = [t for t in ts if n.atrasada(t, hoje)]
    saida.append("## Atrasadas")
    saida += [f"- {t['titulo']} ({n.responsavel(t)}, prazo {n.fmt_dm(n.prazo_efetivo(t))})" for t in atrasadas] or ["- nada"]
    saida.append("")
    bloqueadas = [t for t in ts if t["status"] == "BACKLOG" and n.bloqueada(t, mapa)]
    saida.append("## Bloqueadas (não entram)")
    saida += [f"- {t['titulo']} (espera \"{mapa[t['depende_de']]['titulo']}\")" for t in bloqueadas] or ["- nada"]
    saida.append("")
    saida.append(f"Para marcar a semana, aprove e eu gravo: {len(ids)} tarefas.")
    print("\n".join(saida))


def main(argv: list[str]) -> None:
    p = argparse.ArgumentParser(prog="semana.py", description="Planejamento da semana do time PMO")
    sub = p.add_subparsers(dest="cmd", required=True)
    pl = sub.add_parser("planejar", help="propoe a semana")
    n.adicionar_entrada(pl)
    pl.add_argument("--capacidade", type=int, default=5)
    pl.add_argument("--json", action="store_true")
    args = p.parse_args(argv)
    planejar(args)


if __name__ == "__main__":
    sys.exit(n.main_wrapper(main))
