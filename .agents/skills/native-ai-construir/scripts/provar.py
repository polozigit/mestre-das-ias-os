#!/usr/bin/env python3
"""provar.py: prova o que o time construiu. Cada etapa imprime PASS/FAIL com motivo;
sai 1 se alguma falhar (2 se a raiz nao existe ou o argumento e invalido).

Uso:
  python3 provar.py --raiz <repo> [--fonte <pasta do time>] [--tarefa operacao/tasks/TASK-N] [--mutacao <lote.json>]
                    [--fumaca "<comando>"] [--carga <evidencia.json>] [--w15] [--data AAAA-MM-DD]

--fonte: pasta do time.json (padrao: a raiz). Na Casa o time mora em times/<nome>/ e as saidas,
skills e links ficam na raiz: --raiz . --fonte times/<nome>. Relativo resolve contra a raiz;
tem de ficar dentro dela. Vale nas etapas 1 a 3 e no drift do gerar_saidas.py --check.

Etapas (sempre: 1, 2 e 3; as outras so se o argumento vier):
  1. estatica   toml/md/skills/hooks parseiam e tem os campos exigidos; mapa sem rede (C4).
  2. paridade   time.json x saidas (name, description com gatilho, model, effort, tools,
                sandbox), links das skills, drift do gerar_saidas.py --check, tools minimas
                (C1), avaliador independente do construtor em cada plataforma (C5; no Codex
                contra o modelo que o construtor herda do .codex/config.toml da casa).
  3. contexto   referencias/banco.md e repo.md abaixo do teto e nunca importados com @ (C12).
  4. criterio   (--tarefa) criterio.md e casos.md da tarefa com o mesmo sha256 da linha
                criterio-assinado do W15 (C6); criterio.md com pelo menos 1 item C<n>.
  5. mutacao    (--mutacao, exige --tarefa) lote.json =
                [{"arquivo","trocar","por","comando","criterio":"C1" ou ["C1","C2"]}].
                Aplica cada troca numa copia temporaria, roda o comando la; se o comando
                PASSAR com o mutante e DECORACAO (FAIL). Arquivo que nao existe + trocar ""
                = cria o arquivo (C3). Antes de cada comando, roda-o sem mutacao: comando que
                ja falha nao prova nada. Todo item do criterio.md assinado precisa de pelo
                menos 1 mutante PEGOU (C7a).
  6. carga      evidencia do Task/codex exec (C2): subagent_type igual ao agente (nunca
                general-purpose), tool_uses > 0, fumaca de carga (o agente, pedido a usar
                uma ferramenta fora da lista dele, declarou que nao a tem), modelo declarado,
                tokens dentro do teto (C11; com --tarefa, o da ficha aprovada), quem
                construiu (construtor ou thread) com modelo diferente do avaliador (C5/C8),
                comparado pela familia do modelo ('opus' e
                'claude-opus-5-5' sao o mesmo; no Codex, o ID sem sufixo de data). JSON: lista
                (ou 1 objeto) de
                {"agente","subagent_type","tool_uses","modelo","tokens":N,"fase":"casos",
                 "fora_da_lista":{"ferramenta":"Bash","resposta":"<trecho literal>"}};
                recuo pro thread: {"agente":"thread","modelo":"sonnet"}.
                Limite declarado: o retorno do subagente traz contagem de ferramentas e de
                tokens, nao a lista das ferramentas usadas. A restricao e do frontmatter
                (plataforma); a carga prova so que ele carregou (fumaca + tool_uses + nome).
  7. fumaca     roda o comando na raiz; PASS se exit 0.

Roda na casa (ou numa copia dela). Na fonte do time aninhada em outro repo (sem .git
propria, como no Polozi-Stack) sai 2: la nao ha .claude/ (C13), a prova do time real e
feita pelos testes, que copiam a fonte pra uma casa temporaria.

Com --w15, grava 1 linha por etapa (FAIL = erro, PASS = acerto) via w15.registrar. Os
tokens da carga NAO entram como tokens no W15: eles ja foram gravados no gate da chamada
(senao a soma por tarefa contaria 2 vezes); vao so no detalhe.
Python so stdlib, sem rede.
"""
import argparse
import ast
import datetime
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

sys.dont_write_bytecode = True
# cache de bytecode numa pasta vazia: o __pycache__/ ao lado nunca e lido (C3)
_PYC_VAZIO = tempfile.TemporaryDirectory(prefix="native-ai-pyc-")
sys.pycache_prefix = _PYC_VAZIO.name
sys.path.insert(0, str(Path(__file__).resolve().parent))
import w15  # noqa: E402
import trava_lote  # noqa: E402  (fonte_aninhada: so leitura de .git)

SKILL = ".agents/skills/native-ai-construir"
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
CAMPOS_TOML = ("name", "description", "developer_instructions")
CAMPOS_MD = ("name", "description", "model", "effort", "tools")
DESCRICAO_MAX = 50           # parte curta (time.json "descricao")
DESCRICAO_GERADA_MAX = 300   # descricao + gatilho ("quando"); abaixo do teto de 450 do catalogo
GATILHO_INICIO = "Use "

CONSTRUTOR = "native-ai-construtor"
AVALIADOR = "native-ai-avaliador"
# C1: lista exata de tools no Claude. Sem Bash, sem Agent/Task, sem MCP.
TOOLS_C1 = {
    CONSTRUTOR: ["Read", "Grep", "Glob", "Write", "Edit"],
    AVALIADOR: ["Read", "Grep", "Glob"],
}
TOOLS_PROIBIDAS = {"Bash", "Agent", "Task"}
TOOLS_DE_ESCRITA = {"Write", "Edit", "NotebookEdit"}
SANDBOX_C1 = {AVALIADOR: "read-only"}  # os outros: o que o time.json declara, nunca acesso total
SANDBOX_ABERTO = {"danger-full-access"}

