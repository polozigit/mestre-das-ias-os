#!/usr/bin/env python3
"""classificar_migration.py: diz se uma migration so ACRESCENTA ou e DESTRUTIVA (pode perder dado).

Uso: python3 classificar_migration.py <arquivo.sql> [--json]
Saida: 0 acrescenta, 1 destrutiva, 2 erro de uso (inclui opcao desconhecida).
Ignora comentarios, texto entre aspas e corpo de funcao ($$...$$ fora de DO).
Identificador entre aspas duplas ("it's") e copiado como esta: o apostrofo dentro dele nao abre texto.
Bloco DO executa: o corpo conta, e todo EXECUTE dentro dele e lido ate o ';' (literal '...', E'...',
$tag$...$tag$ e concatenacao com ||).
Dentro de ALTER TABLE, a palavra COLUMN e opcional no Postgres: todo DROP e destrutivo, exceto
DROP CONSTRAINT|DEFAULT|NOT NULL|EXPRESSION|IDENTITY; ALTER [COLUMN] x [SET DATA] TYPE e destrutivo.
Com a palavra COLUMN (DROP COLUMN, ALTER COLUMN x TYPE) vale em qualquer lugar, inclusive SQL dinamico
(EXECUTE format('ALTER TABLE %I DROP COLUMN x', t)). Achado repetido na mesma posicao conta uma vez.
Limites declarados: EXECUTE de variavel montada em outro lugar (ex.: EXECUTE v_sql) nao e visivel;
funcao criada na migration e chamada nela mesma (CREATE FUNCTION f() ... AS $$ DELETE ... $$; SELECT f();)
tambem nao: o corpo da funcao nunca e lido. Quem revisa le o SQL inteiro (revisor C6).
TRUNCATE em GRANT/REVOKE e privilegio, nao comando.
So stdlib.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path

ID = r'(?:"(?:[^"]|"")*"|\w+)'

DESTRUTIVOS = [
    ("DROP TABLE", re.compile(r"\bDROP\s+TABLE\b", re.I)),
    ("DROP SCHEMA", re.compile(r"\bDROP\s+SCHEMA\b", re.I)),
    ("DROP TYPE", re.compile(r"\bDROP\s+TYPE\b", re.I)),
    # Com a palavra COLUMN, vale em qualquer lugar: cobre SQL dinamico em DO, onde o nome da tabela vem de
    # %I ou quote_ident e nao ha cabecalho "ALTER TABLE <nome>" legivel. Sem COLUMN: DENTRO_ALTER_TABLE.
    ("DROP COLUMN", re.compile(r"\bDROP\s+COLUMN\b", re.I)),
    ("ALTER COLUMN TYPE", re.compile(r"\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b", re.I)),
    ("DROP SEQUENCE", re.compile(r"\bDROP\s+SEQUENCE\b", re.I)),
    ("DROP OWNED", re.compile(r"\bDROP\s+OWNED\b", re.I)),
    ("DROP MATERIALIZED VIEW", re.compile(r"\bDROP\s+MATERIALIZED\s+VIEW\b", re.I)),
    ("DROP CASCADE", re.compile(r"\bDROP\b[^;]*\bCASCADE\b", re.I)),
    ("TRUNCATE", re.compile(r"\bTRUNCATE\b", re.I)),
    ("DELETE", re.compile(r"\bDELETE\s+FROM\b", re.I)),
    ("UPDATE", re.compile(r"\bUPDATE\s+(ONLY\s+)?[\w.\"]+\s+((AS\s+)?[\w\"]+\s+)?SET\b", re.I)),
    ("RENAME", re.compile(r"\bALTER\s+(TABLE|SCHEMA|VIEW)\b[^;]*\bRENAME\b", re.I)),
    ("RENAME", re.compile(r"\bALTER\s+(MATERIALIZED\s+VIEW|FOREIGN\s+TABLE)\b[^;]*\bRENAME\b", re.I)),
    ("RENAME VALUE", re.compile(r"\bALTER\s+TYPE\b[^;]*\bRENAME\s+VALUE\b", re.I)),
]

# ALTER TABLE: o corpo (depois do nome da tabela, ate o ';') e onde COLUMN e opcional.
CABECALHO_ALTER_TABLE = re.compile(
    rf"\bALTER\s+(?:FOREIGN\s+)?TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:{ID}\s*\.\s*)?{ID}\s*\*?", re.I)
DENTRO_ALTER_TABLE = [
    ("DROP COLUMN", re.compile(r"\bDROP\s+(?!(?:CONSTRAINT|DEFAULT|NOT\s+NULL|EXPRESSION|IDENTITY)\b)", re.I)),
    ("ALTER COLUMN TYPE", re.compile(rf"\bALTER\s+(?:COLUMN\s+)?{ID}\s+(?:SET\s+DATA\s+)?TYPE\b", re.I)),
]

DOLAR = re.compile(r"\$([A-Za-z_]*)\$")
EXECUTE = re.compile(r"EXECUTE\b", re.I)
EH_DO = re.compile(r"\bDO(\s+LANGUAGE(\s+\w+)?)?\s*$", re.I)


def _fim_literal(sql: str, i: int, escapes: bool = False) -> int:
    """sql[i] e uma aspa simples: devolve o indice da aspa que fecha (ou n-1). escapes: E'...' aceita \\x."""
    n, j = len(sql), i + 1
    while j < n:
        if escapes and sql[j] == "\\":
            j += 2; continue
        if sql[j] == "'" and j + 1 < n and sql[j + 1] == "'":
            j += 2; continue
        if sql[j] == "'":
            return j
        j += 1
    return n - 1


def _fim_identificador(sql: str, i: int) -> int:
    """sql[i] e aspa dupla (identificador): devolve o indice da aspa que fecha ("" dentro e aspa escapada)."""
    n, j = len(sql), i + 1
    while j < n:
        if sql[j] == '"' and j + 1 < n and sql[j + 1] == '"':
            j += 2; continue
        if sql[j] == '"':
            return j
        j += 1
    return n - 1


def _eh_e_string(sql: str, i: int) -> bool:
    return i > 0 and sql[i - 1] in "eE" and (i < 2 or not (sql[i - 2].isalnum() or sql[i - 2] == "_"))


def _ler_execute(sql: str, i: int) -> tuple[str, int]:
    """Le um EXECUTE (dentro de DO) ate o ';' que o encerra, fora de texto. Mantem literais, apaga comentarios,
    junta 'a' || 'b' em um so literal para as palavras nao ficarem partidas. Devolve (texto, indice do ';')."""
    n, j, out = len(sql), i, []
    while j < n and sql[j] != ";":
        if sql.startswith("--", j):
            k = sql.find("\n", j); k = n if k < 0 else k
            out.append(" " * (k - j)); j = k
        elif sql.startswith("/*", j):
            k = sql.find("*/", j + 2); k = n if k < 0 else k + 2
            out.append(re.sub(r"[^\n]", " ", sql[j:k])); j = k
        elif sql[j] == "'":
            k = _fim_literal(sql, j, _eh_e_string(sql, j))
            out.append(sql[j:k + 1]); j = k + 1
        elif sql[j] == '"':
            k = _fim_identificador(sql, j)
            out.append(sql[j:k + 1]); j = k + 1
        else:
            m = DOLAR.match(sql, j)
            if m:
                k = sql.find(m.group(0), m.end())
                k = n if k < 0 else k + len(m.group(0))
                out.append(sql[j:k]); j = k
            else:
                out.append(sql[j]); j += 1
    texto = re.sub(r"'\s*\|\|\s*'", lambda m: "\n" * m.group(0).count("\n"), "".join(out))
    return texto, j


def _limpar(sql: str, em_do: bool = False) -> str:
    """Troca comentario, texto entre aspas e corpo de funcao por espacos, mantendo as quebras de linha.

    Bloco DO executa, entao o corpo e mantido, mas limpo por dentro (comentario e texto viram espaco).
    Dentro de DO, todo EXECUTE (ate o ';') e SQL dinamico que roda de verdade: e mantido."""
    out, i, n = [], 0, len(sql)
    while i < n:
        if em_do and EXECUTE.match(sql, i) and (i == 0 or not (sql[i - 1].isalnum() or sql[i - 1] == "_")):
            texto, i = _ler_execute(sql, i)
            out.append(texto)
        elif sql.startswith("--", i):
            j = sql.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i)); i = j
        elif sql.startswith("/*", i):
            j = sql.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r"[^\n]", " ", sql[i:j])); i = j
        elif sql[i] == "'":
            j = _fim_literal(sql, i, _eh_e_string(sql, i))
            out.append(re.sub(r"[^\n]", " ", sql[i:j + 1])); i = j + 1
        elif sql[i] == '"':
            j = _fim_identificador(sql, i)
            out.append(sql[i:j + 1]); i = j + 1
        else:
            m = DOLAR.match(sql, i)
            if m:
                tag = m.group(0)
                ini = i + len(tag)
                ate = sql.find(tag, ini)
                fechado = ate >= 0
                ate = ate if fechado else n
                corpo = sql[ini:ate]
                if EH_DO.search("".join(out)[-60:]):
                    # bloco DO executa: mantem o corpo, limpando comentario e texto por dentro
                    out.append(" " * len(tag) + _limpar(corpo, em_do=True) + (" " * len(tag) if fechado else ""))
                else:
                    out.append(re.sub(r"[^\n]", " ", sql[i:(ate + len(tag) if fechado else n)]))
                i = ate + len(tag) if fechado else n
            else:
                out.append(sql[i]); i += 1
    return "".join(out)


def _e_privilegio(limpo: str, pos: int) -> bool:
    """TRUNCATE dentro de um GRANT/REVOKE (inclui ALTER DEFAULT PRIVILEGES ... GRANT) e privilegio, nao comando."""
    inicio = limpo.rfind(";", 0, pos) + 1
    return re.search(r"\b(GRANT|REVOKE)\b", limpo[inicio:pos], re.I) is not None


def _dentro_de_alter_table(limpo: str):
    """(posicao, comando) de cada acao destrutiva no corpo de um ALTER TABLE (COLUMN opcional)."""
    for cab in CABECALHO_ALTER_TABLE.finditer(limpo):
        fim = limpo.find(";", cab.end())
        fim = len(limpo) if fim < 0 else fim
        corpo = limpo[cab.end():fim]
        for nome, rx in DENTRO_ALTER_TABLE:
            for m in rx.finditer(corpo):
                yield cab.end() + m.start(), nome


def classificar(sql: str) -> dict:
    limpo = _limpar(sql)
    posicoes = []
    for nome, rx in DESTRUTIVOS:
        for m in rx.finditer(limpo):
            if nome == "TRUNCATE" and _e_privilegio(limpo, m.start()):
                continue
            posicoes.append((m.start(), nome))
    posicoes.extend(_dentro_de_alter_table(limpo))
    linhas = sql.splitlines()
    achados = []
    for pos, nome in sorted(set(posicoes)):  # a mesma acao casada por duas regras vira um achado so
        linha = limpo.count("\n", 0, pos) + 1
        trecho = linhas[linha - 1].strip()[:120]
        achados.append({"linha": linha, "comando": nome, "trecho": trecho})
    achados.sort(key=lambda a: a["linha"])
    return {"classe": "destrutiva" if achados else "acrescenta", "achados": achados}


OPCOES = {"--json"}


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("-")]
    desconhecidas = [a for a in argv if a.startswith("-") and a not in OPCOES]
    if len(args) != 1 or desconhecidas:
        print("uso: classificar_migration.py <arquivo.sql> [--json]", file=sys.stderr)
        return 2
    p = Path(args[0])
    if not p.is_file():
        print(f"arquivo nao encontrado: {p}", file=sys.stderr)
        return 2
    r = classificar(p.read_text(encoding="utf-8"))
    if "--json" in argv:
        print(json.dumps(r, ensure_ascii=False))
    else:
        print(r["classe"])
        for a in r["achados"]:
            print(f"  linha {a['linha']}: {a['comando']}: {a['trecho']}")
    return 1 if r["classe"] == "destrutiva" else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
