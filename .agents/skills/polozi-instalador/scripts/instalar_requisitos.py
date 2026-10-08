#!/usr/bin/env python3
"""ETAPA 0 do polozi-instalador: instala os programas que o preflight achou faltando (py, node, git, gh).

Só roda com o OK do aluno (a SKILL.md pergunta UMA vez e só então chama `--instalar`). Este script nunca
usa `sudo`, nunca pede nem digita senha (a senha do Mac é digitada pelo aluno NA JANELA DO SISTEMA) e só
escreve em `~/Downloads/polozi-instaladores/`. Roda no Python 3.9 do Mac (só stdlib).

Uso:
  instalar_requisitos.py --plano [--json]       # só lista o que falta e o método; saída 0 = nada falta, 1 = falta
  instalar_requisitos.py --instalar <py|node|git|gh>   # instala UM item; saída 0 = aberto/terminado, 2 = falhou

Fontes (conferidas em 08/10/2026):
- Python 3.13.16: python.org/ftp/python/3.13.16/ (pkg do Mac, exe do Windows). O exe tradicional está
  deprecado a partir do 3.14 (docs.python.org/3/using/windows.html), por isso 3.13. Flags do exe:
  `/quiet InstallAllUsers=0 PrependPath=1` (mesma doc).
- Node LTS: a versão é lida de nodejs.org/dist/index.json (primeira entrada com `lts` diferente de false).
- GitHub CLI: a tag vem do redirect de github.com/cli/cli/releases/latest (a API do GitHub limita 60
  consultas por hora por IP e a turma toda usa a mesma rede). O pkg do Mac não é assinado
  (docs/install_macos.md do cli/cli): se o Mac recusar abrir, botão direito > Abrir.
- winget (manifests em microsoft/winget-pkgs): Python.Python.3.12 e Git.Git aceitam `--scope user`;
  OpenJS.NodeJS.LTS e GitHub.cli só existem em escopo de máquina (abrem a janela de permissão do Windows).
- Git no Mac: `xcode-select --install` abre a janela das Command Line Tools (Apple TN2339).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

sys.dont_write_bytecode = True  # não deixa __pycache__ na pasta da skill
sys.path.insert(0, str(Path(__file__).resolve().parent))
import preflight  # noqa: E402  (mesma pasta; usa as mesmas checagens do preflight)

IDS = ("py", "node", "git", "gh")

TITULOS = {
    "py": "Python 3.10 ou mais novo",
    "node": "Node.js (versão LTS)",
    "git": "Git",
    "gh": "GitHub CLI (gh)",
}

# Hosts de onde este script aceita baixar. O GitHub manda os arquivos de release por um redirect.
HOSTS_PERMITIDOS = (
    "www.python.org",
    "nodejs.org",
    "github.com",
    "release-assets.githubusercontent.com",
    "objects.githubusercontent.com",
)

PYTHON_VERSAO = "3.13.16"
# Se a consulta de versão falhar (sem rede, host fora do ar), vale esta (conferida em 08/10/2026).
FALLBACK_VERSOES = {"node": "v24.21.0", "gh": "2.102.0"}

IDS_WINGET = {
    "py": "Python.Python.3.12",
    "node": "OpenJS.NodeJS.LTS",
    "git": "Git.Git",
    "gh": "GitHub.cli",
}
# Só estes dois aceitam `--scope user` (os outros dois só existem em escopo de máquina).
WINGET_ESCOPO_USUARIO = ("py", "git")

PASTA_DOWNLOADS = Path("~/Downloads/polozi-instaladores")
TAMANHO_MINIMO = 1024 * 1024  # um instalador de verdade passa de 1 MB; menos que isso é página de erro

ACAO_MAC = (
    "Na janela do instalador, clique Continuar até o fim e digite a senha do Mac NA JANELA DO SISTEMA "
    "(nunca no chat)."
)
ACAO_MAC_GH = ACAO_MAC + " Se o Mac recusar abrir o instalador, clique com o botão direito nele e escolha Abrir."
ACAO_WINDOWS_MAQUINA = "Se aparecer a janela do Windows pedindo permissão, clique Sim."
ACAO_WINDOWS_SEM_JANELA = "Nada a fazer: o instalador roda sozinho, sem janela."
ACAO_WINDOWS_MSI = "Na janela do instalador, clique Avançar até o fim. Se o Windows pedir permissão, clique Sim."
DEPOIS_MAC = "Quando o instalador terminar, rode o preflight de novo nesta mesma conversa."
DEPOIS_WINDOWS = (
    "Feche esta conversa e abra uma nova (o Windows só enxerga o programa novo numa conversa nova) "
    "e rode $polozi-instalador de novo."
)
DEPOIS_GIT_MAC = (
    "Quando a janela das Command Line Tools terminar, rode o preflight de novo nesta mesma conversa."
)
MANUAL_GIT_WINDOWS = "Baixe em https://git-scm.com/install/windows e clique Avançar até o fim."


class ErroInstalacao(Exception):
    """Falha esperada (host fora da lista, download curto, instalador recusado), mostrada sem traceback."""


def versao_lts_do_node(index_json_texto: str) -> str:
    """Primeira versão LTS do index.json do Node (a lista vem da mais nova pra mais velha)."""
    try:
        entradas = json.loads(index_json_texto)
    except ValueError as erro:
        raise ErroInstalacao("não consegui ler a lista de versões do Node") from erro
    for entrada in entradas:
        if isinstance(entrada, dict) and entrada.get("lts") and entrada.get("version"):
            return str(entrada["version"])
    raise ErroInstalacao("a lista de versões do Node não tem nenhuma LTS")


def versao_do_gh(url_final: str) -> str:
    """Lê `2.102.0` de `https://github.com/cli/cli/releases/tag/v2.102.0`."""
    achado = re.search(r"/releases/tag/v(\d+\.\d+\.\d+)(?:[/?#]|$)", url_final)
    if not achado:
        raise ErroInstalacao(f"não consegui ler a versão do GitHub CLI em '{url_final}'")
    return achado.group(1)


def _urls_de_download(id_: str, plataforma: str, versoes: dict) -> str:
    """URL oficial do instalador pra (programa, sistema); '' quando não há baixada direta."""
    if id_ == "py":
        base = f"https://www.python.org/ftp/python/{PYTHON_VERSAO}/python-{PYTHON_VERSAO}"
        return base + ("-macos11.pkg" if plataforma == "darwin" else "-amd64.exe")
    if id_ == "node":
        v = versoes.get("node") or FALLBACK_VERSOES["node"]
        return f"https://nodejs.org/dist/{v}/node-{v}" + (".pkg" if plataforma == "darwin" else "-x64.msi")
    if id_ == "gh":
        v = versoes.get("gh") or FALLBACK_VERSOES["gh"]
        arquivo = f"gh_{v}_macOS_universal.pkg" if plataforma == "darwin" else f"gh_{v}_windows_amd64.msi"
        return f"https://github.com/cli/cli/releases/download/v{v}/{arquivo}"
    return ""


def plano_para(id_: str, plataforma: str, tem_winget: bool, versoes: dict | None = None) -> dict:
    """Como instalar `id_` em `plataforma`. Função pura: não toca a rede nem o disco.

    Devolve `metodo` (pkg, xcode-select, winget, exe, msi, manual), `comando` (lista ou texto),
    `url` (só nos métodos de download), `acao_do_aluno` e `depois`."""
    if id_ not in IDS:
        raise ErroInstalacao(f"programa desconhecido: {id_}")
    versoes = versoes or {}
    if plataforma == "darwin":
        if id_ == "git":
            return {
                "metodo": "xcode-select", "comando": ["xcode-select", "--install"], "url": "",
                "acao_do_aluno": ACAO_MAC, "depois": DEPOIS_GIT_MAC,
            }
        url = _urls_de_download(id_, plataforma, versoes)
        arquivo = url.rsplit("/", 1)[-1]
        return {
            "metodo": "pkg", "comando": ["open", f"~/Downloads/polozi-instaladores/{arquivo}"], "url": url,
            "acao_do_aluno": ACAO_MAC_GH if id_ == "gh" else ACAO_MAC, "depois": DEPOIS_MAC,
        }
    if plataforma == "win32":
        if tem_winget:
            comando = [
                "winget", "install", "--exact", "--id", IDS_WINGET[id_], "--silent",
                "--accept-package-agreements", "--accept-source-agreements",
            ]
            if id_ in WINGET_ESCOPO_USUARIO:
                comando += ["--scope", "user"]
            return {
                "metodo": "winget", "comando": comando, "url": "",
                "acao_do_aluno": ACAO_WINDOWS_SEM_JANELA if id_ in WINGET_ESCOPO_USUARIO else ACAO_WINDOWS_MAQUINA,
                "depois": DEPOIS_WINDOWS,
            }
        if id_ == "git":
            return {
                "metodo": "manual", "comando": MANUAL_GIT_WINDOWS, "url": "",
                "acao_do_aluno": MANUAL_GIT_WINDOWS, "depois": DEPOIS_WINDOWS,
            }
        url = _urls_de_download(id_, plataforma, versoes)
        arquivo = url.rsplit("/", 1)[-1]
        if id_ == "py":
            return {
                "metodo": "exe",
                "comando": [f"~/Downloads/polozi-instaladores/{arquivo}", "/quiet", "InstallAllUsers=0", "PrependPath=1"],
                "url": url, "acao_do_aluno": ACAO_WINDOWS_SEM_JANELA, "depois": DEPOIS_WINDOWS,
            }
        return {
            "metodo": "msi", "comando": f"abrir ~/Downloads/polozi-instaladores/{arquivo}", "url": url,
            "acao_do_aluno": ACAO_WINDOWS_MSI, "depois": DEPOIS_WINDOWS,
        }
    return {
        "metodo": "manual",
        "comando": f"Sistema {plataforma} não é coberto por este instalador: instale {TITULOS[id_]} pelo site oficial.",
        "url": "", "acao_do_aluno": "Instale pelo site oficial e rode o preflight de novo.", "depois": "",
    }


# ---------------------------------------------------------------------------------------------------------
# Rede (só no --instalar)


def _host_permitido(url: str) -> bool:
    partes = urlparse(url)
    return partes.scheme == "https" and (partes.hostname or "") in HOSTS_PERMITIDOS


class _RedirectSoParaHostsPermitidos(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _host_permitido(newurl):
            raise ErroInstalacao(f"redirecionamento para host fora da lista: {urlparse(newurl).hostname}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _abrir(url: str, timeout: int = 60):
    if not _host_permitido(url):
        raise ErroInstalacao(f"endereço fora da lista permitida: {urlparse(url).hostname or url}")
    abridor = urllib.request.build_opener(_RedirectSoParaHostsPermitidos)
    pedido = urllib.request.Request(url, headers={"User-Agent": "polozi-instalador"})
    return abridor.open(pedido, timeout=timeout)


def baixar(url: str, destino: Path) -> Path:
    """Baixa `url` (https, host da lista) para `destino`, confere o tamanho e devolve o caminho."""
    if not _host_permitido(url):
        raise ErroInstalacao(f"endereço fora da lista permitida: {urlparse(url).hostname or url}")
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_name(destino.name + ".part")
    try:
        with _abrir(url) as resposta, open(parcial, "wb") as saida:
            shutil.copyfileobj(resposta, saida, 1024 * 256)
    except (urllib.error.URLError, OSError, TimeoutError) as erro:
        parcial.unlink(missing_ok=True)
        raise ErroInstalacao(f"não consegui baixar de {urlparse(url).hostname}: {erro}") from erro
    if parcial.stat().st_size < TAMANHO_MINIMO:
        tamanho = parcial.stat().st_size
        parcial.unlink()
        raise ErroInstalacao(f"o arquivo baixado tem só {tamanho} bytes: não é um instalador")
    os.replace(parcial, destino)
    return destino


def resolver_versoes(id_: str) -> dict:
    """Versão mais nova de node e gh, lida na hora; falhou, vale a fixa (FALLBACK_VERSOES)."""
    try:
        if id_ == "node":
            with _abrir("https://nodejs.org/dist/index.json", timeout=20) as resposta:
                return {"node": versao_lts_do_node(resposta.read().decode("utf-8"))}
        if id_ == "gh":
            with _abrir("https://github.com/cli/cli/releases/latest", timeout=20) as resposta:
                return {"gh": versao_do_gh(resposta.geturl())}
    except (urllib.error.URLError, OSError, TimeoutError, ErroInstalacao):
        pass
    return dict(FALLBACK_VERSOES)


# ---------------------------------------------------------------------------------------------------------
# Plano e instalação


def _tem_winget() -> bool:
    return shutil.which("winget") is not None


def itens_faltando() -> list[str]:
    """Ids (na ordem de IDS) que o preflight marcaria `bloqueio`. Só roda `--version`, sem rede."""
    estados = {
        "py": preflight.checar_py()[0],
        "node": preflight.checar_node(),
        "git": preflight.checar_binario_obrigatorio("git", "Git", ["git", "--version"], ""),
        "gh": preflight.checar_binario_obrigatorio("gh", "GitHub CLI", ["gh", "--version"], ""),
    }
    return [id_ for id_ in IDS if estados[id_]["estado"] == "bloqueio"]


def ordem_de_instalacao(ids: list[str], plataforma: str) -> list[str]:
    """Mac: git primeiro (Command Line Tools), depois py, node, gh. Windows: py, git, node, gh."""
    ordem = ("git", "py", "node", "gh") if plataforma == "darwin" else ("py", "git", "node", "gh")
    return [id_ for id_ in ordem if id_ in ids]


def montar_plano(plataforma: str | None = None, tem_winget: bool | None = None) -> dict:
    plataforma = plataforma or sys.platform
    tem_winget = _tem_winget() if tem_winget is None else tem_winget
    faltando = []
    for id_ in ordem_de_instalacao(itens_faltando(), plataforma):
        plano = plano_para(id_, plataforma, tem_winget)
        faltando.append({
            "id": id_, "titulo": TITULOS[id_], "metodo": plano["metodo"], "comando": plano["comando"],
            "acao_do_aluno": plano["acao_do_aluno"],
        })
    return {"sistema": plataforma, "faltando": faltando}


def imprimir_plano(plano: dict) -> None:
    if not plano["faltando"]:
        print("Nada falta: python, node, git e gh estão prontos.")
        return
    print("Falta instalar:")
    for entrada in plano["faltando"]:
        comando = entrada["comando"]
        texto = " ".join(comando) if isinstance(comando, list) else comando
        print(f"- {entrada['id']}: {entrada['titulo']} ({entrada['metodo']}): {texto}")
        print(f"  Você faz: {entrada['acao_do_aluno']}")


def _rodar_instalador(comando: list[str]) -> int:
    try:
        return subprocess.run(comando, check=False).returncode
    except OSError as erro:
        raise ErroInstalacao(f"não consegui abrir o instalador: {erro}") from erro


def instalar(id_: str) -> int:
    plataforma = sys.platform
    plano = plano_para(id_, plataforma, _tem_winget() if plataforma == "win32" else False,
                       resolver_versoes(id_) if id_ in ("node", "gh") else {})
    print(f"INSTALANDO {id_}")
    print(f"ACAO_DO_ALUNO: {plano['acao_do_aluno']}")
    print(f"DEPOIS: {plano['depois']}")
    sys.stdout.flush()
    metodo = plano["metodo"]
    if metodo == "manual":
        raise ErroInstalacao(str(plano["comando"]))
    if metodo == "xcode-select":
        resultado = subprocess.run(plano["comando"], capture_output=True, text=True, check=False)
        saida = ((resultado.stdout or "") + (resultado.stderr or "")).lower()
        if resultado.returncode != 0 and "already installed" not in saida:
            raise ErroInstalacao("o xcode-select não abriu a janela das Command Line Tools")
        return 0
    if metodo == "winget":
        if _rodar_instalador(plano["comando"]) != 0:
            raise ErroInstalacao("o winget não terminou bem; veja a mensagem acima")
        return 0
    # pkg, exe, msi: baixa para ~/Downloads/polozi-instaladores/ e abre
    destino = PASTA_DOWNLOADS.expanduser() / plano["url"].rsplit("/", 1)[-1]
    baixar(plano["url"], destino)
    if metodo == "pkg":
        if _rodar_instalador(["open", str(destino)]) != 0:
            raise ErroInstalacao("o Mac não abriu o instalador baixado")
    elif metodo == "exe":
        if _rodar_instalador([str(destino), "/quiet", "InstallAllUsers=0", "PrependPath=1"]) != 0:
            raise ErroInstalacao("o instalador do Python não terminou bem")
    else:
        abrir = getattr(os, "startfile", None)
        if abrir is None:
            raise ErroInstalacao("este sistema não abre .msi")
        abrir(str(destino))
    return 0


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Instala os requisitos (py, node, git, gh) com o OK do aluno.")
    grupo = parser.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--plano", action="store_true", help="Só lista o que falta e como seria instalado.")
    grupo.add_argument("--instalar", choices=IDS, help="Instala UM item.")
    parser.add_argument("--json", action="store_true", help="Com --plano, imprime em JSON.")
    return parser.parse_args()


def main() -> int:
    args = argumentos()
    if args.plano:
        plano = montar_plano()
        if args.json:
            print(json.dumps(plano, ensure_ascii=False, indent=2))
        else:
            imprimir_plano(plano)
        return 1 if plano["faltando"] else 0
    try:
        return instalar(args.instalar)
    except ErroInstalacao as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