# C4: scripts de mapa leem so arquivo. Estes modulos nao podem aparecer.
IMPORTS_PROIBIDOS_MAPA = {"socket", "urllib", "urllib3", "http", "subprocess", "requests",
                          "ftplib", "smtplib", "ssl", "telnetlib"}

# C12: tetos declarados em bytes (cerca de 10k e 5k tokens). time.json pode sobrepor em
# {"tetos": {"referencias_bytes": {"banco.md": N, "repo.md": N}}}.
TETO_REFERENCIAS_BYTES = {"banco.md": 40_000, "repo.md": 20_000}
IMPORT_ARROBA_RE = re.compile(r"@\S*referencias/(?:banco|repo)\.md")


class Etapa:
    def __init__(self, nome):
        self.nome = nome
        self.passou = 0
        self.falhas = []
        self.notas = []
        self.tokens = {}

    @property
    def ok(self):
        return not self.falhas

    def verifica(self, condicao, falha):
        if condicao:
            self.passou += 1
        else:
            self.falhas.append(falha)
        return bool(condicao)


# ------------------------------------------------------------------ utilitarios
def parse_frontmatter(texto):
    """Frontmatter simples (sem PyYAML): 'chave: valor', 'chave:' + '- item', '[a, b]'."""
    linhas = texto.splitlines()
    if not linhas or linhas[0].strip() != "---":
        raise ValueError("frontmatter ausente (o arquivo nao abre com ---)")
    fim = next((i for i in range(1, len(linhas)) if linhas[i].strip() == "---"), None)
    if fim is None:
        raise ValueError("frontmatter sem fechamento (---)")
    dados, chave = {}, None
    for linha in linhas[1:fim]:
        if not linha.strip() or linha.lstrip().startswith("#"):
            continue
        casou = None if linha[0] in " \t" else re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", linha)
        if casou:
            chave, valor = casou.group(1), casou.group(2).strip()
            if valor in (">", "|", ">-", "|-"):
                dados[chave] = ""
            elif valor == "":
                dados[chave] = []
            elif valor.startswith("[") and valor.endswith("]"):
                dados[chave] = [_sem_aspas(v) for v in valor[1:-1].split(",") if v.strip()]
            else:
                dados[chave] = _sem_aspas(valor)
        elif chave is not None and linha.lstrip().startswith("- ") and isinstance(dados[chave], list):
            dados[chave].append(_sem_aspas(linha.lstrip()[2:].strip()))
        elif chave is not None and isinstance(dados[chave], str):
            dados[chave] = (dados[chave] + " " + linha.strip()).strip()
    return dados


def _sem_aspas(valor):
    valor = valor.strip()
    if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "\"'":
        return valor[1:-1]
    return valor


def lista(valor):
    """tools: 'Read, Grep' ou ['Read', 'Grep'] -> ['Read', 'Grep']."""
    if isinstance(valor, str):
        valor = valor.split(",")
    if not isinstance(valor, list):
        return []
    return [str(v).strip() for v in valor if str(v).strip()]


def descricao_gerada(agente):
    """Mesma regra do gerar_saidas.py: descricao curta + ". " + gatilho (campo quando)."""
    return f"{agente.get('descricao', '')}. {agente.get('quando', '')}"


def times_da_casa(raiz):
    return sorted(p.parent.name for p in (Path(raiz) / "times").glob("*/time.json"))


def carregar_time(raiz, fonte=None):
    fonte = Path(raiz) if fonte is None else Path(fonte)
    caminho = fonte / "time.json"
    if not caminho.is_file():
        achados = times_da_casa(raiz) if fonte == Path(raiz) else []
        if achados:
            return None, ("time.json ausente na raiz. Na Casa cada time mora em times/<nome>/: "
                          f"rode com --fonte times/<nome> (times: {', '.join(achados)})")
        return None, "time.json ausente na raiz" if fonte == Path(raiz) else f"time.json ausente em {_rel(Path(raiz), fonte)}"
    try:
        dados = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError) as erro:
        return None, f"time.json invalido ({erro})"
    if not isinstance(dados, dict) or not isinstance(dados.get("agentes"), list):
        return None, "time.json sem a lista 'agentes'"
    if any(not isinstance(a, dict) or not a.get("name") for a in dados["agentes"]):
        return None, "time.json: todo agente precisa de 'name'"
    if not isinstance(dados.get("skills", []), list):
        return None, "time.json: 'skills' precisa ser lista"
    return dados, None


def _rel(raiz, caminho):
    try:
        return Path(caminho).relative_to(raiz).as_posix()
    except ValueError:
        return str(caminho)


def _ler_md(caminho):
    try:
        return parse_frontmatter(Path(caminho).read_text(encoding="utf-8")), None
    except (OSError, UnicodeDecodeError, ValueError) as erro:
        return None, str(erro)


def _ler_toml(caminho):
    try:
        return tomllib.loads(Path(caminho).read_text(encoding="utf-8")), None
    except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError) as erro:
        return None, f"nao parseia ({erro})"


def _executar(comando, cwd, timeout, env=None):
    """Roda 'comando' (str = shell; list = direto). Devolve (rc, saida, expirou)."""
    posix = os.name == "posix"
    try:
        proc = subprocess.Popen(
            comando, shell=isinstance(comando, str), cwd=str(cwd), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            start_new_session=posix,
        )
    except OSError as erro:
        return 127, str(erro), False
    try:
        saida, _ = proc.communicate(timeout=timeout)
        return proc.returncode, saida or "", False
    except subprocess.TimeoutExpired:
        try:
            if posix:
                os.killpg(proc.pid, signal.SIGKILL)
            else:
                proc.kill()
        except (ProcessLookupError, PermissionError):
            pass
        saida, _ = proc.communicate()
        return None, saida or "", True


