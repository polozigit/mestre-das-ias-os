#!/usr/bin/env python3
"""Audita e arruma a estrutura da Empresa IA.

Cinco verificações, sempre nesta ordem:
  (a) papel do `operacao/mapa.json` apontando pra arquivo inexistente
      -> só reporta ("estado desatualizado"); o JSON nunca é corrigido sozinho.
  (b) arquivo em `producao/` sem data AAAA-MM-DD no nome -> propõe rename;
      só renomeia de fato com --aplicar.
  (c) pasta nova de 1º nível sem `LEIA-ME.md` -> só reporta.
  (d) `MAPA-DA-EMPRESA-IA.md` regenerado a partir de `operacao/mapa.json`
      (tabelas de papéis), preservando o cabeçalho fixo do arquivo; só
      escreve com --aplicar.
  (e) arquivo fora de `credenciais/` cujo conteúdo casa padrão de segredo
      -> só reporta, como P1, com o valor sempre mascarado.

Nunca apaga nada. Ambiguidade real (dois candidatos plausíveis pro mesmo
problema) só é sinalizada no relatório, nunca resolvida sozinha.

--dry-run (padrão): mostra a prévia completa no stdout, não toca em disco.
--aplicar: renomeia arquivos de `producao/`, regenera o MAPA quando
diferente do que o `mapa.json` produziria, e grava o relatório em
`operacao/auditorias/AAAA-MM-DD-arrumacao.md`.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any


class ErroArrumacao(Exception):
    """Erro esperado, apresentado sem traceback ao usuário."""


# Pastas de infraestrutura no 1º nível que nunca carregam LEIA-ME.md — não
# são "áreas" (contexto/empresa/producao/...), são mecânica da Casa.
PASTAS_SEM_LEIA_ME = {"backups", "credenciais"}

# Diretórios que o scanner de segredo (e o de LEIA-ME) nunca entra.
DIRETORIOS_IGNORADOS = {".git", ".githooks", ".codex", ".claude", "node_modules"}

# Nomes de arquivo que nunca contam como "entrega sem data" em producao/.
ARQUIVOS_META = {"LEIA-ME.md", ".estrutura", ".DS_Store"}

PADRAO_DATA = re.compile(r"\d{4}-\d{2}-\d{2}")

# Mesmo padrão do .githooks/pre-commit gerado pelo modelo da Casa — uma só
# fonte de "o que parece segredo" em todo o ecossistema Polozi Fundação.
PADRAO_SEGREDO = re.compile(
    r"(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9]"
    r"|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY)"
)

TAMANHO_MAXIMO_SCAN = 2_000_000  # bytes; acima disso, provável binário — pula.

CABECALHO_EMPRESARIAIS = "| Papel | Caminho | O que tem | Estado | Quem cria |"
SEPARADOR_EMPRESARIAIS = "|---|---|---|---|---|"
CABECALHO_OPERACIONAIS = "| Papel | Caminho | Autoridade |"
SEPARADOR_OPERACIONAIS = "|---|---|---|"


@dataclass
class Achado:
    categoria: str  # "mapa" | "producao" | "leia-me" | "mapa-md" | "segredo"
    descricao: str
    prioridade: str = "P2"


@dataclass
class Renomeacao:
    origem: Path
    destino: Path


@dataclass
class Relatorio:
    achados_mapa: list[Achado] = field(default_factory=list)
    renomeacoes: list[Renomeacao] = field(default_factory=list)
    pastas_sem_leia_me: list[str] = field(default_factory=list)
    mapa_md_desatualizado: bool = False
    mapa_md_ilegivel: str | None = None
    achados_segredo: list[Achado] = field(default_factory=list)
    mapa_json_ausente: bool = False


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audita e arruma a estrutura de uma Empresa IA existente."
    )
    parser.add_argument("--destino", required=True, help="Pasta Empresa IA já aberta.")
    parser.add_argument(
        "--dry-run", action="store_true", help="Mostra a prévia sem escrever (padrão)."
    )
    parser.add_argument(
        "--aplicar",
        action="store_true",
        help="Renomeia, regenera o MAPA e grava o relatório em disco.",
    )
    parser.add_argument(
        "--hoje",
        help="Data AAAA-MM-DD usada só no nome do arquivo de relatório (teste/determinismo).",
    )
    return parser.parse_args()


def validar_empresa(destino: Path) -> None:
    exigidos = [destino / "EMPRESA-IA.md", destino / "MAPA-DA-EMPRESA-IA.md", destino / "operacao"]
    ausentes = [str(caminho.name) for caminho in exigidos if not caminho.exists()]
    if ausentes:
        raise ErroArrumacao(
            "Esta pasta não está pronta como Empresa IA. Use primeiro Polozi Criar Empresa IA. "
            f"Ausentes: {', '.join(ausentes)}."
        )


def nome_empresa(destino: Path) -> str:
    status = destino / "operacao" / "STATUS-ATUAL.md"
    if status.exists():
        encontrado = re.search(
            r"(?mi)^\s*-\s*Empresa:\s*(.+?)\s*$", status.read_text(encoding="utf-8")
        )
        if encontrado:
            return encontrado.group(1).strip()
    protocolo = (destino / "EMPRESA-IA.md").read_text(encoding="utf-8")
    encontrado = re.search(r"(?m)^#\s+(.+?)\s+-\s+protocolo Empresa IA\s*$", protocolo)
    if encontrado:
        return encontrado.group(1).strip()
    return "Empresa IA"


def carregar_mapa_json(destino: Path) -> dict[str, Any] | None:
    caminho = destino / "operacao" / "mapa.json"
    if not caminho.exists():
        return None
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except json.JSONDecodeError as erro:
        raise ErroArrumacao(f"operacao/mapa.json não é um JSON válido: {erro}") from erro


# ---------------------------------------------------------------------------
# (a) papel do mapa.json apontando pra arquivo inexistente
# ---------------------------------------------------------------------------


def checar_mapa(destino: Path, mapa_json: dict[str, Any] | None) -> list[Achado]:
    if mapa_json is None:
        return []
    achados: list[Achado] = []
    for item in mapa_json.get("empresariais", []):
        caminho = destino / item["caminho"]
        estado = item.get("estado", "")
        if not caminho.exists() and estado != "ausente":
            achados.append(
                Achado(
                    "mapa",
                    f"papel `{item['papel']}` aponta pra `{item['caminho']}`, que não existe, "
                    f"mas o estado registrado é `{estado}` — estado desatualizado.",
                )
            )
    for item in mapa_json.get("operacionais", []):
        caminho = destino / item["caminho"]
        if not caminho.exists():
            achados.append(
                Achado(
                    "mapa",
                    f"papel operacional `{item['papel']}` aponta pra `{item['caminho']}`, "
                    "que não existe.",
                )
            )
    return achados


# ---------------------------------------------------------------------------
# (b) arquivo em producao/ sem data AAAA-MM-DD no nome
# ---------------------------------------------------------------------------


def caminho_unico(caminho: Path) -> Path:
    if not caminho.exists():
        return caminho
    for numero in range(2, 1000):
        candidato = caminho.with_name(f"{caminho.stem}-{numero:02d}{caminho.suffix}")
        if not candidato.exists():
            return candidato
    raise ErroArrumacao(f"Não foi possível propor um nome seguro para {caminho.name}.")


def propor_renomeacoes(destino: Path) -> list[Renomeacao]:
    raiz = destino / "producao"
    if not raiz.is_dir():
        return []
    propostas: list[Renomeacao] = []
    for origem in sorted(raiz.rglob("*")):
        if not origem.is_file():
            continue
        if origem.name in ARQUIVOS_META or origem.name.startswith("."):
            continue
        if PADRAO_DATA.search(origem.name):
            continue
        data_mtime = datetime.fromtimestamp(origem.stat().st_mtime).strftime("%Y-%m-%d")
        novo_nome = f"{data_mtime}-{origem.name}"
        destino_proposto = caminho_unico(origem.with_name(novo_nome))
        propostas.append(Renomeacao(origem, destino_proposto))
    return propostas


def aplicar_renomeacoes(propostas: list[Renomeacao]) -> list[Renomeacao]:
    aplicadas: list[Renomeacao] = []
    for proposta in propostas:
        # Recalcula em cima do disco atual: duas propostas do mesmo diretório
        # não podem colidir mesmo se a primeira renomeação já mudou o cenário.
        destino_final = caminho_unico(proposta.destino)
        proposta.origem.rename(destino_final)
        aplicadas.append(Renomeacao(proposta.origem, destino_final))
    return aplicadas


# ---------------------------------------------------------------------------
# (c) pasta nova de 1º nível sem LEIA-ME.md
# ---------------------------------------------------------------------------


def checar_leia_me(destino: Path) -> list[str]:
    faltando = []
    for item in sorted(destino.iterdir()):
        if not item.is_dir():
            continue
        if item.name.startswith(".") or item.name in PASTAS_SEM_LEIA_ME:
            continue
        if not (item / "LEIA-ME.md").exists():
            faltando.append(item.name)
    return faltando


# ---------------------------------------------------------------------------
# (d) MAPA-DA-EMPRESA-IA.md regenerado a partir de operacao/mapa.json
# ---------------------------------------------------------------------------


def gerar_tabela_empresariais(mapa_json: dict[str, Any]) -> str:
    linhas = [CABECALHO_EMPRESARIAIS, SEPARADOR_EMPRESARIAIS]
    for item in mapa_json.get("empresariais", []):
        linhas.append(
            f"| {item['papel']} | `{item['caminho']}` | {item['conteudo']} | "
            f"{item['estado']} | {item['capacidade']} |"
        )
    return "\n".join(linhas)


def gerar_tabela_operacionais(mapa_json: dict[str, Any]) -> str:
    linhas = [CABECALHO_OPERACIONAIS, SEPARADOR_OPERACIONAIS]
    for item in mapa_json.get("operacionais", []):
        linhas.append(f"| {item['papel']} | `{item['caminho']}` | {item['autoridade']} |")
    return "\n".join(linhas)


PADRAO_SECAO_EMPRESARIAIS = re.compile(
    r"(## Papéis empresariais\n\n)(.*?)(\n\n## Papéis operacionais)", re.DOTALL
)
PADRAO_SECAO_OPERACIONAIS = re.compile(
    r"(## Papéis operacionais\n\n)(.*?)(\n\n## Fora do repositório)", re.DOTALL
)


def regenerar_mapa_md(texto_atual: str, mapa_json: dict[str, Any]) -> str:
    """Substitui só as duas tabelas de papéis; preserva título, `## Estados`
    e `## Fora do repositório` char a char — o cabeçalho fixo do modelo-v2."""
    if not PADRAO_SECAO_EMPRESARIAIS.search(texto_atual):
        raise ErroArrumacao(
            "MAPA-DA-EMPRESA-IA.md fora do formato esperado (seção "
            "'## Papéis empresariais' não encontrada) — não regenerado automaticamente."
        )
    if not PADRAO_SECAO_OPERACIONAIS.search(texto_atual):
        raise ErroArrumacao(
            "MAPA-DA-EMPRESA-IA.md fora do formato esperado (seção "
            "'## Papéis operacionais' não encontrada) — não regenerado automaticamente."
        )
    atualizado = PADRAO_SECAO_EMPRESARIAIS.sub(
        lambda m: m.group(1) + gerar_tabela_empresariais(mapa_json) + m.group(3), texto_atual
    )
    atualizado = PADRAO_SECAO_OPERACIONAIS.sub(
        lambda m: m.group(1) + gerar_tabela_operacionais(mapa_json) + m.group(3), atualizado
    )
    return atualizado


# ---------------------------------------------------------------------------
# (e) arquivo fora de credenciais/ que casa padrão de segredo
# ---------------------------------------------------------------------------


def mascarar(valor: str) -> str:
    if len(valor) <= 4:
        return "*" * len(valor)
    return "*" * (len(valor) - 4) + valor[-4:]


def deve_pular(relativo: Path) -> bool:
    partes = relativo.parts
    if partes and partes[0] == "credenciais":
        return True
    return any(parte in DIRETORIOS_IGNORADOS for parte in partes)


def checar_segredos(destino: Path) -> list[Achado]:
    achados: list[Achado] = []
    for origem in sorted(destino.rglob("*")):
        if not origem.is_file():
            continue
        relativo = origem.relative_to(destino)
        if deve_pular(relativo):
            continue
        try:
            if origem.stat().st_size > TAMANHO_MAXIMO_SCAN:
                continue
            texto = origem.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for numero_linha, linha in enumerate(texto.splitlines(), start=1):
            encontrado = PADRAO_SEGREDO.search(linha)
            if encontrado:
                achados.append(
                    Achado(
                        "segredo",
                        f"`{relativo.as_posix()}` linha {numero_linha}: padrão de segredo "
                        f"encontrado ({mascarar(encontrado.group(0))}). Fora de "
                        "`credenciais/` — tire a chave do arquivo (ela vai só em `credenciais/.env`); as travas do git barram o commit enquanto ela estiver aí.",
                        prioridade="P1",
                    )
                )
    return achados


# ---------------------------------------------------------------------------
# Relatório
# ---------------------------------------------------------------------------


def montar_relatorio(
    destino: Path,
    mapa_json: dict[str, Any] | None,
    achados_mapa: list[Achado],
    renomeacoes: list[Renomeacao],
    pastas_sem_leia_me: list[str],
    mapa_md_atual: str,
    mapa_md_novo: str | None,
    mapa_md_erro: str | None,
    achados_segredo: list[Achado],
) -> Relatorio:
    relatorio = Relatorio(
        achados_mapa=achados_mapa,
        renomeacoes=renomeacoes,
        pastas_sem_leia_me=pastas_sem_leia_me,
        mapa_md_desatualizado=bool(mapa_md_novo and mapa_md_novo != mapa_md_atual),
        mapa_md_ilegivel=mapa_md_erro,
        achados_segredo=achados_segredo,
        mapa_json_ausente=mapa_json is None,
    )
    return relatorio


def renderizar_relatorio_texto(empresa: str, hoje: str, aplicado: bool, relatorio: Relatorio) -> str:
    linhas = [
        f"# Arrumação da Casa — {empresa}",
        "",
        f"- Data: {hoje}",
        f"- Modo: {'aplicado' if aplicado else 'prévia (dry-run)'}",
        "- Regra: nada é apagado; ambiguidade real só é sinalizada, nunca resolvida sozinha.",
        "",
        "## (a) Mapa desatualizado (papel → arquivo inexistente)",
        "",
    ]
    if relatorio.mapa_json_ausente:
        linhas.append("`operacao/mapa.json` não existe nesta Empresa IA — checagem pulada.")
    elif not relatorio.achados_mapa:
        linhas.append("Nenhum papel do mapa aponta pra arquivo inexistente com estado inconsistente.")
    else:
        linhas.extend(f"- {achado.descricao}" for achado in relatorio.achados_mapa)

    linhas.extend(["", "## (b) Arquivos em producao/ sem data no nome", ""])
    if not relatorio.renomeacoes:
        linhas.append("Nenhum arquivo de `producao/` sem data no nome.")
    else:
        verbo = "renomeado" if aplicado else "proposto"
        for renomeacao in relatorio.renomeacoes:
            linhas.append(
                f"- {verbo}: `{renomeacao.origem}` → `{renomeacao.destino}`"
            )
        if not aplicado:
            linhas.append("")
            linhas.append("Rode com `--aplicar` para renomear de fato.")

    linhas.extend(["", "## (c) Pastas de 1º nível sem LEIA-ME.md", ""])
    if not relatorio.pastas_sem_leia_me:
        linhas.append("Todas as pastas de 1º nível têm LEIA-ME.md.")
    else:
        linhas.extend(f"- `{pasta}/`" for pasta in relatorio.pastas_sem_leia_me)

    linhas.extend(["", "## (d) MAPA-DA-EMPRESA-IA.md", ""])
    if relatorio.mapa_json_ausente:
        linhas.append("`operacao/mapa.json` não existe — MAPA não pôde ser regenerado.")
    elif relatorio.mapa_md_ilegivel:
        linhas.append(relatorio.mapa_md_ilegivel)
    elif relatorio.mapa_md_desatualizado:
        if aplicado:
            linhas.append("As tabelas de papéis estavam divergentes de `mapa.json` — regeneradas.")
        else:
            linhas.append(
                "As tabelas de papéis estão divergentes de `mapa.json`. "
                "Rode com `--aplicar` para regenerar."
            )
    else:
        linhas.append("As tabelas de papéis já batem com `operacao/mapa.json`.")

    linhas.extend(["", "## (e) P1 — possível segredo fora de credenciais/", ""])
    if not relatorio.achados_segredo:
        linhas.append("Nenhum padrão de segredo encontrado fora de `credenciais/`.")
    else:
        linhas.extend(f"- {achado.descricao}" for achado in relatorio.achados_segredo)

    return "\n".join(linhas).rstrip() + "\n"


def executar(destino: Path, aplicar: bool, hoje: str) -> tuple[Relatorio, str]:
    mapa_json = carregar_mapa_json(destino)
    achados_mapa = checar_mapa(destino, mapa_json)
    propostas = propor_renomeacoes(destino)
    pastas_sem_leia_me = checar_leia_me(destino)
    achados_segredo = checar_segredos(destino)

    caminho_mapa_md = destino / "MAPA-DA-EMPRESA-IA.md"
    mapa_md_atual = caminho_mapa_md.read_text(encoding="utf-8")
    mapa_md_novo: str | None = None
    mapa_md_erro: str | None = None
    if mapa_json is not None:
        try:
            mapa_md_novo = regenerar_mapa_md(mapa_md_atual, mapa_json)
        except ErroArrumacao as erro:
            mapa_md_erro = str(erro)

    renomeacoes_efetivas = propostas
    if aplicar:
        renomeacoes_efetivas = aplicar_renomeacoes(propostas)
        if mapa_md_novo is not None and mapa_md_novo != mapa_md_atual:
            caminho_mapa_md.write_text(mapa_md_novo, encoding="utf-8", newline="\n")

    relatorio = montar_relatorio(
        destino,
        mapa_json,
        achados_mapa,
        renomeacoes_efetivas,
        pastas_sem_leia_me,
        mapa_md_atual,
        mapa_md_novo,
        mapa_md_erro,
        achados_segredo,
    )
    empresa = nome_empresa(destino)
    texto = renderizar_relatorio_texto(empresa, hoje, aplicar, relatorio)

    if aplicar:
        pasta_auditorias = destino / "operacao" / "auditorias"
        pasta_auditorias.mkdir(parents=True, exist_ok=True)
        caminho_relatorio = caminho_unico(pasta_auditorias / f"{hoje}-arrumacao.md")
        caminho_relatorio.write_text(texto, encoding="utf-8", newline="\n")

    return relatorio, texto


def main() -> int:
    args = argumentos()
    try:
        if args.dry_run and args.aplicar:
            raise ErroArrumacao("Use exatamente uma opção: --dry-run ou --aplicar, nunca as duas.")
        destino = Path(args.destino).expanduser().resolve()
        if not destino.is_dir():
            raise ErroArrumacao(f"O destino não é uma pasta: {destino}")
        validar_empresa(destino)
        hoje = args.hoje or date.today().isoformat()
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", hoje):
            raise ErroArrumacao("--hoje deve usar o formato AAAA-MM-DD.")
        _, texto = executar(destino, aplicar=bool(args.aplicar), hoje=hoje)
        print(texto)
        if args.aplicar:
            print(f"APLICADO: relatório gravado em operacao/auditorias/{hoje}-arrumacao.md")
        else:
            print("DRY-RUN: nenhuma alteração realizada (nada escrito, nada renomeado).")
        return 0
    except ErroArrumacao as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 2
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: falha de arquivo: {erro}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
