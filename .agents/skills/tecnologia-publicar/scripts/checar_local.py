#!/usr/bin/env python3
"""Checagem local antes do merge: o que o GitHub Actions fazia, agora no computador do dono.

Decisão de 26/10/2026: a cota grátis do GitHub Actions (2.000 min/mês em
repositório privado) fica só para os dois workflows que aplicam migration
(`deploy-db.yml` e `deploy-db-homologacao.yml`). Lint, tsc, testes, banco
local e varredura de segredo rodam aqui, no passo 4 da skill
tecnologia-publicar, antes do push e do merge. Acabar a cota não trava mais
a publicação.

Uso (rodar na RAIZ da Casa, na branch da mudança):

    python3 .agents/skills/tecnologia-publicar/scripts/checar_local.py [--base origin/main]

Confere só o que a branch mudou contra `--base` (`git diff --no-renames
<base>...HEAD`):

  segredo     linhas acrescentadas com cara de chave e arquivo proibido
              (as mesmas regras do `.githooks/regras-segredo.sh`)
  vereditos   cada migration nova ou alterada tem veredito válido
              (`tecnologia-mudar-banco/scripts/veredito.py conferir`)
  sistema     `npm run lint`, `npx tsc --noEmit` e `npm test` em
              sistemas/empresa-os (só se a branch mexe lá; `npm ci` antes se
              faltar node_modules)
  arquitetura guardas estáticas do banco (`tests/test_arquitetura.py`)
  banco       migrations em Postgres local, duas rodadas com dado + pgTAP
              (`scripts/testar-migrations-local.sh`). Precisa de Docker; sem
              Docker fica PULADO e quem prova é a homologação (a Action
              `deploy-db-homologacao.yml` aplica com dado na PR)

Cada linha sai como `OK`, `FALHOU` ou `PULADO <item>: <motivo>`.

Códigos de saída:

    0  nada FALHOU (pode seguir para o push e a PR)
    1  algum item FALHOU (corrigir, commitar e rodar de novo)
    2  uso errado: fora da raiz da Casa, `--base` inexistente, git ilegível

Nunca lê `credenciais/` e nunca imprime o trecho que parece chave: só o nome
do arquivo. Stdlib puro; roda igual em Mac e Windows (o `sh` do Git Bash
basta para as regras de segredo).
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

SISTEMA = "sistemas/empresa-os"
REGRAS = ".githooks/regras-segredo.sh"
VEREDITO = ".agents/skills/tecnologia-mudar-banco/scripts/veredito.py"
TIMEOUT_GIT = 60
TIMEOUT_COMANDO = 1800


class ErroUso(Exception):
    pass


def _rodar(comando: list[str], cwd: Path, entrada: str | None = None, timeout: int = TIMEOUT_COMANDO):
    try:
        return subprocess.run(
            comando, cwd=str(cwd), input=entrada, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as erro:
        return subprocess.CompletedProcess(comando, 127, "", str(erro))


def _git(casa: Path, *args: str) -> str:
    r = _rodar(["git", "-c", "core.quotepath=off", *args], casa, timeout=TIMEOUT_GIT)
    if r.returncode != 0:
        raise ErroUso(f"git {' '.join(args[:2])} falhou: {(r.stderr or r.stdout).strip()[:300]}")
    return r.stdout


def _ultimas_linhas(r: subprocess.CompletedProcess, n: int = 15) -> str:
    texto = ((r.stdout or "") + (r.stderr or "")).strip().splitlines()
    return "\n".join("    " + l for l in texto[-n:])


def arquivos_mudados(casa: Path, base: str) -> list[str]:
    saida = _git(casa, "diff", "--name-only", "--no-renames", "--diff-filter=ACM", f"{base}...HEAD")
    return [l for l in saida.splitlines() if l.strip()]


def migrations(arquivos: list[str]) -> list[str]:
    return [
        a for a in arquivos
        if a.startswith("sistemas/") and "/supabase/migrations/" in a and a.endswith(".sql")
    ]


def checar_segredo(casa: Path, base: str, arquivos: list[str]) -> tuple[str, str]:
    if not (casa / REGRAS).is_file():
        return "FALHOU", f"{REGRAS} sumiu: sem ele não dá para varrer segredo (git restore {REGRAS})"
    sh = shutil.which("sh")
    if not sh:
        return "FALHOU", "sem `sh` nesta máquina para rodar as regras de segredo (no Windows, instale o Git)"
    proibidos = []
    for arq in arquivos:
        r = _rodar([sh, "-c", f'. "./{REGRAS}"; caminho_proibido "$1"', "sh", arq], casa, timeout=TIMEOUT_GIT)
        if r.returncode == 0:
            proibidos.append(arq)
    if proibidos:
        return "FALHOU", f"arquivo que nunca vai pro GitHub: {', '.join(proibidos)}"
    com_chave = []
    for arq in arquivos:
        diff = _git(casa, "diff", "--no-renames", f"{base}...HEAD", "--", arq)
        acrescentadas = "\n".join(
            l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++ ")
        )
        if not acrescentadas:
            continue
        r = _rodar([sh, "-c", f'. "./{REGRAS}"; texto_tem_segredo'], casa, entrada=acrescentadas, timeout=TIMEOUT_GIT)
        if r.returncode == 0:
            com_chave.append(arq)
    if com_chave:
        return "FALHOU", (
            f"linha com cara de chave em: {', '.join(com_chave)}. Tire a chave do arquivo e guarde "
            "pela skill tecnologia-acessos"
        )
    return "OK", f"{len(arquivos)} arquivo(s) varrido(s)"


def checar_vereditos(casa: Path, arquivos: list[str]) -> tuple[str, str]:
    lista = migrations(arquivos)
    if not lista:
        return "PULADO", "nenhuma migration na branch"
    if not (casa / VEREDITO).is_file():
        return "FALHOU", f"falta {VEREDITO}: o time tecnologia não está instalado nesta Casa"
    ruins = []
    for f in lista:
        r = _rodar([sys.executable, VEREDITO, "conferir", f], casa, timeout=TIMEOUT_GIT)
        if r.returncode != 0:
            ruins.append(f"{f}\n{_ultimas_linhas(r, 5)}")
    if ruins:
        return "FALHOU", "migration sem veredito válido (chame a skill tecnologia-mudar-banco):\n" + "\n".join(ruins)
    return "OK", f"{len(lista)} migration(s) com veredito"


def _npm() -> str | None:
    return shutil.which("npm") or shutil.which("npm.cmd")


def _npx() -> str | None:
    return shutil.which("npx") or shutil.which("npx.cmd")


def checar_sistema(casa: Path, arquivos: list[str]) -> tuple[str, str]:
    if not any(a.startswith(SISTEMA + "/") for a in arquivos):
        return "PULADO", f"a branch não mexe em {SISTEMA}"
    pasta = casa / SISTEMA
    npm, npx = _npm(), _npx()
    if not npm or not npx:
        return "FALHOU", "sem npm/npx nesta máquina (o instalador instala o Node)"
    if not (pasta / "node_modules").is_dir():
        r = _rodar([npm, "ci", "--no-audit", "--no-fund"], pasta)
        if r.returncode != 0:
            return "FALHOU", f"`npm ci` falhou:\n{_ultimas_linhas(r)}"
    for rotulo, comando in (
        ("npm run lint", [npm, "run", "lint"]),
        ("npx tsc --noEmit", [npx, "tsc", "--noEmit"]),
        ("npm test", [npm, "test"]),
    ):
        r = _rodar(comando, pasta)
        if r.returncode != 0:
            return "FALHOU", f"`{rotulo}` vermelho:\n{_ultimas_linhas(r)}"
    return "OK", "lint, tsc e testes verdes"


def checar_arquitetura(casa: Path, arquivos: list[str]) -> tuple[str, str]:
    if not any(a.startswith(SISTEMA + "/") for a in arquivos):
        return "PULADO", f"a branch não mexe em {SISTEMA}"
    pasta = casa / SISTEMA
    if not (pasta / "tests" / "test_arquitetura.py").is_file():
        return "PULADO", f"{SISTEMA}/tests/test_arquitetura.py não existe"
    r = _rodar([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_arquitetura.py"], pasta)
    if r.returncode != 0:
        return "FALHOU", f"guardas de arquitetura vermelhas:\n{_ultimas_linhas(r)}"
    return "OK", "guardas de arquitetura verdes"


def _tem_docker(casa: Path) -> bool:
    docker = shutil.which("docker")
    return bool(docker) and _rodar([docker, "info"], casa, timeout=TIMEOUT_GIT).returncode == 0


def checar_banco(casa: Path, arquivos: list[str]) -> tuple[str, str]:
    mexe = migrations(arquivos) or [a for a in arquivos if a == f"{SISTEMA}/supabase/seed_exemplo.sql"]
    if not mexe:
        return "PULADO", "nenhuma migration nem dado de exemplo na branch"
    script = casa / SISTEMA / "scripts" / "testar-migrations-local.sh"
    if not script.is_file():
        return "FALHOU", f"falta {SISTEMA}/scripts/testar-migrations-local.sh"
    if not _tem_docker(casa):
        return "PULADO", (
            "sem Docker ligado nesta máquina: quem prova a migration com dado é a homologação "
            "(Action deploy-db-homologacao na PR); espere ela verde antes do merge"
        )
    bash = shutil.which("bash")
    if not bash:
        return "PULADO", "sem bash nesta máquina: a homologação (Action deploy-db-homologacao) prova na PR"
    r = _rodar([bash, "scripts/testar-migrations-local.sh"], casa / SISTEMA)
    if r.returncode != 0:
        return "FALHOU", f"migrations no Postgres local vermelhas:\n{_ultimas_linhas(r)}"
    return "OK", "migrations em duas rodadas com dado + pgTAP verdes"


def checar(casa: Path, base: str) -> int:
    if not (casa / ".git").exists():
        raise ErroUso(f"{casa} não é a raiz da Casa (sem .git)")
    _git(casa, "rev-parse", "--verify", "--quiet", f"{base}^{{commit}}")
    arquivos = arquivos_mudados(casa, base)
    resultados = [
        ("segredo", checar_segredo(casa, base, arquivos)),
        ("vereditos", checar_vereditos(casa, arquivos)),
        ("sistema", checar_sistema(casa, arquivos)),
        ("arquitetura", checar_arquitetura(casa, arquivos)),
        ("banco", checar_banco(casa, arquivos)),
    ]
    for nome, (estado, motivo) in resultados:
        print(f"{estado} {nome}: {motivo}")
    falhou = [nome for nome, (estado, _) in resultados if estado == "FALHOU"]
    if falhou:
        print(f"FALHOU: {', '.join(falhou)}. Corrija, commite e rode de novo.")
        return 1
    print(f"CHECAGEM LOCAL OK ({len(arquivos)} arquivo(s) contra {base})")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Checagem local antes do merge (substitui o CI do GitHub Actions).")
    parser.add_argument("--base", default="origin/main", help="ref contra a qual comparar (padrão origin/main)")
    parser.add_argument("--casa", default=os.getcwd(), help="raiz da Casa (padrão: pasta atual)")
    args = parser.parse_args(argv)
    try:
        return checar(Path(args.casa).resolve(), args.base)
    except ErroUso as erro:
        print(f"PARE: {erro}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