def _fim_da_saida(saida, n=3):
    linhas = [l for l in saida.strip().splitlines() if l.strip()]
    return " / ".join(linhas[-n:])[:300]


def imports_proibidos(codigo):
    arvore = ast.parse(codigo)
    achados = set()
    for no in ast.walk(arvore):
        if isinstance(no, ast.Import):
            achados |= {a.name.split(".")[0] for a in no.names}
        elif isinstance(no, ast.ImportFrom) and no.module and no.level == 0:
            achados.add(no.module.split(".")[0])
    return sorted(achados & IMPORTS_PROIBIDOS_MAPA)


_FAMILIAS_CLAUDE = ("opus", "sonnet", "haiku", "fable")
_SUFIXO_DATA_RE = re.compile(r"[-_@]?\d{4}-?\d{2}-?\d{2}$")


def familia_modelo(modelo):
    """Chave de comparacao de independencia (C5/C8). Claude: a familia ('opus',
    'claude-opus-5-5', 'us.anthropic.claude-opus-4-1' e 'opus[1m]' viram 'opus').
    Outros (gpt-*): o ID em minusculas, sem sufixo de data. None se vazio."""
    if not isinstance(modelo, str) or not modelo.strip():
        return None
    texto = modelo.strip().lower()
    partes = re.split(r"[^a-z0-9]+", texto)
    for familia in _FAMILIAS_CLAUDE:
        if familia in partes:
            return familia
    return _SUFIXO_DATA_RE.sub("", texto)


# ------------------------------------------------------------------ 1. estatica
def etapa_estatica(raiz, fonte=None):
    raiz = Path(raiz)
    e = Etapa("estatica")
    tj, _ = carregar_time(raiz, fonte)
    declarados = {a["name"]: a for a in (tj or {}).get("agentes", [])}

    tomls = sorted((raiz / ".codex" / "agents").glob("*.toml"))
    e.verifica(tomls, ".codex/agents/*.toml: nenhum arquivo")
    for caminho in tomls:
        rel = _rel(raiz, caminho)
        dados, erro = _ler_toml(caminho)
        if erro:
            e.falhas.append(f"{rel}: {erro}")
            continue
        e.passou += 1
        for campo in CAMPOS_TOML:
            valor = dados.get(campo)
            e.verifica(isinstance(valor, str) and valor.strip(),
                       f"{rel}: campo {campo} ausente ou vazio")
        nome = dados.get("name") or caminho.stem
        # A regra de modelo e do time: agente de fora (ex.: nucleo da casa) so passa
        # pela leitura do toml e pelos campos obrigatorios.
        if "model" in dados and nome in declarados:
            declarado = declarados.get(nome, {}).get("codex", {}).get("model")
            e.verifica(declarado and dados["model"] == declarado,
                       f"{rel}: campo model ({dados['model']!r}) nao declarado em time.json; "
                       "sem model no toml o Codex herda o modelo da sessao; todo model fixado "
                       "(construtor e avaliador) tem de estar no time.json (C5)")

    mds = sorted((raiz / ".claude" / "agents").glob("*.md"))
    e.verifica(mds, ".claude/agents/*.md: nenhum arquivo")
    for caminho in mds:
        rel = _rel(raiz, caminho)
        fm, erro = _ler_md(caminho)
        if erro:
            e.falhas.append(f"{rel}: {erro}")
            continue
        e.passou += 1
        for campo in CAMPOS_MD:
            e.verifica(fm.get(campo), f"{rel}: frontmatter sem {campo}")

    skills = sorted(p for p in (raiz / ".agents" / "skills").glob("*") if p.is_dir())
    e.verifica(skills, ".agents/skills/*: nenhuma skill")
    for pasta in skills:
        rel = _rel(raiz, pasta / "SKILL.md")
        if not (pasta / "SKILL.md").is_file():
            e.falhas.append(f"{_rel(raiz, pasta)}: SKILL.md ausente")
            continue
        fm, erro = _ler_md(pasta / "SKILL.md")
        if erro:
            e.falhas.append(f"{rel}: {erro}")
            continue
        nome = fm.get("name")
        e.verifica(nome == pasta.name,
                   f"{rel}: name {nome!r} diferente da pasta {pasta.name!r}")
        e.verifica(isinstance(nome, str) and NAME_RE.match(nome),
                   f"{rel}: name {nome!r} invalido (use {NAME_RE.pattern})")
        e.verifica(fm.get("description"), f"{rel}: frontmatter sem description")

    hooks = raiz / ".codex" / "hooks.json"
    if hooks.is_file():
        try:
            dados = json.loads(hooks.read_text(encoding="utf-8"))
        except (OSError, ValueError) as erro:
            e.falhas.append(f".codex/hooks.json: nao parseia ({erro})")
        else:
            if e.verifica(isinstance(dados, dict) and isinstance(dados.get("hooks"), dict),
                          '.codex/hooks.json: sem a chave raiz "hooks" (formato {"hooks": {...}})'):
                soltos = sorted(set(dados) - {"hooks", "description"})
                e.verifica(not soltos,
                           f".codex/hooks.json: evento no topo do arquivo ({', '.join(soltos)}); "
                           'o Codex 0.146.1 ignora o hook, tem que ficar dentro de "hooks"')

    for script in sorted((raiz / ".agents" / "skills").glob("*/scripts/*mapa*.py")):
        rel = _rel(raiz, script)
        try:
            achados = imports_proibidos(script.read_text(encoding="utf-8"))
        except (SyntaxError, OSError, UnicodeDecodeError) as erro:
            e.falhas.append(f"{rel}: nao deu pra ler o codigo ({erro})")
            continue
        e.verifica(not achados,
                   f"{rel}: importa {', '.join(achados)}; script de mapa le so arquivo, sem rede "
                   "nem subprocesso (C4)")
    return e


