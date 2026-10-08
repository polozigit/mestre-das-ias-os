#!/usr/bin/env python3
"""pontos.py: pontos da empresa e de cada pessoa, calculados das tarefas concluidas (nunca gravados).

Uso: python3 pontos.py ver --tarefas ARQ|--pasta-tasks PASTA [--hoje AAAA-MM-DD] [--json]
  --json  imprime {"total": N, "semana": N, "por_pessoa": {...}, "por_classe": {...}}
Regra: so tarefa concluida conta. Trabalho 1, curso 2, plano de 90 dias 3, Rock 5; mais 1 se terminou ate o prazo.
Tarefa reaberta deixa de contar. "Semana" e a semana ISO de hoje, medida pela data de conclusao.
Saida: 0 ok, 2 uso errado. So stdlib, sem rede.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pmo-quadro" / "scripts"))
import nucleo as n  # noqa: E402

REGRA = ("Regra: só tarefa concluída conta. Trabalho 1 ponto, curso 2, plano de 90 dias 3, prioridade do trimestre (Rock) 5; "
         "mais 1 se terminou até o prazo. Tarefa reaberta deixa de contar.")
NOME_CLASSE = {"trabalho": "Trabalho", "curso": "Curso", "plano90": "Plano de 90 dias", "rock": "Rock"}


def calcular(ts: list[dict], hoje) -> dict:
    por_pessoa: dict[str, int] = {}
    por_classe = {c: 0 for c in n.PONTOS_BASE}
    total = 0
    for t in ts:
        pts = n.pontos_da_tarefa(t)
        if not pts:
            continue
        total += pts
        por_pessoa[n.responsavel(t)] = por_pessoa.get(n.responsavel(t), 0) + pts
        por_classe[n.classe_pontos(t)] = por_classe.get(n.classe_pontos(t), 0) + pts
    return {"total": total, "semana": n.pontos_semana(ts, n.semana_iso(hoje)),
            "por_pessoa": dict(sorted(por_pessoa.items(), key=lambda kv: (-kv[1], kv[0]))), "por_classe": por_classe}


def cmd_ver(args) -> None:
    ts, hoje = n.tarefas_da_entrada(args), n.hoje_da_entrada(args)
    r = calcular(ts, hoje)
    if args.json:
        print(json.dumps(r, ensure_ascii=False))
        return
    L = ["# Pontos", "", f"Total: {r['total']}", f"Semana {n.semana_iso(hoje)}: {r['semana']}", "", "Por pessoa:"]
    L += [f"- {nome}: {pts}" for nome, pts in r["por_pessoa"].items()] or ["- nada"]
    L += ["", "Por tipo de tarefa:"]
    L += [f"- {NOME_CLASSE.get(c, c)}: {pts}" for c, pts in r["por_classe"].items()]
    L += ["", REGRA]
    print("\n".join(L))


def main(argv: list[str]) -> None:
    p = argparse.ArgumentParser(prog="pontos.py", description="Pontos do time PMO")
    sub = p.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("ver")
    n.adicionar_entrada(v)
    v.add_argument("--json", action="store_true")
    cmd_ver(p.parse_args(argv))


if __name__ == "__main__":
    sys.exit(n.main_wrapper(main))
