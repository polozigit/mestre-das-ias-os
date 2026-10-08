#!/usr/bin/env python3
"""Gera o mapa do banco e do repo do aluno (referencias/banco.md e repo.md).

Uso:
  python3 gerar_mapa.py --raiz <repo do aluno> --migrations <pasta> --saida <pasta referencias> [--check]
  python3 gerar_mapa.py --raiz <repo do aluno> --sem-banco --saida <pasta referencias> [--check]

--sem-banco: a casa ainda nao tem o sistema (sem pasta de migrations). O banco.md sai
dizendo isso, em vez de o script abortar. Pasta de --migrations que nao existe continua
sendo erro (2): erro de digitacao no caminho nao pode virar "casa sem banco".

So le arquivos locais (migrations e a arvore do repo). Sem rede, sem subprocess:
um teste estatico reprova esses imports. --check nao escreve nada; sai 1 se o
mapa gravado estiver ausente ou diferente do que seria gerado agora.
Python 3.11+, so stdlib.
"""
import argparse
import hashlib
import os
import re
import sys
from pathlib import Path

IGNORAR = {".git", "node_modules", ".next", "__pycache__", ".DS_Store"}
DESTAQUES = ["AGENTS.md", ".codex/", ".claude/", ".agents/skills/", "operacao/"]
PROFUNDIDADE = 2

# ---------------------------------------------------------------- parse SQL

_LIMPAR = re.compile(
    r"""(?P<lc>--[^\n]*)
      | (?P<bc>/\*.*?\*/)
      | (?P<str>'(?:[^']|'')*')
      | (?P<dq>"[^"]*")
      | (?P<dol>(?P<tag>\$(?:[A-Za-z_]\w*)?\$).*?(?P=tag))
    """,
    re.S | re.X,
)


def limpar(sql: str) -> str:
    """Tira comentarios e esvazia strings e corpos entre $$ (nada de la e migration)."""
    def troca(m):
        if m.group("lc"):
            return ""
        if m.group("bc"):
            return " "
        if m.group("str"):
            return "''"
        if m.group("dq"):
            return m.group("dq")
        return " $$ "
    return _LIMPAR.sub(troca, sql)


_ID = r'(?:"[^"]+"|[A-Za-z_][\w$]*)'
_NOME = rf"{_ID}(?:\s*\.\s*{_ID})?"
_PALAVRAS_RESTRICAO = {"CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN", "EXCLUDE", "LIKE"}
_FIM_TIPO = re.compile(
    r"\b(?:NOT|NULL|DEFAULT|PRIMARY|UNIQUE|CHECK|REFERENCES|CONSTRAINT|GENERATED|COLLATE|STORAGE|COMPRESSION)\b",
    re.I,
)

RE_TABELA = re.compile(
    rf"^\s*CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?({_NOME})", re.I)
RE_ALTER = re.compile(rf"^\s*ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?({_NOME})", re.I)
RE_RLS = re.compile(r"\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b", re.I)
RE_POLICY = re.compile(rf"^\s*CREATE\s+POLICY\s+({_ID})\s+ON\s+({_NOME})", re.I)
RE_FUNC = re.compile(
    rf"^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+({_NOME})\s*\(", re.I)
RE_VIEW = re.compile(
    rf"^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:TEMP|TEMPORARY)\s+)?(?:MATERIALIZED\s+)?"
    rf"(?:RECURSIVE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?({_NOME})", re.I)


def _nome(bruto: str) -> str:
    partes = [p.strip().strip('"') for p in re.split(r"\s*\.\s*", bruto.strip())]
    if len(partes) == 1:
        partes.insert(0, "public")
    return ".".join(partes)


def _ident(bruto: str) -> str:
    return bruto.strip().strip('"')


def _split_topo(texto: str) -> list:
    """Divide por virgula no nivel de parenteses zero."""
    partes, atual, nivel = [], [], 0
    for ch in texto:
        if ch == "(":
            nivel += 1
        elif ch == ")":
            nivel -= 1
        if ch == "," and nivel == 0:
            partes.append("".join(atual))
            atual = []
        else:
            atual.append(ch)
    partes.append("".join(atual))
    return [p.strip() for p in partes if p.strip()]


def _parenteses(texto: str, inicio: int) -> str:
    """Conteudo do parentese que abre em texto[inicio]."""
    nivel = 0
    for i in range(inicio, len(texto)):
        if texto[i] == "(":
            nivel += 1
        elif texto[i] == ")":
            nivel -= 1
            if nivel == 0:
                return texto[inicio + 1:i]
    return texto[inicio + 1:]