# ------------------------------------------------------------------ 2. paridade
def _checar_c1(e, nome, agente, rel_md, fm, rel_toml, dt):
    tools_tj = lista(agente.get("claude", {}).get("tools"))
    tools_md = lista(fm.get("tools"))
    e.verifica(sorted(tools_md) == sorted(tools_tj),
               f"{rel_md}: tools {tools_md} diferem do time.json {tools_tj} "
               "(item 6: nenhum lado mais aberto que o desenho)")
    for tool in sorted(set(tools_tj) | set(tools_md)):
        e.verifica(tool not in TOOLS_PROIBIDAS and not tool.startswith("mcp__"),
                   f"{nome}: tool {tool} proibida (C1: sem Bash, Agent/Task nem MCP)")
    if nome in TOOLS_C1:
        e.verifica(sorted(tools_tj) == sorted(TOOLS_C1[nome]),
                   f"{nome}: tools do time.json {tools_tj} diferem da lista exata do C1 {TOOLS_C1[nome]}")
        e.verifica(sorted(tools_md) == sorted(TOOLS_C1[nome]),
                   f"{rel_md}: tools {tools_md} diferem da lista exata do C1 {TOOLS_C1[nome]}")
    if nome == AVALIADOR:
        for tool in sorted(TOOLS_DE_ESCRITA & (set(tools_tj) | set(tools_md))):
            e.falhas.append(f"{nome}: tool de escrita {tool} (C1: avaliador so le)")
    for campo in ("mcps", "mcpServers", "mcp_servers"):
        e.verifica(not fm.get(campo), f"{rel_md}: {campo} preenchido (C1: nenhum agente com MCP)")

    sandbox_tj = agente.get("codex", {}).get("sandbox_mode")
    sandbox_toml = dt.get("sandbox_mode")
    e.verifica(sandbox_toml == sandbox_tj,
               f"{rel_toml}: sandbox_mode {sandbox_toml!r} diferente do time.json {sandbox_tj!r}")
    e.verifica(sandbox_toml not in SANDBOX_ABERTO,
               f"{rel_toml}: sandbox_mode {sandbox_toml!r} abre tudo (C1)")
    if nome in SANDBOX_C1:
        e.verifica(sandbox_toml == SANDBOX_C1[nome] and sandbox_tj == SANDBOX_C1[nome],
                   f"{nome}: sandbox_mode deve ser {SANDBOX_C1[nome]!r} no toml e no time.json (C1); "
                   f"veio toml={sandbox_toml!r}, time.json={sandbox_tj!r}")
    e.verifica(not any(str(k).lower().startswith("mcp") for k in dt),
               f"{rel_toml}: tem configuracao de MCP (C1: nenhum agente com MCP)")


def modelos_sessao_codex(raiz):
    """Modelos que um subagente sem 'model' herda no Codex desta casa: o 'model' da sessao
    e o [agents].default_subagent_model do .codex/config.toml da raiz. None se nao ha config."""
    cfg = Path(raiz) / ".codex" / "config.toml"
    if not cfg.is_file():
        return None
    dados, erro = _ler_toml(cfg)
    if erro:
        return None
    candidatos = [dados.get("model"), (dados.get("agents") or {}).get("default_subagent_model")]
    return {m for m in candidatos if isinstance(m, str) and m.strip()}


def _checar_c5(e, raiz, fms, tomls):
    if CONSTRUTOR not in fms or AVALIADOR not in fms:
        return
    e.verifica(familia_modelo(fms[AVALIADOR].get("model")) != familia_modelo(fms[CONSTRUTOR].get("model")),
               f"C5 (Claude): {AVALIADOR} usa o mesmo model do {CONSTRUTOR} "
               f"({fms[AVALIADOR].get('model')!r}); quem avalia nao pode ser o mesmo modelo")
    av = tomls.get(AVALIADOR)
    if av is None:
        return
    rel = f".codex/agents/{AVALIADOR}.toml"
    if not (isinstance(av.get("model"), str) and av["model"].strip()):
        e.falhas.append(
            f"C5 (FAIL declarado, Codex): {rel} sem model explicito; sem ele o avaliador herda o "
            f"modelo do construtor. O veredito v1 roda so pelo avaliador do Claude")
    else:
        e.passou += 1
        proprio = (tomls.get(CONSTRUTOR) or {}).get("model")
        if isinstance(proprio, str) and proprio.strip():
            efetivos, origem = {proprio}, f".codex/agents/{CONSTRUTOR}.toml"
        else:
            efetivos, origem = modelos_sessao_codex(raiz), ".codex/config.toml (herdado da sessao)"
        if efetivos is None:
            e.notas.append(f"C5 (Codex): sem .codex/config.toml na raiz; o modelo que o "
                           f"{CONSTRUTOR} herda so e conferido na casa e na carga")
        elif not efetivos:
            e.falhas.append(f"C5 (Codex): .codex/config.toml sem model; nao da pra saber o modelo "
                            f"que o {CONSTRUTOR} herda")
        else:
            e.verifica(familia_modelo(av["model"]) not in {familia_modelo(m) for m in efetivos},
                       f"C5 (Codex): {rel} usa {av['model']!r}, o mesmo modelo do construtor "
                       f"({', '.join(sorted(efetivos))}, de {origem})")
    e.verifica(isinstance(av.get("model_reasoning_effort"), str) and av["model_reasoning_effort"].strip(),
               f"C5 (Codex): {rel} sem model_reasoning_effort explicito")


