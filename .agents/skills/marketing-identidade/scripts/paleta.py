#!/usr/bin/env python3
"""paleta.py: ficha de cores e tabela de contraste (WCAG 2.2, nível AA) de uma paleta.

Contraste é número, não olho: este script calcula a razão de TODO par de cores e diz, par a par, se
serve para texto. O manual da marca cola a tabela que ele imprime.

Uso:
  paleta.py --cor "Azul principal=#1F3A5F" --cor "Branco=#FFFFFF" --cor "Âmbar=#F2B705" \\
            [--par "Azul principal/Branco"] [--json]

  --cor NOME=#RRGGBB   (ou #RGB). Nomes únicos, sem "/", "|" nem "=".
  --par TEXTO/FUNDO    par que o manual vai usar como texto sobre fundo; sai 1 se a razão for menor que 4,5.
  --json               saída em JSON em vez de Markdown.

Regras (WCAG 2.2, W3C): luminância relativa L = 0,2126 R + 0,7152 G + 0,0722 B, com R, G e B linearizados
(<= 0,04045 divide por 12,92; senão ((c + 0,055) / 1,055) ^ 2,4); razão = (L1 + 0,05) / (L2 + 0,05), L1 a
mais clara. Texto normal precisa de 4,5 : 1; texto grande (18 pt, ou 14 pt em negrito) e componente de
interface precisam de 3 : 1. A razão é cortada (não arredondada) em 2 casas: 4,499 não vira 4,50.
CMYK sai aproximado (conta simples, sem perfil de impressão): a gráfica confere na prova.

Saída: 0 ok; 1 algum --par reprovado; 2 uso errado. Só stdlib (Python 3.10+), sem rede.
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import re
import sys

MIN_TEXTO = 4.5
MIN_GRANDE = 3.0
RE_HEX = re.compile(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def normalizar_hex(valor: str) -> str:
    achado = RE_HEX.match(valor.strip())
    if not achado:
        raise ValueError(f"cor inválida: {valor!r} (use #RRGGBB ou #RGB)")
    h = achado.group(1)
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return "#" + h.upper()


def rgb(hex_: str) -> tuple[int, int, int]:
    return int(hex_[1:3], 16), int(hex_[3:5], 16), int(hex_[5:7], 16)


def luminancia(hex_: str) -> float:
    def linear(c8: int) -> float:
        c = c8 / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (linear(c) for c in rgb(hex_))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def razao(a: str, b: str) -> float:
    la, lb = luminancia(a), luminancia(b)
    claro, escuro = max(la, lb), min(la, lb)
    return (claro + 0.05) / (escuro + 0.05)


def cortar(valor: float) -> float:
    """2 casas sem arredondar para cima (4,499 fica 4,49)."""
    return math.floor(valor * 100 + 1e-9) / 100


def cmyk(hex_: str) -> tuple[int, int, int, int]:
    r, g, b = (c / 255 for c in rgb(hex_))
    k = 1 - max(r, g, b)
    if k >= 1:
        return 0, 0, 0, 100
    return tuple(round(100 * v) for v in ((1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k))  # type: ignore[return-value]


def ler_cores(itens: list[str]) -> dict[str, str]:
    cores: dict[str, str] = {}
    for item in itens:
        nome, sep, valor = item.partition("=")
        nome = " ".join(nome.split())
        if not sep or not nome:
            raise ValueError(f"use NOME=#RRGGBB (veio {item!r})")
        if any(c in nome for c in "/|\n"):
            raise ValueError(f"o nome da cor não pode ter / nem | (veio {nome!r})")
        if nome in cores:
            raise ValueError(f"nome de cor repetido: {nome}")
        cores[nome] = normalizar_hex(valor)
    if len(cores) < 2:
        raise ValueError("preciso de pelo menos 2 cores para comparar")
    return cores


def pares(cores: dict[str, str]) -> list[dict]:
    saida = []
    for (na, ha), (nb, hb) in itertools.combinations(cores.items(), 2):
        r = razao(ha, hb)
        saida.append({"a": na, "b": nb, "razao": cortar(r), "texto": r >= MIN_TEXTO, "grande_e_componente": r >= MIN_GRANDE})
    return saida


def virgula(valor: float) -> str:
    return f"{valor:.2f}".replace(".", ",")


def em_markdown(cores: dict[str, str], tabela: list[dict], declarados: list[dict]) -> str:
    linhas = ["| Cor | HEX | RGB | CMYK (aproximado) |", "|---|---|---|---|"]
    for nome, h in cores.items():
        c = cmyk(h)
        linhas.append(f"| {nome} | {h} | {', '.join(map(str, rgb(h)))} | {', '.join(map(str, c))} |")
    linhas += ["", "| Par | Razão | Texto normal (mínimo 4,5) | Texto grande e componentes (mínimo 3) |", "|---|---|---|---|"]
    for p in tabela:
        linhas.append(f"| {p['a']} e {p['b']} | {virgula(p['razao'])} : 1 | {'sim' if p['texto'] else 'não'} | "
                      f"{'sim' if p['grande_e_componente'] else 'não'} |")
    if declarados:
        linhas += ["", "Pares que o manual usa como texto sobre fundo:"]
        for d in declarados:
            marca = "passa" if d["passa"] else "REPROVADO"
            linhas.append(f"- {d['texto']} sobre {d['fundo']}: {virgula(d['razao'])} : 1, {marca}")
    return "\n".join(linhas)


def _utf8() -> None:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main(argv: list[str] | None = None) -> int:
    _utf8()
    ap = argparse.ArgumentParser(prog="paleta.py", description=__doc__.split("\n")[0])
    ap.add_argument("--cor", action="append", default=[], help="NOME=#RRGGBB (repita para cada cor)")
    ap.add_argument("--par", action="append", default=[], help="TEXTO/FUNDO: par usado como texto")
    ap.add_argument("--json", action="store_true")
    try:
        a = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    try:
        cores = ler_cores(a.cor)
        declarados = []
        for par in a.par:
            texto, sep, fundo = par.partition("/")
            texto, fundo = " ".join(texto.split()), " ".join(fundo.split())
            if not sep or texto not in cores or fundo not in cores:
                raise ValueError(f"--par {par!r}: use TEXTO/FUNDO com nomes que estão em --cor")
            r = razao(cores[texto], cores[fundo])
            declarados.append({"texto": texto, "fundo": fundo, "razao": cortar(r), "passa": r >= MIN_TEXTO})
    except ValueError as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 2
    tabela = pares(cores)
    if a.json:
        print(json.dumps({
            "cores": [{"nome": n, "hex": h, "rgb": list(rgb(h)), "cmyk": list(cmyk(h))} for n, h in cores.items()],
            "pares": tabela, "declarados": declarados}, ensure_ascii=False, indent=2))
    else:
        print(em_markdown(cores, tabela, declarados))
    reprovados = [d for d in declarados if not d["passa"]]
    for d in reprovados:
        print(f"REPROVADO: {d['texto']} sobre {d['fundo']} = {virgula(d['razao'])} : 1; texto precisa de 4,5 : 1. "
              "Troque a cor ou use esse par só como destaque, nunca como texto.", file=sys.stderr)
    return 1 if reprovados else 0


if __name__ == "__main__":
    sys.exit(main())
