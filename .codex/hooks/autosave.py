#!/usr/bin/env python3
"""Autosave de fim de turno, rodado pelo hook Stop de PROJETO da Casa (este
arquivo mora DENTRO da Casa, em `.codex/hooks/`).

D24-33: o trabalho do dono não fica preso no disco se ele fechar a sessão
sem pedir pra salvar — todo fim de turno commita e tenta empurrar pro
GitHub o que mudou na CASA, na BRANCH ATUAL (nunca troca de branch, nunca
força uma branch específica).

CONTRATO (payload do Stop no stdin): `turn_id`, `stop_hook_active`,
`last_assistant_message`.

PRIMEIRA COISA: se `stop_hook_active` vier verdadeiro, sai 0 sem fazer
NADA — é o sinal anti-loop: este mesmo hook já rodou neste turno, rodar de
novo poderia prender o Codex tentando parar. Nunca devolve `decision:
"block"` nem `continue: false` — os dois fariam o Codex continuar ou parar
o turno, e este hook é só informacional pro dono. Stdout fica SEMPRE vazio.

Todo subprocesso roda com `cwd=casa` (a Casa é descoberta pelo próprio
arquivo, nunca pelo cwd herdado), timeout curto e STDERR DESCARTADO — nunca
impresso (a url de um remoto privado pode carregar credencial).

RETRY DE LOCK: 2 chats podem disputar o `.git/index.lock` do mesmo repo ao
mesmo tempo. `git add`/`git commit` são tentados até `TENTATIVAS_LOCK`
vezes com backoff crescente antes de desistir.

PRÉ-PUSH: o push nunca usa a flag que pula hook, então o
`.githooks/pre-push` da Casa (varredura de segredo, falha fechada) roda em
todo envio. Antes de empurrar, `_varredura_ligada` confere que o git aponta
`core.hooksPath` pra `.githooks` e que o pre-push existe; se não, NÃO
empurra (telemetria `push_sem_varredura`) — o commit fica salvo local.
Com sistema já publicado em produção (marcador
`sistemas/empresa-os/.vercel/project.json`, o mesmo da guarda), a main
publica: o autosave não empurra a main (telemetria
`push_bloqueado_producao`); o trabalho sobe por branch + PR.
Com o `origin` ainda no repositório-modelo do curso (Casa clonada, antes da
etapa 4 do instalador trocar o origin), o autosave só commita: não empurra
(telemetria `push_bloqueado_modelo`). Empurrar ali sujaria o modelo que os
outros alunos clonam, ou levaria um 403 confuso.

PRÉ-COMMIT: se o `.githooks/pre-commit` do modelo barrar o commit (padrão
de segredo detectado), o autosave para ali — NUNCA usa a flag que pula
hook de commit pra forçar a entrada do segredo mesmo assim.

FAIL-OPEN: o corpo do trabalho roda dentro de um único try/except — erro
qualquer vira telemetria `resultado: "erro"` e `main()` sempre devolve 0,
nunca levanta, nunca imprime nada no stdout.

Stdlib puro, sem dependência, roda igual em Mac e Windows.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# hooks/ -> .codex/ -> raiz da Casa.
CASA_PADRAO = Path(__file__).resolve().parents[2]

TIMEOUT_GIT = 8
TIMEOUT_PUSH = 45
TENTATIVAS_LOCK = 5
BACKOFF_LOCK = (0.5, 1, 2, 4)

# Repositório-modelo do curso (mesma regex da guarda.py, do preflight.py e do
# criar_empresa_ia.py): URL https, ssh ou caminho local que TERMINE em
# `polozigit/mestre-das-ias-os[.git]`, sem casar `mestre-das-ias-os-outro`.
REPOSITORIO_MODELO = "polozigit/mestre-das-ias-os"
_RE_REMOTE_DO_MODELO = re.compile(
    r"(?:^|[/:])" + re.escape(REPOSITORIO_MODELO) + r"(?:\.git)?/?$", re.IGNORECASE
)


def _git(args: list[str], casa: Path, timeout: int) -> subprocess.CompletedProcess | None:
    try:
        resultado = subprocess.run(
            args, cwd=str(casa), timeout=timeout, capture_output=True, text=True, check=False
        )
        return resultado
    except Exception:
        return None


def _com_retry_lock(args: list[str], casa: Path, timeout: int):
    saida = None
    for tentativa in range(TENTATIVAS_LOCK):
        saida = _git(args, casa, timeout)
        if saida is not None and saida.returncode == 0:
            return saida, False
        erro = (saida.stderr if saida is not None else "") or ""
        if "index.lock" not in erro:
            return saida, False
        if tentativa < len(BACKOFF_LOCK):
            time.sleep(BACKOFF_LOCK[tentativa])
    return saida, True


def _branch_atual(casa: Path) -> str | None:
    resultado = _git(["git", "rev-parse", "--abbrev-ref", "HEAD"], casa, TIMEOUT_GIT)
    if resultado is None or resultado.returncode != 0:
        return None
    valor = resultado.stdout.strip()
    return valor or None


def _sha_atual(casa: Path) -> str | None:
    resultado = _git(["git", "rev-parse", "--short=7", "HEAD"], casa, TIMEOUT_GIT)
    if resultado is None or resultado.returncode != 0:
        return None
    valor = resultado.stdout.strip()
    return valor or None


def _varredura_ligada(casa: Path) -> bool:
    resultado = _git(["git", "config", "--get", "core.hooksPath"], casa, TIMEOUT_GIT)
    if resultado is None or resultado.returncode != 0:
        return False
    if resultado.stdout.strip().rstrip("/") != ".githooks":
        return False
    return (casa / ".githooks" / "pre-push").is_file()


def _producao_publicada(casa: Path) -> bool:
    return (casa / "sistemas" / "empresa-os" / ".vercel" / "project.json").is_file()


def _origin_e_modelo(casa: Path) -> bool:
    """True se a URL de PUSH do `origin` ainda é o repositório-modelo do curso."""
    resultado = _git(["git", "remote", "get-url", "--push", "--all", "origin"], casa, TIMEOUT_GIT)
    if resultado is None or resultado.returncode != 0:
        return False
    return any(_RE_REMOTE_DO_MODELO.search(linha.strip()) for linha in resultado.stdout.splitlines())


def _push(casa: Path) -> bool:
    for _tentativa in range(2):
        resultado = _git(["git", "push", "-u", "origin", "HEAD"], casa, TIMEOUT_PUSH)
        if resultado is not None and resultado.returncode == 0:
            return True
    return False


def _agora() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _telemetria(casa: Path, branch: str | None, n_arquivos: int, sha: str | None, resultado: str) -> None:
    try:
        linha = {
            "ts": _agora(),
            "hook": "autosave",
            "branch": branch,
            "n_arquivos": n_arquivos,
            "sha": sha,
            "resultado": resultado,
        }
        caminho = casa / "operacao" / "telemetria.jsonl"
        caminho.parent.mkdir(parents=True, exist_ok=True)
        with caminho.open("a", encoding="utf-8") as arquivo:
            arquivo.write(json.dumps(linha, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _executar(casa: Path) -> None:
    status = _git(["git", "status", "--porcelain"], casa, TIMEOUT_GIT)
    if status is None or status.returncode != 0:
        return
    linhas_status = [linha for linha in status.stdout.splitlines() if linha.strip()]
    if not linhas_status:
        _telemetria(casa, _branch_atual(casa), 0, None, "nada_mudou")
        return

    branch = _branch_atual(casa) or "desconhecida"
    n_arquivos = len(linhas_status)
    caminhos = [linha[3:].strip() for linha in linhas_status[:3]]

    add, _esgotou_add = _com_retry_lock(["git", "add", "-A"], casa, TIMEOUT_GIT)
    if add is None or add.returncode != 0:
        _telemetria(casa, branch, n_arquivos, None, "erro")
        return

    agora = datetime.now()
    titulo = f"autosave: {n_arquivos} arquivo(s) ({agora.strftime('%Y-%m-%d %H:%M')})"
    corpo = "\n".join(caminhos)
    mensagem = f"{titulo}\n\n{corpo}" if corpo else titulo

    commit, esgotou_lock = _com_retry_lock(["git", "commit", "-m", mensagem], casa, TIMEOUT_GIT)
    if commit is None or commit.returncode != 0:
        if esgotou_lock:
            _telemetria(casa, branch, n_arquivos, None, "lock")
        else:
            _telemetria(casa, branch, n_arquivos, None, "bloqueado_pre_commit")
        return

    sha = _sha_atual(casa)
    if _origin_e_modelo(casa):
        _telemetria(casa, branch, n_arquivos, sha, "push_bloqueado_modelo")
        return
    if not _varredura_ligada(casa):
        _telemetria(casa, branch, n_arquivos, sha, "push_sem_varredura")
        return
    if branch in ("main", "master") and _producao_publicada(casa):
        _telemetria(casa, branch, n_arquivos, sha, "push_bloqueado_producao")
        return
    if _push(casa):
        _telemetria(casa, branch, n_arquivos, sha, "commitado_e_pushado")
    else:
        _telemetria(casa, branch, n_arquivos, sha, "push_pendente")


def main() -> int:
    try:
        bruto = sys.stdin.read()
        dados = json.loads(bruto) if bruto.strip() else {}
        if not isinstance(dados, dict):
            dados = {}
    except Exception:
        dados = {}

    if dados.get("stop_hook_active"):
        return 0

    try:
        _executar(CASA_PADRAO)
    except Exception:
        try:
            _telemetria(CASA_PADRAO, None, 0, None, "erro")
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