def _rodar_gerar_saidas(raiz, fonte=None):
    script = raiz / SKILL / "scripts" / "gerar_saidas.py"
    if not script.is_file():
        return None, f"{_rel(raiz, script)} ausente (drift nao verificado)"
    base = [sys.executable, str(script), "--check"]
    com_fonte = ["--fonte", str(fonte)] if fonte is not None and Path(fonte) != raiz else []
    rc, saida, expirou = _executar(base + ["--raiz", str(raiz)] + com_fonte, raiz, 120)
    if rc == 2 and "unrecognized arguments" in saida:
        rc, saida, expirou = _executar(base, raiz, 120)
    if expirou:
        return None, "gerar_saidas.py --check: timeout apos 120s"
    if rc != 0:
        return None, f"gerar_saidas.py --check reprovou (drift, saida {rc}): {_fim_da_saida(saida)}"
    return True, None


def etapa_paridade(raiz, fonte=None):
    raiz = Path(raiz)
    e = Etapa("paridade")
    tj, erro = carregar_time(raiz, fonte)
    if not e.verifica(tj, erro):
        return e

    fms, tomls = {}, {}
    for a in tj["agentes"]:
        nome = a["name"]
        descricao = a.get("descricao", "")
        e.verifica(isinstance(descricao, str) and 0 < len(descricao) <= DESCRICAO_MAX,
                   f"time.json: descricao de {nome} precisa ter de 1 a {DESCRICAO_MAX} caracteres")
        quando = a.get("quando", "")
        e.verifica(isinstance(quando, str) and quando.startswith(GATILHO_INICIO),
                   f"time.json: quando de {nome} precisa comecar com {GATILHO_INICIO!r} "
                   "(e o gatilho da description gerada)")
        esperada = descricao_gerada(a)
        e.verifica(len(esperada) <= DESCRICAO_GERADA_MAX,
                   f"time.json: description gerada de {nome} com {len(esperada)} caracteres "
                   f"(maximo {DESCRICAO_GERADA_MAX})")
        rel_md = f".claude/agents/{nome}.md"
        rel_toml = f".codex/agents/{nome}.toml"
        fm = dt = None
        if not (raiz / rel_md).is_file():
            e.falhas.append(f"{rel_md}: ausente (agente do time.json sem saida no Claude)")
        else:
            fm, erro_md = _ler_md(raiz / rel_md)
            if erro_md:
                e.falhas.append(f"{rel_md}: {erro_md}")
                fm = None
        if not (raiz / rel_toml).is_file():
            e.falhas.append(f"{rel_toml}: ausente (agente do time.json sem saida no Codex)")
        else:
            dt, erro_toml = _ler_toml(raiz / rel_toml)
            if erro_toml:
                e.falhas.append(f"{rel_toml}: {erro_toml}")
                dt = None
        if fm is not None:
            fms[nome] = fm
            e.verifica(fm.get("name") == nome, f"{rel_md}: name {fm.get('name')!r} diferente de {nome!r}")
            e.verifica(descricao and fm.get("description") == esperada,
                       f"{rel_md}: description nao e a descricao + gatilho do time.json")
            cl = a.get("claude", {})
            e.verifica(fm.get("model") == cl.get("model"),
                       f"{rel_md}: model {fm.get('model')!r} diferente do time.json {cl.get('model')!r}")
            e.verifica(fm.get("effort") == cl.get("effort"),
                       f"{rel_md}: effort {fm.get('effort')!r} diferente do time.json {cl.get('effort')!r}")
        if dt is not None:
            tomls[nome] = dt
            e.verifica(dt.get("name") == nome, f"{rel_toml}: name {dt.get('name')!r} diferente de {nome!r}")
            e.verifica(descricao and dt.get("description") == esperada,
                       f"{rel_toml}: description nao e a descricao + gatilho do time.json")
            cx = a.get("codex", {})
            e.verifica(dt.get("model_reasoning_effort") == cx.get("model_reasoning_effort"),
                       f"{rel_toml}: model_reasoning_effort {dt.get('model_reasoning_effort')!r} "
                       f"diferente do time.json {cx.get('model_reasoning_effort')!r}")
        if fm is not None and dt is not None:
            # description igual nas 2: implicada pelas 2 checagens contra a esperada acima
            _checar_c1(e, nome, a, rel_md, fm, rel_toml, dt)
    _checar_c5(e, raiz, fms, tomls)

    # skills: fonte em .agents/skills, link em .claude/skills
    for s in tj.get("skills", []):
        nome, pasta = s.get("name"), s.get("dir")
        if not (nome and pasta):
            e.falhas.append("time.json: skill sem name ou dir")
            continue
        e.verifica((raiz / pasta / "SKILL.md").is_file(), f"{pasta}/SKILL.md: ausente (skill {nome} do time.json)")
        link = raiz / ".claude" / "skills" / nome
        if not (link.is_symlink() or link.exists()):
            e.falhas.append(f".claude/skills/{nome}: link ausente")
        else:
            e.verifica(link.is_symlink(),
                       f".claude/skills/{nome}: nao e link simbolico (copia solta; vira duas fontes)")
    for link in sorted((raiz / ".claude" / "skills").glob("*")):
        if not link.is_symlink():
            continue
        rel = _rel(raiz, link)
        try:
            alvo = link.resolve(strict=True)
        except (OSError, RuntimeError):
            e.falhas.append(f"{rel}: link quebrado")
            continue
        esperado = (raiz / ".agents" / "skills" / link.name).resolve()
        e.verifica(alvo == esperado, f"{rel}: aponta para {alvo}, deveria resolver para .agents/skills/{link.name}")

    ok, motivo = _rodar_gerar_saidas(raiz, fonte)
    e.verifica(ok, motivo)
    return e


