#!/usr/bin/env python3
"""Gera a retrospectiva semanal da Casa: lê, conta, propõe — nunca aplica.

Uso:
  <interpretador> retrospectiva.py --casa <PASTA> [--data AAAA-MM-DD] [--dry-run]

Escreve exatamente 1 arquivo: `operacao/retrospectivas/<data>.md` (recusa se
já existir — nunca sobrescreve uma retrospectiva). Não decide nada sozinha:
as propostas ficam com `status: proposta`, prontas pro dono copiar pra
`operacao/DECISOES.md` e aprovar. Também LÊ (nunca escreve) o registro de
`tecnologia-vigiar` em `operacao/vigilancia/` (uma linha por rodada em
`AAAA-MM.md`; as Casas com o formato antigo, `estado.json` + `AAAA-MM-DD.md`,
continuam lidas) — pasta ausente ou registro inválido nunca levanta exceção,
só marca `sem_registro`.

PROIBIDO neste módulo: `subprocess`, `os.system`, `shutil`, ou escrever
qualquer caminho fora de `operacao/retrospectivas/`. Stdlib puro.

Códigos de saída: 0 ok; 2 recusa (arquivo do dia já existe); 3 falha de
arquivo/entrada.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

TETO_PROPOSTAS = 3

# Contrato lido de `tecnologia-vigiar` (operacao/vigilancia/) — só leitura,
# nunca escrita (quem escreve lá é a própria vigília).
# Formato atual: `AAAA-MM.md`, uma linha por rodada:
#   AAAA-MM-DD | site: ok | vercel: success | advisors: 0 erros, 2 avisos (nomes) | actions: ok
# A cópia semanal do banco é o arquivo `operacao/backups/AAAA-MM-DD-semanal.sql`
# (só o NOME do arquivo é lido, nunca o conteúdo: é dado real de cliente).
# Formato antigo (Casas já instaladas): `estado.json` + um `AAAA-MM-DD.md` por dia.
PASTA_VIGILANCIA = "operacao/vigilancia"
ESTADO_VIGILANCIA = "estado.json"
PASTA_BACKUPS = "operacao/backups"
RE_MES = re.compile(r"^\d{4}-\d{2}$")
RE_RODADA = re.compile(r"^(\d{4}-\d{2}-\d{2})\s*\|(.*)$")
RE_ADVISORS = re.compile(r"advisors:\s*(\d+)\s*erros?,\s*(\d+)\s*avisos?(?:\s*\(([^)]*)\))?", re.IGNORECASE)
RE_COPIA_SEMANAL = re.compile(r"^(\d{4}-\d{2}-\d{2})-semanal(?:-dados)?\.sql$")
JANELA_DIAS = 7
BACKUP_ATRASO_DIAS = 7

# Mesmo contrato de campo que `polozi-concluir-trabalho/scripts/concluir_trabalho.py`
# carimba no TASK.md (ROTULO_STATUS = "Status:", VALOR_CONCLUIDA = "concluída").
# Mantido como constante própria (nunca redigitado em prosa solta) — o
# contrato cruzado com a skill irmã é provado por teste (tests/test_retrospectiva.py),
# nunca por import direto: este módulo nunca importa código que rode subprocess.
ROTULO_STATUS = "Status:"
VALOR_CONCLUIDA = "concluída"

ESTADOS_ABERTOS = {"aberta", "bloqueada"}


def _ler(caminho: Path) -> str:
    try:
        return caminho.read_text(encoding="utf-8")
    except OSError:
        return ""


def _celulas_da_linha(linha: str) -> list[str]:
    """Divide uma linha de tabela Markdown em células, ignorando `|` escapado
    (`\\|`) — mesma convenção usada por `polozi-aplicar-regra` pra ler
    `operacao/DECISOES.md`."""
    interna = linha.strip()
    if interna.startswith("|"):
        interna = interna[1:]
    if interna.endswith("|"):
        interna = interna[:-1]
    return [c.strip() for c in re.split(r"(?<!\\)\|", interna)]


def _escapar_pipe(texto: str) -> str:
    return texto.replace("|", "\\|")


def extrair_pendencias_abertas(texto_pendencias: str) -> list[dict]:
    """Linhas da tabela de `operacao/PENDENCIAS.md` com estado aberta/bloqueada.
    Colunas: id | pendência | origem | prioridade | estado | registrada em."""
    achadas: list[dict] = []
    for linha in texto_pendencias.splitlines():
        if not linha.strip().startswith("|"):
            continue
        celulas = _celulas_da_linha(linha)
        if len(celulas) < 6:
            continue
        if celulas[0].lower() in ("id", "---") or celulas[0].startswith("---"):
            continue
        id_, pendencia, origem, _prioridade, estado, _registrada = celulas[:6]
        if estado.strip().lower() in ESTADOS_ABERTOS:
            achadas.append({"id": id_, "pendencia": pendencia, "origem": origem, "estado": estado})
    return achadas


def contar_por_origem(pendencias: list[dict]) -> dict[str, int]:
    contagem: dict[str, int] = {}
    for item in pendencias:
        origem = item["origem"] or "(sem origem)"
        contagem[origem] = contagem.get(origem, 0) + 1
    return contagem


def contar_tasks_concluidas(casa: Path) -> int:
    """Varre `operacao/tasks/TASK-*/TASK.md` — usado quando NÃO há banco
    conectado. Com banco conectado, é o SKILL.md que instrui a IA a
    complementar com a lista do painel (o script não fala com banco)."""
    total = 0
    tasks_dir = casa / "operacao" / "tasks"
    if not tasks_dir.is_dir():
        return 0
    for pasta in sorted(tasks_dir.glob("TASK-*")):
        task_md = pasta / "TASK.md"
        if not task_md.is_file():
            continue
        for linha in _ler(task_md).splitlines():
            if linha.strip().startswith(f"- {ROTULO_STATUS}") and VALOR_CONCLUIDA in linha:
                total += 1
                break
    return total


def _data_ou_none(texto: str) -> date | None:
    try:
        return date.fromisoformat(texto)
    except ValueError:
        return None


def _ultima_copia_semanal(casa: Path) -> str | None:
    """Data da cópia semanal mais recente de `operacao/backups/` (só pelo NOME do
    arquivo). Pasta ausente ou sem cópia: None."""
    pasta = casa / PASTA_BACKUPS
    if not pasta.is_dir():
        return None
    datas = []
    for arquivo in pasta.iterdir():
        m = RE_COPIA_SEMANAL.match(arquivo.name)
        if m and _data_ou_none(m.group(1)) is not None:
            datas.append(m.group(1))
    return max(datas) if datas else None


def _resumir_registro_mensal(casa: Path, pasta: Path, data_ref: date | None) -> dict | None:
    """Formato atual (`tecnologia-vigiar`): lê as linhas de rodada de `AAAA-MM.md`.
    Devolve None quando não há nenhuma rodada legível."""
    rodadas: dict[date, str] = {}
    for arquivo in sorted(pasta.glob("*.md")):
        if not RE_MES.match(arquivo.stem):
            continue
        for linha in _ler(arquivo).splitlines():
            m = RE_RODADA.match(linha.strip())
            dia = _data_ou_none(m.group(1)) if m else None
            if m and dia is not None:
                rodadas[dia] = m.group(2)
    if not rodadas:
        return None

    rodadas_7d = 0
    if data_ref is not None:
        rodadas_7d = sum(1 for dia in rodadas if timedelta(0) <= (data_ref - dia) < timedelta(days=JANELA_DIAS))

    achado = RE_ADVISORS.search(rodadas[max(rodadas)])
    advisors_total = int(achado.group(1)) + int(achado.group(2)) if achado else 0
    advisors_ids = [n.strip() for n in (achado.group(3) or "").split(",") if n.strip()] if achado else []

    ultimo_backup_ok = _ultima_copia_semanal(casa)
    dias_desde_backup_ok = None
    if ultimo_backup_ok and data_ref is not None:
        dias_desde_backup_ok = (data_ref - date.fromisoformat(ultimo_backup_ok)).days

    return {
        "sem_registro": False,
        "rodadas_7d": rodadas_7d,
        "advisors_ids": advisors_ids,
        "advisors_total": advisors_total,
        "ultimo_backup_ok": ultimo_backup_ok,
        "dias_desde_backup_ok": dias_desde_backup_ok,
    }


def resumir_vigilancia(casa: Path, data: str) -> dict:
    """Lê (nunca escreve) o registro de `tecnologia-vigiar`. Pasta ausente
    (Casa de antes desta peça — a pasta nasce com `LEIA-ME.md`/`BACKUPS.md`,
    sem dado nenhum), registro ainda inexistente (nenhuma rodada) ou inválido:
    nunca levanta — só marca `sem_registro`. O `estado.json` do formato antigo,
    quando existe e é válido, vale primeiro (Casas já instaladas)."""
    pasta = casa / PASTA_VIGILANCIA
    if not pasta.is_dir():
        return {"sem_registro": True}

    try:
        data_ref = date.fromisoformat(data)
    except ValueError:
        data_ref = None

    estado = None
    estado_path = pasta / ESTADO_VIGILANCIA
    if estado_path.is_file():
        try:
            estado = json.loads(estado_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            estado = None
    if not isinstance(estado, dict):
        atual = _resumir_registro_mensal(casa, pasta, data_ref)
        return atual if atual is not None else {"sem_registro": True}

    rodadas_7d = 0
    for arquivo in pasta.glob("*.md"):
        data_arquivo = _data_ou_none(arquivo.stem)
        if data_arquivo is None:
            continue
        if data_ref is not None and timedelta(0) <= (data_ref - data_arquivo) < timedelta(days=JANELA_DIAS):
            rodadas_7d += 1

    advisors_ids = estado.get("advisors_ids") or []
    ultimo_backup_ok = estado.get("ultimo_backup_ok")
    dias_desde_backup_ok = None
    if ultimo_backup_ok and data_ref is not None:
        dias_desde_backup_ok = None
        data_backup = _data_ou_none(str(ultimo_backup_ok))
        if data_backup is not None:
            dias_desde_backup_ok = (data_ref - data_backup).days

    return {
        "sem_registro": False,
        "rodadas_7d": rodadas_7d,
        "advisors_ids": advisors_ids,
        "advisors_total": len(advisors_ids),
        "ultimo_backup_ok": ultimo_backup_ok,
        "dias_desde_backup_ok": dias_desde_backup_ok,
    }


def montar_propostas_vigilancia(vigilancia: dict, data: str) -> list[str]:
    """No máximo 2 propostas a partir do registro da vigília: backup
    atrasado (> BACKUP_ATRASO_DIAS dias) e advisor(es) na linha de base."""
    propostas: list[str] = []
    if vigilancia.get("sem_registro"):
        return propostas
    dias = vigilancia.get("dias_desde_backup_ok")
    if dias is not None and dias > BACKUP_ATRASO_DIAS:
        regra = _escapar_pipe(f"conferir por que o backup semanal não roda há {dias} dias")[:220]
        propostas.append(f"| D-? | revisão: backup atrasado ({dias} dias) | vigilancia | proposta | {regra} | {data} |")
    total = vigilancia.get("advisors_total", len(vigilancia.get("advisors_ids") or []))
    if total:
        regra = _escapar_pipe(f"revisar {total} advisor(es) na linha de base do banco")[:220]
        propostas.append(f"| D-? | revisão: advisor novo registrado | vigilancia | proposta | {regra} | {data} |")
    return propostas[:2]


def montar_propostas(pendencias: list[dict], data: str, vigilancia: dict | None = None) -> list[str]:
    """No máximo TETO_PROPOSTAS linhas no TOTAL (vigília + pendências), no
    formato de linha da tabela de `operacao/DECISOES.md`: id | decisao |
    origem | status | regra | registrada em."""
    vigilancia = vigilancia or {}
    propostas_vigilancia = montar_propostas_vigilancia(vigilancia, data)
    propostas_pendencias: list[str] = []
    for item in pendencias:
        titulo = _escapar_pipe(item["pendencia"])[:60]
        regra = _escapar_pipe(f"revisar pendência recorrente: {item['pendencia']}")[:220]
        propostas_pendencias.append(
            f"| D-? | revisão: {titulo} | retrospectiva | proposta | {regra} | {data} |"
        )
    propostas = (propostas_vigilancia + propostas_pendencias)[:TETO_PROPOSTAS]
    return propostas


def _secao_vigilancia(vigilancia: dict) -> list[str]:
    if vigilancia.get("sem_registro"):
        return ["sem registro de vigília nesta semana"]
    dias = vigilancia.get("dias_desde_backup_ok")
    backup_txt = "sem backup registrado" if dias is None else f"{dias} dia(s)"
    return [
        f"- Rodadas nos últimos 7 dias: {vigilancia.get('rodadas_7d', 0)} de 7.",
        f"- Advisors na linha de base: {vigilancia.get('advisors_total', len(vigilancia.get('advisors_ids') or []))}.",
        f"- Dias desde o último backup ok: {backup_txt}.",
    ]


def montar_relatorio(casa: Path, data: str) -> str:
    changelog = _ler(casa / "operacao" / "CHANGELOG.md")
    pendencias_texto = _ler(casa / "operacao" / "PENDENCIAS.md")
    pendencias = extrair_pendencias_abertas(pendencias_texto)
    contagem = contar_por_origem(pendencias)
    concluidas = contar_tasks_concluidas(casa)
    linhas_changelog = len([l for l in changelog.splitlines() if l.strip().startswith("- ")])
    vigilancia = resumir_vigilancia(casa, data)

    resumo_origens = ", ".join(f"{origem}={quantidade}" for origem, quantidade in sorted(contagem.items()))

    linhas = [
        f"# Retrospectiva — {data}",
        "",
        "## O que aconteceu",
        "",
        f"- Linhas no changelog: {linhas_changelog}.",
        f"- Tasks concluídas em `operacao/tasks/`: {concluidas}.",
        f"- Pendências abertas/bloqueadas por origem: {resumo_origens or 'nenhuma'}.",
        "",
        "## Cota",
        "",
        "nao medido — não existe comando oficial que devolva uso restante sem "
        "credencial; confira o painel de uso do Codex na tela do app.",
        "",
        "## Vigília",
        "",
        *_secao_vigilancia(vigilancia),
        "",
        "## Propostas",
        "",
    ]
    propostas = montar_propostas(pendencias, data, vigilancia)
    if propostas:
        linhas.extend(propostas)
    else:
        linhas.append("Nenhuma proposta esta semana.")
    linhas.append("")
    return "\n".join(linhas)


def escrever_atomico(destino: Path, texto: str) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_name(destino.name + ".tmp")
    tmp.write_text(texto, encoding="utf-8", newline="\n")
    tmp.replace(destino)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--casa", required=True, help="pasta da Empresa IA (Casa)")
    ap.add_argument("--data", default=None, help="AAAA-MM-DD (default: hoje)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    casa = Path(args.casa).expanduser()
    if not casa.is_dir():
        print(f"ERRO: pasta da Casa não existe: {casa}", file=sys.stderr)
        return 3

    data = args.data or date.today().isoformat()
    destino = casa / "operacao" / "retrospectivas" / f"{data}.md"

    if destino.exists():
        print(f"RECUSADO: já existe retrospectiva de {data} em {destino}", file=sys.stderr)
        return 2

    texto = montar_relatorio(casa, data)

    if args.dry_run:
        print("DRY-RUN — nada escrito.")
        print(texto)
        return 0

    try:
        escrever_atomico(destino, texto)
    except OSError as erro:
        print(f"ERRO: falha de arquivo: {erro}", file=sys.stderr)
        return 3

    print(f"Retrospectiva escrita: {destino}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
