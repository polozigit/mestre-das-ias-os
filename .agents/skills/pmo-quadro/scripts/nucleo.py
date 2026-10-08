#!/usr/bin/env python3
"""nucleo.py: biblioteca do time PMO. Le tarefas, aplica as regras do quadro e monta SQL seguro.

Nao e um comando: quadro.py, semana.py, revisao.py, trilha.py e pontos.py importam daqui.
Regras de negocio: times/pmo/DESENHO.md. So stdlib, sem rede, sem banco.
Excecoes: ErroUso vira saida 2 ("Uso errado: ..."), Recusa vira saida 1 ("Recusei: ..."), via main_wrapper.
Nenhuma funcao daqui gera DELETE; o SQL de escrita so toca colunas de COLUNAS_ATUALIZAVEIS.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

STATUS = ("BACKLOG", "EM_ANDAMENTO", "REVISAO", "CONCLUIDA", "CANCELADA")
ROTULO = {
    "BACKLOG": "Backlog",
    "EM_ANDAMENTO": "Em andamento",
    "REVISAO": "Revisão",
    "CONCLUIDA": "Concluída",
    "CANCELADA": "Cancelada",
}
# Espelho exato de empresa-os-template/src/lib/tarefas/status.ts (test_consistencia.py trava a simetria).
TRANSICOES = {
    "BACKLOG": ("EM_ANDAMENTO", "CANCELADA"),
    "EM_ANDAMENTO": ("REVISAO", "BACKLOG", "CANCELADA"),
    "REVISAO": ("CONCLUIDA", "EM_ANDAMENTO", "CANCELADA"),
    "CONCLUIDA": ("EM_ANDAMENTO",),
    "CANCELADA": ("BACKLOG",),
}
FASES_PLANO90 = ("clareza", "fundacao", "ativacao", "aplicacao", "escala")
FASES_CURSO = ("D1", "D2", "D3")
ROTULO_FASE = {"clareza": "Clareza", "fundacao": "Fundação", "ativacao": "Ativação", "aplicacao": "Aplicação",
               "escala": "Escala"}  # o banco grava sem acento (ck_tarefas_fase_da_trilha); o dono le com acento
NIVEL_ALVO = {"clareza": 1, "fundacao": 2, "ativacao": 3, "aplicacao": 4, "escala": 5}
LIMITE_EM_ANDAMENTO = 3
MAX_ROCKS_ABERTOS = 7
PONTOS_BASE = {"trabalho": 1, "curso": 2, "plano90": 3, "rock": 5}
BONUS_NO_PRAZO = 1
COLUNAS_ATUALIZAVEIS = frozenset(
    {"titulo", "objetivo", "criterio_pronto", "status", "dono_id", "concluida_em", "metadata", "prazo", "tipo"})
COLUNAS_ESTRUTURA = frozenset(
    {"trilha", "fase", "ordem", "chave", "comando", "prova", "depende_de", "origem", "origem_tipo", "origem_ref"})
PRIORIDADES = ("alta", "normal", "baixa")
COLUNAS_INSERT = ("titulo", "objetivo", "criterio_pronto", "tipo", "prazo", "dono_id", "metadata")
ATIVIDADES_PERMITIDAS = ("tarefa_criada", "tarefa_movida", "tarefa_ajustada")
SEM_RESPONSAVEL = "sem responsável"

SQL_LEITURA = """select coalesce(json_agg(x order by x.criada_em), '[]'::json) as tarefas from (
  select t.id, t.titulo, t.objetivo, t.criterio_pronto, t.status, t.trilha, t.fase, t.ordem, t.chave, t.tipo,
         t.prazo, tp.prazo_previsto_em as prazo_plano, t.dono_id, u.nome as dono_nome, t.agente_id,
         a.name as agente_nome, t.depende_de, t.criada_em, t.atualizada_em, t.concluida_em, t.metadata, t.prova
    from public.tarefas t
    left join tarefas.tarefa_plano tp on tp.tarefa_id = t.id
    left join public.usuarios u on u.id = t.dono_id
    left join public.agentes a on a.id = t.agente_id
) x;"""

_CHAVES_TAREFA = (
    "id", "titulo", "objetivo", "criterio_pronto", "status", "trilha", "fase", "ordem", "chave", "tipo",
    "prazo", "prazo_plano", "dono_id", "dono_nome", "agente_id", "agente_nome", "depende_de",
    "criada_em", "atualizada_em", "concluida_em", "metadata", "prova")


class ErroUso(Exception):
    """Uso errado do comando (saida 2)."""


class Recusa(Exception):
    """Regra do PMO recusou a acao (saida 1)."""


# ---------------------------------------------------------------- datas

_RE_DATA_HORA = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$")


def parse_dt(s) -> datetime | None:
    """ISO 8601 (data, ou data e hora com fuso, com 'Z' ou +00) para datetime com fuso. Invalido = None.
    Sem fuso vale UTC. Escrito na mao pra funcionar igual no Python 3.10 (fracao de segundo de 1 a 6 digitos)."""
    if s is None:
        return None
    if isinstance(s, datetime):
        return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
    if isinstance(s, date):
        return datetime(s.year, s.month, s.day, tzinfo=timezone.utc)
    m = _RE_DATA_HORA.match(str(s).strip())
    if not m:
        return None
    ano, mes, dia, hh, mm, ss, frac, fuso = m.groups()
    tz = timezone.utc
    if fuso and fuso != "Z":
        sinal = -1 if fuso[0] == "-" else 1
        d = fuso[1:].replace(":", "")
        tz = timezone(sinal * timedelta(hours=int(d[:2]), minutes=int(d[2:4] or 0)))
    micro = int((frac or "0")[:6].ljust(6, "0"))
    try:
        return datetime(int(ano), int(mes), int(dia), int(hh or 0), int(mm or 0), int(ss or 0), micro, tzinfo=tz)
    except ValueError:
        return None


def parse_data(s) -> date | None:
    """Data como esta escrita (a data local do carimbo, sem converter de fuso)."""
    d = parse_dt(s)
    return d.date() if d else None


def validar_data(s) -> str:
    if not isinstance(s, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        raise ErroUso(f'data "{s}" fora do formato AAAA-MM-DD')
    try:
        date.fromisoformat(s)
    except ValueError:
        raise ErroUso(f'data "{s}" não existe no calendário') from None
    return s


def validar_uuid(s) -> str:
    if not isinstance(s, str) or not re.fullmatch(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", s):
        raise ErroUso(f'"{s}" não é um identificador válido (esperado o formato 8-4-4-4-12)')
    return s.lower()


def semana_iso(d: date) -> str:
    ano, semana, _ = d.isocalendar()
    return f"{ano}-W{semana:02d}"


def fmt_dm(d: date | None) -> str:
    return d.strftime("%d/%m") if d else "sem prazo"


# ---------------------------------------------------------------- leitura das tarefas

def _normalizar(t: dict) -> dict:
    if not isinstance(t, dict):
        raise ErroUso("cada tarefa precisa ser um objeto JSON")
    n = dict(t)
    for k in _CHAVES_TAREFA:
        n.setdefault(k, None)
    if n["status"] not in STATUS:
        raise ErroUso(f'tarefa "{n["titulo"]}" com status inválido ({n["status"]}); esperado um de {", ".join(STATUS)}')
    if not n["tipo"]:
        n["tipo"] = "acao"
    if not n["trilha"]:
        n["trilha"] = "trabalho"
    meta = n["metadata"]
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except ValueError:
            meta = {}
    n["metadata"] = meta if isinstance(meta, dict) else {}
    return n


def _desembrulhar(v):
    """Devolve a lista de tarefas escondida em v (lista, linha do execute_sql, string JSON) ou None."""
    for _ in range(6):
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except ValueError:
                return None
        elif isinstance(v, dict):
            if len(v) != 1:
                return None
            v = next(iter(v.values()))
        elif isinstance(v, list):
            if len(v) == 1 and isinstance(v[0], dict) and len(v[0]) == 1:
                interno = next(iter(v[0].values()))
                if isinstance(interno, list) or (isinstance(interno, str) and interno.lstrip().startswith("[")):
                    v = interno
                    continue
            return v if all(isinstance(x, dict) for x in v) else None
        else:
            return None
    return None


def carregar_tarefas(texto: str) -> list[dict]:
    """Aceita lista JSON, linha do execute_sql ([{"tarefas": [...]}]), string JSON, ou texto com lixo em volta."""
    if not isinstance(texto, str):
        raise ErroUso("o conteúdo das tarefas precisa ser texto")
    texto = texto.lstrip("﻿")
    try:
        inteiro = _desembrulhar(json.loads(texto))
    except ValueError:
        inteiro = None
    if inteiro is not None:
        return [_normalizar(x) for x in inteiro]
    decodificador = json.JSONDecoder()
    vazio = False
    i = texto.find("[")
    while i != -1:
        try:
            v, _ = decodificador.raw_decode(texto, i)
        except ValueError:
            v = None
        r = _desembrulhar(v) if v is not None else None
        if r:
            return [_normalizar(x) for x in r]
        if r == []:
            vazio = True
        i = texto.find("[", i + 1)
    if vazio:
        return []
    raise ErroUso("não achei a lista de tarefas no texto (esperado o resultado do SELECT do quadro.py consulta)")


def _sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


_RE_TITULO_TASK = re.compile(r"^#\s+TASK-(\d+)\s*(?:[-\u2014\u2013:]+\s*)?(.*?)\s*$")
_STATUS_TASK = {
    "aberta": "EM_ANDAMENTO", "em andamento": "EM_ANDAMENTO", "concluida": "CONCLUIDA", "cancelada": "CANCELADA"}


def _tarefa_de_md(pasta: Path, numero: int) -> dict:
    id_ = f"TASK-{numero}"
    titulo, status, criada, concluida, objetivo, criterios = id_, "BACKLOG", None, None, None, []
    secao = ""
    for linha in (pasta / "TASK.md").read_text(encoding="utf-8").splitlines():
        m = _RE_TITULO_TASK.match(linha)
        if m and int(m.group(1)) == numero:
            titulo = m.group(2) or id_
            continue
        if linha.startswith("## "):
            secao = _sem_acento(linha[3:]).strip().lower()
            continue
        chave = _sem_acento(linha).strip().lower()
        valor = linha.split(":", 1)[1].strip() if ":" in linha else ""
        if chave.startswith("- status:"):
            status = _STATUS_TASK.get(_sem_acento(valor).strip().lower(), "BACKLOG")
        elif chave.startswith("- aberta em:"):
            criada = valor if parse_dt(valor) else None
        elif chave.startswith("- concluida em:"):
            concluida = valor if parse_dt(valor) else None
        elif secao == "objetivo" and objetivo is None and linha.strip() and not linha.strip().startswith("<"):
            objetivo = linha.strip()
        elif secao.startswith("criterio") and re.match(r"^\s*-\s*\[[ xX]\]\s*(.+)$", linha):
            texto = re.match(r"^\s*-\s*\[[ xX]\]\s*(.+)$", linha).group(1).strip()
            if not texto.startswith("<"):
                criterios.append(texto)
    return _normalizar({
        "id": id_, "titulo": titulo, "objetivo": objetivo, "criterio_pronto": "; ".join(criterios) or None,
        "status": status, "trilha": "trabalho", "criada_em": criada, "concluida_em": concluida})


def ler_pasta_tasks(pasta: Path) -> list[dict]:
    """Fallback sem banco: le operacao/tasks/TASK-N/TASK.md (so leitura)."""
    pasta = Path(pasta)
    if not pasta.is_dir():
        raise ErroUso(f"pasta de tarefas não encontrada: {pasta}")
    achadas = []
    for sub in pasta.iterdir():
        m = re.fullmatch(r"TASK-(\d+)", sub.name)
        if m and (sub / "TASK.md").is_file():
            achadas.append((int(m.group(1)), sub))
    return [_tarefa_de_md(sub, n) for n, sub in sorted(achadas)]


# ---------------------------------------------------------------- regras do quadro

def prazo_efetivo(t: dict) -> date | None:
    return parse_data(t.get("prazo_plano")) or parse_data(t.get("prazo"))


def aberta(t: dict) -> bool:
    return t.get("status") not in ("CONCLUIDA", "CANCELADA")


def atrasada(t: dict, hoje: date) -> bool:
    p = prazo_efetivo(t)
    return aberta(t) and p is not None and p < hoje


def bloqueada(t: dict, por_id: dict) -> bool:
    dep = por_id.get(t.get("depende_de")) if t.get("depende_de") else None
    return dep is not None and aberta(dep)


def e_rock(t: dict) -> bool:
    return t.get("tipo") == "rock"


def classe_pontos(t: dict) -> str:
    return "rock" if e_rock(t) else (t.get("trilha") or "trabalho")


def prioridade(t: dict) -> str:
    p = (t.get("metadata") or {}).get("prioridade")
    return p if p in PRIORIDADES else "normal"


def responsavel(t: dict) -> str:
    return (t.get("dono_nome") or t.get("dono_id") or t.get("agente_nome") or t.get("agente_id")
            or SEM_RESPONSAVEL)


def chave_responsavel(t: dict) -> str | None:
    """Quem conta pro limite de tarefas em andamento: o id do dono, senao o id do agente, senao ninguem (None).
    Por id, nao por nome: duas pessoas chamadas Joao nao se somam."""
    return t.get("dono_id") or t.get("agente_id") or None


def pontos_da_tarefa(t: dict) -> int:
    if t.get("status") != "CONCLUIDA":
        return 0
    pontos = PONTOS_BASE.get(classe_pontos(t), 1)
    feita, prazo = parse_data(t.get("concluida_em")), prazo_efetivo(t)
    if feita is not None and prazo is not None and feita <= prazo:
        pontos += BONUS_NO_PRAZO
    return pontos


def pontos_semana(tarefas: list[dict], semana: str) -> int:
    """Pontos das concluidas cuja semana ISO de concluida_em e `semana`."""
    total = 0
    for t in tarefas:
        d = parse_data(t.get("concluida_em"))
        if d is not None and semana_iso(d) == semana:
            total += pontos_da_tarefa(t)
    return total


def idade_dias(t: dict, hoje: date) -> tuple[int, bool]:
    """Dias desde que a tarefa comecou. (dias, aproximado): sem metadata.iniciada_em usa atualizada_em."""
    inicio = parse_data((t.get("metadata") or {}).get("iniciada_em"))
    aproximado = inicio is None
    if aproximado:
        inicio = parse_data(t.get("atualizada_em")) or parse_data(t.get("criada_em"))
    if inicio is None:
        return 0, True
    return max((hoje - inicio).days, 0), aproximado


def concluida_na_janela(t: dict, hoje: date, dias: int = 7) -> bool:
    """CONCLUIDA com concluida_em nos `dias` dias que terminam em hoje (hoje inclusive)."""
    d = parse_data(t.get("concluida_em"))
    return t.get("status") == "CONCLUIDA" and d is not None and hoje - timedelta(days=dias - 1) <= d <= hoje


def mapa_por_id(tarefas: list[dict]) -> dict:
    return {t["id"]: t for t in tarefas if t.get("id")}


def _chave_fila(t: dict, hoje: date):
    rank = {"alta": 0, "normal": 1, "baixa": 2}[prioridade(t)]
    da_trilha = e_rock(t) or t.get("trilha") in ("curso", "plano90")
    criada = parse_dt(t.get("criada_em")) or datetime.max.replace(tzinfo=timezone.utc)
    return (not atrasada(t, hoje), rank, not da_trilha, prazo_efetivo(t) or date.max, criada)


def fila(tarefas: list[dict], hoje: date) -> list[dict]:
    """O que pode ser puxado agora: BACKLOG, nao bloqueada. Atrasada, prioridade, Rock/trilha, prazo, mais antiga."""
    mapa = mapa_por_id(tarefas)
    candidatas = [t for t in tarefas if t.get("status") == "BACKLOG" and not bloqueada(t, mapa)]
    return sorted(candidatas, key=lambda t: _chave_fila(t, hoje))


def motivo_fila(t: dict, hoje: date) -> str:
    motivos = []
    if atrasada(t, hoje):
        motivos.append(f"atrasada (prazo {fmt_dm(prazo_efetivo(t))})")
    if prioridade(t) == "alta":
        motivos.append("prioridade alta")
    if e_rock(t):
        motivos.append("prioridade do trimestre (Rock)")
    elif t.get("trilha") == "curso":
        motivos.append("faz parte do curso")
    elif t.get("trilha") == "plano90":
        motivos.append("faz parte do plano de 90 dias")
    if prazo_efetivo(t) and not atrasada(t, hoje):
        motivos.append(f"prazo {fmt_dm(prazo_efetivo(t))}")
    return ", ".join(motivos) or "sem prazo, por ordem de chegada"


def rocks_plano90(tarefas: list[dict], hoje: date) -> list[dict]:
    """Os Rocks do 1o trimestre: 1 item por fase do plano de 90 dias que tenha tarefa."""
    saida = []
    for fase in FASES_PLANO90:
        da_fase = [t for t in tarefas if t.get("trilha") == "plano90" and t.get("fase") == fase]
        if not da_fase:
            continue
        concluidas = sum(1 for t in da_fase if t.get("status") == "CONCLUIDA")
        canceladas = sum(1 for t in da_fase if t.get("status") == "CANCELADA")
        feita = concluidas >= 1 and all(not aberta(t) for t in da_fase)
        atrasadas = [t.get("titulo") or "" for t in da_fase if atrasada(t, hoje)]
        prazos = [p for p in (prazo_efetivo(t) for t in da_fase) if p]
        saida.append({
            "fase": fase, "nivel_alvo": NIVEL_ALVO[fase], "total": len(da_fase), "concluidas": concluidas,
            "canceladas": canceladas, "feita": feita,
            "situacao": "feita" if feita else ("fora do trilho" if atrasadas else "no trilho"),
            "prazo": max(prazos) if prazos else None, "atrasadas": atrasadas})
    return saida


def rocks_abertos(tarefas: list[dict]) -> list[dict]:
    return [t for t in tarefas if e_rock(t) and aberta(t)]


# ---------------------------------------------------------------- SQL seguro

def sql_texto(v) -> str:
    """Literal SQL de texto: None vira NULL, aspa simples dobrada, byte nulo recusado."""
    if v is None:
        return "NULL"
    s = v if isinstance(v, str) else str(v)
    if "\x00" in s:
        raise ErroUso("texto com byte nulo não pode ir pro banco")
    return "'" + s.replace("'", "''") + "'"


def _valor_sql(coluna: str, v) -> str:
    if coluna == "titulo":
        if not isinstance(v, str) or not v.strip():
            raise Recusa("tarefa sem título não vale")
        return sql_texto(v)
    if coluna in ("objetivo", "criterio_pronto"):
        return sql_texto(v)
    if coluna == "status":
        if v not in STATUS:
            raise ErroUso(f'status "{v}" não existe')
        return sql_texto(v)
    if coluna == "tipo":
        if not isinstance(v, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", v):
            raise ErroUso(f'tipo "{v}" fora do formato (minúsculo, sem espaço)')
        return sql_texto(v)
    if coluna == "dono_id":
        return "NULL" if v is None else sql_texto(validar_uuid(v))
    if coluna == "prazo":
        return "NULL" if v is None else sql_texto(validar_data(v))
    if coluna == "concluida_em":
        if v is None:
            return "NULL"
        if v == "now()":
            return "now()"
        if parse_dt(v) is None:
            raise ErroUso(f'data e hora "{v}" fora do formato ISO 8601')
        return sql_texto(v)
    raise ErroUso(f"coluna {coluna} sem tratamento")  # pragma: no cover


def _json_sql(d: dict) -> str:
    if not isinstance(d, dict):
        raise ErroUso("metadata precisa ser um objeto")
    return sql_texto(json.dumps(d, ensure_ascii=False)) + "::jsonb"


def _atividade(tipo: str, descricao: str) -> str:
    if tipo not in ATIVIDADES_PERMITIDAS:
        raise ErroUso(f'tipo de atividade "{tipo}" não permitido')
    if not isinstance(descricao, str) or not descricao.strip():
        raise ErroUso("a linha do tempo precisa de uma descrição")
    return sql_texto(tipo), sql_texto(descricao)


def _uuid_ou_null(v) -> str:
    """Literal SQL de um uuid ja conferido, ou NULL com cast (nunca texto do usuario)."""
    return "NULL::uuid" if v is None else f"'{validar_uuid(v)}'::uuid"


def guarda_limite_em_andamento(tarefa_id: str, dono_id, agente_id) -> str:
    """Condicao SQL: quem vai receber a tarefa tem menos de LIMITE_EM_ANDAMENTO outras em andamento, contadas no banco.
    Conta pela mesma chave do chave_responsavel: o dono; sem dono, o agente; sem os dois, as tarefas sem responsavel."""
    uuid, dono, agente = validar_uuid(tarefa_id), _uuid_ou_null(dono_id), _uuid_ou_null(agente_id)
    return (f"(select count(*) from public.tarefas x where x.status = 'EM_ANDAMENTO' and x.id <> '{uuid}' "
            f"and x.dono_id is not distinct from {dono} "
            f"and ({dono} is not null or x.agente_id is not distinct from {agente})) < {LIMITE_EM_ANDAMENTO}")


def guarda_max_rocks() -> str:
    """Condicao SQL: ainda ha vaga entre as prioridades do trimestre abertas, contadas no banco."""
    return (f"(select count(*) from public.tarefas x where x.tipo = 'rock' "
            f"and x.status not in ('CONCLUIDA', 'CANCELADA')) < {MAX_ROCKS_ABERTOS}")


def _palavra(nome: str, v) -> str:
    if not isinstance(v, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", v):
        raise ErroUso(f'{nome} "{v}" fora do formato (minúsculo, sem espaço)')
    return sql_texto(v)


def sql_update(tarefa_id: str, status_atual: str, mudancas: dict, atividade_tipo: str,
               atividade_descricao: str, trilha: str, tipo: str, extras: tuple = ()) -> str:
    """UPDATE de 1 tarefa + linha na linha do tempo, na mesma instrucao.
    Guarda de corrida: o WHERE exige id, status, trilha e tipo como o script leu (mudou no banco = 0 linha).
    `extras` so recebe condicoes prontas geradas pelas funcoes guarda_* daqui, nunca texto do usuario."""
    if not mudancas:
        raise ErroUso("nada pra atualizar")
    if not set(mudancas) <= COLUNAS_ATUALIZAVEIS:
        raise Recusa("coluna fora da lista que o PMO pode mudar: " + ", ".join(sorted(set(mudancas) - COLUNAS_ATUALIZAVEIS)))
    if status_atual not in STATUS:
        raise ErroUso(f'status atual "{status_atual}" não existe')
    uuid = validar_uuid(tarefa_id)
    tipo_atividade, descricao = _atividade(atividade_tipo, atividade_descricao)
    sets = []
    for coluna, valor in mudancas.items():
        if coluna == "metadata":
            sets.append(f"metadata = metadata || {_json_sql(valor)}")
        else:
            sets.append(f"{coluna} = {_valor_sql(coluna, valor)}")
    onde = " and ".join([f"id = '{uuid}'", f"status = '{status_atual}'", f"trilha = {_palavra('trilha', trilha)}",
                         f"tipo = {_palavra('tipo', tipo)}", *extras])
    return (f"with m as (update public.tarefas set {', '.join(sets)} "
            f"where {onde} returning id, titulo) "
            f"insert into public.atividade (tipo, descricao, tarefa_id, modulo_origem) "
            f"select {tipo_atividade}, {descricao}, m.id, 'tarefas' from m returning tarefa_id;")


def sql_insert(campos: dict, descricao: str, guarda: str | None = None) -> str:
    """INSERT de 1 tarefa da trilha 'trabalho' (origem ia, origem_tipo pmo) + linha na linha do tempo.
    Com `guarda` (condicao pronta de guarda_*), o insert vira select ... where <guarda>: guarda falsa = 0 linha."""
    if not set(campos) <= set(COLUNAS_INSERT):
        raise Recusa("coluna fora da lista que o PMO pode criar: " + ", ".join(sorted(set(campos) - set(COLUNAS_INSERT))))
    _, desc = _atividade("tarefa_criada", descricao)
    campos = {"tipo": "acao", "metadata": {}, **campos}
    cols, vals = [], []
    for coluna in COLUNAS_INSERT:
        if coluna not in campos:
            continue
        cols.append(coluna)
        vals.append(_json_sql(campos[coluna]) if coluna == "metadata" else _valor_sql(coluna, campos[coluna]))
    cols += ["trilha", "origem", "origem_tipo"]
    vals += ["'trabalho'", "'ia'", "'pmo'"]
    origem = f"select {', '.join(vals)} where {guarda}" if guarda else f"values ({', '.join(vals)})"
    return (f"with n as (insert into public.tarefas ({', '.join(cols)}) {origem} "
            f"returning id, titulo) insert into public.atividade (tipo, descricao, tarefa_id, modulo_origem) "
            f"select 'tarefa_criada', {desc}, n.id, 'tarefas' from n returning tarefa_id;")


# ---------------------------------------------------------------- banco (Supabase CLI ligado ao projeto)

def _lista_de_linhas(texto: str):
    """Primeiro array JSON do texto cujos itens sao todos objetos (a lista de linhas do resultado), ou None."""
    decodificador = json.JSONDecoder()
    i = texto.find("[")
    while i != -1:
        try:
            v, _ = decodificador.raw_decode(texto, i)
        except ValueError:
            v = None
        if isinstance(v, list) and all(isinstance(x, dict) for x in v):
            return v
        i = texto.find("[", i + 1)
    return None


def executar_sql(sql: str, sistema) -> list:
    """Roda `sql` no banco ligado a `sistema` (pasta com o projeto Supabase ligado) via `supabase db query --linked`.
    Devolve a lista de linhas (dicts). Nunca imprime endereco do banco; falha vira Recusa."""
    sistema = Path(sistema)
    if not sistema.is_dir():
        raise ErroUso(f"pasta do sistema não encontrada: {sistema}")
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write(sql)
        arquivo = Path(f.name)
    try:
        p = subprocess.run(["supabase", "db", "query", "--linked", "-o", "json", "-f", str(arquivo)], cwd=sistema,
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    except FileNotFoundError:
        raise Recusa("não achei o programa supabase neste computador: a ligação com o banco é feita pelo time Tecnologia") from None
    except subprocess.TimeoutExpired:
        raise Recusa("o banco não respondeu em 2 minutos: nada foi confirmado, leia o quadro de novo") from None
    finally:
        arquivo.unlink(missing_ok=True)
    if p.returncode != 0:
        erro = re.sub(r"\b[a-zA-Z][a-zA-Z0-9+.-]*://\S+", "[endereço omitido]", p.stderr or "").strip()
        raise Recusa("o banco não aceitou ou o projeto não está ligado: " + erro[:300])
    linhas = _lista_de_linhas(p.stdout or "")
    if linhas is None:
        raise Recusa("o banco respondeu algo que não entendi: leia o quadro de novo antes de repetir")
    return linhas


# ---------------------------------------------------------------- entrada comum dos CLIs

def adicionar_entrada(parser: argparse.ArgumentParser, so_arquivo: bool = False) -> None:
    parser.add_argument("--tarefas", metavar="ARQ", help="JSON do SELECT do quadro (use - para ler da entrada padrão)")
    if not so_arquivo:
        parser.add_argument("--pasta-tasks", metavar="PASTA", help="sem banco: pasta operacao/tasks com TASK-N/TASK.md")
    parser.add_argument("--hoje", metavar="AAAA-MM-DD", help="data de hoje (padrão: a do computador)")


def hoje_da_entrada(args) -> date:
    return date.fromisoformat(validar_data(args.hoje)) if args.hoje else date.today()


def tarefas_da_entrada(args) -> list[dict]:
    """Exatamente uma fonte: --tarefas ARQ (ou -) OU --pasta-tasks PASTA."""
    pasta = getattr(args, "pasta_tasks", None)
    if bool(args.tarefas) == bool(pasta):
        raise ErroUso("passe exatamente um: --tarefas ARQ (resultado do SELECT) ou --pasta-tasks PASTA")
    if pasta:
        return ler_pasta_tasks(Path(pasta))
    if args.tarefas == "-":
        return carregar_tarefas(sys.stdin.buffer.read().decode("utf-8"))  # Windows: stdin padrao e cp1252
    caminho = Path(args.tarefas)
    if not caminho.is_file():
        raise ErroUso(f"arquivo de tarefas não encontrado: {caminho}")
    return carregar_tarefas(caminho.read_text(encoding="utf-8"))


def main_wrapper(fn, argv=None) -> int:
    """Roda fn(argv): Recusa vira saida 1, ErroUso vira saida 2, o resto e o que fn devolver (0 se None)."""
    # Sempre UTF-8: no Windows o padrao do pipe e cp1252, que quebra em emoji (saida 1 lida como recusa) ou
    # entrega o SQL com acento em outra codificacao pro execute_sql.
    for fluxo in (sys.stdout, sys.stderr):
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(encoding="utf-8")
    try:
        codigo = fn(sys.argv[1:] if argv is None else argv)
    except Recusa as e:
        print(f"Recusei: {e}", file=sys.stderr)
        return 1
    except ErroUso as e:
        print(f"Uso errado: {e}", file=sys.stderr)
        return 2
    return 0 if codigo is None else codigo
