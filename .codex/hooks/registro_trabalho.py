#!/usr/bin/env python3
"""Registro do trabalho no quadro (A33 + A42), rodado por hook de PROJETO da Casa.

Tudo que o dono pede vira registro, sem modelo e sem depender do CLI do Supabase: o script
escreve no banco pelo REST (PostgREST) com a chave de serviço de `credenciais/.env`, o mesmo
caminho do `publicar_documento.py`. Nenhum hook chama modelo nem faz git de escrita.

SUBCOMANDOS
  inicio                    hook UserPromptSubmit (JSON no stdin): guarda o pedido na fila local.
  fim                       hook Stop (JSON no stdin): registra o turno e sobe a fila em lote.
  objetivo --sessao S ...   registra o objetivo (título, critério, área, tipo) do trabalho que vai gerar arquivo.
  concluir --sessao S ...   conclui o objetivo com a evidência do tipo (consulta, documento, codigo, publicacao).
  provar [--sessao S]       diz "no banco" ou "na fila (N)"; só confirma depois de ler o banco.
  sincronizar               sobe a fila agora, em lote.
  ficha --sessao S          cria `operacao/tasks/TASK-N/TASK.md` (só quando o trabalho continua noutra
                            conversa, é do plano ou o dono pede; nunca por pedido).
  reconciliar [--chave C]   conclui a atividade do plano pela PROVA real (curso: Concluída;
                            plano90: só Revisão, concluir exige o CONFERE do PMO).
  ligar                     acrescenta os 2 hooks no `.codex/hooks.json` já renderizado (idempotente).
  Opção global `--casa PASTA` (só para teste): a Casa é descoberta pelo próprio arquivo.

FILA LOCAL (`operacao/tasks/.sessoes/`, ignorada pelo git): `casa.json` (casa_id), `vinculos.json`
(conversa -> objetivo), `<objetivo>.json` (estado), `pendentes/` (o que falta subir), `registro.lock`.
O Stop envia no máximo LOTE_ENVIO objetivos por vez, com espera progressiva por falha; nunca varre todas as
conversas por turno. O id do objetivo é o próprio `tarefas.id`: criar de novo devolve a mesma linha. Os eventos que o dono vê nas
telas (tarefa aberta, movida, pedido registrado) vão para `atividade` pela MESMA fila e no mesmo lote do Stop; como
o id da linha é do banco, a identidade do evento é `metadata.registro_id` (uuid5) e o reenvio confere antes de postar.

REGRAS DURAS: os hooks saem SEMPRE 0 e nunca bloqueiam o turno; rede com timeout curto; erro vira 1 linha em
`operacao/telemetria.jsonl`; nunca imprime chave nem URL do banco; `stop_hook_active` verdadeiro = sai sem
fazer nada; mensagem interna do app é ignorada. Stdout do `inicio`: 1 linha curta com o id da conversa e do
objetivo, só na primeira vez; `fim` não imprime nada. Nunca grava o pedido inteiro no banco (só o título, 80
caracteres). Arquivos de `credenciais/` nunca entram na prova. Sem credencial ou sem banco: fila local, nunca
erro pro dono; "no banco" só depois de confirmar. O Stop nunca conclui.

Stdlib puro, roda igual em Mac e Windows.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

# hooks/ -> .codex/ -> raiz da Casa.
CASA_PADRAO = Path(__file__).resolve().parents[2]

TIMEOUT_REDE = 6
TIMEOUT_GIT = 8
TETO_TITULO = 80
TETO_TEXTO = 500
TETO_PEDIDO_REGISTRO = 200
TETO_RESUMO = 280
TETO_REGISTRO_META = 50
TETO_ARQUIVOS = 30
JANELA_RECONCILIAR_S = 600
LOTE_ENVIO = 5
ESPERA_BASE_S = 30
ESPERA_MAX_S = 3600
ESPERA_LIMITE_WIP_S = 300
TETO_EVENTOS_ENVIADOS = 200
ROTULO_STATUS = {"BACKLOG": "Backlog", "EM_ANDAMENTO": "Em andamento", "REVISAO": "Revisão",
                 "CONCLUIDA": "Concluída", "CANCELADA": "Cancelada"}
LIMITE_EM_ANDAMENTO = 3  # igual a nucleo.LIMITE_EM_ANDAMENTO do pmo-quadro (usado se o nucleo não estiver na Casa)
TIPOS = ("consulta", "documento", "codigo", "publicacao")
CRITERIO_PRONTO = "Pedido atendido e registrado com prova (arquivos, commits ou PR)"
VALOR_CONCLUIDA = "concluída"  # igual a VALOR_CONCLUIDA do polozi-concluir-trabalho
VALOR_ABERTA = "aberta"
PLANO_REL = Path("sistemas") / "empresa-os" / "config" / "planos" / "mestre.json"
TASKS_REL = Path("operacao") / "tasks"
SESSOES_REL = TASKS_REL / ".sessoes"
NUCLEO_REL = Path(".agents") / "skills" / "pmo-quadro" / "scripts" / "nucleo.py"
ORIGENS_HUMANAS = ("user", "human", "usuario")
PREFIXOS_INTERNOS = ("<codex-followup", "::codex-followup", "<environment_context>", "<system-reminder>")

TRIVIAIS = {
    "oi", "ola", "bom", "boa", "dia", "tarde", "noite", "ok", "okay", "sim", "nao", "obrigado", "obrigada",
    "valeu", "vlw", "pode", "podem", "continua", "continue", "segue", "siga", "certo", "beleza", "blz",
    "otimo", "legal", "isso", "show", "perfeito", "entendi", "tudo", "bem", "e", "a", "o", "de", "por", "favor",
}
VERBOS_UTEIS = {
    "cria", "crie", "criar", "faz", "faca", "fazer", "monta", "monte", "montar", "escreve", "escreva", "gera",
    "gere", "gerar", "publica", "publique", "instala", "instale", "configura", "configure", "conecta",
    "conecte", "ajusta", "ajuste", "corrige", "corrija", "atualiza", "atualize", "roda", "rode", "analisa",
    "analise", "revisa", "revise", "lista", "liste", "mostra", "mostre", "abre", "abra", "envia", "envie",
    "prepara", "prepare", "remova", "remove", "apaga", "apague", "troca", "troque", "explica", "explique",
    "calcula", "calcule", "busca", "busque", "pesquisa", "pesquise", "organiza", "organize",
}

RE_PR = re.compile(r"https://github\.com/[\w.-]+/[\w.-]+/pull/\d+")
RE_STATUS = re.compile(r"(?m)^(-\s*Status:)[^\S\n]*.*$")
RE_CONCLUIDA_EM = re.compile(r"(?m)^(-\s*Concluída em:)[^\S\n]*.*$")
RE_COMMIT = re.compile(r"(?m)^(-\s*Commit:)[^\S\n]*.*$")
RE_QUADRO = re.compile(r"(?m)^(-\s*Quadro:)[^\S\n]*.*$")


# ---------------------------------------------------------------- utilidades

def _agora() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _agora_iso() -> str:
    return _agora().isoformat()


def _data_local() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%d")


def _hora_local() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%d %H:%M")


def _linha(texto: str) -> str:
    return " ".join((texto or "").split())


def _truncar(texto: str, limite: int) -> str:
    texto = _linha(texto)
    return texto if len(texto) <= limite else texto[: limite - 1].rstrip() + "…"


def _sem_acento(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")


def _norm(texto: str) -> str:
    return " ".join(_sem_acento(texto or "").lower().split())


def _telemetria(casa: Path, resultado: str, **extra) -> None:
    try:
        linha = {"ts": _agora_iso(), "hook": "registro", "resultado": resultado}
        linha.update(extra)
        caminho = casa / "operacao" / "telemetria.jsonl"
        caminho.parent.mkdir(parents=True, exist_ok=True)
        with caminho.open("a", encoding="utf-8") as arquivo:
            arquivo.write(json.dumps(linha, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _ler_json(caminho: Path, padrao):
    try:
        return json.loads(caminho.read_text(encoding="utf-8-sig"))
    except Exception:
        return padrao


def _gravar_atomico(caminho: Path, texto: str) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    tmp = caminho.with_name(caminho.name + ".tmp")
    tmp.write_text(texto, encoding="utf-8", newline="\n")
    tmp.replace(caminho)


def e_trivial(prompt: str) -> bool:
    """Saudação, 'ok', 'sim', pedido vazio ou de até 2 palavras sem verbo útil não vira tarefa."""
    bruto = (prompt or "").strip()
    if not bruto:
        return True
    if bruto.startswith("$") or bruto.startswith("/"):
        return False  # invocação explícita de skill: é trabalho
    palavras = re.findall(r"[a-z0-9]+", _norm(bruto))
    if not palavras:
        return True
    if all(p in TRIVIAIS for p in palavras):
        return True
    if len(palavras) <= 2 and not any(p in VERBOS_UTEIS for p in palavras):
        return True
    return False


# ---------------------------------------------------------------- banco (PostgREST)

class ErroBanco(Exception):
    pass


def ler_credencial(casa: Path) -> tuple[str, str] | None:
    """(url, chave) de <casa>/credenciais/.env, ou None se faltar um dos dois."""
    caminho = casa / "credenciais" / ".env"
    if not caminho.is_file():
        return None
    valores: dict[str, str] = {}
    try:
        linhas = caminho.read_text(encoding="utf-8-sig", errors="replace").splitlines()
    except OSError:
        return None
    for linha in linhas:
        linha = linha.strip()
        if linha.startswith("export "):
            linha = linha[len("export "):].lstrip()
        chave, sep, valor = linha.partition("=")
        if sep and not chave.startswith("#"):
            valores[chave.strip()] = valor.strip().strip('"').strip("'")
    url = (valores.get("NEXT_PUBLIC_SUPABASE_URL") or valores.get("SUPABASE_URL") or "").rstrip("/")
    chave = valores.get("SUPABASE_SERVICE_ROLE_KEY") or valores.get("SUPABASE_SECRET_KEY") or ""
    return (url, chave) if url and chave else None


def _https_ok(url: str) -> bool:
    """A chave de serviço só viaja por https (exceto banco local: localhost e 127.0.0.1)."""
    try:
        partes = urllib.parse.urlsplit(url)
        host = partes.hostname
    except ValueError:
        return False
    return partes.scheme == "https" or (partes.scheme == "http" and host in ("localhost", "127.0.0.1"))


class Banco:
    def __init__(self, url: str, chave: str):
        if not _https_ok(url):
            raise ErroBanco("endereco_nao_https")
        self._url = url
        self._chave = chave

    def _chamar(self, metodo: str, caminho: str, params: dict | None = None, corpo=None):
        alvo = f"{self._url}/rest/v1/{caminho}"
        if params:
            alvo += "?" + urllib.parse.urlencode(params, safe="(),.*")
        cab = {
            "apikey": self._chave,
            "Authorization": f"Bearer {self._chave}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
            "User-Agent": "polozi-registro-trabalho/1",
        }
        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8") if corpo is not None else None
        try:
            req = urllib.request.Request(alvo, data=dados, method=metodo, headers=cab)
            with urllib.request.urlopen(req, timeout=TIMEOUT_REDE) as resp:
                bruto = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as erro:
            raise ErroBanco(f"http_{erro.code}") from None
        except Exception as erro:  # rede, timeout, URL torta: nunca vaza a mensagem (pode carregar a URL)
            raise ErroBanco(f"rede_{type(erro).__name__}") from None
        if not bruto.strip():
            return []
        try:
            achado = json.loads(bruto)
        except ValueError:
            raise ErroBanco("resposta_invalida") from None
        return achado if isinstance(achado, list) else [achado]

    def get(self, tabela: str, **filtros) -> list[dict]:
        return self._chamar("GET", tabela, filtros)

    def post(self, tabela: str, corpo: dict) -> dict | None:
        linhas = self._chamar("POST", tabela, None, corpo)
        return linhas[0] if linhas else None

    def patch(self, tabela: str, filtros: dict, corpo: dict) -> dict | None:
        """PATCH com filtro de guarda; devolve a linha atualizada, ou None se a guarda não casou nenhuma."""
        linhas = self._chamar("PATCH", tabela, filtros, corpo)
        return linhas[0] if linhas else None


def abrir_banco(casa: Path) -> Banco | None:
    cred = ler_credencial(casa)
    if cred is None:
        return None
    try:
        return Banco(*cred)
    except ErroBanco:
        return None


# ---------------------------------------------------------------- estado por objetivo (fila local)

def _chave_de(texto: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", texto)[:100] or "sem-sessao"


def _vinculos(casa: Path) -> dict:
    dados = _ler_json(casa / SESSOES_REL / "vinculos.json", {})
    return dados if isinstance(dados, dict) else {}


def _arquivo_estado(casa: Path, sid: str) -> Path:
    """A conversa aponta para o objetivo ativo dela (vinculos.json); sem vínculo, o próprio id."""
    return casa / SESSOES_REL / f"{_chave_de(_vinculos(casa).get(sid, sid))}.json"


def carregar_estado(casa: Path, sid: str) -> dict | None:
    arquivo = _arquivo_estado(casa, sid)
    estado = _ler_json(arquivo, None)
    if not isinstance(estado, dict) or not estado.get("task"):
        return None
    estado.setdefault("chave_estado", arquivo.stem)
    return estado


def _id_da_casa(casa: Path) -> str:
    identidade = casa / SESSOES_REL / "casa.json"
    dados = _ler_json(identidade, {})
    if not isinstance(dados, dict) or not dados.get("id"):
        dados = {"id": str(uuid.uuid4())}
        _gravar_atomico(identidade, json.dumps(dados))
    return dados["id"]


def salvar_estado(casa: Path, sid: str, estado: dict) -> None:
    """Grava o estado do objetivo e marca como pendente de envio. A identidade física (arquivo) do objetivo
    não muda quando a conversa passa a apontar para outro: um estado antigo não pisa no novo."""
    chave = estado.setdefault("chave_estado", _chave_de(sid))
    if not estado.get("objetivo_id"):
        estado["casa_id"] = _id_da_casa(casa)
        estado["objetivo_id"] = str(uuid.uuid5(uuid.UUID(estado["casa_id"]), chave))
    arquivo = casa / SESSOES_REL / f"{chave}.json"
    _gravar_atomico(casa / SESSOES_REL / "pendentes" / arquivo.name, json.dumps({"arquivo": arquivo.name}))
    _gravar_atomico(arquivo, json.dumps(estado, ensure_ascii=False, indent=1) + "\n")


def _pendentes(casa: Path) -> list[Path]:
    return sorted((casa / SESSOES_REL / "pendentes").glob("*.json"))


def _proximo_numero(casa: Path) -> int:
    """Próximo TASK-N: olha as fichas versionadas e os estados locais (só quando nasce um objetivo novo)."""
    maior = 0
    pasta = casa / TASKS_REL
    if pasta.is_dir():
        for filho in pasta.iterdir():
            achado = re.fullmatch(r"TASK-(\d+)", filho.name)
            if achado:
                maior = max(maior, int(achado.group(1)))
    sessoes = casa / SESSOES_REL
    if sessoes.is_dir():
        for arq in sessoes.glob("*.json"):
            task = (_ler_json(arq, {}) or {}).get("task") if arq.name not in ("casa.json", "vinculos.json") else None
            achado = re.fullmatch(r"TASK-(\d+)", str(task or ""))
            if achado:
                maior = max(maior, int(achado.group(1)))
    return maior + 1


# ---------------------------------------------------------------- ficha TASK.md (só sob demanda)

def _caminho_task(casa: Path, task: str) -> Path:
    return casa / TASKS_REL / task / "TASK.md"


def criar_ficha(casa: Path, estado: dict) -> Path:
    """Cria `operacao/tasks/TASK-N/TASK.md` no formato do TEMPLATE-TASK.md. Nunca roda por pedido: só quando o
    trabalho continua noutra conversa, é do plano ou o dono pede. Já existe: devolve o caminho sem mexer."""
    task = estado["task"]
    caminho = _caminho_task(casa, task)
    if caminho.is_file():
        return caminho
    titulo = estado.get("titulo") or task
    objetivo = estado.get("objetivo") or titulo
    criterio = estado.get("criterio_pronto") or CRITERIO_PRONTO
    texto = (
        f"# {task}: {titulo}\n\n"
        f"- Status: {VALOR_ABERTA}\n"
        f"- Aberta em: {_data_local()}\n"
        "- Concluída em:\n"
        "- Commit:\n"
        f"- Quadro: {estado.get('tarefa_id') or 'pendente'}\n\n"
        "## Objetivo\n\n"
        f"{objetivo}\n\n"
        "## Critérios de pronto\n\n"
        "| ID | Critério | Resultado | Evidência (versão final) |\n"
        "|---|---|---|---|\n"
        f"| C1 | {_truncar(criterio, TETO_TEXTO)} | pendente | |\n\n"
        "## Checkpoint\n\n"
        "- Próximo passo exato: \n\n"
        "## Registro\n\n"
        f"- {_hora_local()} | ficha criada\n"
    )
    _gravar_atomico(caminho, texto)
    return caminho


def _ler_task(casa: Path, task: str) -> str | None:
    try:
        return _caminho_task(casa, task).read_text(encoding="utf-8")
    except OSError:
        return None


def _trocar_bullet(texto: str, padrao: re.Pattern, valor: str) -> str:
    return padrao.sub(lambda m: m.group(1) + (f" {valor}" if valor else ""), texto, count=1)


def _atualizar_task(casa: Path, task: str, *, status: str | None = None, concluida_em: str | None = None,
                    commit: str | None = None, quadro: str | None = None,
                    linha_registro: str | None = None) -> None:
    """Só mexe em ficha que já existe: não cria TASK.md."""
    texto = _ler_task(casa, task)
    if texto is None:
        return
    if status is not None:
        texto = _trocar_bullet(texto, RE_STATUS, status)
    if concluida_em is not None:
        texto = _trocar_bullet(texto, RE_CONCLUIDA_EM, concluida_em)
    if commit is not None:
        texto = _trocar_bullet(texto, RE_COMMIT, commit)
    if quadro is not None:
        texto = _trocar_bullet(texto, RE_QUADRO, quadro)
    if linha_registro:
        if "## Registro" not in texto:
            texto = texto.rstrip() + "\n\n## Registro\n\n"
        texto = texto.rstrip() + f"\n- {_hora_local()} | {linha_registro}\n"
    _gravar_atomico(_caminho_task(casa, task), texto)


# ---------------------------------------------------------------- plano (casamento pelo comando)

def carregar_plano(casa: Path) -> list[dict]:
    """[{chave, trilha, comando_norm}] das atividades do plano copiado no sistema; [] sem o arquivo."""
    dados = _ler_json(casa / PLANO_REL, None)
    if not isinstance(dados, dict):
        return []
    saida = []
    for etapa in dados.get("etapas") or []:
        for atividade in etapa.get("atividades") or []:
            comando = _norm(str(atividade.get("comando") or ""))
            if not comando:
                continue
            chave = f"{etapa.get('trilha')}.{str(etapa.get('fase')).lower()}.{atividade.get('chave')}"
            saida.append({"chave": chave, "trilha": etapa.get("trilha"), "comando_norm": comando})
    return saida


def _prefixo_comum(a: str, b: str) -> int:
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def casar_plano(casa: Path, prompt: str) -> str | None:
    """Chave da atividade do plano cujo comando o pedido começa a colar; None se nenhuma."""
    pedido = _norm(prompt)
    if len(pedido) < 25:
        return None
    melhor, melhor_n = None, 0
    for ativ in carregar_plano(casa):
        cmd = ativ["comando_norm"]
        n = _prefixo_comum(pedido, cmd)
        if n >= min(len(cmd), 70) and n > melhor_n:
            melhor, melhor_n = ativ["chave"], n
    return melhor


# ---------------------------------------------------------------- git (só leitura)

def _git(casa: Path, *args: str) -> str | None:
    try:
        r = subprocess.run(["git", *args], cwd=str(casa), timeout=TIMEOUT_GIT, capture_output=True,
                           text=True, check=False)
        return r.stdout if r.returncode == 0 else None
    except Exception:
        return None


def _head(casa: Path) -> str | None:
    saida = _git(casa, "rev-parse", "HEAD")
    return saida.strip() if saida and saida.strip() else None


def _sujos(casa: Path) -> set[str]:
    saida = _git(casa, "status", "--porcelain", "-uall") or ""
    nomes = set()
    for linha in saida.splitlines():
        nome = linha[3:].strip().strip('"')
        if " -> " in nome:
            nome = nome.split(" -> ", 1)[1]
        if nome:
            nomes.add(nome)
    return nomes


def _entra_na_prova(nome: str) -> bool:
    if nome.startswith("credenciais/") or "/credenciais/" in nome:
        return False
    if nome.startswith("operacao/tasks/") or nome == "operacao/telemetria.jsonl":
        return False
    return True


# ---------------------------------------------------------------- tarefa no banco (fila -> PostgREST)

def _campos_do_objetivo(estado: dict) -> dict:
    """metadata do contrato: casa_id, objetivo, criterio, area, tipo, sessoes, evidencia, recibo_git."""
    sid = estado.get("sessao_id") or ""
    return {
        "casa_id": estado.get("casa_id"), "objetivo": estado.get("objetivo") or estado.get("titulo"),
        "criterio": estado.get("criterio_pronto") or CRITERIO_PRONTO, "area": estado.get("area") or "geral",
        "tipo": estado.get("tipo_trabalho") or "consulta", "sessoes": estado.get("sessoes") or [sid],
        "evidencia": estado.get("evidencia"), "recibo_git": estado.get("recibo_git"),
    }


def _meta_nova(task: str, sid: str, iniciada_em: str | None = None) -> dict:
    return {"task_sessao": task, "sessao_id": sid, "iniciada_em": iniciada_em or _agora_iso(),
            "prioridade": "normal", "registro": []}


def _enfileirar_evento(estado: dict, tipo: str, descricao: str, chave: str) -> None:
    """Põe na MESMA fila do objetivo um evento que o dono vê na tela (tabela atividade). O id do evento é
    repetível (uuid5 da tarefa + chave): evento já enviado ou já na fila não entra de novo."""
    registro_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{estado.get('tarefa_id') or estado.get('objetivo_id')}:{chave}"))
    if registro_id in (estado.get("eventos_enviados") or []):
        return
    pend = estado.setdefault("atividades_pendentes", [])
    if any((p.get("metadata") or {}).get("registro_id") == registro_id for p in pend):
        return
    pend.append({"tipo": tipo, "descricao": _truncar(descricao, 300), "modulo_origem": "tarefas",
                 "metadata": {"task_sessao": estado.get("task"), "registrada_em": _agora_iso(),
                              "registro_id": registro_id}})


def _evento_de_status(estado: dict, de: str | None, para: str) -> None:
    rotulo = ROTULO_STATUS.get(para, para)
    origem = f" (era {ROTULO_STATUS.get(de, de)})" if de else ""
    _enfileirar_evento(estado, "tarefa_movida", f"{_truncar(estado.get('titulo') or estado['task'], 80)}: {rotulo}{origem}",
                       f"movida:{para}")


def _entregar_atividades(casa: Path, banco: Banco, estado: dict, sid: str) -> None:
    """Manda os eventos da fila para `atividade` (id de linha é do banco, então a identidade vai em
    metadata.registro_id). Cada evento confirmado sai da fila na hora. Evento que já foi tentado e ficou sem
    resposta é conferido no banco antes de reenviar, para não duplicar."""
    if not estado.get("tarefa_id"):
        return
    pend = estado.get("atividades_pendentes") or []
    while pend:
        item = pend[0]
        rid = (item.get("metadata") or {}).get("registro_id")
        existe = False
        if item.get("tentado") and rid:
            achadas = banco.get("atividade", **{"tarefa_id": f"eq.{estado['tarefa_id']}",
                                                "metadata->>registro_id": f"eq.{rid}", "select": "id", "limit": "1"})
            existe = bool(achadas)
        if not existe:
            item["tentado"] = True
            salvar_estado(casa, sid, estado)  # a tentativa fica registrada antes da rede
            corpo = {k: v for k, v in item.items() if k != "tentado"}
            corpo["tarefa_id"] = estado["tarefa_id"]
            if corpo["metadata"].get("registrada_em"):
                corpo["quando"] = corpo["metadata"]["registrada_em"]
            banco.post("atividade", corpo)
        if rid:
            estado["eventos_enviados"] = ((estado.get("eventos_enviados") or []) + [rid])[-TETO_EVENTOS_ENVIADOS:]
        pend.pop(0)
        estado["atividades_pendentes"] = pend
        salvar_estado(casa, sid, estado)


def _garantir_no_banco(casa: Path, banco: Banco, estado: dict, sid: str, titulo: str) -> None:
    """Dá ao estado um tarefa_id: acha a do plano pela chave, acha a do mesmo objetivo ou cria."""
    if estado.get("tarefa_id"):
        return
    salvar_estado(casa, sid, estado)  # o UUID do objetivo fica no disco antes do POST
    task = estado["task"]
    chave = estado.get("chave_plano") or ""
    if chave:
        achadas = banco.get("tarefas", chave=f"eq.{chave}", select="id,status,metadata")
        if achadas:
            linha = achadas[0]
            meta = dict(linha.get("metadata") or {})
            meta.update(task_sessao=task, sessao_id=sid)
            novo = {"metadata": meta}
            if linha.get("status") == "BACKLOG":
                novo["status"] = "EM_ANDAMENTO"
            banco.patch("tarefas", {"id": f"eq.{linha['id']}", "status": f"eq.{linha['status']}"}, novo)
            estado["tarefa_id"] = linha["id"]
            if "status" in novo:
                _evento_de_status(estado, linha["status"], novo["status"])
            return
        estado["chave_plano"] = ""  # a tarefa do plano não existe neste banco: vira trabalho fora do plano
    abertas = banco.get("tarefas", origem_ref=f"eq.{sid}", origem_tipo="eq.pedido", select="id", limit="1")
    if abertas:
        estado["tarefa_id"] = abertas[0]["id"]
        return
    registros = estado.get("registro") or []
    iniciada_em = estado.get("iniciada_em") or (registros[0].get("em") if registros else None) or _agora_iso()
    estado["iniciada_em"] = iniciada_em
    confirmada = bool(estado.get("conclusao_confirmada"))
    corpo = {
        "id": estado["objetivo_id"], "titulo": titulo, "objetivo": estado.get("objetivo") or titulo,
        "criterio_pronto": estado.get("criterio_pronto") or CRITERIO_PRONTO, "origem": "ia",
        "trilha": "trabalho", "origem_tipo": "pedido", "origem_ref": sid,
        "status": "CONCLUIDA" if confirmada else "BACKLOG", "criada_em": iniciada_em,
        "metadata": {**_meta_nova(task, sid, iniciada_em), "registro": registros, **_campos_do_objetivo(estado)},
    }
    if confirmada:
        corpo["concluida_em"] = estado.get("concluida_em") or _agora_iso()
    try:
        linha = banco.post("tarefas", corpo)
    except ErroBanco:
        # timeout depois do INSERT: a linha pode existir; o id do objetivo é o mesmo, então não duplica
        recuperadas = banco.get("tarefas", id=f"eq.{estado['objetivo_id']}", select="id", limit="1")
        if not recuperadas:
            raise
        linha = recuperadas[0]
    if not linha or not linha.get("id"):
        raise ErroBanco("insert_sem_linha")
    estado["tarefa_id"] = linha["id"]
    _enfileirar_evento(estado, "tarefa_criada", f"{_truncar(titulo, 80)}: tarefa aberta", "criada")
    if confirmada:
        _evento_de_status(estado, None, "CONCLUIDA")


def _vincular_task(casa: Path, estado: dict) -> None:
    if estado.get("tarefa_id"):
        _atualizar_task(casa, estado["task"], quadro=estado["tarefa_id"])


def _nucleo(casa: Path):
    """Regras do quadro do pmo-quadro, se o time estiver na Casa; sem ele, só o limite embutido."""
    try:
        spec = importlib.util.spec_from_file_location("nucleo_registro", casa / NUCLEO_REL)
        modulo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modulo)
        return modulo
    except Exception:
        return None


def _status_gravavel(casa: Path, banco: Banco, atual: dict, destino: str) -> tuple[str, bool]:
    """(status que pode ser gravado agora, limite de 3 em andamento batido). A 4ª em andamento fica em BACKLOG
    e sobe na próxima tentativa; transição que o quadro não permite é recusada."""
    if destino == atual["status"]:
        return destino, False
    nucleo = _nucleo(casa)
    transicoes = getattr(nucleo, "TRANSICOES", None)
    if transicoes and destino not in transicoes.get(atual["status"], ()):
        raise ErroBanco("transicao_recusada")
    if destino == "EM_ANDAMENTO":
        limite = getattr(nucleo, "LIMITE_EM_ANDAMENTO", LIMITE_EM_ANDAMENTO)
        filtros = {"status": "eq.EM_ANDAMENTO", "id": "neq." + atual["id"], "select": "id", "limit": str(limite),
                   "dono_id": "eq." + atual["dono_id"] if atual.get("dono_id") else "is.null"}
        if not atual.get("dono_id"):
            filtros["agente_id"] = "eq." + atual["agente_id"] if atual.get("agente_id") else "is.null"
        if len(banco.get("tarefas", **filtros)) >= limite:
            return atual["status"], True
    return destino, False


def _entregar(casa: Path, banco: Banco, arq: Path, estado: dict) -> bool:
    """Sobe UM objetivo (1 GET + 1 PATCH, mais 1 POST na primeira vez). True = já não há o que subir;
    False = fica na fila (ex.: limite de 3 em andamento)."""
    sid = estado.get("sessao_id") or arq.stem
    _garantir_no_banco(casa, banco, estado, sid, estado.get("titulo") or estado["task"])
    _vincular_task(casa, estado)
    linhas = banco.get("tarefas", id=f"eq.{estado['tarefa_id']}",
                       select="id,status,metadata,trilha,atualizada_em,dono_id,agente_id")
    if not linhas:
        raise ErroBanco("tarefa_ausente")
    atual = linhas[0]
    if not atual.get("atualizada_em"):
        raise ErroBanco("versao_servidor_ausente")
    if atual["status"] == "CANCELADA":  # cancelamento do dono vale: nunca reabre pela fila
        if estado.get("status_local") != "CANCELADA":
            _evento_de_status(estado, estado.get("status_local"), "CANCELADA")
        estado["status_local"] = "CANCELADA"
        _entregar_atividades(casa, banco, estado, sid)
        return True
    meta = dict(atual.get("metadata") or {})
    meta.update(registro=estado.get("registro") or [], task_sessao=estado["task"], sessao_id=sid)
    if estado.get("aguardando_dono"):
        meta["aguardando_dono"] = True
    else:
        meta.pop("aguardando_dono", None)
    corpo: dict = {"metadata": meta}
    limitado = False
    if atual.get("trilha", "trabalho") == "trabalho":
        meta.update(_campos_do_objetivo(estado))
        esperada = estado.get("versao_servidor")
        editada_pelo_dono = bool(esperada and esperada != atual["atualizada_em"])
        aberta = atual["status"] != "CONCLUIDA"
        if estado.get("objetivo_definido") and aberta and not editada_pelo_dono:
            corpo.update(titulo=estado["titulo"], objetivo=estado["objetivo"], criterio_pronto=estado["criterio_pronto"])
            destino = estado.get("status_local", atual["status"])
            if destino != "CONCLUIDA":
                corpo["status"], limitado = _status_gravavel(casa, banco, atual, destino)
        if estado.get("conclusao_confirmada"):
            corpo.update(status="CONCLUIDA", concluida_em=estado["concluida_em"])
            meta.update(conclusao_confirmada=True, commit_conclusao=estado.get("commit_conclusao"))
            meta.pop("aguardando_dono", None)
        elif not aberta:
            estado["status_local"] = "CONCLUIDA"  # o dono concluiu à mão: a fila não reabre
    guarda = {"id": f"eq.{estado['tarefa_id']}", "status": f"eq.{atual['status']}",
              "atualizada_em": f"eq.{atual['atualizada_em']}"}
    entregue = banco.patch("tarefas", guarda, corpo)
    if entregue is None:
        raise ErroBanco("tarefa_mudou_durante_sincronizacao")
    estado["versao_servidor"] = entregue.get("atualizada_em") or atual["atualizada_em"]
    if corpo.get("status") and corpo["status"] != atual["status"]:
        _evento_de_status(estado, atual["status"], corpo["status"])
    _entregar_atividades(casa, banco, estado, sid)
    if limitado:
        estado["proxima_tentativa"] = time.time() + ESPERA_LIMITE_WIP_S
    return not limitado


def sincronizar_pendentes(casa: Path, banco: Banco, *, estrito: bool = False, so: str | None = None,
                          limite: int = LOTE_ENVIO) -> int:
    """Sobe a fila em lote (até `limite` objetivos). Falha de banco: espera progressiva e para (estrito: levanta).
    `so` = nome do arquivo de estado (ignora a espera; usado pelo concluir). Devolve quantos subiram."""
    pasta = casa / SESSOES_REL
    marcadores = [pasta / "pendentes" / so] if so else _pendentes(casa)
    subiram = tentados = 0
    for marcador in marcadores:
        if tentados >= limite:
            break
        arq = pasta / marcador.name
        estado = _ler_json(arq, None)
        if not isinstance(estado, dict) or not estado.get("task"):
            marcador.unlink(missing_ok=True)
            continue
        estado.setdefault("chave_estado", arq.stem)
        if not so and float(estado.get("proxima_tentativa") or 0) > time.time():
            continue
        tentados += 1
        try:
            if _entregar(casa, banco, arq, estado):
                estado.pop("proxima_tentativa", None)
                estado["falhas"] = 0
                salvar_estado(casa, estado.get("sessao_id") or arq.stem, estado)
                marcador.unlink(missing_ok=True)
                subiram += 1
            else:
                salvar_estado(casa, estado.get("sessao_id") or arq.stem, estado)
        except ErroBanco as erro:
            estado["falhas"] = int(estado.get("falhas") or 0) + 1
            estado["proxima_tentativa"] = time.time() + min(ESPERA_MAX_S, ESPERA_BASE_S * 2 ** min(estado["falhas"], 7))
            salvar_estado(casa, estado.get("sessao_id") or arq.stem, estado)
            _telemetria(casa, "erro_sync", detalhe=str(erro))
            if estrito:
                raise
            break
    return subiram


# ---------------------------------------------------------------- inicio

def _payload() -> dict:
    try:
        bruto = sys.stdin.read()
        dados = json.loads(bruto) if bruto.strip() else {}
        return dados if isinstance(dados, dict) else {}
    except Exception:
        return {}


def _novo_estado(casa: Path, sid: str, titulo: str, chave_plano: str) -> dict:
    return {
        "task": f"TASK-{_proximo_numero(casa)}", "sessao_id": sid, "titulo": titulo, "tarefa_id": "",
        "chave_plano": chave_plano or "", "turnos_vistos": [], "base_commit": _head(casa),
        "sujos_inicio": sorted(_sujos(casa)), "status_local": "BACKLOG", "registro": [],
        "atividades_pendentes": [], "iniciada_em": _agora_iso(), "conclusao_confirmada": False,
        "sessoes": [sid],
    }


def executar_inicio(casa: Path, dados: dict) -> str:
    """Só persiste na fila local (sem rede). Devolve a linha de stdout: 1 linha com o id da conversa e do
    objetivo na primeira vez, '' no resto."""
    origem = dados.get("source") or dados.get("origin") or dados.get("role")
    prompt = str(dados.get("prompt") or "")
    if (origem and origem not in ORIGENS_HUMANAS) or prompt.strip().startswith(PREFIXOS_INTERNOS):
        return ""  # followup, contexto e mensagem do app não são pedido do dono
    sid = str(dados.get("session_id") or "").strip()
    if not sid:
        return ""
    turno = str(dados.get("turn_id") or "").strip()
    estado = carregar_estado(casa, sid)
    if estado is not None and turno and turno in (estado.get("turnos_vistos") or []):
        return ""  # hook repetido no mesmo turno: não duplica

    chave = casar_plano(casa, prompt)
    saida = ""
    if estado is None:
        if not chave and e_trivial(prompt) and not dados.get("objetivo_explicito"):
            return ""
        titulo = _truncar(prompt.strip().splitlines()[0] if prompt.strip() else "", TETO_TITULO) or "Pedido"
        estado = _novo_estado(casa, sid, titulo, chave or "")
        if chave:
            criar_ficha(casa, estado)  # tarefa do plano: a ficha é parte do plano
        saida = (f"Registro: conversa {sid}, objetivo {_id_do_objetivo(casa, sid, estado)}; "
                 "guardado na fila local, ainda não confirmado no banco.")
    else:
        _atualizar_task(casa, estado["task"], linha_registro=f"pedido: {_truncar(prompt, TETO_PEDIDO_REGISTRO)}")
        if estado.get("status_local") in ("CONCLUIDA", "CANCELADA"):
            return ""  # objetivo encerrado não é reaberto por mensagem: pedido novo = `objetivo --novo`
        estado["aguardando_dono"] = False
    if turno:
        estado["turnos_vistos"] = (estado.get("turnos_vistos") or [])[-200:] + [turno]
    salvar_estado(casa, sid, estado)
    return saida


def _id_do_objetivo(casa: Path, sid: str, estado: dict) -> str:
    """Calcula (e grava) o id do objetivo antes do primeiro salvar, para poder dizê-lo na 1ª linha."""
    salvar_estado(casa, sid, estado)
    return estado["objetivo_id"]


# ---------------------------------------------------------------- fim

def _resumo_e_pergunta(mensagem: str) -> tuple[str, bool]:
    linhas = [l.strip() for l in (mensagem or "").splitlines() if l.strip()]
    uteis = [re.sub(r"^[#>*\-\s`]+", "", l).strip() for l in linhas]
    uteis = [l for l in uteis if re.search(r"\w", l)]
    if not uteis:
        return "", False
    resumo = _truncar(uteis[0], TETO_RESUMO)
    ultima = uteis[-1].rstrip("*_` )\"'")
    return resumo, ultima.endswith("?")


def _prova_do_turno(casa: Path, estado: dict, mensagem: str) -> dict:
    base = estado.get("base_commit")
    arquivos: list[str] = []
    commits: list[str] = []
    if base:
        saida = _git(casa, "diff", "--name-only", f"{base}..HEAD") or ""
        arquivos += [l.strip() for l in saida.splitlines() if l.strip()]
        saida = _git(casa, "log", "--format=%h %s", f"{base}..HEAD") or ""
        commits = [_truncar(l, 100) for l in saida.splitlines() if l.strip()][:5]
    inicio = set(estado.get("sujos_inicio") or [])
    arquivos += [n for n in sorted(_sujos(casa)) if n not in inicio]
    vistos, unicos = set(), []
    for n in arquivos:
        if n not in vistos and _entra_na_prova(n):
            vistos.add(n)
            unicos.append(n)
    prs = sorted(set(RE_PR.findall(mensagem or "")))[:3]
    return {"arquivos": unicos, "commits": commits, "prs": prs}


def executar_fim(casa: Path, dados: dict) -> None:
    """Registra o turno na fila e sobe um lote pequeno. O Stop NUNCA conclui: quem conclui é `concluir`."""
    sid = str(dados.get("session_id") or "").strip()
    if not sid:
        return
    estado = carregar_estado(casa, sid)
    if estado is None:
        return
    turno = str(dados.get("turn_id") or "").strip()
    if turno and turno in (estado.get("fins_vistos") or []):
        return
    mensagem = str(dados.get("last_assistant_message") or "")
    resumo, aguardando = _resumo_e_pergunta(mensagem)
    prova = _prova_do_turno(casa, estado, mensagem)
    do_plano = bool(estado.get("chave_plano"))

    partes = [resumo or "turno registrado"]
    if prova["arquivos"]:
        mostrados = ", ".join(prova["arquivos"][:5])
        extra = len(prova["arquivos"]) - 5
        partes.append(f"arquivos: {mostrados}" + (f" (+{extra})" if extra > 0 else ""))
    if prova["commits"]:
        partes.append("commits: " + "; ".join(prova["commits"][:3]))
    if prova["prs"]:
        partes.append("PR: " + ", ".join(prova["prs"]))
    _atualizar_task(casa, estado["task"], linha_registro=" | ".join(partes))

    agora = _agora_iso()
    estado["aguardando_dono"] = bool(aguardando and not do_plano and estado.get("status_local") != "CONCLUIDA")
    estado["registro"] = ((estado.get("registro") or []) + [
        {"em": agora, "resumo": resumo, "arquivos": prova["arquivos"][:TETO_ARQUIVOS], "commits": prova["commits"],
         "prs": prova["prs"]}])[-TETO_REGISTRO_META:]
    estado["atividades_pendentes"] = (estado.get("atividades_pendentes") or []) + [{
        "tipo": "pedido_registrado", "descricao": resumo or "Turno registrado", "modulo_origem": "tarefas",
        "metadata": {"task_sessao": estado["task"], "n_arquivos": len(prova["arquivos"]), "registrada_em": agora,
                     "turno_id": turno, "registro_id": f"{estado.get('sessao_id') or sid}:{turno or agora}"}}]
    if turno:
        estado["fins_vistos"] = (estado.get("fins_vistos") or [])[-200:] + [turno]

    banco = abrir_banco(casa)
    agora_ts = _agora().timestamp()
    deve_reconciliar = banco is not None and (
        bool(prova["arquivos"]) or agora_ts - float(estado.get("ultimo_reconciliar_ts") or 0) >= JANELA_RECONCILIAR_S)
    if deve_reconciliar:
        estado["ultimo_reconciliar_ts"] = agora_ts
    salvar_estado(casa, sid, estado)
    if banco is not None:
        sincronizar_pendentes(casa, banco)
        if deve_reconciliar:
            try:
                reconciliar(casa, banco)
            except ErroBanco as erro:
                _telemetria(casa, "erro_reconciliar", detalhe=str(erro))


# ---------------------------------------------------------------- reconciliar pelo plano

def _tabela_celulas(linha: str) -> list[str]:
    interior = linha.strip()
    interior = interior[1:] if interior.startswith("|") else interior
    interior = interior[:-1] if interior.endswith("|") else interior
    return [c.strip() for c in interior.split("|")]


def _ler_texto(caminho: Path) -> str:
    try:
        return caminho.read_text(encoding="utf-8-sig", errors="replace")
    except OSError:
        return ""


def prova_sistema_no_ar(casa: Path, banco) -> str | None:
    texto = _ler_texto(casa / "operacao" / "INSTALACAO.md")
    if not re.search(r"(?m)^\|\s*8-sistema\s*\|\s*concluida\s*\|\s*\d{4}-\d{2}-\d{2}\s*\|", texto):
        return None
    if not (casa / "sistemas" / "empresa-os" / ".vercel" / "project.json").is_file():
        return None
    return "INSTALACAO.md com 8-sistema concluida e sistema ligado na Vercel (.vercel/project.json)"


DOCUMENTOS_DA_PROVA = {
    "dossie": ("contexto/dossie/dossie-completo.md",),
    "persona": ("empresa/publico/persona.md",),
    "marca": ("empresa/marca/identidade-visual.md", "empresa/marca/tom-de-voz.md"),
}


def prova_dossie_persona_marca(casa: Path, banco) -> str | None:
    if banco is None:
        return None
    linhas = banco.get("documentos_publicados", tipo="in.(dossie,persona,marca)",
                       select="tipo,caminho_origem,texto")
    achados = {tipo: False for tipo in DOCUMENTOS_DA_PROVA}
    for linha in linhas:
        tipo = linha.get("tipo")
        if (tipo in DOCUMENTOS_DA_PROVA and linha.get("caminho_origem") in DOCUMENTOS_DA_PROVA[tipo]
                and str(linha.get("texto") or "").strip()):
            achados[tipo] = True
    if not all(achados.values()):
        return None
    return "dossie, persona e marca publicados no banco (documentos_publicados)"


def prova_whatsapp(casa: Path, banco) -> str | None:
    if banco is None:
        return None
    linhas = banco.get("whatsapp_mensagem", direcao="eq.enviada", origem="in.(teste,mcp,assistente)",
                       status="in.(enviada,entregue,lida)", select="id", limit="1")
    return "mensagem de WhatsApp enviada pelo sistema (whatsapp_mensagem)" if linhas else None


PREFIXOS_DO_KIT = ("polozi", "tecnologia", "pmo", "marketing")
SKILLS_MINIMAS_DO_TIME_AUTORAL = 2


def prova_fabrica(casa: Path, banco) -> str | None:
    """Time autoral: DUAS skills do aluno da MESMA area (`.agents/skills/<area>-<nome>/SKILL.md`, area fora das
    do kit) citadas no MAPA, ou, nas Casas que ainda guardam o gate antigo, o gate de instalacao com acerto.
    Uma skill so nao e time. Atencao (plano v14): as skills do processo interno do Dia 2 (curso.d2.processo-interno)
    sao da mesma area; se a IA citar duas delas no MAPA, este passo do Dia 3 conclui ja no Dia 2."""
    pasta = casa / ".agents" / "skills"
    mapa = _ler_texto(casa / "operacao" / "mapa.json") + _ler_texto(casa / "MAPA-DA-EMPRESA-IA.md")
    if pasta.is_dir():
        por_area: dict[str, list[str]] = {}
        for skill in sorted(pasta.iterdir()):
            area = skill.name.split("-", 1)[0]
            if "-" in skill.name and area not in PREFIXOS_DO_KIT and (skill / "SKILL.md").is_file() \
                    and f".agents/skills/{skill.name}" in mapa:
                por_area.setdefault(area, []).append(skill.name)
        for area, nomes in sorted(por_area.items()):
            if len(nomes) >= SKILLS_MINIMAS_DO_TIME_AUTORAL:
                return f"time autoral {area} com {len(nomes)} skills criadas e registradas no MAPA"
    for linha in _ler_texto(casa / "operacao" / "vereditos" / "erros-e-acertos.md").splitlines():
        if not re.match(r"^\| \d{4}-\d{2}-\d{2} \|", linha):
            continue
        cel = _tabela_celulas(linha)
        if len(cel) == 5 and cel[1] == "instalacao" and cel[2] == "acerto":
            return "gate de instalacao com acerto em operacao/vereditos/erros-e-acertos.md"
    return None


def prova_backup(casa: Path, banco) -> str | None:
    texto = _ler_texto(casa / "operacao" / "vigilancia" / "BACKUPS.md")
    for achado in re.finditer(r"restaurado em (\d{4}-\d{2}-\d{2}), (\d+) tabelas", texto):
        if int(achado.group(2)) > 0:
            return f"backup restaurado em {achado.group(1)} ({achado.group(2)} tabelas)"
    return None


def prova_ritual_semanal(casa: Path, banco) -> str | None:
    pasta = casa / "operacao" / "pmo" / "revisoes"
    if pasta.is_dir() and any(re.fullmatch(r"\d{4}-W\d{2}\.md", f.name) for f in pasta.iterdir()):
        return "revisao semanal gravada em operacao/pmo/revisoes/"
    return None


PROVAS = {
    "curso.d1.sistema-no-ar": prova_sistema_no_ar,
    "curso.d1.dossie-persona-marca": prova_dossie_persona_marca,
    "curso.d2.whatsapp": prova_whatsapp,
    "curso.d3.fabrica": prova_fabrica,
    "plano90.fundacao.backup": prova_backup,
    "plano90.clareza.ritual-semanal": prova_ritual_semanal,
}


def destino_por_prova(trilha: str, status: str) -> str | None:
    """Para onde a prova leva a tarefa. Curso conclui; plano90 só chega à Revisão (concluir exige o CONFERE
    do pmo-conferente). Concluída e Cancelada ninguém reabre; só se move a partir de Backlog/Em andamento
    (e Revisão -> Concluída só no curso)."""
    if trilha == "curso" and status in ("BACKLOG", "EM_ANDAMENTO", "REVISAO"):
        return "CONCLUIDA"
    if trilha == "plano90" and status in ("BACKLOG", "EM_ANDAMENTO"):
        return "REVISAO"
    return None


def reconciliar(casa: Path, banco: Banco, so_chave: str | None = None) -> list[tuple[str, str, str]]:
    """Devolve [(chave, destino, prova)] do que moveu."""
    chaves = [c for c in PROVAS if so_chave is None or c == so_chave]
    if not chaves:
        return []
    linhas = banco.get("tarefas", chave="in.(" + ",".join(chaves) + ")", select="id,chave,status,trilha,metadata")
    moveu = []
    for linha in linhas:
        chave = linha.get("chave")
        if chave not in PROVAS:
            continue
        destino = destino_por_prova(str(linha.get("trilha")), str(linha.get("status")))
        if destino is None:
            continue
        prova = PROVAS[chave](casa, banco)
        if not prova:
            continue
        meta = dict(linha.get("metadata") or {})
        carimbo = {"data": _agora_iso(), "prova": prova}
        corpo: dict = {"status": destino}
        if destino == "CONCLUIDA":
            meta["reconciliado_por_prova"] = carimbo
            corpo["concluida_em"] = _agora_iso()
        else:
            meta["prova_reconciliada"] = carimbo
        corpo["metadata"] = meta
        guarda = {"id": f"eq.{linha['id']}", "status": f"eq.{linha['status']}"}
        if banco.patch("tarefas", guarda, corpo) is None:
            continue
        try:
            banco.post("atividade", {
                "tipo": "plano_reconciliado", "descricao": f"{chave} -> {destino}: {prova}"[:300],
                "tarefa_id": linha["id"], "modulo_origem": "tarefas", "metadata": {"chave": chave},
            })
        except ErroBanco:
            pass
        moveu.append((chave, destino, prova))
    return moveu


# ---------------------------------------------------------------- ligar

def _entrada(casa: Path, subcomando: str, timeout: int) -> dict:
    caminho = casa / ".codex" / "hooks" / "registro_trabalho.py"
    return {
        "matcher": ".*",
        "hooks": [{
            "type": "command",
            "command": f'python3 "{caminho}" {subcomando}',
            "commandWindows": f'py -3 "{str(caminho).replace("/", chr(92))}" {subcomando}',
            "timeout": timeout,
        }],
    }


def _tem_registro(lista: list) -> bool:
    return any("registro_trabalho.py" in str(h.get("command", "")) + str(h.get("commandWindows", ""))
               for e in lista if isinstance(e, dict) for h in (e.get("hooks") or []) if isinstance(h, dict))


def ligar(casa: Path) -> str:
    caminho = casa / ".codex" / "hooks.json"
    dados = _ler_json(caminho, None)
    if not isinstance(dados, dict) or not isinstance(dados.get("hooks"), dict):
        return "sem .codex/hooks.json renderizado: rode a etapa 3-casa do instalador antes."
    hooks = dados["hooks"]
    mudou = False
    prompt = hooks.setdefault("UserPromptSubmit", [])
    if not _tem_registro(prompt):
        prompt.append(_entrada(casa, "inicio", 15))
        mudou = True
    stop = hooks.setdefault("Stop", [])
    if not _tem_registro(stop):
        stop.insert(0, _entrada(casa, "fim", 20))
        mudou = True
    if mudou:
        _gravar_atomico(caminho, json.dumps(dados, ensure_ascii=False, indent=2) + "\n")
        return "hooks do registro ligados."
    return "hooks do registro ja estavam ligados."


# ---------------------------------------------------------------- comandos do agente (objetivo, concluir, provar)

COMO_CORRIGIR = {
    "objetivo_e_evidencia_obrigatorios": "registre o objetivo com `objetivo` e passe --resumo \"o que foi comprovado\".",
    "conversa_sem_objetivo": "rode `objetivo --sessao <id da conversa> ...` antes (o id vem na linha do hook).",
    "arquivos_de_entrega_obrigatorios": "passe --arquivo <caminho> para cada arquivo entregue.",
    "arquivo_de_entrega_invalido": "o --arquivo precisa existir dentro da Casa e não pode estar em credenciais/.",
    "verificacoes_obrigatorias": "passe --verificacao \"checagem executada e resultado\" (tipos codigo e publicacao).",
    "publicacao_exige_recibo_confirmado": "publique pela $tecnologia-publicar e passe o --commit do recibo; publicação não confirmada não conclui.",
    "commit_invalido": "salve com `salvar.py -m \"...\" <caminhos>` e passe --commit <SHA>.",
    "commit_nao_existe": "esse commit não existe neste repositório; confira o SHA em `git log`.",
    "arvore_suja": "os arquivos entregues têm mudança sem commit; salve com `salvar.py -m \"...\" <caminhos>` e conclua de novo.",
    "git_indisponivel": "não consegui ler o git; confira se a pasta é um repositório e tente de novo.",
    "tarefa_do_plano_exige_conferencia": "tarefa do plano conclui pela prova (`reconciliar`) e pelo CONFERE do PMO, não por `concluir`.",
    "tarefa_ou_sessao_obrigatoria": "passe --sessao <id da conversa> (ou --tarefa N).",
    "objetivo_nao_encontrado": "confira o id do objetivo; ele aparece na linha do hook e na saída de `objetivo`.",
}


def _recusa(codigo: str) -> int:
    dica = COMO_CORRIGIR.get(codigo)
    print(f"Registro pendente: {codigo}." + (f" Como corrigir: {dica}" if dica else ""))
    return 1


def _estado_por_tarefa(casa: Path, numero: int) -> dict | None:
    for arq in sorted((casa / SESSOES_REL).glob("*.json")):
        if arq.name in ("casa.json", "vinculos.json"):
            continue
        estado = _ler_json(arq, None)
        if isinstance(estado, dict) and estado.get("task") == f"TASK-{numero}":
            estado.setdefault("chave_estado", arq.stem)
            return estado
    return None


def _estado_por_objetivo(casa: Path, objetivo_id: str) -> dict | None:
    for arq in sorted((casa / SESSOES_REL).glob("*.json")):
        if arq.name in ("casa.json", "vinculos.json"):
            continue
        estado = _ler_json(arq, None)
        if isinstance(estado, dict) and estado.get("task") and estado.get("objetivo_id") == objetivo_id:
            estado.setdefault("chave_estado", arq.stem)
            return estado
    return None


def _tentar_subir(casa: Path, estado: dict) -> bool:
    """Tenta subir só este objetivo agora. True = confirmado no banco (marcador de pendência apagado)."""
    banco = abrir_banco(casa)
    if banco is None:
        return False
    nome = f"{estado['chave_estado']}.json"
    try:
        sincronizar_pendentes(casa, banco, estrito=True, so=nome)
    except ErroBanco:
        return False
    return not (casa / SESSOES_REL / "pendentes" / nome).exists()


def _fila(casa: Path) -> str:
    return f"na fila ({len(_pendentes(casa))})"


def comando_objetivo(casa: Path, args) -> int:
    if not all(v.strip() for v in (args.titulo, args.objetivo, args.criterio)):
        print("Registro pendente: título, objetivo e critério são obrigatórios.")
        return 1
    chat = args.sessao
    estado = carregar_estado(casa, chat)
    vinculo = None
    if args.retomar:
        estado = _estado_por_objetivo(casa, args.retomar)
        if estado is None:
            return _recusa("objetivo_nao_encontrado")
        vinculo = estado["chave_estado"]
    else:
        encerrado = bool(estado) and estado.get("status_local") in ("CONCLUIDA", "CANCELADA")
        if estado is None:
            estado = _novo_estado(casa, chat, _truncar(args.titulo, TETO_TITULO), "")
        elif estado.get("objetivo_definido") and (args.novo or encerrado):
            nova_chave = str(uuid.uuid4())
            estado = _novo_estado(casa, nova_chave, _truncar(args.titulo, TETO_TITULO), "")
            vinculo = nova_chave
    sessoes = list(estado.get("sessoes") or [])
    if chat not in sessoes:
        sessoes.append(chat)
    estado.update(titulo=_truncar(args.titulo, TETO_TITULO), objetivo=_truncar(args.objetivo, TETO_TEXTO),
                  criterio_pronto=_truncar(args.criterio, TETO_TEXTO), area=args.area.strip().lower() or "geral",
                  tipo_trabalho=args.tipo, objetivo_definido=True, sessoes=sessoes,
                  status_local="BACKLOG" if args.planejado else "EM_ANDAMENTO")
    chave_ref = estado.get("sessao_id") or chat
    salvar_estado(casa, chave_ref, estado)
    if vinculo:
        vinculos = _vinculos(casa)
        vinculos[chat] = vinculo
        _gravar_atomico(casa / SESSOES_REL / "vinculos.json", json.dumps(vinculos))
    if args.ficha:
        criar_ficha(casa, estado)
        _vincular_task(casa, estado)
    if _tentar_subir(casa, estado):
        print(f"Objetivo {estado['objetivo_id']}: registrado no banco.")
    else:
        print(f"Objetivo {estado['objetivo_id']}: guardado na fila local; ainda não confirmado no banco.")
    return 0


def comando_ficha(casa: Path, args) -> int:
    estado = carregar_estado(casa, args.sessao)
    if estado is None:
        return _recusa("conversa_sem_objetivo")
    caminho = criar_ficha(casa, estado)
    _vincular_task(casa, estado)
    print(f"Ficha: {caminho.relative_to(casa).as_posix()}")
    return 0


def _recibo_git(casa: Path, commit: str) -> dict:
    """Recibo do que o salvar.py gravou em `.sessoes/git-recibo.json` (commit, branch, caminhos, enviado,
    integrado, publicado). Sem recibo desse commit: só o que o git local prova (não enviado)."""
    recibo = _ler_json(casa / SESSOES_REL / "git-recibo.json", {})
    if isinstance(recibo, dict) and commit and str(recibo.get("commit") or "").startswith(commit[:7]):
        return {k: recibo.get(k) for k in ("commit", "branch", "enviado", "integrado", "publicado")}
    ramo = (_git(casa, "branch", "--show-current") or "").strip()
    return {"commit": commit, "branch": ramo, "enviado": False, "integrado": False, "publicado": False}


def comando_concluir(casa: Path, args) -> int:
    estado = None
    if args.sessao:
        estado = carregar_estado(casa, args.sessao)
        if estado is None:
            return _recusa("conversa_sem_objetivo")
    elif args.tarefa is not None:
        estado = _estado_por_tarefa(casa, args.tarefa)
        if estado is None:
            return _recusa("objetivo_nao_encontrado")
    else:
        return _recusa("tarefa_ou_sessao_obrigatoria")
    tipo = estado.get("tipo_trabalho") or "consulta"
    if not estado.get("objetivo_definido") or not args.resumo.strip():
        return _recusa("objetivo_e_evidencia_obrigatorios")
    if estado.get("chave_plano"):
        return _recusa("tarefa_do_plano_exige_conferencia")
    if tipo != "consulta" and not args.arquivo:
        return _recusa("arquivos_de_entrega_obrigatorios")
    for nome in args.arquivo:
        alvo = (casa / nome).resolve()
        if not alvo.is_relative_to(casa.resolve()) or not alvo.is_file() or nome.startswith("credenciais/"):
            return _recusa("arquivo_de_entrega_invalido")
    if tipo in ("codigo", "publicacao") and not args.verificacao:
        return _recusa("verificacoes_obrigatorias")
    commit = (args.commit or "").strip()
    recibo = None
    if tipo != "consulta":
        if not re.fullmatch(r"[0-9a-f]{7,40}", commit):
            return _recusa("commit_invalido")
        if _git(casa, "rev-parse", "--verify", f"{commit}^{{commit}}") is None:
            return _recusa("commit_nao_existe")
        sujos = _git(casa, "status", "--porcelain", "--", *args.arquivo)
        if sujos is None:
            return _recusa("git_indisponivel")
        if sujos.strip():
            return _recusa("arvore_suja")
        recibo = _recibo_git(casa, commit)
    if tipo == "publicacao":
        publicado = _ler_json(casa / SESSOES_REL / "publicacao-recibo.json", {})
        if (not publicado.get("publicado") or not str(publicado.get("url", "")).startswith("https://")
                or publicado.get("commit") != commit):
            return _recusa("publicacao_exige_recibo_confirmado")
        recibo = {**(recibo or {}), "publicado": True, "url": publicado["url"]}
    agora = estado.get("concluida_em") if estado.get("conclusao_confirmada") else _agora_iso()
    estado.update(evidencia=_truncar(args.resumo, TETO_TEXTO), arquivos_entrega=args.arquivo,
                  verificacoes=args.verificacao, recibo_git=recibo, conclusao_confirmada=True, concluida_em=agora,
                  status_local="CONCLUIDA", aguardando_dono=False, commit_conclusao=commit or None)
    salvar_estado(casa, estado.get("sessao_id") or args.sessao or "", estado)  # a intenção sobrevive a falha de rede
    _atualizar_task(casa, estado["task"], status=VALOR_CONCLUIDA, concluida_em=str(agora)[:10],
                    commit=commit[:7] if commit else "")
    if _tentar_subir(casa, estado):
        print(f"{estado['task']}: conclusão confirmada no banco.")
    else:
        print(f"{estado['task']}: conclusão guardada na fila local; o banco ainda não recebeu ({_fila(casa)}).")
    return 0


def comando_provar(casa: Path, sessao: str | None) -> int:
    """Diz 'no banco' só depois de LER o banco; senão 'na fila (N)'."""
    banco = abrir_banco(casa)
    fila = _pendentes(casa)
    if sessao:
        estado = carregar_estado(casa, sessao)
        if estado is None:
            print("Sem objetivo registrado para essa conversa.")
            return 1
        if banco is not None and estado.get("tarefa_id") and not (
                casa / SESSOES_REL / "pendentes" / f"{estado['chave_estado']}.json").exists():
            try:
                linhas = banco.get("tarefas", id=f"eq.{estado['tarefa_id']}", select="id,status", limit="1")
            except ErroBanco:
                linhas = []
            if linhas:
                print(f"No banco: {estado['task']} em {linhas[0].get('status')}.")
                return 0
        print(f"Na fila ({len(fila)}): {estado['task']} ainda não confirmado no banco.")
        return 1
    if banco is None:
        print(f"Sem credencial do banco: registros ficam na fila local ({len(fila)}).")
        return 1
    try:
        banco.get("tarefas", select="id", limit="1")
    except ErroBanco:
        print(f"Banco fora do ar: registros ficam na fila local ({len(fila)}).")
        return 1
    if fila:
        print(f"Na fila ({len(fila)}): ainda não confirmados no banco.")
        return 1
    print("No banco: nada pendente na fila.")
    return 0


# ---------------------------------------------------------------- main

def _args(argv: list[str]):
    import argparse
    p = argparse.ArgumentParser(prog="registro_trabalho.py", description="Registro do trabalho no quadro.")
    p.add_argument("--casa", help="pasta da Casa (só para teste)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("inicio")
    sub.add_parser("fim")
    sub.add_parser("ligar")
    sub.add_parser("sincronizar")
    rec = sub.add_parser("reconciliar")
    rec.add_argument("--chave")
    prov = sub.add_parser("provar")
    prov.add_argument("--sessao")
    fic = sub.add_parser("ficha")
    fic.add_argument("--sessao", required=True)
    obj = sub.add_parser("objetivo")
    obj.add_argument("--sessao", required=True, help="id da conversa (vem na linha que o hook imprime)")
    obj.add_argument("--titulo", required=True)
    obj.add_argument("--objetivo", required=True)
    obj.add_argument("--criterio", required=True)
    obj.add_argument("--area", default="geral")
    obj.add_argument("--tipo", choices=TIPOS, default="consulta")
    obj.add_argument("--novo", action="store_true", help="objetivo novo na mesma conversa")
    obj.add_argument("--planejado", action="store_true", help="fica em Backlog, não em andamento")
    obj.add_argument("--retomar", metavar="ID_DO_OBJETIVO", help="continua, nesta conversa, objetivo de outra")
    obj.add_argument("--ficha", action="store_true", help="cria operacao/tasks/TASK-N/TASK.md")
    con = sub.add_parser("concluir")
    con.add_argument("--sessao")
    con.add_argument("--tarefa", type=int)
    con.add_argument("--commit", default="")
    con.add_argument("--resumo", default="")
    con.add_argument("--arquivo", action="append", default=[])
    con.add_argument("--verificacao", action="append", default=[])
    return p.parse_args(argv)


def _executar(casa: Path, args) -> int:
    if args.cmd in ("inicio", "fim"):
        dados = _payload()
        if dados.get("stop_hook_active"):
            return 0
        try:
            if args.cmd == "inicio":
                saida = executar_inicio(casa, dados)
                if saida:
                    print(saida)
            else:
                executar_fim(casa, dados)
        except Exception as erro:
            _telemetria(casa, "erro", cmd=args.cmd, detalhe=type(erro).__name__)
        return 0

    if args.cmd == "ligar":
        try:
            print(ligar(casa))
        except Exception as erro:
            print(f"nao consegui ligar os hooks ({type(erro).__name__}).")
        return 0

    if args.cmd == "reconciliar":
        try:
            banco = abrir_banco(casa)
            if banco is None:
                print("Plano: sem credenciais do banco; nada reconciliado.")
                return 0
            moveu = reconciliar(casa, banco, args.chave)
            for chave, destino, prova in moveu:
                print(f"Plano: {chave} -> {destino} ({prova}).")
            if not moveu:
                print("Plano: nenhuma atividade com prova nova.")
        except Exception as erro:
            _telemetria(casa, "erro", cmd="reconciliar", detalhe=type(erro).__name__)
            print("Plano: nao consegui reconciliar agora (banco indisponivel).")
        return 0

    try:  # comandos do agente: erro vira mensagem com o jeito de corrigir, nunca traceback
        if args.cmd == "objetivo":
            return comando_objetivo(casa, args)
        if args.cmd == "concluir":
            return comando_concluir(casa, args)
        if args.cmd == "ficha":
            return comando_ficha(casa, args)
        if args.cmd == "provar":
            return comando_provar(casa, args.sessao)
        banco = abrir_banco(casa)  # sincronizar
        if banco is None:
            print(f"Sem credencial do banco: registros ficam na fila local ({len(_pendentes(casa))}).")
            return 0
        subiram = sincronizar_pendentes(casa, banco)
        print(f"Sincronizado: {subiram} subiram; {_fila(casa)}.")
        return 0
    except ErroBanco as erro:
        return _recusa(str(erro))
    except Exception as erro:
        _telemetria(casa, "erro", cmd=args.cmd, detalhe=type(erro).__name__)
        print(f"Registro pendente: erro inesperado ({type(erro).__name__}); o trabalho segue, o registro fica na fila.")
        return 1


def _travar(arquivo) -> bool:
    if os.name == "nt":
        import msvcrt
        arquivo.seek(0)
        arquivo.write(b"0")
        arquivo.flush()
        arquivo.seek(0)
        msvcrt.locking(arquivo.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(arquivo.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    return True


def main(argv: list[str] | None = None) -> int:
    try:
        args = _args(sys.argv[1:] if argv is None else argv)
    except SystemExit:
        return 0  # hook nunca quebra o turno por argumento torto
    casa = Path(args.casa).resolve() if args.casa else CASA_PADRAO
    hook = args.cmd in ("inicio", "fim")
    try:
        pasta = casa / SESSOES_REL
        pasta.mkdir(parents=True, exist_ok=True)
        arquivo = (pasta / "registro.lock").open("a+b")
    except OSError:
        return 0 if hook else 1
    # O lock do SO se solta sozinho se o hook morrer por timeout. Espera até ~3 s antes de desistir.
    with arquivo:
        for tentativa in range(10):
            try:
                _travar(arquivo)
                break
            except OSError:
                time.sleep(0.3)
        else:
            _telemetria(casa, "ocupado")
            return 0 if hook else 1
        return _executar(casa, args)


if __name__ == "__main__":
    sys.exit(main())