# ------------------------------------------------------------------ 3. contexto (C12)
def etapa_contexto(raiz, fonte=None):
    raiz = Path(raiz)
    e = Etapa("contexto")
    tj, _ = carregar_time(raiz, fonte)
    tetos = dict(TETO_REFERENCIAS_BYTES)
    declarado = ((tj or {}).get("tetos") or {}).get("referencias_bytes")
    if isinstance(declarado, dict):
        tetos.update({k: v for k, v in declarado.items() if isinstance(v, int) and v > 0})
    for nome, teto in sorted(tetos.items()):
        caminho = raiz / SKILL / "referencias" / nome
        if not caminho.is_file():
            e.notas.append(f"{nome}: ainda nao gerado, nada a medir")
            continue
        tamanho = caminho.stat().st_size
        e.verifica(tamanho <= teto, f"{_rel(raiz, caminho)}: {tamanho} bytes, acima do teto de {teto} (C12)")
    trechos = ["AGENTS.md", "CLAUDE.md", "trechos/AGENTS.md"]
    if fonte is not None and Path(fonte) != raiz:
        trechos.append(_rel(raiz, Path(fonte) / "trechos" / "AGENTS.md"))
    for nome in trechos:
        arq = raiz / nome
        if arq.is_file():
            casou = IMPORT_ARROBA_RE.search(arq.read_text(encoding="utf-8", errors="replace"))
            e.verifica(not casou,
                       f"{nome}: importa o mapa com @ ({casou.group(0) if casou else ''}); "
                       "ficaria sempre carregado, e o mapa e lido sob demanda (C12)")
    return e


# ------------------------------------------------------------------ 4. criterio (C6)
ID_CRITERIO_RE = re.compile(r"^\s*(?:[-*]|\|)\s*\**\s*(C\d+)\b", re.M)


def ids_criterio(texto):
    """IDs dos itens do criterio.md (linhas '- C1: ...' ou '| C1 | ...'), na ordem."""
    vistos = []
    for cid in ID_CRITERIO_RE.findall(texto):
        if cid not in vistos:
            vistos.append(cid)
    return vistos


def etapa_criterio(raiz, tarefa):
    raiz = Path(raiz)
    e = Etapa("criterio")
    ok, motivo = w15.conferir_criterio(raiz, tarefa)
    e.verifica(ok, f"C6: {motivo}")
    arq = raiz / tarefa / "criterio.md"
    ids = ids_criterio(arq.read_text(encoding="utf-8")) if arq.is_file() else []
    e.verifica(ids, f"{_rel(raiz, arq)}: nenhum item C<n> (o criterio precisa de itens com ID)")
    if ok:
        e.notas.append(motivo)
    return e, ids


# ------------------------------------------------------------------ 5. mutacao
def _criterios_do_item(item):
    valor = item.get("criterio")
    if isinstance(valor, str):
        valor = [valor]
    if not isinstance(valor, list) or not valor:
        return None
    limpos = [v.strip() for v in valor if isinstance(v, str) and v.strip()]
    return limpos if len(limpos) == len(valor) else None


def _validar_item(item):
    if not isinstance(item, dict):
        return "item do lote nao e objeto"
    faltam = [c for c in ("arquivo", "trocar", "por", "comando")
              if not isinstance(item.get(c), str)]
    if faltam:
        return "campos ausentes ou que nao sao texto: " + ", ".join(faltam)
    if not item["arquivo"].strip() or not item["comando"].strip():
        return "arquivo e comando nao podem ser vazios"
    if _criterios_do_item(item) is None:
        return "campo criterio ausente (ID do item do criterio.md que o mutante prova, ex.: \"C1\")"
    return None


def etapa_mutacao(raiz, lote, timeout=120, ids=None):
    raiz = Path(raiz)
    e = Etapa("mutacao")
    try:
        itens = json.loads(Path(lote).read_text(encoding="utf-8"))
    except (OSError, ValueError) as erro:
        e.falhas.append(f"lote {lote}: nao deu pra ler ({erro})")
        return e
    if not isinstance(itens, list):
        e.falhas.append(f"lote {lote}: deve ser uma lista de mutantes")
        return e
    if not itens:
        e.falhas.append(f"lote {lote}: vazio (sem mutante nao ha prova)")
        return e

    tmp = tempfile.mkdtemp(prefix="provar-mutacao-")
    pegos = 0
    pegos_por_criterio = set()
    try:
        copia = Path(tmp) / "repo"
        shutil.copytree(raiz, copia, symlinks=True,
                        ignore=shutil.ignore_patterns(".git", "__pycache__", "node_modules", ".venv"))
        copia_real = copia.resolve()
        env = dict(os.environ, NATIVE_AI_RAIZ=str(copia))
        linha_de_base = {}
        for i, item in enumerate(itens, 1):
            erro = _validar_item(item)
            if erro:
                e.falhas.append(f"mutante {i}: {erro}")
                continue
            arquivo, trocar, por = item["arquivo"], item["trocar"], item["por"]
            nome = item.get("nome") or f"{arquivo}: {trocar[:40]!r} -> {por[:40]!r}"
            criterios = _criterios_do_item(item)
            if ids is not None:
                desconhecidos = [c for c in criterios if c not in ids]
                if desconhecidos:
                    e.falhas.append(f"mutante {nome}: criterio {', '.join(desconhecidos)} nao existe "
                                    "no criterio.md assinado")
                    continue
            comando = item["comando"].replace("{raiz}", str(copia))

            alvo = (copia / arquivo)
            if Path(arquivo).is_absolute() or not alvo.resolve().is_relative_to(copia_real):
                e.falhas.append(f"mutante {nome}: arquivo fora da raiz")
                continue

            if comando not in linha_de_base:
                linha_de_base[comando] = _executar(comando, copia, timeout, env)
            rc0, saida0, expirou0 = linha_de_base[comando]
            if expirou0:
                e.falhas.append(f"mutante {nome}: timeout na linha de base ({timeout}s)")
                continue
            if rc0 != 0:
                e.falhas.append(f"mutante {nome}: o comando ja falha sem mutacao (saida {rc0}: "
                                f"{_fim_da_saida(saida0)}); nao prova nada")
                continue

            primeiro_novo, original = None, None
            if alvo.exists():
                if trocar == "":
                    e.falhas.append(f"mutante {nome}: trocar vazio so serve pra criar arquivo que nao existe")
                    continue
                original = alvo.read_bytes()
                texto = original.decode("utf-8", errors="replace")
                if trocar not in texto:
                    e.falhas.append(f"mutante {nome}: trecho a trocar nao encontrado em {arquivo}")
                    continue
                novo = texto.replace(trocar, por, 1)
                if novo == texto:
                    e.falhas.append(f"mutante {nome}: troca nao muda nada")
                    continue
                alvo.write_text(novo, encoding="utf-8")
            else:
                if trocar != "":
                    e.falhas.append(f"mutante {nome}: {arquivo} nao existe (trocar so vale em arquivo existente)")
                    continue
                pai = alvo.parent
                while not pai.exists():
                    primeiro_novo = pai
                    pai = pai.parent
                alvo.parent.mkdir(parents=True, exist_ok=True)
                alvo.write_text(por, encoding="utf-8")
            try:
                rc, saida, expirou = _executar(comando, copia, timeout, env)
            finally:
                if original is not None:
                    alvo.write_bytes(original)
                elif primeiro_novo is not None:
                    shutil.rmtree(primeiro_novo, ignore_errors=True)
                elif alvo.exists():
                    alvo.unlink()
            if expirou:
                e.falhas.append(f"mutante {nome}: timeout com o mutante ({timeout}s)")
            elif rc == 0:
                e.falhas.append(f"DECORACAO: {nome} (o comando passou com o mutante; "
                                "a guarda nao exige o trecho)")
                e.notas.append(f"DECORACAO {nome}")
            else:
                pegos += 1
                e.passou += 1
                pegos_por_criterio.update(criterios)
                e.notas.append(f"PEGOU {nome} ({', '.join(criterios)})")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    total = len(itens)
    e.notas.append(f"taxa: {pegos}/{total} mutantes pegos ({round(100 * pegos / total)}%)")
    if ids is not None:
        for cid in ids:
            e.verifica(cid in pegos_por_criterio,
                       f"C7a: item {cid} do criterio sem nenhum mutante PEGOU (nao esta provado)")
    return e


