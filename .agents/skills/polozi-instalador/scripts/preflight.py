#!/usr/bin/env python3
"""ETAPA 0 do polozi-instalador: preflight da máquina do aluno.

Só lê o disco e roda `--version`/checagens de binário na PATH (e, na Casa que
tem `.git`, lê o remote `origin`). A única
exceção de escrita é `--gravar`, que toca só `operacao/INSTALACAO.md` (bloco
entre os marcadores `<!-- PREFLIGHT:INICIO -->`/`<!-- PREFLIGHT:FIM -->`, o
campo `comando_python:` do frontmatter e a linha da tabela `0-preflight`).

A Casa pode chegar CLONADA do repositório-modelo (tem `.git`, `origin` aponta
pro modelo) ou descompactada do zip (sem `.git`): as duas passam, o item
`casa_git` só conta qual das duas é. O item `codex` exige o Codex 0.160 ou
mais novo (os agentes de veredito do kit usam `gpt-6.1-sol`, que a 0.146
recusava com conta ChatGPT); sem o comando `codex` na PATH (quem usa só o app)
a versão não dá pra ler e o item fica `nao_verificavel`. O item `node` exige o
Node 20.9 ou mais novo (o Next.js 16 do sistema não roda abaixo disso) e avisa
abaixo do Node 22 (ver `VERSAO_MINIMA_NODE`).

Nenhum subprocess deste script invoca a si mesmo nem outro módulo Python —
a única leitura da string de detecção do interpretador (a primeira tentativa
do shim, abaixo) é uma sonda de presença de binário na PATH, não uma
reinvocação de script; por isso o shim tenta as 3 variantes de comando
separadamente, sem encadear com `||` (cmd/PowerShell do Windows não
garantem o encadeamento).

Uso:
  preflight.py --pasta <abs> --json            # só lê, imprime o contrato
  preflight.py --pasta <abs> --gravar          # carimba em operacao/INSTALACAO.md
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

MARCADORES = ("AGENTS.md", "EMPRESA-IA.md", "MAPA-DA-EMPRESA-IA.md")

PASTAS_SINCRONIZADAS = (
    "onedrive",
    "dropbox",
    "google drive",
    "googledrive",
    "my drive",
    "icloud drive",
    "mobile documents",
    "cloudstorage",
)

# Tentativas de detecção do interpretador, uma de cada vez, nesta ordem.
# Windows não garante "python3" (o instalador oficial só põe "python" e o
# launcher "py"); por isso a skill nunca assume "python3" fora daqui.
TENTATIVAS_PY = (
    ("python3", ["python3", "--version"]),
    ("py -3", ["py", "-3", "--version"]),
    ("python", ["python", "--version"]),
)

MARCADOR_INICIO = "<!-- PREFLIGHT:INICIO -->"
MARCADOR_FIM = "<!-- PREFLIGHT:FIM -->"

# Versão mínima do Codex (major, minor). O catálogo embutido do CLI ganhou o `gpt-6.1-sol` na 0.159.1
# (changelog oficial, 29/09/2026); o kit pede a 0.160 porque foi a versão provada com a conta ChatGPT
# (0.160.1, 07/10/2026) e a 0.146 recusava o modelo.
VERSAO_MINIMA_CODEX = (0, 160)

# Como atualizar: README do repositório openai/codex (npm, instalador do Mac/Linux e do Windows) e
# changelog oficial (learn.chatgpt.com/docs/changelog), lidos em 07/10/2026.
COMO_ATUALIZAR_CODEX = (
    "Atualize o Codex para a versão 0.160 ou mais nova. No app do Codex: instale a versão mais recente "
    "do app (o CLI vem dentro dele). No terminal: `npm install -g @openai/codex` (Mac/Linux também: "
    "`curl -fsSL https://chatgpt.com/codex/install.sh | sh`; Windows: "
    '`powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"`). '
    "Depois feche e abra o Codex de novo e rode o preflight outra vez."
)

# Versão mínima do Node (major, minor): o Next.js 16 do sistema (sistemas/empresa-os) não roda abaixo da 20.9.
# Fontes: a doc do Next.js, "System requirements" ("Minimum Node.js version: 20.9",
# nextjs.org/docs/app/getting-started/installation, lida em 08/10/2026), e o `engines.node` do `next@16.2.4` no
# package-lock.json do sistema (`>=20.9.0`); o package.json do sistema não declara `engines`. O teste
# NodeVersaoMinimaTest amarra esta constante ao lock: se o Next subir a exigência, o teste reprova.
VERSAO_MINIMA_NODE = (20, 9)
# O mesmo lock trava o `@supabase/supabase-js` (e auth-js, postgrest-js...) em versões que declaram
# `engines.node >=22.0.0`: do 20.9 ao 21.x o sistema sobe, mas o npm avisa na instalação (EBADENGINE) e o
# Supabase não garante. Por isso abaixo do Node 22 é AVISO (não bloqueia), e a mensagem recomenda a LTS atual.
VERSAO_RECOMENDADA_NODE = (22, 0)

COMO_INSTALAR_NODE = (
    "Instale ou atualize o Node.js: baixe a versão LTS em nodejs.org (precisa ser a 20.9 ou mais nova; o "
    "sistema usa o Next.js 16, que não roda em versão menor). Depois feche e abra o Codex de novo e rode o "
    "preflight outra vez."
)

# Repositório-modelo da Casa: `origin` apontando pra ele = Casa clonada, ainda não ligada ao repositório
# do aluno (a etapa 4-github troca o origin; push no modelo nunca).
REPOSITORIO_MODELO = "polozigit/mestre-das-ias-os"
_RE_REMOTE_DO_MODELO = re.compile(
    r"(?:^|[/:])" + re.escape(REPOSITORIO_MODELO) + r"(?:\.git)?/?$", re.IGNORECASE
)

ROTULO_ESTADO = {
    "ok": "OK",
    "aviso": "AVISO",
    "bloqueio": "BLOQUEIO",
    "nao_verificavel": "NAO-VERIFICAVEL",
}


class ErroPreflight(Exception):
    """Erro esperado ao gravar o resultado, apresentado sem traceback."""


def item(id_: str, titulo: str, estado: str, evidencia: str, como_resolver: str = "") -> dict:
    return {
        "id": id_,
        "titulo": titulo,
        "estado": estado,
        "evidencia": evidencia,
        "como_resolver": como_resolver,
    }


def _rodar(comando: list[str], cwd: Path | None = None):
    try:
        return subprocess.run(
            comando, capture_output=True, text=True, timeout=10, check=False,
            cwd=str(cwd) if cwd is not None else None,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None


def checar_py() -> tuple[dict, str]:
    for rotulo, comando in TENTATIVAS_PY:
        resultado = _rodar(comando)
        if resultado is None:
            continue
        saida = ((resultado.stdout or "") + (resultado.stderr or "")).strip()
        if resultado.returncode != 0:
            continue
        correspondencia = re.search(r"Python (\d+)\.(\d+)", saida)
        if not correspondencia:
            continue
        versao = (int(correspondencia.group(1)), int(correspondencia.group(2)))
        if versao >= (3, 10):
            return item("py", "Python 3.10+", "ok", f"{saida} ({rotulo})"), rotulo
        return (
            item(
                "py", "Python 3.10+", "bloqueio", f"{saida} ({rotulo}) — versão abaixo de 3.10",
                "Instale o Python 3.10+ oficial (python.org) [24a:windows/f10].",
            ),
            "pendente",
        )
    return (
        item(
            "py", "Python 3.10+", "bloqueio",
            "nenhuma das 3 tentativas respondeu 'Python 3.'",
            "Instale o Python 3.10+ oficial (python.org) [24a:windows/f10].",
        ),
        "pendente",
    )


def checar_binario_obrigatorio(id_: str, titulo: str, comando: list[str], como_resolver: str) -> dict:
    resultado = _rodar(comando)
    if resultado is not None and resultado.returncode == 0:
        saida = ((resultado.stdout or resultado.stderr or "").strip().splitlines() or [""])[0]
        return item(id_, titulo, "ok", saida, "")
    return item(id_, titulo, "bloqueio", "binário não encontrado ou falhou", como_resolver)


def checar_binario_opcional(id_: str, titulo: str, comando: list[str], como_resolver: str) -> dict:
    resultado = _rodar(comando)
    if resultado is not None and resultado.returncode == 0:
        saida = ((resultado.stdout or resultado.stderr or "").strip().splitlines() or [""])[0]
        return item(id_, titulo, "ok", saida, "")
    return item(id_, titulo, "aviso", "binário não encontrado", como_resolver)


def _versao_do_codex(texto: str) -> tuple[int, int, int] | None:
    achado = re.search(r"(\d+)\.(\d+)\.(\d+)", texto)
    return tuple(int(parte) for parte in achado.groups()) if achado else None  # type: ignore[return-value]


def checar_codex() -> dict:
    titulo = f"Codex {VERSAO_MINIMA_CODEX[0]}.{VERSAO_MINIMA_CODEX[1]} ou mais novo"
    # shutil.which acha `codex.cmd` (npm no Windows); subprocess com o nome puro só acha `codex.exe`
    caminho = shutil.which("codex")
    resultado = _rodar([caminho, "--version"]) if caminho else None
    if resultado is None or resultado.returncode != 0:
        return item(
            "codex", titulo, "nao_verificavel",
            "comando 'codex' não achado no terminal; quem usa só o app do Codex tem o CLI embutido, "
            "e a versão dele não dá pra ler por aqui",
            COMO_ATUALIZAR_CODEX,
        )
    linhas = ((resultado.stdout or "") + (resultado.stderr or "")).strip().splitlines()
    primeira = linhas[0].strip() if linhas else ""
    versao = _versao_do_codex(primeira)
    if versao is None:
        return item(
            "codex", titulo, "nao_verificavel",
            f"não consegui ler a versão em '{primeira}'", COMO_ATUALIZAR_CODEX,
        )
    if versao[:2] >= VERSAO_MINIMA_CODEX:
        return item("codex", titulo, "ok", primeira, "")
    return item(
        "codex", titulo, "bloqueio",
        f"{primeira} (abaixo de {VERSAO_MINIMA_CODEX[0]}.{VERSAO_MINIMA_CODEX[1]})",
        "Esta versão não roda o gpt-6.1-sol dos agentes de veredito (a 0.146 recusava com conta "
        "ChatGPT). " + COMO_ATUALIZAR_CODEX,
    )


def _versao_semver(texto: str) -> tuple[int, int, int] | None:
    achado = re.search(r"(\d+)\.(\d+)\.(\d+)", texto)
    return tuple(int(parte) for parte in achado.groups()) if achado else None  # type: ignore[return-value]


def checar_node() -> dict:
    """Node.js na PATH e na versão que o sistema (Next.js 16) exige: bloqueio abaixo da 20.9, aviso abaixo da 22."""
    titulo = f"Node.js {VERSAO_MINIMA_NODE[0]}.{VERSAO_MINIMA_NODE[1]} ou mais novo"
    resultado = _rodar(["node", "--version"])
    if resultado is None or resultado.returncode != 0:
        return item("node", titulo, "bloqueio", "binário não encontrado ou falhou", COMO_INSTALAR_NODE)
    linhas = ((resultado.stdout or "") + (resultado.stderr or "")).strip().splitlines()
    primeira = linhas[0].strip() if linhas else ""
    versao = _versao_semver(primeira)
    if versao is None:
        return item(
            "node", titulo, "nao_verificavel", f"não consegui ler a versão em '{primeira}'", COMO_INSTALAR_NODE
        )
    if versao[:2] < VERSAO_MINIMA_NODE:
        return item(
            "node", titulo, "bloqueio",
            f"{primeira} (abaixo de {VERSAO_MINIMA_NODE[0]}.{VERSAO_MINIMA_NODE[1]})", COMO_INSTALAR_NODE,
        )
    if versao[:2] < VERSAO_RECOMENDADA_NODE:
        return item(
            "node", titulo, "aviso",
            f"{primeira}: roda o Next.js, mas o pacote do Supabase do sistema declara o Node "
            f"{VERSAO_RECOMENDADA_NODE[0]} ou mais novo (package-lock.json), então o npm avisa na instalação.",
            "Se puder, atualize pro Node 22 LTS ou mais novo (nodejs.org). Não bloqueia.",
        )
    return item("node", titulo, "ok", primeira, "")


def checar_pasta_sync(pasta: Path) -> dict:
    for parte in pasta.parts:
        parte_lower = parte.lower()
        for termo in PASTAS_SINCRONIZADAS:
            if termo in parte_lower:
                return item(
                    "pasta_sync", "Pasta fora de serviço de sincronização", "bloqueio",
                    f"componente do caminho contém '{termo}': {parte}",
                    "Mova a Casa para uma pasta local (fora de OneDrive/Dropbox/Google "
                    "Drive/iCloud Drive) antes de continuar — o git corrompe em silêncio "
                    "dentro de pasta sincronizada.",
                )
    return item("pasta_sync", "Pasta fora de serviço de sincronização", "ok", str(pasta), "")


def checar_pasta_sync_oculto(pasta: Path) -> dict:
    if sys.platform != "darwin":
        return item(
            "pasta_sync_oculto", "Desktop/Documentos no iCloud (macOS)", "ok",
            "checagem só se aplica ao macOS", "",
        )
    home = Path.home()
    for base in (home / "Desktop", home / "Documents"):
        try:
            pasta.relative_to(base)
        except ValueError:
            continue
        return item(
            "pasta_sync_oculto", "Desktop/Documentos no iCloud (macOS)", "aviso",
            f"a Casa está sob {base} — 'Desktop e Documentos no iCloud' sincroniza sem "
            "aparecer no caminho, o item pasta_sync não consegue ver isso.",
            "Confirme nos Ajustes do Sistema se 'Desktop e Documentos no iCloud' está "
            "desligado, ou mova a Casa para outra pasta local.",
        )
    return item("pasta_sync_oculto", "Desktop/Documentos no iCloud (macOS)", "ok", str(pasta), "")


def checar_raiz_da_casa(pasta: Path) -> dict:
    faltando = [nome for nome in MARCADORES if not (pasta / nome).exists()]
    if not (pasta / ".codex" / "config.toml").exists():
        faltando.append(".codex/config.toml")
    if faltando:
        return item(
            "raiz_da_casa", "Pasta é a raiz da Casa", "bloqueio",
            f"faltando: {', '.join(faltando)}",
            "Esta não é a raiz da Casa — abra no Codex a pasta que tem o AGENTS.md.",
        )
    return item("raiz_da_casa", "Pasta é a raiz da Casa", "ok", str(pasta), "")


def _sem_credenciais(url: str) -> str:
    """Tira `usuario:senha@` de uma URL: a evidência vai pro operacao/INSTALACAO.md, que é versionado."""
    return re.sub(r"(?<=://)[^/@\s]+@", "", url)


def checar_casa_git(pasta: Path) -> dict:
    """Como a Casa chegou: CLONADA do repositório-modelo (`.git` com `origin` do modelo) ou
    descompactada do zip (sem `.git`). As duas passam; nunca bloqueia."""
    titulo = "Casa clonada ou descompactada"
    if not (pasta / ".git").exists():
        return item(
            "casa_git", titulo, "ok",
            "sem .git: Casa descompactada do zip (a etapa 3-casa inicia o git)", "",
        )
    resultado = _rodar(["git", "remote", "get-url", "origin"], cwd=pasta)
    origin = (resultado.stdout or "").strip() if resultado is not None and resultado.returncode == 0 else ""
    if not origin:
        return item(
            "casa_git", titulo, "ok",
            ".git sem remote origin: repositório local, ainda não ligado ao GitHub", "",
        )
    visivel = _sem_credenciais(origin)
    if _RE_REMOTE_DO_MODELO.search(origin):
        return item(
            "casa_git", titulo, "ok",
            f"Casa clonada do repositório-modelo (origin = {visivel}). A etapa 4-github troca o origin "
            "pelo repositório do aluno; push no modelo nunca.",
            "",
        )
    return item("casa_git", titulo, "ok", f"Casa já ligada a outro repositório (origin = {visivel})", "")


def checar_chrome() -> dict:
    if sys.platform == "darwin":
        encontrado = Path("/Applications/Google Chrome.app").exists()
    elif sys.platform == "win32":
        candidatos = []
        for variavel in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
            base = os.environ.get(variavel)
            if base:
                candidatos.append(Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe")
        encontrado = any(caminho.exists() for caminho in candidatos)
    else:
        encontrado = False
    if encontrado:
        return item(
            "chrome", "Chrome instalado", "ok", "binário do Chrome encontrado no disco",
            "",
        )
    return item(
        "chrome", "Chrome instalado", "aviso", "Chrome não encontrado nos caminhos conhecidos",
        "Instale o Chrome. 'Chrome como navegador padrão' e 'extensão do Codex "
        "habilitada' não têm prova por script — são prova por PRINT no gate da Etapa 7 "
        "(D24-11; Computer Use pode nem existir no plano Plus do aluno [24a:cli_automacoes/f16]).",
    )


def checar_rules_aceitas(pasta: Path) -> dict:
    caminho_regras = pasta / ".codex" / "rules" / "empresa-ia.rules"
    como_resolver = (
        "Não é possível medir por comando hoje — o gate T-git da Etapa 7 confirma se "
        "'allow' dispensa o prompt de aprovação [24a:config/n08]."
    )
    if not caminho_regras.exists():
        return item(
            "rules_aceitas", "Regras do git aceitas pelo Codex", "nao_verificavel",
            f"arquivo de regras ausente: {caminho_regras}", como_resolver,
        )
    comando = [
        "codex", "execpolicy", "check", "--pretty",
        "--rules", str(caminho_regras), "--", "git", "commit", "-m", "x",
    ]
    resultado = _rodar(comando)
    if resultado is None or resultado.returncode != 0:
        detalhe = (resultado.stderr.strip() if resultado is not None and resultado.stderr else "")
        return item(
            "rules_aceitas", "Regras do git aceitas pelo Codex", "nao_verificavel",
            detalhe or "subcomando 'codex execpolicy check' indisponível neste ambiente",
            como_resolver,
        )
    return item(
        "rules_aceitas", "Regras do git aceitas pelo Codex", "ok",
        resultado.stdout.strip(), "",
    )


def rodar_checagens(pasta: Path) -> dict:
    item_py, comando_python = checar_py()
    itens = [
        item_py,
        checar_node(),
        checar_binario_obrigatorio(
            "git", "Git", ["git", "--version"], "Instale o Git [24a:windows/f10]."
        ),
        checar_binario_obrigatorio(
            "gh", "GitHub CLI", ["gh", "--version"],
            "Instale o GitHub CLI (gh) — o git invisível do aluno passa por ele (D24-15) "
            "[24a:windows/f10].",
        ),
        checar_codex(),
        checar_binario_opcional(
            "docker", "Docker", ["docker", "--version"],
            "Só necessário pro módulo de reserva whatsapp-local (Etapa 8).",
        ),
        checar_pasta_sync(pasta),
        checar_pasta_sync_oculto(pasta),
        checar_raiz_da_casa(pasta),
        checar_casa_git(pasta),
        checar_chrome(),
        checar_rules_aceitas(pasta),
    ]
    ok = not any(entrada["estado"] == "bloqueio" for entrada in itens)
    return {
        "ok": ok,
        "sistema": sys.platform,
        "pasta": str(pasta),
        "comando_python": comando_python,
        "itens": itens,
    }


def imprimir_texto(resultado: dict) -> None:
    for entrada in resultado["itens"]:
        rotulo = ROTULO_ESTADO[entrada["estado"]]
        print(f"[{rotulo}] {entrada['id']} - {entrada['evidencia']}")


def _substituir_bloco_preflight(texto: str, resultado: dict) -> str:
    linhas = []
    for entrada in resultado["itens"]:
        rotulo = ROTULO_ESTADO[entrada["estado"]]
        linha = f"- [{rotulo}] {entrada['id']}: {entrada['evidencia']}"
        if entrada["como_resolver"]:
            linha += f" — {entrada['como_resolver']}"
        linhas.append(linha)
    bloco_novo = f"{MARCADOR_INICIO}\n" + "\n".join(linhas) + f"\n{MARCADOR_FIM}"
    padrao = re.compile(re.escape(MARCADOR_INICIO) + r".*?" + re.escape(MARCADOR_FIM), re.S)
    texto_novo, quantidade = padrao.subn(bloco_novo, texto)
    if quantidade == 0:
        raise ErroPreflight(
            "marcadores <!-- PREFLIGHT:INICIO/FIM --> não encontrados em operacao/INSTALACAO.md"
        )
    return texto_novo


def _gravar_comando_python(texto: str, comando_python: str) -> str:
    def substituir(correspondencia: re.Match) -> str:
        corpo = correspondencia.group(1)
        if re.search(r"^comando_python:.*$", corpo, re.M):
            corpo = re.sub(
                r"^comando_python:.*$", f"comando_python: {comando_python}", corpo, flags=re.M
            )
        else:
            corpo = corpo + f"\ncomando_python: {comando_python}"
        return f"---\n{corpo}\n---"

    texto_novo, quantidade = re.subn(r"^---\n(.*?)\n---", substituir, texto, count=1, flags=re.S)
    if quantidade == 0:
        raise ErroPreflight("frontmatter ausente em operacao/INSTALACAO.md")
    return texto_novo


def _gravar_linha_etapa(texto: str, resultado: dict) -> str:
    estado = "concluida" if resultado["ok"] else "pendente"
    data_hoje = date.today().isoformat() if resultado["ok"] else ""
    linha_nova = f"| 0-preflight | {estado} | {data_hoje} |"
    padrao = re.compile(r"^\| 0-preflight \|.*\|.*\|$", re.M)
    texto_novo, quantidade = padrao.subn(linha_nova, texto)
    if quantidade == 0:
        raise ErroPreflight("linha '| 0-preflight |' não encontrada em operacao/INSTALACAO.md")
    return texto_novo


def gravar_resultado(pasta: Path, resultado: dict) -> Path:
    caminho = pasta / "operacao" / "INSTALACAO.md"
    if not caminho.is_file():
        raise ErroPreflight(f"operacao/INSTALACAO.md não encontrado em {pasta}")
    texto = caminho.read_text(encoding="utf-8")
    texto = _substituir_bloco_preflight(texto, resultado)
    texto = _gravar_comando_python(texto, resultado["comando_python"])
    texto = _gravar_linha_etapa(texto, resultado)
    caminho.write_text(texto, encoding="utf-8", newline="\n")
    return caminho


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="ETAPA 0 do polozi-instalador — preflight da máquina do aluno."
    )
    parser.add_argument("--pasta", required=True, help="Pasta absoluta aberta no Codex.")
    parser.add_argument("--json", action="store_true", help="Imprime o contrato em JSON.")
    parser.add_argument(
        "--gravar", action="store_true", help="Carimba o resultado em operacao/INSTALACAO.md."
    )
    return parser.parse_args()


def main() -> int:
    args = argumentos()
    pasta = Path(args.pasta).expanduser().resolve()
    resultado = rodar_checagens(pasta)
    if args.gravar:
        try:
            gravar_resultado(pasta, resultado)
        except ErroPreflight as erro:
            print(f"ERRO: {erro}", file=sys.stderr)
            return 2
    if args.json:
        print(json.dumps(resultado, ensure_ascii=False, indent=2))
    else:
        imprimir_texto(resultado)
    return 0 if resultado["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
