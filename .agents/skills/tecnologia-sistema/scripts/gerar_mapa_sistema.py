#!/usr/bin/env python3
"""gerar_mapa_sistema.py: le as migrations do sistema da empresa e lista schemas e tabelas, com a migration que criou cada uma.

Uso: python3 gerar_mapa_sistema.py --migrations <pasta> [--saida <arquivo.md>]
Sem --saida, imprime o Markdown. Saida: 0 ok, 2 erro de uso.
Le so o texto dos .sql (nunca conecta no banco). Ignora comentario, texto entre aspas e corpo de funcao.
Le as migrations em ordem e, dentro de cada uma, os comandos na ordem do texto: DROP TABLE (inclusive
em migration posterior, inclusive lista "DROP TABLE a, b") tira a tabela do mapa; CREATE depois do DROP
(DROP TABLE IF EXISTS + CREATE TABLE) recoloca, com a migration que recriou. Tabela criada e apagada na
mesma migration (ex.: tabela de fumaca da 0001) nao entra.
Limite declarado: tabela criada por SQL montado em runtime (ex.: public.criar_outbox_inbox) nao aparece.
So stdlib.
"""
from __future__ import annotations
import re, sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tecnologia-mudar-banco" / "scripts"))
from classificar_migration import _limpar  # noqa: E402

ID = r'(?:"[^"]+"|\w+)'
CRIA_TABELA = re.compile(rf"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:({ID})\s*\.\s*)?({ID})", re.I)
CRIA_SCHEMA = re.compile(rf"\bCREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?({ID})", re.I)
NOME_TABELA = re.compile(rf"(?:({ID})\s*\.\s*)?({ID})")
APAGA_TABELA = re.compile(
    rf"\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?((?:{ID}\s*\.\s*)?{ID}(?:\s*,\s*(?:{ID}\s*\.\s*)?{ID})*)", re.I)


def _nome(token: str) -> str:
    return token[1:-1] if token.startswith('"') else token.lower()


def _qualificado(schema: str | None, tabela: str) -> str:
    return f"{_nome(schema) if schema else 'public'}.{_nome(tabela)}"


def _eventos(limpo: str) -> list[tuple[int, str, str]]:
    """(posicao, "cria" ou "apaga", schema.tabela) na ordem em que aparecem no texto."""
    ev = [(m.start(), "cria", _qualificado(m.group(1), m.group(2))) for m in CRIA_TABELA.finditer(limpo)]
    for m in APAGA_TABELA.finditer(limpo):
        for n in NOME_TABELA.finditer(m.group(1)):
            ev.append((m.start(), "apaga", _qualificado(n.group(1), n.group(2))))
    return sorted(ev, key=lambda e: e[0])


def mapear(pasta_migrations: Path) -> dict:
    migrations, tabelas = [], {}
    for arq in sorted(Path(pasta_migrations).glob("*.sql")):
        limpo = _limpar(arq.read_text(encoding="utf-8"))
        schemas = [_nome(m.group(1)) for m in CRIA_SCHEMA.finditer(limpo)]
        criadas: list[str] = []
        for _pos, tipo, q in _eventos(limpo):
            if tipo == "apaga":
                tabelas.pop(q, None)
                if q in criadas:
                    criadas.remove(q)
            elif q not in tabelas:
                tabelas[q] = arq.name
                criadas.append(q)
        migrations.append({"arquivo": arq.name, "schemas_criados": schemas, "tabelas": criadas})
    return {"migrations": migrations, "tabelas": tabelas, "total_tabelas": len(tabelas)}


def markdown(mapa: dict) -> str:
    por_schema: dict[str, list[tuple[str, str]]] = {}
    for q, arq in mapa["tabelas"].items():
        schema, tabela = q.split(".", 1)
        por_schema.setdefault(schema, []).append((tabela, arq))
    linhas = ["# Mapa do banco (gerado, não edite à mão)", "",
              f"Gerado em {date.today().isoformat()} a partir de {len(mapa['migrations'])} migrations.",
              f"Total de tabelas: {mapa['total_tabelas']}.", ""]
    for schema in sorted(por_schema, key=lambda s: (s != "public", s)):
        linhas += [f"## {schema}", "", "| tabela | criada em |", "| --- | --- |"]
        linhas += [f"| {t} | {a} |" for t, a in sorted(por_schema[schema])]
        linhas.append("")
    return "\n".join(linhas)


def main(argv: list[str]) -> int:
    pasta = saida = None
    i = 0
    while i < len(argv):
        if argv[i] in ("--migrations", "--saida") and i + 1 < len(argv):
            if argv[i] == "--migrations":
                pasta = argv[i + 1]
            else:
                saida = argv[i + 1]
            i += 2
        else:
            print("uso: gerar_mapa_sistema.py --migrations <pasta> [--saida <arquivo.md>]", file=sys.stderr)
            return 2
    if not pasta or not Path(pasta).is_dir():
        print(f"pasta de migrations nao encontrada: {pasta}", file=sys.stderr)
        return 2
    texto = markdown(mapear(Path(pasta)))
    if saida:
        Path(saida).write_text(texto, encoding="utf-8")
    else:
        print(texto)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