# ------------------------------------------------------------------ 6. carga (C2)
def etapa_carga(raiz, arquivo, tarefa=None):
    raiz = Path(raiz)
    e = Etapa("carga")
    try:
        evidencias = json.loads(Path(arquivo).read_text(encoding="utf-8"))
    except (OSError, ValueError) as erro:
        e.falhas.append(f"evidencia de carga {arquivo}: nao deu pra ler ({erro})")
        return e
    if isinstance(evidencias, dict):
        evidencias = [evidencias]
    if not isinstance(evidencias, list) or not evidencias:
        e.falhas.append(f"evidencia de carga {arquivo}: vazia ou nao e lista")
        return e

    construiu, avaliou = {}, {}
    for i, ev in enumerate(evidencias, 1):
        if not isinstance(ev, dict):
            e.falhas.append(f"evidencia {i}: nao e objeto")
            continue
        agente = ev.get("agente")
        modelo = ev.get("modelo")
        if not (isinstance(modelo, str) and modelo.strip()):
            e.falhas.append(f"evidencia {i} ({agente!r}): sem modelo; sem ele nao da pra provar "
                            "que quem avalia nao e o modelo de quem construiu (C5/C8)")
            modelo = None
        if agente == "thread":
            # recuo do C8: construcao no thread. Nao e subagente; so o modelo importa.
            if modelo:
                construiu.setdefault(familia_modelo(modelo), []).append(f"evidencia {i} (thread, {modelo})")
                e.passou += 1
            continue
        if modelo and agente == AVALIADOR:
            avaliou.setdefault(familia_modelo(modelo), []).append(f"evidencia {i} ({modelo})")
        elif modelo:
            construiu.setdefault(familia_modelo(modelo), []).append(f"evidencia {i} ({agente}, {modelo})")
        rel_md = f".claude/agents/{agente}.md"
        fm, erro = (None, "ausente") if not (agente and (raiz / rel_md).is_file()) else _ler_md(raiz / rel_md)
        if fm is None:
            e.falhas.append(f"evidencia {i}: agente {agente!r} sem {rel_md} ({erro})")
            continue
        tipo = ev.get("subagent_type")
        if tipo == "general-purpose":
            e.falhas.append(f"{agente}: rodou como general-purpose; o frontmatter do agente nao foi aplicado")
        else:
            e.verifica(tipo == agente, f"{agente}: subagent_type {tipo!r} diferente do agente")
        usos = ev.get("tool_uses")
        e.verifica(isinstance(usos, int) and not isinstance(usos, bool) and usos > 0,
                   f"{agente}: tool_uses={usos!r}; precisa ser maior que 0 (agente que nao usou "
                   "ferramenta nao provou nada)")
        fora = ev.get("fora_da_lista")
        fora = fora if isinstance(fora, dict) else {}
        tool, resposta = fora.get("ferramenta"), fora.get("resposta")
        if not (isinstance(tool, str) and tool.strip() and isinstance(resposta, str)):
            e.falhas.append(f"{agente}: fora_da_lista ausente; sem a fumaca de carga nao ha "
                            "prova de que a lista do frontmatter foi aplicada (C1/C2)")
        elif tool in set(lista(fm.get("tools"))):
            e.falhas.append(f"{agente}: fumaca com {tool}, que esta na lista dele; nao prova nada")
        else:
            e.verifica(tool.lower() in resposta.lower(),
                       f"{agente}: a resposta da fumaca nao declara que falta {tool}")
        tokens = ev.get("tokens")
        if isinstance(tokens, int) and not isinstance(tokens, bool) and tokens >= 0:
            chave = f"{agente}:{ev['fase']}" if ev.get("fase") else agente
            e.tokens[chave] = e.tokens.get(chave, 0) + tokens
    for modelo in sorted(set(construiu) & set(avaliou)):
        e.falhas.append(f"C5/C8: o {AVALIADOR} rodou no mesmo modelo de quem construiu ({modelo!r}: "
                        f"{', '.join(construiu[modelo])}); sem independencia, o veredito nao vale")
    for estouro in w15.estouros_de_teto(e.tokens, raiz=raiz, tarefa=tarefa):
        e.falhas.append(f"teto de tokens excedido (C11): {estouro}")
    return e


