#!/usr/bin/env python3
"""veredito.py: grava e confere o veredito de uma migration (compativel com .githooks/pre-commit da Casa).

Uso:
  veredito.py gravar <sql> --revisor X --resultado APPROVED|BLOCKED [--aprovado-por-dono "<nome> em <data>: <frase>"]
                           [--nota T] [--pasta operacao/vereditos]
  veredito.py conferir <sql> [--pasta operacao/vereditos]
Saida: 0 ok, 1 problema achado (conferir), 2 erro de uso (inclui destrutiva APPROVED sem aprovado-por-dono).
O arquivo e operacao/vereditos/<nome-sem-.sql>.json, uma chave por linha: o pre-commit le com sed
`"resultado": "APPROVED"` e `"sha256": "<hex>"`. sha256 = bytes do arquivo (igual a shasum -a 256), sem
normalizar nada. O pre-commit da Casa calcula o sha da copia staged (a que vai no commit); os dois batem
quando o arquivo e staged sem mudanca depois do veredito. Editou depois de gravar = regrave.
aprovado_por_dono ("<nome> em <data>: <frase literal>") so vale com a palavra inteira "sim" DEPOIS dos
dois pontos (gravar recusa e conferir reprova sem ela): "assim", "simples" ou "ok" nao contam.
So stdlib.
"""
from __future__ import annotations
import argparse, hashlib, json, re, sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from classificar_migration import classificar  # noqa: E402

PASTA_PADRAO = "operacao/vereditos"
RESULTADOS = ("APPROVED", "BLOCKED")


_SIM = re.compile(r"\bsim\b", re.I)


def _tem_sim(aprovado_por_dono: str | None) -> bool:
    """True se, depois dos primeiros dois pontos, a frase do dono tem a palavra inteira "sim"."""
    texto = aprovado_por_dono or ""
    if ":" not in texto:
        return False
    return _SIM.search(texto.split(":", 1)[1]) is not None


def _sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def _arquivo_veredito(migration: Path, pasta: Path) -> Path:
    return Path(pasta) / (migration.stem + ".json")


def gravar(migration: Path, pasta_vereditos: Path, revisor: str, resultado: str,
           aprovado_por_dono: str | None, nota: str) -> Path:
    migration = Path(migration)
    if resultado not in RESULTADOS:
        raise ValueError(f"resultado deve ser APPROVED ou BLOCKED, veio {resultado!r}")
    if not migration.is_file():
        raise ValueError(f"migration nao encontrada: {migration}")
    dono = (aprovado_por_dono or "").strip() or None
    r = classificar(migration.read_text(encoding="utf-8"))
    if r["classe"] == "destrutiva" and resultado == "APPROVED" and not _tem_sim(dono):
        raise ValueError("migration destrutiva so pode ser APPROVED com aprovado_por_dono "
                         '("<nome> em <data>: <frase com sim>"); nada foi gravado')
    dados = {
        "migration": migration.name,
        "sha256": _sha256(migration),
        "classe": r["classe"],
        "achados": r["achados"],
        "resultado": resultado,
        "revisor": revisor,
        "aprovado_por_dono": dono if r["classe"] == "destrutiva" else None,
        "nota": nota,
        "data": date.today().isoformat(),
    }
    destino = _arquivo_veredito(migration, pasta_vereditos)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return destino


def conferir(migration: Path, pasta_vereditos: Path) -> list[str]:
    migration = Path(migration)
    arq = _arquivo_veredito(migration, pasta_vereditos)
    if not arq.is_file():
        return [f"sem veredito para {migration.name} (esperado {arq})"]
    try:
        v = json.loads(arq.read_text(encoding="utf-8"))
    except ValueError:
        return [f"veredito ilegivel: {arq}"]
    if not migration.is_file():
        return [f"migration nao encontrada: {migration}"]
    probs = []
    if v.get("resultado") != "APPROVED":
        probs.append(f"resultado {v.get('resultado')}")
    if v.get("sha256") != _sha256(migration):
        probs.append("migration mudou depois do veredito (sha diferente)")
    classe = classificar(migration.read_text(encoding="utf-8"))["classe"]
    if classe == "destrutiva" and not _tem_sim(v.get("aprovado_por_dono")):
        probs.append("destrutiva sem aprovado_por_dono com o sim do dono")
    return probs


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="veredito.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gravar")
    g.add_argument("sql")
    g.add_argument("--revisor", required=True)
    g.add_argument("--resultado", required=True, choices=RESULTADOS)
    g.add_argument("--aprovado-por-dono", default=None)
    g.add_argument("--nota", default="")
    g.add_argument("--pasta", default=PASTA_PADRAO)
    c = sub.add_parser("conferir")
    c.add_argument("sql")
    c.add_argument("--pasta", default=PASTA_PADRAO)
    try:
        a = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    if a.cmd == "gravar":
        try:
            p = gravar(Path(a.sql), Path(a.pasta), a.revisor, a.resultado, a.aprovado_por_dono, a.nota)
        except ValueError as e:
            print(str(e), file=sys.stderr)
            return 2
        print(p)
        return 0
    probs = conferir(Path(a.sql), Path(a.pasta))
    for p in probs:
        print(p)
    return 1 if probs else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
