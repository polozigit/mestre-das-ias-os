#!/usr/bin/env python3
"""aprovacao.py: grava e confere o "sim" do dono num documento da marca ou do público.

Por que existe: o dono aprova o documento ANTES de ele virar verdade da empresa e de ir para o
banco. A frase dele fica gravada no próprio arquivo, presa ao texto que ele viu: se o texto mudar
depois do "sim", a aprovação deixa de valer e o publicador recusa.

Uso (da raiz do projeto):
  aprovacao.py registrar --arquivo empresa/publico/persona.md --frase "sim, pode publicar"
  aprovacao.py conferir  --arquivo empresa/publico/persona.md

registrar  recusa frase sem a palavra inteira "sim" ("assim", "simples" e "ok" não contam). Grava,
           logo abaixo do título (a linha "# ..."), a linha
             Aprovado pelo dono em AAAA-MM-DD: "<frase>" (texto conferido: <12 hex>)
           troca a linha "- Estado: rascunho" (ou em-revisao) por "- Estado: aprovado" e apaga
           aprovação anterior. O selo de 12 hex é o sha256 do texto SEM a linha de aprovação,
           com fim de linha normalizado, espaço no fim da linha e linha em branco repetida
           ignorados (editor do Windows e espaço sobrando não quebram a aprovação).
conferir   sai 1 se não há a linha, se ela está fora do formato, se a frase não tem "sim", se a
           data é futura ou se o texto mudou depois do "sim".

Saída: 0 ok; 1 recusa ou problema achado; 2 uso errado (arquivo que não existe, argumento).
Só stdlib (Python 3.10+), sem rede. Importável: registrar, conferir, selo.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from datetime import date
from pathlib import Path

PREFIXO = "Aprovado pelo dono em"
RE_QUALQUER = re.compile(r"^Aprovado pelo dono em\b")
RE_LINHA = re.compile(
    r'^Aprovado pelo dono em (\d{4}-\d{2}-\d{2}): "(.+)" \(texto conferido: ([0-9a-f]{12})\)$'
)
RE_SIM = re.compile(r"\bsim\b", re.IGNORECASE)
RE_ESTADO = re.compile(r"^- Estado:[^\n]*$", re.MULTILINE)  # qualquer estado de antes vira aprovado
RE_TITULO = re.compile(r"^# .+$", re.MULTILINE)
TETO_FRASE = 200


def normalizar(texto: str) -> str:
    """Fim de linha LF, sem espaço no fim da linha, uma linha em branco no máximo, sem borda vazia."""
    linhas = [l.rstrip() for l in texto.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    saida: list[str] = []
    for linha in linhas:
        if linha == "" and saida and saida[-1] == "":
            continue
        saida.append(linha)
    return "\n".join(saida).strip("\n")


def sem_aprovacao(texto: str) -> str:
    linhas = texto.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return normalizar("\n".join(l for l in linhas if not RE_QUALQUER.match(l)))


def selo(texto: str) -> str:
    """12 primeiros hex do sha256 do texto sem a linha de aprovação, já normalizado."""
    return hashlib.sha256(sem_aprovacao(texto).encode("utf-8")).hexdigest()[:12]


def _limpar_frase(frase: str) -> str:
    frase = " ".join((frase or "").split()).replace('"', "'")
    if not frase:
        raise ValueError("a frase do dono está vazia")
    if len(frase) > TETO_FRASE:
        raise ValueError(f"a frase do dono tem mais de {TETO_FRASE} caracteres; grave só o trecho do sim")
    if not RE_SIM.search(frase):
        raise ValueError('a frase do dono precisa ter a palavra "sim" (ok, pode e assim não valem)')
    return frase


def _com_linha(corpo: str, linha: str) -> str:
    """Põe a linha de aprovação logo abaixo do título (a primeira linha '# ...'); sem título, no topo."""
    titulo = RE_TITULO.search(corpo)
    if titulo:
        antes, depois = corpo[:titulo.end()], corpo[titulo.end():].lstrip("\n")
        novo = f"{antes}\n\n{linha}\n\n{depois}" if depois else f"{antes}\n\n{linha}"
    else:
        novo = f"{linha}\n\n{corpo}"
    return novo.rstrip("\n") + "\n"


def registrar(texto: str, frase: str, hoje: date | None = None) -> str:
    """Devolve o texto com o estado trocado por aprovado e a linha de aprovação gravada."""
    frase = _limpar_frase(frase)
    hoje = hoje or date.today()
    base = [l for l in texto.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n").split("\n")
            if not RE_QUALQUER.match(l)]
    corpo = normalizar(RE_ESTADO.sub("- Estado: aprovado", "\n".join(base), count=1))
    # o selo é do texto como ele FICA depois da gravação (menos a própria linha): monta com uma
    # linha provisória, tira o selo dela e só então troca pela linha de verdade
    provisorio = _com_linha(corpo, f"{PREFIXO} provisório")
    linha = f'{PREFIXO} {hoje.isoformat()}: "{frase}" (texto conferido: {selo(provisorio)})'
    return _com_linha(corpo, linha)


def conferir(texto: str, hoje: date | None = None) -> tuple[bool, str]:
    """(True, 'aprovado em AAAA-MM-DD') ou (False, motivo em português simples)."""
    hoje = hoje or date.today()
    linhas = [l for l in texto.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n").split("\n")
              if RE_QUALQUER.match(l)]
    if not linhas:
        return False, "o documento não tem a linha de aprovação do dono (peça o sim dele e rode aprovacao.py registrar)"
    achado = RE_LINHA.match(linhas[-1].rstrip())
    if not achado:
        return False, 'a linha de aprovação está fora do formato (Aprovado pelo dono em AAAA-MM-DD: "frase" (texto conferido: 12 hex))'
    data, frase, marca = achado.groups()
    try:
        quando = date.fromisoformat(data)
    except ValueError:
        return False, f"a data da aprovação não existe: {data}"
    if quando > hoje:
        return False, f"a data da aprovação está no futuro: {data}"
    if not RE_SIM.search(frase):
        return False, 'a frase do dono não tem a palavra "sim"'
    if marca != selo(texto):
        return False, "o texto mudou depois do sim do dono: mostre a mudança a ele e peça um sim novo"
    return True, f"aprovado em {data}"


def _caminho(casa: str, arquivo: str) -> Path:
    p = Path(arquivo)
    return p if p.is_absolute() else Path(casa) / p


def _utf8() -> None:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main(argv: list[str] | None = None) -> int:
    _utf8()
    ap = argparse.ArgumentParser(prog="aprovacao.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("registrar")
    r.add_argument("--arquivo", required=True)
    r.add_argument("--frase", required=True, help="frase literal do dono, com a palavra sim")
    r.add_argument("--casa", default=".")
    c = sub.add_parser("conferir")
    c.add_argument("--arquivo", required=True)
    c.add_argument("--casa", default=".")
    try:
        a = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    caminho = _caminho(a.casa, a.arquivo)
    if caminho.suffix.lower() != ".md" or not caminho.is_file():
        print(f"ERRO: {a.arquivo} não é um arquivo .md que existe", file=sys.stderr)
        return 2
    try:
        texto = caminho.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: não consegui ler {a.arquivo} ({type(erro).__name__})", file=sys.stderr)
        return 2
    if a.cmd == "registrar":
        try:
            novo = registrar(texto, a.frase)
        except ValueError as erro:
            print(f"RECUSEI: {erro}. Nada foi gravado.", file=sys.stderr)
            return 1
        caminho.write_text(novo, encoding="utf-8", newline="\n")
        print(f"FEITO: aprovação gravada em {a.arquivo}")
        return 0
    ok, motivo = conferir(texto)
    print(("OK: " if ok else "PROBLEMA: ") + motivo)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
