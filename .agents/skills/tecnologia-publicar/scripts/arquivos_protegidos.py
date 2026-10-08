#!/usr/bin/env python3
"""arquivos_protegidos.py: diz quais caminhos de uma lista sao arquivos protegidos (do dono, nao da IA).

Uso: git diff --name-only origin/main...HEAD | python3 arquivos_protegidos.py
     python3 arquivos_protegidos.py <caminho> [<caminho> ...]
Saida: 0 nenhum protegido, 1 achou (imprime um por linha), 2 erro de uso.
Protegidos (em qualquer pasta): AGENTS.md, CLAUDE.md, .githooks/, .codex/hooks/, .codex/config.toml,
.claude/settings*.json e .github/. Eles mandam no que a IA pode fazer e no que o CI e o deploy fazem:
mudanca neles so entra com o OK do dono gravado (tecnologia-publicar passo 3; revisor C7).
So stdlib.
"""
from __future__ import annotations
import re, sys

# (nome citado nas instrucoes, regex sobre o caminho com "/" como separador)
PADROES = [
    ("AGENTS.md", re.compile(r"(^|/)AGENTS\.md$")),
    ("CLAUDE.md", re.compile(r"(^|/)CLAUDE\.md$")),
    (".githooks/", re.compile(r"(^|/)\.githooks/")),
    (".codex/hooks/", re.compile(r"(^|/)\.codex/hooks/")),
    (".codex/config.toml", re.compile(r"(^|/)\.codex/config\.toml$")),
    (".claude/settings*.json", re.compile(r"(^|/)\.claude/settings[^/]*\.json$")),
    (".github/", re.compile(r"(^|/)\.github/")),
]


def protegidos(caminhos: list[str]) -> list[str]:
    achados = []
    for c in caminhos:
        c = c.strip()
        if not c:
            continue
        norm = c.replace("\\", "/")  # "./AGENTS.md" ja casa: todo padrao comeca em (^|/)
        if any(rx.search(norm) for _nome, rx in PADROES):
            achados.append(c)
    return achados


def main(argv: list[str]) -> int:
    if any(a.startswith("-") for a in argv):
        print("uso: arquivos_protegidos.py [<caminho> ...]  (sem argumento, le um caminho por linha da entrada)",
              file=sys.stderr)
        return 2
    caminhos = argv if argv else sys.stdin.read().splitlines()
    achados = protegidos(caminhos)
    for a in achados:
        print(a)
    return 1 if achados else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
