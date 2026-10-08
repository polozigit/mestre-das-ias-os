#!/usr/bin/env python3
"""trilha.py: mostra o curso e o plano de 90 dias (progresso, prazos) e as prioridades do trimestre.

Uso: python3 trilha.py <ver | cronograma | trimestre> --tarefas ARQ|--pasta-tasks PASTA [--hoje AAAA-MM-DD]
  ver         curso (D1, D2, D3) e plano de 90 dias por fase, a fase atual e o nivel alvo
  cronograma  tarefas abertas do curso e do plano de 90 dias por prazo
  trimestre   prioridades do trimestre (plano de 90 dias e Rocks), vagas, e se ja e hora de escolher as proximas
O PMO diz "a trilha te leva ao nivel N"; o nivel medido e do modulo Maturidade, nunca daqui.
Saida: 0 ok, 2 uso errado. So stdlib, sem rede.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pmo-quadro" / "scripts"))
import nucleo as n  # noqa: E402


def _linha_fase(r: dict) -> str:
    return (f"- Fase {n.ROTULO_FASE[r['fase']]} (nível alvo {r['nivel_alvo']}): {r['situacao']}, "
            f"{r['concluidas']} de {r['total']} concluídas, prazo {n.fmt_dm(r['prazo'])}")


def cmd_ver(args) -> None:
    ts, hoje = n.tarefas_da_entrada(args), n.hoje_da_entrada(args)
    L = ["# Trilha", "", "## Curso"]
    curso = [t for t in ts if t["trilha"] == "curso"]
    for fase in n.FASES_CURSO:
        da_fase = [t for t in curso if t.get("fase") == fase]
        if da_fase:
            L.append(f"- {fase}: {sum(1 for t in da_fase if t['status'] == 'CONCLUIDA')} de {len(da_fase)} concluídas")
    if not curso:
        L.append("- nada")
    L += ["", "## Plano de 90 dias"]
    fases = n.rocks_plano90(ts, hoje)
    if not fases:
        L.append("Plano de 90 dias ainda não começou.")
    for r in fases:
        L.append(_linha_fase(r))
        if r["atrasadas"]:
            L.append("  atrasadas: " + "; ".join(r["atrasadas"]))
    atual = next((r for r in fases if not r["feita"]), None)
    if fases:
        L += ["", "## Fase atual"]
        if atual:
            L += [f"Fase atual: {n.ROTULO_FASE[atual['fase']]}.",
                  f"A trilha te leva ao nível {atual['nivel_alvo']} quando a fase {n.ROTULO_FASE[atual['fase']]} fecha; "
                  "o nível medido vem do módulo Maturidade."]
        else:
            L.append("Todas as fases do plano de 90 dias estão feitas.")
    print("\n".join(L))


def cmd_cronograma(args) -> None:
    ts, hoje = n.tarefas_da_entrada(args), n.hoje_da_entrada(args)
    abertas = [t for t in ts if t["trilha"] in ("curso", "plano90") and n.aberta(t)]
    abertas.sort(key=lambda t: (n.prazo_efetivo(t) is None, n.prazo_efetivo(t) or hoje, t.get("ordem") or 0, t["titulo"]))
    L = ["# Cronograma da trilha", ""]
    for t in abertas:
        p = n.prazo_efetivo(t)
        marca = " [atrasada]" if n.atrasada(t, hoje) else ""
        L.append(f"- {p.isoformat() if p else 'sem prazo'}: {t['titulo']} ({t['trilha']} {t.get('fase') or ''}){marca}")
    if not abertas:
        L.append("- nada")
    print("\n".join(L))


def cmd_trimestre(args) -> None:
    ts, hoje = n.tarefas_da_entrada(args), n.hoje_da_entrada(args)
    fases = n.rocks_plano90(ts, hoje)
    rocks = n.rocks_abertos(ts)
    L = ["# Prioridades do trimestre", "", "Plano de 90 dias (Rocks do 1º trimestre):"]
    L += [_linha_fase(r) for r in fases] or ["- nada"]
    L += ["", f"Prioridades abertas que você escreveu (Rock): {len(rocks)} de {n.MAX_ROCKS_ABERTOS}, "
              f"vagas: {max(n.MAX_ROCKS_ABERTOS - len(rocks), 0)}"]
    for t in rocks:
        L.append(f"- {t['titulo']} ({n.responsavel(t)}), prazo {n.fmt_dm(n.prazo_efetivo(t))}: "
                 f"{'fora do trilho' if n.atrasada(t, hoje) else 'no trilho'}")
    prazos = [p for p in (n.prazo_efetivo(t) for t in ts if t["trilha"] == "plano90") if p]
    todas_feitas = bool(fases) and all(r["feita"] for r in fases)
    passou_prazo = bool(prazos) and hoje > max(prazos)
    L.append("")
    if todas_feitas or passou_prazo:
        L.append("Hora de escolher as prioridades do próximo trimestre (3 a 7).")
    else:
        L.append("Ainda não é a hora de escolher as próximas prioridades: o plano de 90 dias segue em andamento.")
    print("\n".join(L))


def main(argv: list[str]) -> None:
    p = argparse.ArgumentParser(prog="trilha.py", description="Trilha do aluno: curso e plano de 90 dias")
    sub = p.add_subparsers(dest="cmd", required=True)
    for nome in ("ver", "cronograma", "trimestre"):
        n.adicionar_entrada(sub.add_parser(nome))
    args = p.parse_args(argv)
    {"ver": cmd_ver, "cronograma": cmd_cronograma, "trimestre": cmd_trimestre}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(n.main_wrapper(main))
