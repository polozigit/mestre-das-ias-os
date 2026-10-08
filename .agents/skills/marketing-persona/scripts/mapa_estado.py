#!/usr/bin/env python3
"""mapa_estado.py: muda o estado de um papel da persona ou da marca no Mapa do projeto.

O Mapa (MAPA-DA-EMPRESA-IA.md, gerado de operacao/mapa.json) diz o que vale como verdade da
empresa: só o estado `aprovado` vale; `rascunho` e `em-revisao` são hipótese. Este script é a
única mão do time Marketing no Mapa: troca o estado de UM dos três papéis do time, nos dois
arquivos (mapa.json e a tabela do .md), sem mexer em mais nada.

Uso (da raiz do projeto):
  mapa_estado.py --papel publico.persona --estado rascunho
  mapa_estado.py --papel marca.tom-de-voz --estado aprovado [--dry-run]

Papéis: publico.persona, marca.identidade-visual, marca.tom-de-voz.
Estados: rascunho, em-revisao, aprovado, desatualizado.
Regras (recusa com saída 1, nada é escrito):
  - o papel precisa existir no Mapa e o arquivo dele precisa existir;
  - `aprovado` só com a linha de aprovação do dono, presa ao texto (aprovacao.py conferir).

Saída: 0 ok; 1 recusa; 2 uso errado. Só stdlib (Python 3.10+), sem rede.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aprovacao  # noqa: E402

PAPEIS = {
    "publico.persona": "empresa/publico/persona.md",
    "marca.identidade-visual": "empresa/marca/identidade-visual.md",
    "marca.tom-de-voz": "empresa/marca/tom-de-voz.md",
}
ESTADOS = ("rascunho", "em-revisao", "aprovado", "desatualizado")
MAPA_JSON = "operacao/mapa.json"
MAPA_MD = "MAPA-DA-EMPRESA-IA.md"


class Recusa(Exception):
    pass


def _rx_json(papel: str, campo: str) -> re.Pattern:
    # o objeto do papel não tem chaves dentro: [^{}] segura a busca no mesmo objeto
    return re.compile(r'("papel":\s*"' + re.escape(papel) + r'"[^{}]*?"' + campo + r'":\s*")([^"]*)(")')


def _rx_md(papel: str) -> re.Pattern:
    return re.compile(r"^(\|\s*" + re.escape(papel) + r"\s*\|\s*`([^`]+)`\s*\|\s*[^|]*\|\s*)([^|]*?)(\s*\|.*)$",
                      re.MULTILINE)


def estado_e_caminho(json_txt: str | None, md_txt: str | None, papel: str) -> tuple[str, str]:
    """(estado atual, caminho do arquivo do papel) lidos do mapa.json, senão da tabela do .md."""
    if json_txt is not None:
        est = _rx_json(papel, "estado").search(json_txt)
        cam = _rx_json(papel, "caminho").search(json_txt)
        if est:
            return est.group(2), (cam.group(2) if cam else PAPEIS[papel])
    if md_txt is not None:
        achado = _rx_md(papel).search(md_txt)
        if achado:
            return achado.group(3).strip(), achado.group(2)
    raise Recusa(f"o papel {papel} não está no Mapa deste projeto (nem em {MAPA_JSON} nem em {MAPA_MD})")


def trocar_json(texto: str, papel: str, estado: str) -> str:
    achado = _rx_json(papel, "estado").search(texto)
    if not achado:
        raise Recusa(f"o papel {papel} não está em {MAPA_JSON}")
    novo = texto[:achado.start(2)] + estado + texto[achado.end(2):]
    try:
        json.loads(novo)
    except ValueError as erro:  # nunca deixar o mapa.json ilegível
        raise Recusa(f"a troca deixaria {MAPA_JSON} ilegível ({type(erro).__name__}); nada foi escrito")
    return novo


def trocar_md(texto: str, papel: str, estado: str) -> str:
    achado = _rx_md(papel).search(texto)
    if not achado:
        raise Recusa(f"o papel {papel} não está na tabela de {MAPA_MD}")
    return texto[:achado.start(3)] + estado + texto[achado.end(3):]


def _ler(caminho: Path) -> str | None:
    return caminho.read_bytes().decode("utf-8") if caminho.is_file() else None


def aplicar(casa: Path, papel: str, estado: str, escrever: bool = True) -> str:
    """Troca o estado do papel nos dois arquivos do Mapa. Devolve a linha de resultado."""
    json_txt = _ler(casa / MAPA_JSON)
    md_txt = _ler(casa / MAPA_MD)
    if json_txt is None and md_txt is None:
        raise Recusa(f"este projeto não tem Mapa ({MAPA_MD} nem {MAPA_JSON})")
    antes, caminho = estado_e_caminho(json_txt, md_txt, papel)
    arquivo = casa / caminho
    if not arquivo.is_file():
        raise Recusa(f"o arquivo do papel {papel} ({caminho}) não existe: escreva o documento antes de mudar o estado")
    if estado == "aprovado":
        ok, motivo = aprovacao.conferir(arquivo.read_bytes().decode("utf-8"))
        if not ok:
            raise Recusa(f"não marco {papel} como aprovado: {motivo}")
    novo_json = trocar_json(json_txt, papel, estado) if json_txt is not None else None
    novo_md = trocar_md(md_txt, papel, estado) if md_txt is not None else None
    if escrever:
        if novo_json is not None and novo_json != json_txt:
            (casa / MAPA_JSON).write_bytes(novo_json.encode("utf-8"))
        if novo_md is not None and novo_md != md_txt:
            (casa / MAPA_MD).write_bytes(novo_md.encode("utf-8"))
    return f"Mapa: {papel}: {antes} -> {estado}" + (" (sem mudança)" if antes == estado else "")


def _utf8() -> None:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main(argv: list[str] | None = None) -> int:
    _utf8()
    ap = argparse.ArgumentParser(prog="mapa_estado.py", description=__doc__.split("\n")[0])
    ap.add_argument("--casa", default=".")
    ap.add_argument("--papel", required=True, choices=sorted(PAPEIS))
    ap.add_argument("--estado", required=True, choices=ESTADOS)
    ap.add_argument("--dry-run", action="store_true", help="mostra a troca e não escreve")
    try:
        a = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    casa = Path(a.casa)
    if not casa.is_dir():
        print(f"ERRO: {a.casa} não é uma pasta", file=sys.stderr)
        return 2
    try:
        linha = aplicar(casa, a.papel, a.estado, escrever=not a.dry_run)
    except Recusa as erro:
        print(f"RECUSEI: {erro}", file=sys.stderr)
        return 1
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: falha ao ler ou gravar o Mapa ({type(erro).__name__})", file=sys.stderr)
        return 2
    print(("DRY-RUN: " if a.dry_run else "FEITO: ") + linha)
    return 0


if __name__ == "__main__":
    sys.exit(main())
