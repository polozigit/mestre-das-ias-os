#!/usr/bin/env python3
"""Acerta o e-mail do git da Casa para o e-mail do GitHub da conta (etapa do GitHub).

A Vercel Hobby só faz deploy de commit cujo autor bate com um e-mail verificado
da conta GitHub dona do repositório. A Casa nasce com `empresa-ia@local`, então
depois do `gh auth login` este script grava no git LOCAL da Casa o e-mail
primário e verificado da conta (`gh api user/emails`, precisa do escopo
user:email) ou, sem ele, o noreply oficial `{id}+{login}@users.noreply.github.com`.
Só preenche `user.name` local se estiver vazio.

Stdlib puro, sem shell, roda igual em Mac e Windows. Nunca imprime token.
Idempotente: se o e-mail já é o certo, imprime `JA_ESTAVA` e não escreve.

Exit 0 = `FEITO` ou `JA_ESTAVA`. Exit 2 = `PAREI <motivo>`.

Uso:
  identidade_git.py --casa <abs>
"""
import argparse
import json
import shutil
import subprocess
import sys

TIMEOUT = 30


class Parei(Exception):
    pass


def rodar(args):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=TIMEOUT)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Parei(f"falha ao executar {args[0]}: {type(e).__name__}")


def git(casa, *args):
    git_bin = shutil.which("git")
    if not git_bin:
        raise Parei("git nao encontrado no PATH")
    return rodar([git_bin, "-C", casa, *args])


def gh_json(*args):
    gh_bin = shutil.which("gh")
    if not gh_bin:
        raise Parei("gh nao autenticado: rode gh auth login")
    r = rodar([gh_bin, "api", *args])
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None


def email_escolhido(user):
    itens = gh_json("user/emails")
    if isinstance(itens, list):
        for it in itens:
            if isinstance(it, dict) and it.get("primary") and it.get("verified") and it.get("email"):
                return it["email"], "primario"
    return f"{user['id']}+{user['login']}@users.noreply.github.com", "noreply"


def ler_local(casa, chave):
    r = git(casa, "config", "--local", chave)
    return r.stdout.strip() if r.returncode == 0 else ""


def principal(casa):
    if git(casa, "rev-parse", "--is-inside-work-tree").returncode != 0:
        raise Parei(f"--casa nao e repositorio git: {casa}")
    user = gh_json("user")
    if not isinstance(user, dict) or not user.get("id") or not user.get("login"):
        raise Parei("gh nao autenticado: rode gh auth login")
    email, origem = email_escolhido(user)
    antes = ler_local(casa, "user.email")
    if antes == email:
        print(f"JA_ESTAVA email={email}")
        return
    if git(casa, "config", "--local", "user.email", email).returncode != 0:
        raise Parei("git config user.email falhou")
    if not ler_local(casa, "user.name"):
        nome = user.get("name") or user["login"]
        if git(casa, "config", "--local", "user.name", nome).returncode != 0:
            raise Parei("git config user.name falhou")
    if ler_local(casa, "user.email") != email:
        raise Parei("user.email lido de volta diverge do gravado")
    print(f"FEITO email={email} origem={origem} (antes: {antes})")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--casa", required=True)
    args = ap.parse_args()
    try:
        principal(args.casa)
    except Parei as e:
        print(f"PAREI {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
