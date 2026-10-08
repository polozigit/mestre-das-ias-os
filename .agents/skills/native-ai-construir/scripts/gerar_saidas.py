#!/usr/bin/env python3
"""gerar_saidas.py: le <raiz>/time.json e gera as saidas de cada plataforma.

Uso:
    python3 gerar_saidas.py --raiz <raiz do repo> [--check]

Gera, a partir de time.json (fonte unica) e dos arquivos de instrucoes:
    <raiz>/.claude/agents/<name>.md        subagente do Claude Code
    <raiz>/.codex/agents/<name>.toml       subagente do Codex
    <raiz>/trechos/codex-config.toml       blocos [agents.<name>] (proposta, o dono cola)
    <raiz>/trechos/AGENTS.md               regra dos 3 caminhos + tabela (proposta)
    <raiz>/.claude/skills/<skill>          link simbolico para ../../<dir da skill>

Nunca escreve em AGENTS.md, CLAUDE.md, .claude/settings*.json nem .codex/config.toml:
esses caminhos sao sempre humanos (condicao C3), so saem como proposta em trechos/.

Sem --check, so escreve onde a trava deixa (C10): le o .git/HEAD (arquivo, sem
subprocess) e sai 2 sem escrever nada se a raiz estiver na branch principal com o sistema
ja no ar (sistemas/empresa-os/.vercel/project.json), com HEAD solto ou fora de um
repositorio git. Escrever na principal ja instalaria o agente. Na Casa ainda sem o
sistema publicado a main e a branch de trabalho (mesmo sinal da guarda.py) e o gerador
escreve nela; a fonte aninhada (C13) continua recusando a principal.

Fonte aninhada (C13): quando a raiz e a fonte do time guardada dentro de outro repo
(sem .git propria, com um repositorio acima, como no Polozi-Stack), nada vai pra
.claude/: o Claude Code descobre .claude/skills e .claude/agents aninhados e o time
entraria no catalogo do repo de fora. La saem so .codex/agents e trechos/, e os
.claude/ gerados que sobraram contam como orfao. O .claude/ so nasce na casa.

--check nao escreve nada: sai 1 se algum gerado diferir do que o time.json produziria
(drift), 0 se tudo bate. Sem --check o script e idempotente: so reescreve o que mudou.

Saida: 0 ok, 1 drift (so com --check), 2 erro de validacao, de uso ou branch principal.

So stdlib (Python 3.11+), sem rede.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import tomllib
from pathlib import Path

sys.dont_write_bytecode = True
# cache de bytecode numa pasta vazia: o __pycache__/ ao lado nunca e lido (C3)
_PYC_VAZIO = tempfile.TemporaryDirectory(prefix="native-ai-pyc-")
sys.pycache_prefix = _PYC_VAZIO.name
sys.path.insert(0, str(Path(__file__).resolve().parent))
import trava_lote  # noqa: E402  (so leitura de .git/HEAD; sem subprocess)

MARCA_MD = "<!-- GERADO de time.json; nao edite a mao -->"
MARCA_TOML = "# GERADO de time.json - nao edite a mao"

NOME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MODELO_CLAUDE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
TOOL_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")

DESCRICAO_MAX = 50           # parte curta: o que o agente faz
DESCRICAO_GERADA_MAX = 300   # descricao + ". " + quando (gatilho); abaixo do teto de 450 do catalogo
GATILHO_INICIO = "Use "      # o quando vira o gatilho da description: "Use so quando ..."
EFFORT_CLAUDE = {"low", "medium", "high", "xhigh", "max"}
EFFORT_CODEX = {"minimal", "low", "medium", "high", "xhigh"}
SANDBOX_VALIDOS = {"read-only", "workspace-write"}

# C1: o time nunca ganha shell, delegacao nem MCP. O verbo perigoso sai inteiro.
TOOLS_PROIBIDAS = {"Bash", "Agent", "Task"}
PREFIXO_MCP = "mcp__"
TOOLS_ESCRITA = {"Write", "Edit", "MultiEdit", "NotebookEdit"}

# C9: caminhos em que o "caminho 2" (mudanca pequena) nao vale.
PROTEGIDOS = [
    "`.claude/agents/**`",
    "`.codex/agents/**`",
    "`.agents/skills/**`",
    "hooks (qualquer um)",
    "`AGENTS.md`",
]

CHAVES_TOPO = {"versao", "diretoria", "origem", "agentes", "skills"}
CHAVES_AGENTE = {"name", "descricao", "quando", "instrucoes", "claude", "codex"}
CHAVES_CLAUDE = {"model", "effort", "tools"}
CHAVES_CODEX = {"model_reasoning_effort", "sandbox_mode", "model"}
CHAVES_SKILL = {"name", "dir", "quando", "entrada"}


class Erro(Exception):
    """Erro de validacao ou de uso. Carrega uma ou mais mensagens."""

    def __init__(self, mensagens):
        if isinstance(mensagens, str):
            mensagens = [mensagens]
        super().__init__("; ".join(mensagens))
        self.mensagens = list(mensagens)


# ---------------------------------------------------------------- leitura

def ler_texto(caminho: Path) -> str:
    """Le UTF-8 (com ou sem BOM), normalizando fim de linha para \\n."""
    return caminho.read_text(encoding="utf-8-sig")


def carregar_time(raiz: Path) -> dict:
    arq = raiz / "time.json"
    if not arq.is_file():
        raise Erro(f"time.json nao encontrado em {raiz}")
    try:
        dados = json.loads(ler_texto(arq))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise Erro(f"time.json invalido: {exc}")
    if not isinstance(dados, dict):
        raise Erro("time.json invalido: a raiz precisa ser um objeto")
    return dados


def caminho_relativo_seguro(raiz: Path, rel) -> Path | None:
    """Devolve raiz/rel se rel for relativo, sem '..' e dentro da raiz; senao None."""
    if not isinstance(rel, str) or not rel.strip():
        return None
    if rel.startswith(("/", "\\")) or re.match(r"^[A-Za-z]:", rel):
        return None
    partes = re.split(r"[\\/]", rel)
    if any(p in ("..", "") for p in partes):
        return None
    alvo = raiz / Path(*partes)
    try:
        alvo.resolve().relative_to(raiz.resolve())
    except ValueError:
        return None
    return alvo


# -------------------------------------------------------------- validacao

def _texto_simples(v) -> bool:
    return isinstance(v, str) and v.strip() != "" and "\n" not in v and "\r" not in v


def validar(t: dict, raiz: Path) -> list[str]:
    erros: list[str] = []

    desconhecidas = set(t) - CHAVES_TOPO
    if desconhecidas:
        erros.append(f"time.json: chave desconhecida {sorted(desconhecidas)}")

    versao = t.get("versao")
    if not isinstance(versao, str) or not versao.startswith("1."):
        erros.append(f"time.json: versao deve ser '1.x', veio {versao!r}")
    if not _texto_simples(t.get("origem")):
        erros.append("time.json: origem ausente (ex.: 'polozi')")

    diretoria = t.get("diretoria")
    prefixo = None
    if isinstance(diretoria, str) and NOME_RE.match(diretoria):
        prefixo = diretoria + "-"
    else:
        erros.append(f"time.json: diretoria {diretoria!r} fora do padrao {NOME_RE.pattern}")

    agentes = t.get("agentes")
    if not isinstance(agentes, list) or not agentes:
        erros.append("time.json: agentes deve ser uma lista com pelo menos 1 item")
        agentes = []

    vistos: set[str] = set()
    for i, ag in enumerate(agentes):
        if not isinstance(ag, dict):
            erros.append(f"agentes[{i}]: deve ser um objeto")
            continue
        nome = ag.get("name")
        rot = f"agente {nome!r}" if isinstance(nome, str) else f"agentes[{i}]"
        extra = set(ag) - CHAVES_AGENTE
        if extra:
            erros.append(f"{rot}: chave desconhecida {sorted(extra)}")

        if not isinstance(nome, str) or not NOME_RE.match(nome):
            erros.append(f"{rot}: name fora do padrao {NOME_RE.pattern}")
        else:
            if prefixo and not nome.startswith(prefixo):
                erros.append(f"{rot}: name deve comecar com '{prefixo}'")
            if nome in vistos:
                erros.append(f"{rot}: name duplicado")
            vistos.add(nome)

        desc = ag.get("descricao")
        if not _texto_simples(desc):
            erros.append(f"{rot}: descricao ausente ou com quebra de linha")
        elif len(desc) > DESCRICAO_MAX:
            erros.append(f"{rot}: descricao com {len(desc)} caracteres (maximo {DESCRICAO_MAX})")

        quando = ag.get("quando")
        if not _texto_simples(quando):
            erros.append(f"{rot}: quando ausente (uma frase curta, sem quebra de linha)")
        elif not quando.startswith(GATILHO_INICIO):
            erros.append(f"{rot}: quando precisa comecar com {GATILHO_INICIO!r} "
                         "(vira o gatilho da description, ex.: 'Use so quando a skill X chamar no passo N')")
        elif _texto_simples(desc) and len(descricao_gerada(ag)) > DESCRICAO_GERADA_MAX:
            erros.append(f"{rot}: descricao + quando com {len(descricao_gerada(ag))} caracteres "
                         f"(maximo {DESCRICAO_GERADA_MAX})")

        rel = ag.get("instrucoes")
        arq = caminho_relativo_seguro(raiz, rel)
        if arq is None:
            erros.append(f"{rot}: instrucoes {rel!r} invalido (precisa ser relativo e ficar dentro da raiz)")
        elif not arq.is_file():
            erros.append(f"{rot}: arquivo de instrucoes {rel!r} nao existe")
        else:
            try:
                if not ler_texto(arq).strip():
                    erros.append(f"{rot}: arquivo de instrucoes {rel!r} esta vazio")
            except UnicodeDecodeError:
                erros.append(f"{rot}: arquivo de instrucoes {rel!r} nao e UTF-8")

        claude = ag.get("claude")
        codex = ag.get("codex")
        tools: list = []
        sandbox = None
        if not isinstance(claude, dict):
            erros.append(f"{rot}: bloco claude ausente")
        else:
            extra = set(claude) - CHAVES_CLAUDE
            if extra:
                erros.append(f"{rot}: claude com chave desconhecida {sorted(extra)}")
            if not isinstance(claude.get("model"), str) or not MODELO_CLAUDE_RE.match(claude["model"]):
                erros.append(f"{rot}: claude.model invalido {claude.get('model')!r}")
            if claude.get("effort") not in EFFORT_CLAUDE:
                erros.append(f"{rot}: claude.effort {claude.get('effort')!r} invalido (use {sorted(EFFORT_CLAUDE)})")
            tools = claude.get("tools")
            if not isinstance(tools, list) or not tools:
                erros.append(f"{rot}: claude.tools deve ser uma lista com pelo menos 1 ferramenta")
                tools = []
            else:
                if len(set(tools)) != len(tools):
                    erros.append(f"{rot}: claude.tools tem item repetido")
                for tool in tools:
                    if not isinstance(tool, str) or not TOOL_RE.match(tool):
                        erros.append(f"{rot}: tool invalida {tool!r}")
                    elif tool in TOOLS_PROIBIDAS or tool.startswith(PREFIXO_MCP):
                        erros.append(
                            f"{rot}: tool {tool!r} proibida (C1: o time nao usa Bash, Agent/Task nem MCP)"
                        )

        if not isinstance(codex, dict):
            erros.append(f"{rot}: bloco codex ausente")
        else:
            extra = set(codex) - CHAVES_CODEX
            if extra:
                erros.append(f"{rot}: codex com chave desconhecida {sorted(extra)}")
            if codex.get("model_reasoning_effort") not in EFFORT_CODEX:
                erros.append(
                    f"{rot}: codex.model_reasoning_effort {codex.get('model_reasoning_effort')!r} invalido "
                    f"(use {sorted(EFFORT_CODEX)})"
                )
            sandbox = codex.get("sandbox_mode")
            if sandbox not in SANDBOX_VALIDOS:
                erros.append(f"{rot}: codex.sandbox_mode {sandbox!r} invalido (use {sorted(SANDBOX_VALIDOS)})")
                sandbox = None
            if "model" in codex and not _texto_simples(codex["model"]):
                erros.append(f"{rot}: codex.model invalido {codex['model']!r}")

        # C1: nenhum lado mais aberto que o desenho
        if tools and sandbox:
            escreve = bool(TOOLS_ESCRITA & set(t_ for t_ in tools if isinstance(t_, str)))
            if escreve and sandbox == "read-only":
                tem = sorted(TOOLS_ESCRITA & set(tools))
                erros.append(
                    f"{rot}: claude.tools tem {', '.join(tem)} mas codex.sandbox_mode e 'read-only' "
                    "(nenhum lado pode ser mais aberto que o outro)"
                )
            if not escreve and sandbox == "workspace-write":
                erros.append(
                    f"{rot}: codex.sandbox_mode e 'workspace-write' mas claude.tools nao tem Write/Edit "
                    "(nenhum lado pode ser mais aberto que o outro)"
                )

    skills = t.get("skills")
    if not isinstance(skills, list) or not skills:
        erros.append("time.json: skills deve ser uma lista com pelo menos 1 item")
        skills = []
    vistas: set[str] = set()
    for i, sk in enumerate(skills):
        if not isinstance(sk, dict):
            erros.append(f"skills[{i}]: deve ser um objeto")
            continue
        nome = sk.get("name")
        rot = f"skill {nome!r}" if isinstance(nome, str) else f"skills[{i}]"
        extra = set(sk) - CHAVES_SKILL
        if extra:
            erros.append(f"{rot}: chave desconhecida {sorted(extra)}")
        if not isinstance(nome, str) or not NOME_RE.match(nome):
            erros.append(f"{rot}: name fora do padrao {NOME_RE.pattern}")
        else:
            if prefixo and not nome.startswith(prefixo):
                erros.append(f"{rot}: name deve comecar com '{prefixo}'")
            if nome in vistas:
                erros.append(f"{rot}: name duplicado")
            vistas.add(nome)
        rel = sk.get("dir")
        pasta = caminho_relativo_seguro(raiz, rel)
        if pasta is None:
            erros.append(f"{rot}: dir {rel!r} invalido (precisa ser relativo e ficar dentro da raiz)")
        else:
            if isinstance(nome, str) and pasta.name != nome:
                erros.append(f"{rot}: a pasta do dir ({pasta.name!r}) precisa ter o mesmo nome da skill")
            if not pasta.is_dir():
                erros.append(f"{rot}: pasta {rel!r} nao existe")
        if "quando" in sk and not _texto_simples(sk["quando"]):
            erros.append(f"{rot}: quando invalido")
    if sum(1 for sk in skills if isinstance(sk, dict) and sk.get("entrada") is True) > 1:
        erros.append("skills: so uma skill pode ter entrada=true")

    return erros


# ---------------------------------------------------------------- geracao

_YAML_PLANO = re.compile(r"^\w[\w ,.()/+-]*$")
_YAML_RESERVADAS = {"true", "false", "yes", "no", "on", "off", "null", "none", "~", "y", "n"}


def yaml_escalar(s: str) -> str:
    """Texto puro quando e seguro em YAML; senao entre aspas (JSON e YAML valido)."""
    seguro = (
        _YAML_PLANO.match(s)
        and s == s.strip()
        and s.lower() not in _YAML_RESERVADAS
        and not re.fullmatch(r"[-+0-9.eE_ ]+", s)
    )
    return s if seguro else json.dumps(s, ensure_ascii=False)


def _tem_controle(s: str) -> bool:
    return any((ord(c) < 0x20 and c not in "\n\t") or ord(c) == 0x7F for c in s)


def toml_texto(s: str) -> str:
    """String TOML de uma linha (basica, com escapes)."""
    return json.dumps(s, ensure_ascii=False).replace("\x7f", "\\u007f")


def toml_multilinha(texto: str) -> str:
    """String TOML multilinha segura. Literal ('''), sem escapes, quando possivel."""
    corpo = texto.rstrip("\n") + "\n"
    if "'''" not in corpo and not _tem_controle(corpo):
        return "'''\n" + corpo + "'''"
    partes = []
    for c in corpo:
        if c == "\\":
            partes.append("\\\\")
        elif c in "\n\t":
            partes.append(c)
        elif ord(c) < 0x20 or ord(c) == 0x7F:
            partes.append(f"\\u{ord(c):04x}")
        else:
            partes.append(c)
    seguro = "".join(partes).replace('"""', '""\\"')
    return '"""\n' + seguro + '"""'


def descricao_gerada(ag: dict) -> str:
    """description das 2 plataformas: o que faz + gatilho (sem gatilho, atrai pedido errado)."""
    return f"{ag['descricao']}. {ag['quando']}"


def gerar_md_claude(ag: dict, instrucoes: str) -> str:
    c = ag["claude"]
    cab = [
        "---",
        f"name: {ag['name']}",
        f"description: {yaml_escalar(descricao_gerada(ag))}",
        f"model: {c['model']}",
        f"effort: {c['effort']}",
        f"tools: {', '.join(c['tools'])}",
        "---",
    ]
    return "\n".join(cab) + "\n" + MARCA_MD + "\n\n" + instrucoes.rstrip("\n") + "\n"


def gerar_toml_codex(ag: dict, instrucoes: str) -> str:
    x = ag["codex"]
    linhas = [
        MARCA_TOML,
        f"name = {toml_texto(ag['name'])}",
        f"description = {toml_texto(descricao_gerada(ag))}",
    ]
    if x.get("model"):
        linhas.append(f"model = {toml_texto(x['model'])}")
    linhas += [
        f"model_reasoning_effort = {toml_texto(x['model_reasoning_effort'])}",
        f"sandbox_mode = {toml_texto(x['sandbox_mode'])}",
        f"developer_instructions = {toml_multilinha(instrucoes)}",
    ]
    texto = "\n".join(linhas) + "\n"
    # prova de ida e volta: o que o Codex vai ler e exatamente o que o time.json mandou
    try:
        lido = tomllib.loads(texto)
    except tomllib.TOMLDecodeError as exc:
        raise Erro(f"agente {ag['name']!r}: toml gerado nao parseia ({exc})")
    esperado = instrucoes.rstrip("\n") + "\n"
    if lido.get("developer_instructions") != esperado or lido.get("name") != ag["name"]:
        raise Erro(f"agente {ag['name']!r}: toml gerado nao reproduz as instrucoes (ida e volta falhou)")
    return texto


def gerar_trecho_config(t: dict) -> str:
    linhas = [
        MARCA_TOML,
        "# Proposta para o .codex/config.toml. O dono revisa e cola; o script nunca escreve nele.",
        "# config_file e relativo a pasta .codex/.",
        f"# AGENTES:INICIO ({t['diretoria']})",
    ]
    for ag in t["agentes"]:
        linhas += [
            f"[agents.{ag['name']}]",
            f"config_file = {toml_texto('agents/' + ag['name'] + '.toml')}",
            f"description = {toml_texto(descricao_gerada(ag))}",
            "",
        ]
    linhas.append(f"# AGENTES:FIM ({t['diretoria']})")
    texto = "\n".join(linhas) + "\n"
    try:
        tomllib.loads(texto)
    except tomllib.TOMLDecodeError as exc:
        raise Erro(f"trechos/codex-config.toml gerado nao parseia ({exc})")
    return texto


def _celula(s: str) -> str:
    return s.replace("|", "\\|")


def skill_de_entrada(t: dict) -> dict:
    for sk in t["skills"]:
        if sk.get("entrada") is True:
            return sk
    return t["skills"][0]


def gerar_trecho_agents_md(t: dict) -> str:
    entrada = skill_de_entrada(t)["name"]
    linhas = [
        MARCA_MD,
        "",
        f"## Time {t['diretoria']}",
        "",
        "Este time cria e melhora agentes, skills e fluxos desta casa. "
        "Antes de agir, escolha um dos 3 caminhos:",
        "",
        "1. Pergunta ou consulta: responda direto.",
        "2. Mudança pequena em algo que já existe (um texto, um número, um ajuste simples): "
        "mostre o desenho curto e espere o sim do dono. "
        "Este caminho não vale para os arquivos protegidos listados abaixo.",
        f"3. Coisa nova (agente, skill, fluxo ou sistema) ou mudança em arquivo protegido: "
        f"chame a skill `{entrada}`. Ela desenha, constrói, prova e pede o OK do dono.",
        "",
        "Arquivos protegidos: qualquer mudança neles vai pelo caminho 3, com a prova e a revisão "
        "do avaliador do time, e nunca pelo caminho 2.",
        "",
    ]
    linhas += [f"- {p}" for p in PROTEGIDOS]
    linhas += ["", "| Nome | Quando chamar |", "|---|---|"]
    for ag in t["agentes"]:
        linhas.append(f"| `{ag['name']}` | {_celula(ag['quando'])} |")
    for sk in t["skills"]:
        quando = sk.get("quando") or (
            "Ponto de entrada do time: chame pelo nome" if sk is skill_de_entrada(t) else "Chame pelo nome"
        )
        linhas.append(f"| `{sk['name']}` | {_celula(quando)} |")
    return "\n".join(linhas) + "\n"


def gerar(t: dict, raiz: Path) -> dict[str, tuple[str, str]]:
    """Mapa caminho relativo (posix) -> ('arquivo', texto) ou ('link', alvo).

    Na fonte aninhada (C13) nada vai pra .claude/."""
    com_claude = not trava_lote.fonte_aninhada(raiz)
    saidas: dict[str, tuple[str, str]] = {}
    for ag in t["agentes"]:
        instr = ler_texto(caminho_relativo_seguro(raiz, ag["instrucoes"]))
        if com_claude:
            saidas[f".claude/agents/{ag['name']}.md"] = ("arquivo", gerar_md_claude(ag, instr))
        saidas[f".codex/agents/{ag['name']}.toml"] = ("arquivo", gerar_toml_codex(ag, instr))
    saidas["trechos/codex-config.toml"] = ("arquivo", gerar_trecho_config(t))
    saidas["trechos/AGENTS.md"] = ("arquivo", gerar_trecho_agents_md(t))
    if com_claude:
        for sk in t["skills"]:
            saidas[f".claude/skills/{sk['name']}"] = ("link", "../../" + sk["dir"].replace("\\", "/"))
    return saidas


# ------------------------------------------------------ comparacao e escrita

def _orfaos(t: dict, raiz: Path) -> list[Path]:
    """Gerados antigos (com marca) de agentes que sairam do time.json. Na fonte aninhada
    (C13), todo .claude/ gerado do time e orfao: agentes com marca e links das skills."""
    aninhada = trava_lote.fonte_aninhada(raiz)
    atuais = {ag["name"] for ag in t["agentes"]}
    atuais_md = set() if aninhada else atuais
    prefixo = t["diretoria"] + "-"
    achados: list[Path] = []
    pasta_md = raiz / ".claude/agents"
    if pasta_md.is_dir():
        for p in sorted(pasta_md.glob("*.md")):
            if p.stem.startswith(prefixo) and p.stem not in atuais_md and p.is_file() and not p.is_symlink():
                try:
                    if MARCA_MD in ler_texto(p):
                        achados.append(p)
                except UnicodeDecodeError:
                    pass
    pasta_toml = raiz / ".codex/agents"
    if pasta_toml.is_dir():
        for p in sorted(pasta_toml.glob("*.toml")):
            if p.stem.startswith(prefixo) and p.stem not in atuais and p.is_file() and not p.is_symlink():
                try:
                    if ler_texto(p).split("\n", 1)[0] == MARCA_TOML:
                        achados.append(p)
                except UnicodeDecodeError:
                    pass
    if aninhada:
        for sk in t["skills"]:
            link = raiz / ".claude/skills" / sk["name"]
            if link.is_symlink():
                achados.append(link)
    return achados


def comparar(t: dict, saidas: dict, raiz: Path):
    """Lista de (rel, tipo, motivo). tipo: novo | diferente | conflito | orfao."""
    dif = []
    raiz_real = raiz.resolve()
    for rel, (tipo, valor) in saidas.items():
        p = raiz / rel
        try:
            p.parent.resolve().relative_to(raiz_real)
        except ValueError:
            dif.append((rel, "conflito", "a pasta de destino sai da raiz (link simbolico no caminho)"))
            continue
        if tipo == "arquivo":
            if p.is_symlink():
                dif.append((rel, "conflito", "destino e um link simbolico; remova antes de gerar"))
            elif p.is_dir():
                dif.append((rel, "conflito", "destino e uma pasta"))
            elif not p.exists():
                dif.append((rel, "novo", "nao existe"))
            elif p.read_bytes() != valor.encode("utf-8"):
                dif.append((rel, "diferente", "conteudo difere do time.json"))
        else:
            if p.is_symlink():
                if os.readlink(p) != valor:
                    dif.append((rel, "diferente", f"link aponta para {os.readlink(p)!r}, esperado {valor!r}"))
            elif p.exists():
                dif.append((rel, "conflito", "existe e nao e link simbolico; nao sobrescrevo"))
            else:
                dif.append((rel, "novo", "link nao existe"))
    for p in _orfaos(t, raiz):
        motivo = ("fonte aninhada em outro repo: .claude/ so nasce na casa (C13)"
                  if trava_lote.fonte_aninhada(raiz) and p.relative_to(raiz).as_posix().startswith(".claude/")
                  else "gerado de um agente que saiu do time.json")
        dif.append((p.relative_to(raiz).as_posix(), "orfao", motivo))
    return dif


def aplicar(saidas: dict, dif: list, raiz: Path) -> tuple[int, int]:
    """Escreve o que mudou. Devolve (escritos, removidos)."""
    escritos = removidos = 0
    for rel, tipo, _ in dif:
        p = raiz / rel
        if tipo == "orfao":
            p.unlink()
            removidos += 1
            continue
        kind, valor = saidas[rel]
        p.parent.mkdir(parents=True, exist_ok=True)
        if kind == "arquivo":
            p.write_bytes(valor.encode("utf-8"))
        else:
            if p.is_symlink():
                p.unlink()
            try:
                os.symlink(valor, p)
            except OSError as exc:
                raise Erro(f"nao consegui criar o link {rel}: {exc}")
        escritos += 1
    return escritos, removidos


# -------------------------------------------------------------------- CLI

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Gera .claude/agents, .codex/agents, trechos/ e links de skill a partir de time.json."
    )
    ap.add_argument("--raiz", required=True, help="raiz do repo (onde esta o time.json)")
    ap.add_argument("--check", action="store_true", help="nao escreve; sai 1 se algum gerado estiver diferente")
    args = ap.parse_args(argv)
    raiz = Path(args.raiz)

    try:
        if not raiz.is_dir():
            raise Erro(f"raiz {raiz} nao e uma pasta")
        t = carregar_time(raiz)
        erros = validar(t, raiz)
        if erros:
            raise Erro(erros)
        saidas = gerar(t, raiz)
        dif = comparar(t, saidas, raiz)

        if args.check:
            for rel, tipo, motivo in dif:
                print(f"DRIFT {rel} [{tipo}]: {motivo}")
            if dif:
                print(f"gerar_saidas --check: {len(dif)} diferenca(s). Rode sem --check para regerar.")
                return 1
            print(f"gerar_saidas --check: ok, {len(saidas)} saida(s) iguais ao time.json")
            return 0

        motivo_branch = trava_lote.recusa_na_principal(raiz)
        if motivo_branch:
            raise Erro(f"nao escrevo: {motivo_branch} (C10)")
        conflitos = [(rel, motivo) for rel, tipo, motivo in dif if tipo == "conflito"]
        if conflitos:
            raise Erro([f"{rel}: {motivo}" for rel, motivo in conflitos])
        escritos, removidos = aplicar(saidas, dif, raiz)
        sem_mudanca = len(saidas) - sum(1 for _, tipo, _ in dif if tipo != "orfao")
        print(f"gerar_saidas: {escritos} escritos, {sem_mudanca} sem mudanca, {removidos} removidos")
        return 0
    except Erro as exc:
        for msg in exc.mensagens:
            print(f"ERRO: {msg}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
