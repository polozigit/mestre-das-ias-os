#!/usr/bin/env python3
"""Registro do trabalho no quadro (A33 + A42), rodado por hook de PROJETO da Casa.

Tudo que o dono pede vira tarefa registrada, sem modelo e sem depender do CLI do
Supabase: o script escreve no banco pelo REST (PostgREST) com a chave de serviço de
`credenciais/.env`, o mesmo caminho do `publicar_documento.py`.

SUBCOMANDOS
  inicio                    hook UserPromptSubmit (JSON no stdin): abre ou retoma a tarefa do pedido.
  fim                       hook Stop (JSON no stdin): registra o turno e conclui (ou espera o dono).
  reconciliar [--chave C]   conclui a atividade do plano pela PROVA real (curso: Concluída;
                            plano90: só Revisão, concluir exige o CONFERE do PMO).
  ligar                     acrescenta os 2 hooks no `.codex/hooks.json` já renderizado (idempotente).
  Opção global `--casa PASTA` (só para teste): a Casa é descoberta pelo próprio arquivo.

REGRAS DURAS (iguais às de autosave.py): os hooks saem SEMPRE 0 e nunca bloqueiam o turno; rede com
timeout curto; erro vira 1 linha em `operacao/telemetria.jsonl`; nunca imprime chave nem URL do banco;
`stop_hook_active` verdadeiro = sai sem fazer nada. Stdout do `inicio` só quando ABRE tarefa nova
(1 linha curta); `fim` não imprime nada. Nunca grava o pedido inteiro no banco (só o título, 80 caracteres).
Arquivos de `credenciais/` nunca entram na prova. Sem credenciais ou sem banco: só arquivo
(`- Quadro: pendente`); o próximo `inicio`/`fim` com banco sincroniza as pendentes.

Stdlib puro, roda igual em Mac e Windows.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# hooks/ -> .codex/ -> raiz da Casa.
CASA_PADRAO = Path(__file__).resolve().parents[2]

TIMEOUT_REDE = 6
TIMEOUT_GIT = 8
TETO_TITULO = 80
TETO_PEDIDO_REGISTRO = 200
TETO_RESUMO = 280
TETO_REGISTRO_META = 50
TETO_ARQUIVOS = 30
JANELA_RECONCILIAR_S = 600
CRITERIO_PRONTO = "Pedido atendido e registrado com prova (arquivos, commits ou PR)"
VALOR_CONCLUIDA = "concluída"  # igual a VALOR_CONCLUIDA do polozi-concluir-trabalho
VALOR_ABERTA = "aberta"
PLANO_REL = Path("sistemas") / "empresa-os" / "config" / "planos" / "mestre.json"
TASKS_REL = Path("operacao") / "tasks"
SESSOES_REL = TASKS_REL / ".sessoes"

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


# ---------------------------------------------------------------- estado por conversa e TASK.md

def _arquivo_estado(casa: Path, sid: str) -> Path:
    seguro = re.sub(r"[^A-Za-z0-9._-]", "_", sid)[:100] or "sem-sessao"
    return casa / SESSOES_REL / f"{seguro}.json"


def carregar_estado(casa: Path, sid: str) -> dict | None:
    estado = _ler_json(_arquivo_estado(casa, sid), None)
    return estado if isinstance(estado, dict) and estado.get("task") else None


def salvar_estado(casa: Path, sid: str, estado: dict) -> None:
    _gravar_atomico(_arquivo_estado(casa, sid), json.dumps(estado, ensure_ascii=False, indent=1) + "\n")


def _proximo_numero(casa: Path) -> int:
    maior = 0
    pasta = casa / TASKS_REL
    if pasta.is_dir():
        for filho in pasta.iterdir():
            achado = re.fullmatch(r"TASK-(\d+)", filho.name)
            if achado:
                maior = max(maior, int(achado.group(1)))
    return maior + 1


def _caminho_task(casa: Path, task: str) -> Path:
    return casa / TASKS_REL / task / "TASK.md"


def _escrever_task(casa: Path, numero: int, titulo: str, quadro: str, pedido: str) -> str:
    task = f"TASK-{numero}"
    texto = (
        f"# {task} — {titulo}\n\n"
        f"- Status: {VALOR_ABERTA}\n"
        f"- Aberta em: {_data_local()}\n"
        "- Concluída em:\n"
        "- Commit:\n"
        f"- Quadro: {quadro}\n\n"
        "## Objetivo\n\n"
        f"{titulo}\n\n"
        "## Critério de pronto\n\n"
        f"- [ ] {CRITERIO_PRONTO}\n\n"
        "## Registro\n\n"
        f"- {_hora_local()} | pedido: {_truncar(pedido, TETO_PEDIDO_REGISTRO)}\n"
    )
    _gravar_atomico(_caminho_task(casa, task), texto)
    return task


def _ler_task(casa: Path, task: str) -> str | None:
    try:
        return _caminho_task(casa, task).read_text(encoding="utf-8")
    except OSError:
        return None


def _trocar_bullet(texto: str, padrao: re.Pattern, valor: str) -> str:
    return padrao.sub(lambda m: m.group(1) + (f" {valor}" if valor else ""), texto, count=1)


def _atualizar_task(casa: Path, task: str, *, status: str | None = None, concluida_em: str | None = None,
                    quadro: str | None = None, linha_registro: str | None = None) -> None:
    texto = _ler_task(casa, task)
    if texto is None:
        return
    if status is not None:
        texto = _trocar_bullet(texto, RE_STATUS, status)
    if concluida_em is not None:
        texto = _trocar_bullet(texto, RE_CONCLUIDA_EM, concluida_em)
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


# ---------------------------------------------------------------- tarefa no banco

def _meta_nova(task: str, sid: str) -> dict:
    return {"task_sessao": task, "sessao_id": sid, "iniciada_em": _agora_iso(), "prioridade": "normal",
            "registro": []}


def _garantir_no_banco(casa: Path, banco: Banco, estado: dict, sid: str, titulo: str) -> None:
    """Dá ao estado um tarefa_id: acha a do plano pela chave, acha a já aberta por origem_ref ou cria."""
    if estado.get("tarefa_id"):
        return
    task = estado["task"]
    chave = estado.get("chave_plano") or ""
    if chave:
        achadas = banco.get("tarefas", chave=f"eq.{chave}", select="id,status,metadata")
        if achadas:
            linha = achadas[0]
            meta = dict(linha.get("metadata") or {})
            meta["task_sessao"] = task
            meta["sessao_id"] = sid
            novo = {"metadata": meta}
            if linha.get("status") == "BACKLOG":
                novo["status"] = "EM_ANDAMENTO"
            banco.patch("tarefas", {"id": f"eq.{linha['id']}", "status": f"eq.{linha['status']}"}, novo)
            estado["tarefa_id"] = linha["id"]
            return
        estado["chave_plano"] = ""  # a tarefa do plano não existe neste banco: vira trabalho fora do plano
    abertas = banco.get("tarefas", origem_ref=f"eq.{sid}", origem_tipo="eq.pedido",
                        status="not.in.(CONCLUIDA,CANCELADA)", select="id", limit="1")
    if abertas:
        estado["tarefa_id"] = abertas[0]["id"]
        return
    corpo = {
        "titulo": titulo, "criterio_pronto": CRITERIO_PRONTO, "origem": "ia", "trilha": "trabalho",
        "origem_tipo": "pedido", "origem_ref": sid, "status": estado.get("status_local") or "EM_ANDAMENTO",
        "metadata": {**_meta_nova(task, sid), "registro": estado.get("registro") or []},
    }
    if corpo["status"] == "CONCLUIDA":
        corpo["concluida_em"] = estado.get("concluida_em") or _agora_iso()
    linha = banco.post("tarefas", corpo)
    if not linha or not linha.get("id"):
        raise ErroBanco("insert_sem_linha")
    estado["tarefa_id"] = linha["id"]


def _vincular_task(casa: Path, estado: dict) -> None:
    if estado.get("tarefa_id"):
        _atualizar_task(casa, estado["task"], quadro=estado["tarefa_id"])


def _descarregar_atividades(banco: Banco, estado: dict) -> None:
    """Manda as linhas de atividade que ficaram pendentes (banco fora do ar antes)."""
    pend = estado.get("atividades_pendentes") or []
    if not pend or not estado.get("tarefa_id"):
        return
    restantes = []
    for item in pend:
        try:
            banco.post("atividade", {**item, "tarefa_id": estado["tarefa_id"]})
        except ErroBanco:
            restantes.append(item)
    estado["atividades_pendentes"] = restantes


def sincronizar_pendentes(casa: Path, banco: Banco, ignorar_sid: str | None = None) -> None:
    pasta = casa / SESSOES_REL
    if not pasta.is_dir():
        return
    for arq in sorted(pasta.glob("*.json")):
        estado = _ler_json(arq, None)
        if not isinstance(estado, dict) or not estado.get("task") or estado.get("tarefa_id"):
            continue
        sid = estado.get("sessao_id") or arq.stem
        if sid == ignorar_sid:
            continue
        try:
            _garantir_no_banco(casa, banco, estado, sid, estado.get("titulo") or estado["task"])
            _vincular_task(casa, estado)
            _descarregar_atividades(banco, estado)
            salvar_estado(casa, sid, estado)
        except ErroBanco as erro:
            _telemetria(casa, "erro_sync", detalhe=str(erro))
            return


# ---------------------------------------------------------------- inicio

def _payload() -> dict:
    try:
        bruto = sys.stdin.read()
        dados = json.loads(bruto) if bruto.strip() else {}
        return dados if isinstance(dados, dict) else {}
    except Exception:
        return {}


def executar_inicio(casa: Path, dados: dict) -> str:
    """Devolve a linha de stdout ('' na maioria dos casos)."""
    sid = str(dados.get("session_id") or "").strip()
    if not sid:
        return ""
    turno = str(dados.get("turn_id") or "").strip()
    prompt = str(dados.get("prompt") or "")
    estado = carregar_estado(casa, sid)
    if estado is not None and turno and turno in (estado.get("turnos_vistos") or []):
        return ""  # hook repetido no mesmo turno: não duplica

    chave = casar_plano(casa, prompt)
    if estado is not None and chave and chave != (estado.get("chave_plano") or ""):
        estado = None  # pedido novo (outra atividade do plano): fecha o vínculo da anterior e abre a nova
    if estado is None and not chave and e_trivial(prompt):
        return ""

    banco = abrir_banco(casa)
    saida = ""
    if estado is None:
        titulo = _truncar(prompt.strip().splitlines()[0] if prompt.strip() else "", TETO_TITULO) or "Pedido"
        numero = _proximo_numero(casa)
        task = _escrever_task(casa, numero, titulo, "pendente", prompt)
        estado = {
            "task": task, "sessao_id": sid, "titulo": titulo, "tarefa_id": "", "chave_plano": chave or "",
            "turnos_vistos": [], "base_commit": _head(casa), "sujos_inicio": sorted(_sujos(casa)),
            "status_local": "EM_ANDAMENTO", "registro": [], "atividades_pendentes": [],
        }
        if not chave:
            saida = f"Registro: pedido aberto como {task} no quadro (fora do plano)."
    else:
        _atualizar_task(casa, estado["task"], linha_registro=f"pedido: {_truncar(prompt, TETO_PEDIDO_REGISTRO)}")
        if estado.get("status_local") == "CONCLUIDA":
            estado["status_local"] = "EM_ANDAMENTO"
            estado["concluida_em"] = ""
            _atualizar_task(casa, estado["task"], status=VALOR_ABERTA, concluida_em="")
            if estado.get("tarefa_id") and banco is not None:
                try:
                    linha = banco.get("tarefas", id=f"eq.{estado['tarefa_id']}", select="id,metadata")
                    meta = dict((linha[0] if linha else {}).get("metadata") or {})
                    meta.pop("aguardando_dono", None)
                    banco.patch("tarefas", {"id": f"eq.{estado['tarefa_id']}", "status": "eq.CONCLUIDA"},
                                {"status": "EM_ANDAMENTO", "concluida_em": None, "metadata": meta})
                except ErroBanco as erro:
                    _telemetria(casa, "erro_reabrir", detalhe=str(erro))
        if estado.get("aguardando_dono"):
            estado["aguardando_dono"] = False

    if turno:
        estado["turnos_vistos"] = (estado.get("turnos_vistos") or [])[-200:] + [turno]
    if banco is not None:
        try:
            _garantir_no_banco(casa, banco, estado, sid, estado.get("titulo") or estado["task"])
            _vincular_task(casa, estado)
            _descarregar_atividades(banco, estado)
        except ErroBanco as erro:
            _telemetria(casa, "erro_banco", detalhe=str(erro))
    salvar_estado(casa, sid, estado)
    if banco is not None:
        sincronizar_pendentes(casa, banco, ignorar_sid=sid)
    return saida


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
    linha_registro = " | ".join(partes)

    concluir = (not aguardando) and (not do_plano)
    agora = _agora_iso()
    _atualizar_task(casa, estado["task"], linha_registro=linha_registro)
    if concluir:
        estado["status_local"] = "CONCLUIDA"
        estado["concluida_em"] = agora
        _atualizar_task(casa, estado["task"], status=VALOR_CONCLUIDA, concluida_em=_data_local())
    estado["aguardando_dono"] = bool(aguardando and not do_plano)
    item_registro = {"em": agora, "resumo": resumo, "arquivos": prova["arquivos"][:TETO_ARQUIVOS],
                     "commits": prova["commits"], "prs": prova["prs"]}
    estado["registro"] = ((estado.get("registro") or []) + [item_registro])[-TETO_REGISTRO_META:]
    atividade = {
        "tipo": "pedido_registrado", "descricao": resumo or "Turno registrado", "modulo_origem": "tarefas",
        "metadata": {"task_sessao": estado["task"], "n_arquivos": len(prova["arquivos"]),
                     "concluida": concluir},
    }
    if turno:
        estado["fins_vistos"] = (estado.get("fins_vistos") or [])[-200:] + [turno]

    banco = abrir_banco(casa)
    mudou_arquivo = bool(prova["arquivos"])
    if banco is None:
        estado["atividades_pendentes"] = (estado.get("atividades_pendentes") or []) + [atividade]
    else:
        try:
            _garantir_no_banco(casa, banco, estado, sid, estado.get("titulo") or estado["task"])
            _vincular_task(casa, estado)
            linhas = banco.get("tarefas", id=f"eq.{estado['tarefa_id']}", select="id,status,metadata")
            if linhas:
                atual = linhas[0]
                meta = dict(atual.get("metadata") or {})
                meta["registro"] = estado["registro"]
                meta["task_sessao"] = estado["task"]
                if estado["aguardando_dono"]:
                    meta["aguardando_dono"] = True
                else:
                    meta.pop("aguardando_dono", None)
                corpo = {"metadata": meta}
                if concluir:
                    corpo["status"] = "CONCLUIDA"
                    corpo["concluida_em"] = agora
                guarda = {"id": f"eq.{estado['tarefa_id']}", "status": f"eq.{atual.get('status')}"}
                if atual.get("status") in ("CONCLUIDA", "CANCELADA") and not concluir:
                    corpo.pop("status", None)
                if banco.patch("tarefas", guarda, corpo) is None:
                    _telemetria(casa, "guarda_status", task=estado["task"])
            estado.setdefault("atividades_pendentes", []).append(atividade)
            _descarregar_atividades(banco, estado)
        except ErroBanco as erro:
            _telemetria(casa, "erro_banco", detalhe=str(erro))
            estado["atividades_pendentes"] = (estado.get("atividades_pendentes") or []) + (
                [atividade] if atividade not in (estado.get("atividades_pendentes") or []) else [])

    ultimo = float(estado.get("ultimo_reconciliar_ts") or 0)
    agora_ts = _agora().timestamp()
    deve_reconciliar = banco is not None and (mudou_arquivo or agora_ts - ultimo >= JANELA_RECONCILIAR_S)
    if deve_reconciliar:
        estado["ultimo_reconciliar_ts"] = agora_ts
    salvar_estado(casa, sid, estado)
    if banco is not None:
        sincronizar_pendentes(casa, banco, ignorar_sid=sid)
        if deve_reconciliar or do_plano:
            try:
                reconciliar(casa, banco, estado["chave_plano"] if do_plano and not deve_reconciliar else None)
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


TIMES_DO_KIT = ("native-ai", "tecnologia", "pmo", "marketing")


def prova_times(casa: Path, banco) -> str | None:
    texto = _ler_texto(casa / "capacidades" / "PLUGINS.md")
    inicio = texto.find("## Times da empresa")
    if inicio == -1:
        return None
    resto = texto[inicio:]
    proximo = re.search(r"\n## ", resto[1:])
    secao = resto[: proximo.start() + 1] if proximo else resto
    linhas = [l for l in secao.splitlines() if l.strip().startswith("|")]
    estados = {}
    for linha in linhas[2:]:
        cel = _tabela_celulas(linha)
        if len(cel) >= 3:
            estados[cel[0].lower()] = cel[2].lower()
    if all(estados.get(t) == "ativo" for t in TIMES_DO_KIT):
        return "os 4 times do kit estao ativos em capacidades/PLUGINS.md"
    return None


def prova_fabrica(casa: Path, banco) -> str | None:
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
    "curso.d1.whatsapp": prova_whatsapp,
    "curso.d1.times": prova_times,
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


# ---------------------------------------------------------------- main

def _args(argv: list[str]):
    import argparse
    p = argparse.ArgumentParser(prog="registro_trabalho.py", description="Registro do trabalho no quadro.")
    p.add_argument("--casa", help="pasta da Casa (só para teste)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("inicio")
    sub.add_parser("fim")
    rec = sub.add_parser("reconciliar")
    rec.add_argument("--chave")
    sub.add_parser("ligar")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    try:
        args = _args(sys.argv[1:] if argv is None else argv)
    except SystemExit:
        return 0  # hook nunca quebra o turno por argumento torto
    casa = Path(args.casa).resolve() if args.casa else CASA_PADRAO

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

    # reconciliar
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


if __name__ == "__main__":
    sys.exit(main())
