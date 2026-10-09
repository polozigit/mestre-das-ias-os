#!/usr/bin/env python3
"""ETAPA 0 do polozi-instalador: liga o acesso total do Claude Code neste computador.

A Casa roda em acesso total (decisão de 08/10/2026). No Codex isso já vem no `.codex/config.toml` da Casa
e no seletor da tela. No Claude Code, o modo `bypassPermissions` NÃO vale se vier do `.claude/settings.json`
do projeto: só do `~/.claude/settings.json` do usuário (code.claude.com/docs/en/settings.md, "The file can't
set that value"; permission-modes.md: "If you set "bypassPermissions" in those two files, it doesn't take
effect either, and the session starts in Manual mode"). Por isso este script grava a chave no arquivo do
usuário, com o OK do aluno.

O que continua valendo em acesso total: as regras `permissions.deny` da Casa (permission-modes.md: "Deny rules
block in every mode, including `bypassPermissions`") e o hook que sai 2 (hooks.md). O aviso do modo, na
primeira sessão, é do aluno: este script nunca grava `skipDangerousModePermissionPrompt`.

Nunca apaga nem reescreve o que o aluno já tem no arquivo: só acrescenta `permissions.defaultMode`, guarda
uma cópia do arquivo anterior ao lado e recusa um arquivo que não é JSON válido. Se o próprio arquivo trava o
modo (`permissions.disableBypassPermissionsMode = "disable"`), respeita a trava e só avisa.

Uso:
  ligar_acesso_total.py --plano      # só diz o que faria; não grava nada
  ligar_acesso_total.py --gravar     # grava; saída 0 = feito ou nada a fazer, 2 = parou (arquivo inválido)

Primeira linha da saída: FEITO, JA_ESTAVA, NAO_SE_APLICA, TRAVA, PLANO ou PAREI.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.dont_write_bytecode = True

MODO = "bypassPermissions"
COPIA = "settings.json.antes-acesso-total"
ACAO_DO_ALUNO = (
    "na primeira conversa do Claude Code depois disto, aceite o aviso do modo de acesso total (uma vez só); "
    "no app do Claude, aba Code, ligue \"Allow bypass permissions mode\" nas configurações."
)


def _ler(arquivo: Path) -> dict:
    """Lê o settings do usuário. Ausente = {}. Inválido ou não-objeto = ValueError (nunca sobrescrever)."""
    if not arquivo.exists():
        return {}
    texto = arquivo.read_text(encoding="utf-8")
    if not texto.strip():
        return {}
    dados = json.loads(texto)
    if not isinstance(dados, dict):
        raise ValueError("o arquivo não é um objeto JSON")
    return dados


def executar(home: Path, gravar: bool) -> tuple[int, list[str]]:
    pasta = home / ".claude"
    arquivo = pasta / "settings.json"
    if not pasta.is_dir() and shutil.which("claude") is None:
        return 0, ["NAO_SE_APLICA: o Claude Code não está neste computador; nada a gravar."]
    try:
        dados = _ler(arquivo)
    except ValueError as erro:  # json.JSONDecodeError é ValueError
        return 2, [
            f"PAREI: {arquivo} não é um JSON válido ({erro}). Nada foi gravado.",
            "Mostre o arquivo ao dono e corrija junto antes de rodar de novo.",
        ]
    permissoes = dados.get("permissions")
    if permissoes is not None and not isinstance(permissoes, dict):
        return 2, [f"PAREI: em {arquivo}, \"permissions\" não é um objeto. Nada foi gravado."]
    permissoes = permissoes or {}
    if permissoes.get("disableBypassPermissionsMode") == "disable":
        return 0, [
            f"TRAVA: {arquivo} desliga o modo de acesso total (disableBypassPermissionsMode). Respeitado, nada gravado.",
            "Avise o dono em 1 linha: no Claude Code a IA vai pedir aprovação; no Codex segue o acesso total.",
        ]
    if permissoes.get("defaultMode") == MODO:
        return 0, [f"JA_ESTAVA: {arquivo} já liga o acesso total.", f"ACAO_DO_ALUNO: {ACAO_DO_ALUNO}"]
    if not gravar:
        return 0, [f"PLANO: gravar permissions.defaultMode = \"{MODO}\" em {arquivo} (o resto do arquivo fica igual)."]
    pasta.mkdir(parents=True, exist_ok=True)
    if arquivo.exists():
        shutil.copy2(arquivo, pasta / COPIA)
    permissoes["defaultMode"] = MODO
    dados["permissions"] = permissoes
    arquivo.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    linhas = [f"FEITO: acesso total ligado no Claude Code ({arquivo})."]
    if (pasta / COPIA).exists():
        linhas.append(f"Cópia do arquivo anterior: {pasta / COPIA}")
    linhas.append(f"ACAO_DO_ALUNO: {ACAO_DO_ALUNO}")
    return 0, linhas


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Liga o acesso total do Claude Code (settings do usuário).")
    modo = parser.add_mutually_exclusive_group(required=True)
    modo.add_argument("--plano", action="store_true")
    modo.add_argument("--gravar", action="store_true")
    parser.add_argument("--home", help=argparse.SUPPRESS)  # só para os testes
    args = parser.parse_args(argv)
    home = Path(args.home).expanduser() if args.home else Path.home()
    codigo, linhas = executar(home, gravar=args.gravar)
    print("\n".join(linhas))
    return codigo


if __name__ == "__main__":
    sys.exit(main())
