#!/usr/bin/env python3
"""Gera os agentes .toml da Casa a partir de agents-spec/agentes.json (fonte única).

Uso:
  python3 gerar_agentes.py --destino <pasta-da-casa>   # escreve .codex/agents/*.toml
                                                        # e a tabela do AGENTS.md, se houver marcador
  python3 gerar_agentes.py --check <pasta-do-modelo>   # regenera em tmp e compara byte a byte
                                                        # com o que está commitado

Nunca edite os arquivos gerados à mão — mude o JSON e regenere.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

# IDs por tier: a Casa usa terra; sol/luna ficam só como mapeamento (decisão I32, 07/10/2026:
# Sol = gpt-6.1-sol e Luna = gpt-6-luna, provados no Codex 0.160.1; Terra não tem ID novo)
# [24a:modelos/f3, f4, f5].
MODELO_CODEX = {"sol": "gpt-6.1-sol", "terra": "gpt-5.6-terra", "luna": "gpt-6-luna"}

MARCADOR_INICIO = "<!-- AGENTES:INICIO -->"
MARCADOR_FIM = "<!-- AGENTES:FIM -->"


def toml_str(s: str) -> str:
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


def corpo_toml(a: dict) -> str:
    return (
        "# GERADO de agents-spec/agentes.json — não edite à mão.\n"
        f"name = {toml_str(a['name'])}\n"
        f"description = {toml_str(a['descricao'])}\n"
        f"model = {toml_str(MODELO_CODEX[a['tier']])}\n"
        f"model_reasoning_effort = {toml_str(a['esforco'])}\n"
        f"sandbox_mode = {toml_str(a['sandbox'])}\n"
        f'developer_instructions = """\n{a["instrucoes"]}\n"""\n'
    )


def gerar_tomls(destino: Path, spec: dict) -> list[Path]:
    d = destino / ".codex" / "agents"
    d.mkdir(parents=True, exist_ok=True)
    saidas = []
    for a in spec["agentes"]:
        f = d / f"{a['name']}.toml"
        f.write_text(corpo_toml(a), encoding="utf-8", newline="\n")
        saidas.append(f)
    return saidas


def tabela_quando(spec: dict) -> str:
    linhas = ["| Agente | Quando chamar |", "|---|---|"]
    for a in spec["agentes"]:
        linhas.append(f"| {a['name']} | {a['quando']} |")
    return "\n".join(linhas) + "\n"


def extrair_miolo(texto: str) -> str | None:
    if MARCADOR_INICIO not in texto or MARCADOR_FIM not in texto:
        return None
    _, resto = texto.split(MARCADOR_INICIO, 1)
    miolo, _ = resto.split(MARCADOR_FIM, 1)
    return miolo.strip("\n")


def escrever_agents_md(destino: Path, spec: dict) -> bool:
    caminho = destino / "AGENTS.md"
    if not caminho.exists():
        print(f"aviso: {caminho} não existe — nada escrito.", file=sys.stderr)
        return False
    texto = caminho.read_text(encoding="utf-8")
    if extrair_miolo(texto) is None:
        print(
            f"aviso: {caminho} sem marcadores {MARCADOR_INICIO}/{MARCADOR_FIM} — nada escrito.",
            file=sys.stderr,
        )
        return False
    antes, resto = texto.split(MARCADOR_INICIO, 1)
    _, depois = resto.split(MARCADOR_FIM, 1)
    novo = f"{antes}{MARCADOR_INICIO}\n{tabela_quando(spec)}{MARCADOR_FIM}{depois}"
    caminho.write_text(novo, encoding="utf-8", newline="\n")
    return True


def carregar_spec() -> dict:
    caminho = Path(__file__).parent / "agentes.json"
    return json.loads(caminho.read_text(encoding="utf-8"))


def checar(modelo: Path, spec: dict) -> list[str]:
    divergentes = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        gerar_tomls(tmp_path, spec)
        for a in spec["agentes"]:
            nome_arquivo = f"{a['name']}.toml"
            gerado = (tmp_path / ".codex" / "agents" / nome_arquivo).read_bytes()
            commitado = modelo / ".codex" / "agents" / nome_arquivo
            if not commitado.exists():
                divergentes.append(f".codex/agents/{nome_arquivo} (ausente)")
                continue
            if commitado.read_bytes() != gerado:
                divergentes.append(f".codex/agents/{nome_arquivo}")

    agents_md = modelo / "AGENTS.md"
    if not agents_md.exists():
        divergentes.append("AGENTS.md (ausente)")
    else:
        miolo_atual = extrair_miolo(agents_md.read_text(encoding="utf-8"))
        miolo_esperado = tabela_quando(spec).strip("\n")
        if miolo_atual is None:
            divergentes.append("AGENTS.md (sem marcadores AGENTES)")
        elif miolo_atual != miolo_esperado:
            divergentes.append("AGENTS.md (miolo AGENTES)")

    return divergentes


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    grupo = p.add_mutually_exclusive_group(required=True)
    grupo.add_argument(
        "--destino", help="escreve .codex/agents/*.toml (e a tabela do AGENTS.md, se houver marcador)"
    )
    grupo.add_argument(
        "--check", help="regenera em pasta temporária e compara byte a byte com o modelo commitado"
    )
    args = p.parse_args()
    spec = carregar_spec()

    if args.check:
        divergentes = checar(Path(args.check), spec)
        if divergentes:
            print("DRIFT encontrado:")
            for item in divergentes:
                print(f"  - {item}")
            return 1
        print("--check: diff zero.")
        return 0

    destino = Path(args.destino)
    saidas = gerar_tomls(destino, spec)
    for s in saidas:
        print(f"gerado: {s}")
    if escrever_agents_md(destino, spec):
        print(f"gerado: {destino / 'AGENTS.md'} (miolo AGENTES)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