def _coluna(entrada: str):
    m = re.match(rf"^({_ID})\s+(.*)$", entrada, re.S)
    if not m or _ident(m.group(1)).upper() in _PALAVRAS_RESTRICAO and not m.group(1).startswith('"'):
        return None
    resto = m.group(2)
    fim = _FIM_TIPO.search(resto)
    tipo = resto[:fim.start()] if fim else resto
    tipo = re.sub(r"\s+", " ", tipo).strip()
    tipo = re.sub(r"\s*,\s*", ",", tipo)
    return _ident(m.group(1)), tipo


def parse_migration(sql: str) -> dict:
    """Extrai de uma migration: tabelas (com colunas), RLS, policies, funcoes, views."""
    out = {"tabelas": {}, "colunas_add": [], "rls": [], "policies": [], "funcoes": [], "views": []}
    for stmt in limpar(sql).split(";"):
        m = RE_TABELA.match(stmt)
        if m:
            nome = _nome(m.group(1))
            colunas = out["tabelas"].setdefault(nome, [])
            resto = stmt[m.end():]
            if resto.lstrip().startswith("("):
                corpo = _parenteses(resto, resto.index("("))
                for entrada in _split_topo(corpo):
                    col = _coluna(entrada)
                    if col:
                        colunas.append(col)
            continue
        m = RE_ALTER.match(stmt)
        if m:
            nome = _nome(m.group(1))
            resto = stmt[m.end():]
            if RE_RLS.search(resto) and nome not in out["rls"]:
                out["rls"].append(nome)
            for entrada in _split_topo(resto):
                a = re.match(r"^ADD\s+(COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(.*)$", entrada, re.I | re.S)
                if not a:
                    continue
                col = _coluna(a.group(2))
                if col and (a.group(1) or col[0].upper() not in _PALAVRAS_RESTRICAO):
                    out["colunas_add"].append((nome,) + col)
            continue
        m = RE_POLICY.match(stmt)
        if m:
            cmd = re.search(r"\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b", stmt, re.I)
            papeis = re.search(r"\bTO\s+(.+?)(?=\s+(?:USING|WITH)\b|$)", stmt, re.I | re.S)
            out["policies"].append({
                "nome": _ident(m.group(1)),
                "tabela": _nome(m.group(2)),
                "cmd": cmd.group(1).upper() if cmd else "ALL",
                "papeis": re.sub(r"\s+", " ", papeis.group(1)).strip() if papeis else "",
            })
            continue
        m = RE_FUNC.match(stmt)
        if m:
            out["funcoes"].append(_nome(m.group(1)))
            continue
        m = RE_VIEW.match(stmt)
        if m:
            out["views"].append(_nome(m.group(1)))
    return out


# -------------------------------------------------------------- gerar textos

def _cabecalho(fontes: str, hash_: str) -> str:
    return (f"<!-- GERADO por gerar_mapa.py de {fontes}; nao edite a mao -->\n"
            f"<!-- hash das fontes: {hash_} -->\n")


def gerar_banco(migrations: Path) -> str:
    arquivos = sorted(p for p in migrations.iterdir() if p.is_file() and p.suffix == ".sql")
    h = hashlib.sha256()
    criadas, com_rls, corpo = [], set(), []
    for arq in arquivos:
        bruto = arq.read_bytes()
        h.update(arq.name.encode() + b"\0" + bruto + b"\0")
        info = parse_migration(bruto.decode("utf-8", errors="replace"))
        for t in info["tabelas"]:
            if t not in criadas:
                criadas.append(t)
        com_rls.update(info["rls"])
        corpo.append(f"## {arq.name}\n")
        vazio = True
        for t, cols in info["tabelas"].items():
            vazio = False
            corpo.append(f"- tabela `{t}`")
            if cols:
                corpo.append("  - colunas: " + ", ".join(f"{n} {tp}".strip() for n, tp in cols))
        for t, n, tp in info["colunas_add"]:
            vazio = False
            corpo.append(f"- coluna adicionada em `{t}`: {n} {tp}".rstrip())
        if info["rls"]:
            vazio = False
            corpo.append("- RLS habilitado: " + ", ".join(info["rls"]))
        for p in info["policies"]:
            vazio = False
            alvo = f", para {p['papeis']}" if p["papeis"] else ""
            corpo.append(f"- policy `{p['nome']}` em {p['tabela']} ({p['cmd']}{alvo})")
        for f in info["funcoes"]:
            vazio = False
            corpo.append(f"- funcao `{f}`")
        for v in info["views"]:
            vazio = False
            corpo.append(f"- view `{v}`")
        if vazio:
            corpo.append("- (nada mapeado)")
        corpo.append("")
    sem_rls = [t for t in criadas if t not in com_rls]
    resumo = [
        "## Resumo",
        "",
        f"- Migrations: {len(arquivos)}",
        f"- Tabelas: {len(criadas)}",
        f"- Sem RLS: {', '.join(sem_rls) if sem_rls else 'nenhuma'}",
        "",
    ]
    fontes = f"{migrations.name}/ ({len(arquivos)} arquivos .sql)"
    return (_cabecalho(fontes, h.hexdigest()) + "\n# Mapa do banco\n\n"
            + "\n".join(resumo + corpo)).rstrip() + "\n"