# ------------------------------------------------------------------ 7. fumaca
def etapa_fumaca(raiz, comando, timeout=600):
    e = Etapa("fumaca")
    rc, saida, expirou = _executar(comando, raiz, timeout)
    if expirou:
        e.falhas.append(f"timeout apos {timeout}s: {comando}")
    elif rc != 0:
        e.falhas.append(f"comando saiu com {rc}: {comando} ({_fim_da_saida(saida)})")
    else:
        e.passou += 1
    return e


# ------------------------------------------------------------------ CLI
def imprimir(e):
    if e.ok:
        print(f"PASS {e.nome}: {e.passou} verificacoes")
    else:
        for falha in e.falhas:
            print(f"FAIL {e.nome}: {falha}")
    for nota in e.notas:
        print(f"  {nota}")


def detalhe_w15(e):
    if e.ok:
        extra = [n for n in e.notas if n.startswith("taxa:")]
        texto = "; ".join([f"{e.passou} verificacoes"] + extra)
    else:
        texto = "; ".join(e.falhas[:3])
        if len(e.falhas) > 3:
            texto += f" (+{len(e.falhas) - 3} falhas)"
    if e.tokens:
        # so no detalhe: os tokens ja foram gravados no gate de cada chamada (nao somar 2 vezes)
        texto += "; tokens na evidencia (nao somados): " + ", ".join(
            f"{k}={v}" for k, v in sorted(e.tokens.items()))
    return texto[:500]


def main(argv=None):
    p = argparse.ArgumentParser(description="Prova o que o time Native AI construiu.")
    p.add_argument("--raiz", required=True, help="raiz do repo (onde ficam as saidas e as skills)")
    p.add_argument("--fonte", help="pasta do time.json (padrao: a raiz; na Casa, times/<nome>)")
    p.add_argument("--tarefa", help="pasta da tarefa (operacao/tasks/TASK-N): confere o criterio "
                                    "congelado (C6) e a cobertura da mutacao (C7a)")
    p.add_argument("--mutacao", help="lote.json de mutantes (exige --tarefa)")
    p.add_argument("--fumaca", help="comando de fumaca (PASS se exit 0)")
    p.add_argument("--carga", help="evidencia.json da carga do subagente (C2)")
    p.add_argument("--w15", action="store_true", help="grava 1 linha por etapa no W15")
    p.add_argument("--data", help="AAAA-MM-DD para o W15 (padrao: hoje)")
    p.add_argument("--unidade", default="native-ai", help="unidade gravada no W15")
    p.add_argument("--timeout", type=int, default=120, help="segundos por comando de mutacao")
    p.add_argument("--timeout-fumaca", type=int, default=600)
    args = p.parse_args(argv)

    raiz = Path(args.raiz).resolve()
    if not raiz.is_dir():
        print(f"provar: raiz {args.raiz} nao e uma pasta", file=sys.stderr)
        return 2
    if trava_lote.fonte_aninhada(raiz):
        print(f"provar: {raiz} e a fonte do time dentro de outro repositorio (sem .git propria); "
              "la nao ha .claude/ (C13). Rode o provar na casa ou numa copia com .git",
              file=sys.stderr)
        return 2
    if args.data:
        try:
            datetime.date.fromisoformat(args.data)
        except ValueError:
            print(f"provar: --data invalida: {args.data!r}", file=sys.stderr)
            return 2

    if args.mutacao and not args.tarefa:
        print("provar: --mutacao exige --tarefa (cada item do criterio assinado precisa de "
              "mutante PEGOU, C7a)", file=sys.stderr)
        return 2

    fonte = None
    if args.fonte:
        bruta = Path(args.fonte)
        fonte = (bruta if bruta.is_absolute() else raiz / bruta).resolve()
        if not fonte.is_dir():
            print(f"provar: --fonte {args.fonte} nao e uma pasta (relativo resolve contra a raiz)",
                  file=sys.stderr)
            return 2
        try:
            fonte.relative_to(raiz)
        except ValueError:
            print(f"provar: --fonte {args.fonte} fica fora da raiz {raiz}", file=sys.stderr)
            return 2
        if fonte == raiz:
            fonte = None

    etapas = [etapa_estatica(raiz, fonte), etapa_paridade(raiz, fonte), etapa_contexto(raiz, fonte)]
    ids = None
    if args.tarefa:
        e_crit, ids = etapa_criterio(raiz, args.tarefa)
        etapas.append(e_crit)
    if args.mutacao:
        etapas.append(etapa_mutacao(raiz, args.mutacao, timeout=args.timeout, ids=ids))
    if args.carga:
        etapas.append(etapa_carga(raiz, args.carga, tarefa=args.tarefa))
    if args.fumaca:
        etapas.append(etapa_fumaca(raiz, args.fumaca, timeout=args.timeout_fumaca))

    for e in etapas:
        imprimir(e)
        if args.w15:
            w15.registrar(raiz, f"provar:{e.nome}", "acerto" if e.ok else "erro", args.unidade,
                          detalhe_w15(e), data=args.data, tarefa=args.tarefa)
    falhas = [e.nome for e in etapas if not e.ok]
    print(f"RESULTADO: {'PASS' if not falhas else 'FAIL'} "
          f"({len(etapas) - len(falhas)}/{len(etapas)} etapas)"
          + (f"; falharam: {', '.join(falhas)}" if falhas else ""))
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
