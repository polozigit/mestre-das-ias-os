#!/usr/bin/env python3
"""Verificação de estado da Casa, rodada pelo hook SessionStart de PROJETO
(este arquivo mora DENTRO da Casa, em `.codex/hooks/`).

D24-22: a verificação de início de sessão deixa de ser uma frase em prosa
que a IA cumpre ou não e vira um COMANDO, com saída curta e determinística.

Uso:
  <interpretador> verificar_estado.py --evento startup [--casa PASTA]
  <interpretador> verificar_estado.py --evento compact [--casa PASTA]

A Casa é descoberta pelo PRÓPRIO ARQUIVO (`CASA_PADRAO`), nunca pelo cwd —
a doc diz que o comando roda com o cwd da sessão como diretório de trabalho,
o que não é garantia de onde a Casa está. `--casa` existe só como override
de teste.

EVENTO `compact`: imprime 1 linha e sai 0. Não roda checagem nenhuma.

EVENTO `startup`: imprime o marcador `VERIFICACAO DE ESTADO` (o AGENTS.md
do modelo procura por ele), 1 linha por item de VERIFICACOES, NESSA ordem,
e fecha com 1 linha de triagem (`TRIAGEM: github` | `TRIAGEM: conexao` |
`TRIAGEM: em dia`).

Regras duras: todo subprocess roda com timeout curto, `cwd=casa` (nunca o
cwd herdado) e stderr descartado (mensagem de erro do gh/git pode carregar
url com credencial); qualquer exceção ou timeout vira `nao medido`, nunca
derruba o script; sai SEMPRE 0; nunca imprime nada além das linhas fixas e
dos NOMES de bloco MCP; não escreve arquivo nenhum; não roda git
add/commit/push. Não lê `PLUGIN_ROOT`/variável de ambiente nenhuma pra
montar caminho.

Stdlib puro, sem dependência, roda igual em Mac e Windows.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

# hooks/ -> .codex/ -> raiz da Casa.
CASA_PADRAO = Path(__file__).resolve().parents[2]

# As MESMAS 5 chaves que o fallback declarativo do AGENTS.md cita, NESSA
# ordem (guarda de concordância G21 importa esta constante — não redigite a
# lista em outro lugar).
VERIFICACOES = [
    "gh",
    "mcp",
    "repo_remoto",
    "github_atrasado",
    "arvore_suja",
]

# Mesmos padrões do `.githooks/pre-commit` do modelo — mantidos em paralelo
# de propósito (bash vs. Python, sem import cruzado entre os dois mundos);
# teste irmão planta um segredo sintético e prova que o regex pega.
RE_SEGREDO = re.compile(
    r"(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9]"
    r"|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY)"
)

# Nomes de bloco `[mcp_servers.<nome>]` — ancorado no início da linha,
# nunca captura url nem valor de bloco `.env`.
RE_MCP = re.compile(r"^\[mcp_servers\.([A-Za-z0-9_-]+)\]", re.MULTILINE)

TIMEOUT_SUBPROCESSO = 8
NAO_MEDIDO = "nao medido"


def _rodar(comando: list[str], casa: Path) -> subprocess.CompletedProcess | None:
    try:
        return subprocess.run(
            comando,
            cwd=str(casa),
            timeout=TIMEOUT_SUBPROCESSO,
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        return None


def checar_gh(casa: Path) -> str:
    resultado = _rodar(["gh", "auth", "status"], casa)
    if resultado is None:
        return NAO_MEDIDO
    return "conectado" if resultado.returncode == 0 else "faltando"


def checar_mcp(_: Path) -> str:
    caminho = Path.home() / ".codex" / "config.toml"
    try:
        if not caminho.is_file():
            return NAO_MEDIDO
        texto = caminho.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return NAO_MEDIDO
    nomes = sorted(m.group(1) for m in RE_MCP.finditer(texto))
    return ", ".join(nomes) if nomes else "nenhum"


def checar_repo_remoto(casa: Path) -> str:
    url = _rodar(["git", "remote", "get-url", "origin"], casa)
    if url is None or url.returncode != 0:
        return NAO_MEDIDO
    alcance = _rodar(["git", "ls-remote", "--exit-code", "origin"], casa)
    if alcance is None:
        return NAO_MEDIDO
    return "alcancavel" if alcance.returncode == 0 else "inalcancavel"


def checar_github_atrasado(casa: Path) -> str:
    resultado = _rodar(["git", "log", "origin/main..HEAD", "--oneline"], casa)
    if resultado is None or resultado.returncode != 0:
        return NAO_MEDIDO
    return "sim" if resultado.stdout.strip() else "nao"


def checar_arvore_suja(casa: Path) -> str:
    resultado = _rodar(["git", "status", "--porcelain"], casa)
    if resultado is None or resultado.returncode != 0:
        return NAO_MEDIDO
    return "sim" if resultado.stdout.strip() else "nao"


MEDIDORES = {
    "gh": checar_gh,
    "mcp": checar_mcp,
    "repo_remoto": checar_repo_remoto,
    "github_atrasado": checar_github_atrasado,
    "arvore_suja": checar_arvore_suja,
}


def triagem(medidas: dict[str, str]) -> str:
    if medidas.get("arvore_suja") == "sim" or medidas.get("github_atrasado") == "sim":
        return "github"
    if medidas.get("gh") == "faltando" or medidas.get("mcp") == "nenhum":
        return "conexao"
    return "em dia"


def rodar_startup(casa: Path) -> list[str]:
    linhas = ["VERIFICACAO DE ESTADO"]
    medidas: dict[str, str] = {}
    for chave in VERIFICACOES:
        try:
            valor = MEDIDORES[chave](casa)
        except Exception:
            valor = NAO_MEDIDO
        medidas[chave] = valor
        linhas.append(f"{chave}: {valor}")
    linhas.append(f"TRIAGEM: {triagem(medidas)}")
    return linhas


def rodar_compact() -> list[str]:
    return [
        "Houve compactação. Avalie fechar com $polozi-concluir-trabalho ou "
        "passar adiante com $polozi-transferir-trabalho."
    ]


def _sem_segredo(linhas: list[str]) -> list[str]:
    """Última barreira: nenhuma linha sai se casar o regex de segredo."""
    seguras = []
    for linha in linhas:
        if RE_SEGREDO.search(linha):
            seguras.append("[linha omitida: casava padrão de segredo]")
        else:
            seguras.append(linha)
    return seguras


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--evento", required=True, choices=["startup", "compact"])
    ap.add_argument("--casa", default=None, help="override de teste; default: raiz desta Casa")
    args = ap.parse_args()
    casa = Path(args.casa).expanduser() if args.casa else CASA_PADRAO

    if args.evento == "compact":
        linhas = rodar_compact()
    else:
        linhas = rodar_startup(casa)

    for linha in _sem_segredo(linhas):
        print(linha)
    return 0


if __name__ == "__main__":
    sys.exit(main())
