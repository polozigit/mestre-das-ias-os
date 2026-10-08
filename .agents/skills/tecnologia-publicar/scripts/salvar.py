#!/usr/bin/env python3
"""Salva o trabalho da Casa no GitHub, sem subagente: commit + push + prova.

Substitui o subagente que fazia todo commit/push. Tudo aqui é determinístico:
mesmas travas da Casa (pre-commit e pre-push em `.githooks/`), nunca pula
hook, nunca força push, nunca reescreve histórico.

Uso (rodar na RAIZ da Casa):

    python3 .agents/skills/tecnologia-publicar/scripts/salvar.py -m "<mensagem>" <caminho> [<caminho> ...]
    python3 .agents/skills/tecnologia-publicar/scripts/salvar.py -m "<mensagem>" --tudo
    python3 .agents/skills/tecnologia-publicar/scripts/salvar.py --provar

`--tudo` faz `git add -A` (use só ao salvar a árvore suja inteira, por exemplo
no começo da sessão). `--provar` só confere, não salva.

Códigos de saída:

    0  SINCRONIZADO <sha7> (commit e push feitos, nada sobrando)
       ou SALVO_LOCAL <sha7> (Casa sem `origin`, ou com o `origin` ainda no
       repositório-modelo do curso: commit local feito, push NUNCA; salvo só
       neste computador até a etapa 4 do instalador trocar o origin)
    1  prova falhou: arquivos fora do commit, commits que não subiram,
       ou sem upstream para provar (so com --provar); também com o `origin`
       no repositório-modelo, onde nunca há GitHub do dono para provar
    2  recusado: a trava de commit barrou (segredo, migration sem veredito),
       ou o push falhou por outro motivo (pre-push, proteção do GitHub, rede),
       ou o git está ocupado (index.lock)
    3  sistema publicado em produção e a branch é main/master: usar o
       fluxo completo do tecnologia-publicar (branch + PR). Nada foi commitado
    4  travas de segredo desligadas (core.hooksPath != .githooks ou hooks
       ausentes). Nada foi commitado
    5  uso errado ou lugar errado: fora da raiz da Casa, HEAD solto, sem -m,
       sem caminhos e sem --tudo, caminho fora do repositório
    6  o GitHub tem mudanças que conflitam com as locais; o merge foi
       desfeito e nada foi perdido: mostrar os dois lados ao dono

Contratos:
- Nunca usa --force, -f, --force-with-lease nem --no-verify. Nunca rebase,
  nunca reset.
- Push rejeitado por "remoto à frente": um `git pull --no-rebase --no-edit`
  (merge) e um novo push. Conflito = `git merge --abort` e saída 6.
- Saída do git nunca é repetida crua: a url do remoto pode carregar
  credencial, então todo texto passa por `limpar` antes de ser impresso.
- Não lê `credenciais/`.

Stdlib puro; roda igual em Mac e Windows.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time
from pathlib import Path

TIMEOUT_GIT = 30
TIMEOUT_PUSH = 120
TENTATIVAS_LOCK = 5
BACKOFF_LOCK = (0.5, 1, 2, 4)
MARCADOR_PRODUCAO = Path("sistemas") / "empresa-os" / ".vercel" / "project.json"
MAX_LINHAS_ERRO = 8
MAX_NOMES = 10

# Repositório-modelo do curso: o aluno clona este e o `origin` fica apontando pra ele até a etapa 4
# do instalador criar o repositório dele e trocar o origin. Mesma regex da guarda.py, do autosave.py,
# do preflight.py e do criar_empresa_ia.py: URL https, ssh ou caminho local que TERMINE em
# `polozigit/mestre-das-ias-os[.git]`, sem confundir com `mestre-das-ias-os-outro`.
REPOSITORIO_MODELO = "polozigit/mestre-das-ias-os"
_RE_REMOTE_DO_MODELO = re.compile(
    r"(?:^|[/:])" + re.escape(REPOSITORIO_MODELO) + r"(?:\.git)?/?$", re.IGNORECASE
)
MSG_MODELO = (
    "sem push: o origin ainda é o repositório-modelo do curso; a etapa 4 do instalador "
    "cria o seu repositório e troca o origin"
)

# LC_ALL/LANGUAGE=C: as mensagens do git que este script lê ("fetch first",
# "non-fast-forward", "CONFLICT") saem em inglês mesmo num git traduzido.
ENV = dict(
    os.environ,
    GIT_TERMINAL_PROMPT="0",
    GIT_EDITOR="true",
    GIT_MERGE_AUTOEDIT="no",
    LC_ALL="C",
    LANGUAGE="C",
)


class Sair(Exception):
    def __init__(self, codigo: int):
        self.codigo = codigo


def dizer(texto: str = "") -> None:
    print(texto, flush=True)


def limpar(texto: str) -> str:
    """Troca `https://usuario:token@` e `https://token@` por `https://***@`."""
    return re.sub(r"(https?://)[^/\s@]+@", r"\1***@", texto or "")


def falhar(codigo: int, motivo: str) -> None:
    dizer(limpar(motivo))
    raise Sair(codigo)


def git(args: list[str], raiz: Path, timeout: int = TIMEOUT_GIT) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            ["git", *args],
            cwd=str(raiz),
            env=ENV,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(args, 124, "", "tempo esgotado")
    except OSError as erro:
        return subprocess.CompletedProcess(args, 127, "", f"git indisponível: {erro}")


def git_com_lock(args: list[str], raiz: Path, timeout: int = TIMEOUT_GIT) -> tuple[subprocess.CompletedProcess, bool]:
    """Repete enquanto outro processo segura o .git/index.lock. Devolve (saida, esgotou)."""
    saida = git(args, raiz, timeout)
    for tentativa in range(TENTATIVAS_LOCK):
        if saida.returncode == 0 or "index.lock" not in (saida.stderr or ""):
            return saida, False
        if tentativa >= len(BACKOFF_LOCK):
            break
        time.sleep(BACKOFF_LOCK[tentativa])
        saida = git(args, raiz, timeout)
    return saida, "index.lock" in (saida.stderr or "") and saida.returncode != 0


def linhas(saida: subprocess.CompletedProcess, ignorar_prefixos: tuple[str, ...] = ()) -> list[str]:
    juntas = f"{saida.stdout or ''}\n{saida.stderr or ''}"
    resultado = []
    for linha in juntas.splitlines():
        linha = limpar(linha).strip()
        if not linha or linha.startswith(ignorar_prefixos):
            continue
        resultado.append(linha)
    return resultado[:MAX_LINHAS_ERRO]


def sha_curto(raiz: Path) -> str:
    saida = git(["rev-parse", "--short=7", "HEAD"], raiz)
    return saida.stdout.strip() if saida.returncode == 0 and saida.stdout.strip() else "sem-commit"


def branch_atual(raiz: Path) -> str | None:
    saida = git(["symbolic-ref", "-q", "--short", "HEAD"], raiz)
    valor = saida.stdout.strip()
    return valor if saida.returncode == 0 and valor else None


def conferir_raiz() -> Path:
    try:
        saida = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=TIMEOUT_GIT, check=False, env=ENV,
        )
    except (OSError, subprocess.TimeoutExpired):
        saida = None
    topo = saida.stdout.strip() if saida is not None and saida.returncode == 0 else ""
    if not topo:
        falhar(5, "ERRO: aqui não é um repositório git; rode na raiz da Casa.")
    try:
        igual = os.path.samefile(topo, os.getcwd())
    except OSError:
        igual = False
    if not igual:
        falhar(5, f"ERRO: rode na raiz da Casa ({Path(topo).name}), não numa subpasta.")
    return Path(topo).resolve()


def conferir_caminhos(raiz: Path, caminhos: list[str]) -> list[str]:
    base = os.path.normpath(str(raiz))
    limpos = []
    for caminho in caminhos:
        absoluto = os.path.normpath(os.path.join(base, caminho))
        try:
            dentro = os.path.commonpath([base, absoluto]) == base and absoluto != base
        except ValueError:
            dentro = False
        if not dentro:
            falhar(5, f"ERRO: caminho fora do repositório: {caminho}")
        relativo = os.path.relpath(absoluto, base).replace(os.sep, "/")
        if relativo == ".git" or relativo.startswith(".git/"):
            falhar(5, f"ERRO: caminho dentro de .git não pode ser salvo: {caminho}")
        limpos.append(relativo)
    return limpos


def travas_ligadas(raiz: Path) -> bool:
    saida = git(["config", "--get", "core.hooksPath"], raiz)
    if saida.returncode != 0 or saida.stdout.strip().rstrip("/") != ".githooks":
        return False
    return (raiz / ".githooks" / "pre-commit").is_file() and (raiz / ".githooks" / "pre-push").is_file()


def producao_publicada(raiz: Path) -> bool:
    return (raiz / MARCADOR_PRODUCAO).is_file()


def prova(raiz: Path) -> tuple[bool, list[str]]:
    """(provado, mensagens). Provado = árvore limpa e nenhum commit à frente do upstream."""
    mensagens: list[str] = []
    status = git(["-c", "core.quotepath=false", "status", "--porcelain", "-uall"], raiz)
    if status.returncode != 0:
        return False, ["não consegui ler o estado do git"]
    sujos = [linha[3:].strip() for linha in status.stdout.splitlines() if linha.strip()]
    if sujos:
        mensagens.append(f"ficaram {len(sujos)} arquivo(s) fora do commit:")
        mensagens.extend(f"  {nome}" for nome in sujos[:MAX_NOMES])
        if len(sujos) > MAX_NOMES:
            mensagens.append(f"  ... e mais {len(sujos) - MAX_NOMES}")
    a_frente = git(["rev-list", "--count", "@{u}..HEAD"], raiz)
    if a_frente.returncode != 0:
        mensagens.append("sem upstream: não dá para provar que está no GitHub")
        return False, mensagens
    try:
        n = int(a_frente.stdout.strip())
    except ValueError:
        return False, mensagens + ["não consegui contar os commits à frente"]
    if n > 0:
        mensagens.append(f"{n} commit(s) ainda não subiram")
    return not mensagens, mensagens


def provar_e_sair(raiz: Path, local: bool = False) -> int:
    """Imprime a prova. `local` = sem origin: só a árvore limpa conta."""
    if local:
        status = git(["-c", "core.quotepath=false", "status", "--porcelain", "-uall"], raiz)
        sujos = [linha[3:].strip() for linha in status.stdout.splitlines() if linha.strip()]
        if sujos:
            dizer(f"ficaram {len(sujos)} arquivo(s) fora do commit:")
            for nome in sujos[:MAX_NOMES]:
                dizer(f"  {nome}")
            return 1
        return 0
    if origin_e_modelo(raiz):
        # estar igual ao modelo não é estar salvo no GitHub do dono: nunca "SINCRONIZADO" aqui
        dizer(MSG_MODELO)
        return 1
    provado, mensagens = prova(raiz)
    if provado:
        dizer(f"SINCRONIZADO {sha_curto(raiz)}")
        return 0
    for mensagem in mensagens:
        dizer(limpar(mensagem))
    return 1


def preparar(raiz: Path, caminhos: list[str], tudo: bool) -> None:
    if tudo:
        add, esgotou = git_com_lock(["add", "-A"], raiz)
    else:
        add, esgotou = git_com_lock(["add", "--", *caminhos], raiz)
    if add.returncode != 0:
        if esgotou:
            falhar(2, "git ocupado por outro processo (index.lock): tente de novo em instantes.")
        detalhe = linhas(add)
        falhar(5, "ERRO: não consegui preparar os arquivos: " + (detalhe[0] if detalhe else "git add falhou"))


def commitar(raiz: Path, mensagem: str) -> int | None:
    """Devolve a quantidade de arquivos commitados, ou None se não havia nada."""
    if git(["diff", "--cached", "--quiet"], raiz).returncode == 0:
        return None
    lista = git(["diff", "--cached", "--name-only"], raiz)
    quantidade = len([n for n in lista.stdout.splitlines() if n.strip()])
    commit, esgotou = git_com_lock(["commit", "-m", mensagem], raiz)
    if commit.returncode != 0:
        if esgotou:
            falhar(2, "git ocupado por outro processo (index.lock): tente de novo em instantes.")
        detalhe = linhas(commit)
        bloqueio = any("BLOQUEADO" in linha for linha in detalhe)
        dizer("BLOQUEADO pela trava de commit:" if bloqueio else "commit falhou:")
        for linha in detalhe:
            dizer(linha)
        if bloqueio:
            dizer("Nada foi commitado. Tire o segredo ou o arquivo e tente de novo; nunca contorne a trava.")
        raise Sair(2)
    return quantidade


def tem_origin(raiz: Path) -> bool:
    return git(["remote", "get-url", "origin"], raiz).returncode == 0


def origin_e_modelo(raiz: Path) -> bool:
    """True se a URL de PUSH do `origin` ainda é o repositório-modelo do curso (a Casa foi clonada
    dele e a etapa 4 do instalador ainda não trocou o origin). Só devolve sim ou não: a URL nunca
    é repetida (pode carregar credencial)."""
    saida = git(["remote", "get-url", "--push", "--all", "origin"], raiz)
    if saida.returncode != 0:
        return False
    return any(_RE_REMOTE_DO_MODELO.search(linha.strip()) for linha in saida.stdout.splitlines())


def remoto_a_frente(saida: subprocess.CompletedProcess) -> bool:
    texto = (saida.stderr or "") + (saida.stdout or "")
    return "fetch first" in texto or "non-fast-forward" in texto or ("rejected" in texto and "behind" in texto)


def empurrar(raiz: Path) -> subprocess.CompletedProcess:
    return git(["push", "-u", "origin", "HEAD"], raiz, TIMEOUT_PUSH)


def falha_de_push(saida: subprocess.CompletedProcess) -> None:
    dizer("push recusado:")
    for linha in linhas(saida, ignorar_prefixos=("To ", "error: failed to push")):
        dizer(linha)
    dizer("Pode ser a trava de segredo (pre-push), a proteção do GitHub, a rede ou a senha do GitHub.")
    dizer("Segredo: tire do commit, nunca contorne. Se uma chave vazou, use tecnologia-acessos (Girar chave).")
    raise Sair(2)


def juntar_com_github(raiz: Path, branch: str) -> bool:
    """Merge (nunca rebase). True se juntou; False e merge desfeito se houve conflito."""
    pull = git(["pull", "--no-rebase", "--no-edit", "origin", branch], raiz, TIMEOUT_PUSH)
    if pull.returncode == 0:
        return True
    em_merge = git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], raiz).returncode == 0
    if em_merge:
        git(["merge", "--abort"], raiz)
        return False
    dizer("não consegui juntar com o GitHub:")
    for linha in linhas(pull):
        dizer(linha)
    raise Sair(2)


def salvar(raiz: Path, mensagem: str, caminhos: list[str], tudo: bool) -> int:
    branch = branch_atual(raiz)
    if branch is None:
        falhar(5, "ERRO: o git está num estado solto (sem branch); não dá para salvar.")
    if not travas_ligadas(raiz):
        falhar(4, "travas de segredo desligadas; rode a instalação de novo. Nada foi commitado.")
    if branch in ("main", "master") and producao_publicada(raiz):
        falhar(3, "sistema publicado: use o fluxo completo do tecnologia-publicar (branch + PR). Nada foi commitado.")

    preparar(raiz, caminhos, tudo)
    quantidade = commitar(raiz, mensagem)
    if quantidade is None:
        dizer("nada novo para commitar")
    else:
        dizer(f"commit {sha_curto(raiz)}: {quantidade} arquivo(s)")

    if not tem_origin(raiz):
        dizer(f"SALVO_LOCAL {sha_curto(raiz)}")
        return provar_e_sair(raiz, local=True)
    if origin_e_modelo(raiz):
        dizer(MSG_MODELO)
        dizer(f"SALVO_LOCAL {sha_curto(raiz)}")
        return provar_e_sair(raiz, local=True)

    saida = empurrar(raiz)
    if saida.returncode != 0 and remoto_a_frente(saida):
        if not juntar_com_github(raiz, branch):
            falhar(6, "conflito com o GitHub: mostre os dois lados ao dono. Nada foi perdido, o merge foi desfeito.")
        dizer("juntei as mudanças do GitHub (merge)")
        saida = empurrar(raiz)
    if saida.returncode != 0:
        falha_de_push(saida)
    dizer(f"push ok: origin/{branch}")
    return provar_e_sair(raiz)


class Parser(argparse.ArgumentParser):
    def error(self, message: str):  # argparse sairia com 2; aqui uso errado é 5
        falhar(5, f"ERRO de uso: {message}")


def montar_parser() -> argparse.ArgumentParser:
    parser = Parser(description="Salva o trabalho da Casa no GitHub (commit + push + prova).")
    parser.add_argument("-m", "--mensagem", help="mensagem do commit")
    parser.add_argument("--tudo", action="store_true", help="git add -A (árvore suja inteira)")
    parser.add_argument("--provar", action="store_true", help="só conferir se está sincronizado")
    parser.add_argument("caminhos", nargs="*", help="arquivos ou pastas a salvar")
    return parser


def principal(argv: list[str]) -> int:
    args = montar_parser().parse_args(argv)
    raiz = conferir_raiz()
    if args.provar:
        if args.tudo or args.caminhos or args.mensagem:
            falhar(5, "ERRO de uso: --provar não combina com -m, caminhos nem --tudo.")
        return provar_e_sair(raiz)
    if not args.mensagem or not args.mensagem.strip():
        falhar(5, "ERRO de uso: falta -m \"<mensagem>\".")
    if args.tudo and args.caminhos:
        falhar(5, "ERRO de uso: use --tudo OU caminhos, não os dois.")
    if not args.tudo and not args.caminhos:
        falhar(5, "ERRO de uso: informe os caminhos a salvar ou --tudo.")
    caminhos = [] if args.tudo else conferir_caminhos(raiz, args.caminhos)
    return salvar(raiz, args.mensagem, caminhos, args.tudo)


def main(argv: list[str] | None = None) -> int:
    try:
        return principal(sys.argv[1:] if argv is None else argv)
    except Sair as saida:
        return saida.codigo


if __name__ == "__main__":
    sys.exit(main())