SEM_BANCO = ("Esta casa ainda nao tem banco: nao ha pasta de migrations. Quando o sistema "
             "existir, rode o gerar_mapa.py com --migrations no lugar de --sem-banco.")


def gerar_banco_vazio() -> str:
    h = hashlib.sha256(b"sem-banco").hexdigest()
    return _cabecalho("--sem-banco (casa sem migrations)", h) + "\n# Mapa do banco\n\n" + SEM_BANCO + "\n"


def _listar(pasta: Path) -> list:
    try:
        itens = sorted(os.scandir(pasta), key=lambda e: e.name)
    except OSError:
        return []
    return [e for e in itens if e.name not in IGNORAR]


def gerar_repo(raiz: Path) -> str:
    linhas, existe = [], {d: False for d in DESTAQUES}

    def marcar(rel: str) -> str:
        if rel in existe:
            existe[rel] = True
            return " *"
        return ""

    for e in _listar(raiz):
        eh_dir = e.is_dir(follow_symlinks=False)
        rel = e.name + ("/" if eh_dir else "")
        linhas.append(f"- {rel}{marcar(rel)}")
        if eh_dir and PROFUNDIDADE >= 2:
            for f in _listar(Path(e.path)):
                sub = rel + f.name + ("/" if f.is_dir(follow_symlinks=False) else "")
                linhas.append(f"  - {sub}{marcar(sub)}")
    arvore = "\n".join(linhas)
    h = hashlib.sha256(arvore.encode()).hexdigest()
    dest = [f"- `{d}`: {'existe' if existe[d] else 'nao existe'}" for d in DESTAQUES]
    return (_cabecalho("raiz do repo (arvore ate profundidade 2)", h)
            + "\n# Mapa do repo\n\n## Destaques\n\n" + "\n".join(dest)
            + "\n\n## Arvore\n\nMarcados com * sao os destaques.\n\n" + arvore + "\n")


# ------------------------------------------------------------------- CLI

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Gera referencias/banco.md e repo.md")
    ap.add_argument("--raiz", required=True, type=Path)
    fonte = ap.add_mutually_exclusive_group(required=True)
    fonte.add_argument("--migrations", type=Path)
    fonte.add_argument("--sem-banco", action="store_true",
                       help="casa sem sistema ainda: banco.md diz que nao ha banco")
    ap.add_argument("--saida", required=True, type=Path)
    ap.add_argument("--check", action="store_true",
                    help="nao escreve; sai 1 se o mapa estiver ausente ou desatualizado")
    a = ap.parse_args(argv)
    if not a.raiz.is_dir():
        print(f"erro: raiz nao existe: {a.raiz}", file=sys.stderr)
        return 2
    if a.migrations is not None and not a.migrations.is_dir():
        print(f"erro: pasta de migrations nao existe: {a.migrations} (casa sem sistema: use --sem-banco)",
              file=sys.stderr)
        return 2
    banco = gerar_banco_vazio() if a.sem_banco else gerar_banco(a.migrations)
    gerados = {"banco.md": banco, "repo.md": gerar_repo(a.raiz)}
    if a.check:
        velhos = []
        for nome, texto in gerados.items():
            p = a.saida / nome
            if not p.is_file() or p.read_bytes() != texto.encode("utf-8"):
                velhos.append(nome)
        if velhos:
            print("DESATUALIZADO: " + ", ".join(velhos) + " (rode gerar_mapa.py sem --check)")
            return 1
        print("ok: mapa em dia")
        return 0
    a.saida.mkdir(parents=True, exist_ok=True)
    for nome, texto in gerados.items():
        (a.saida / nome).write_bytes(texto.encode("utf-8"))
        print(f"gerado: {a.saida / nome}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
