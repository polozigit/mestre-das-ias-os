#!/usr/bin/env python3
"""Espelha o catálogo de IA da Casa (agentes, skills e workflows) no banco da empresa.

O repositório é a fonte; o banco é espelho (public.agentes + public.artefatos_ia, migration
0022 do sistema). `montar_catalogo(casa)` COLETA o payload da RPC `sincronizar_catalogo_ia`
(sem rede); `lotes` o parte em pedaços de até TETO_LOTE bytes; `enviar` manda os lotes em ordem
com a chave de serviço de `<casa>/credenciais/.env`; `main` é a linha de comando.

Lê: `.codex/agents/*.toml` (instalados), as fontes dos plugins e times que o `instalar_time.py`
acha (disponíveis), skills (`SKILL.md` + scripts), workflows do sistema
(`sistemas/*/.github/workflows/*.yml`) e as linhas de `capacidades/AUTOMACOES.md`. Só o que é da
Casa: plugin do cache do Codex (que é da máquina) entra só se a Casa o declarou no marketplace
local ou o marcou `ativo` no PLUGINS.md (`nomes_da_casa`).

Segredo nunca: arquivo de credencial dentro do catálogo ou conteúdo que bate o padrão dos
hooks da Casa aborta TUDO (ErroSync, código 3) mostrando só o caminho. Exceção: plugin de
terceiro (cache do Codex, nome sem `polozi-`) não está sob controle do aluno; nele só a skill
ou o agente afetado fica de fora, com AVISO (só o caminho) no stderr, e o resto segue. Pastas
de teste não são lidas.

Códigos de saída previstos: 0 ok; 2 sem credencial do banco; 3 segredo ou arquivo de
credencial; 4 erro de rede/RPC.

A chave de serviço nunca é impressa, nem em mensagem de erro: o payload só vai para
`{URL}/rest/v1/rpc/sincronizar_catalogo_ia`.
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import instalar_time as it  # noqa: E402

try:  # Python 3.11+
    import tomllib as _tomllib  # type: ignore[import-not-found]
except ModuleNotFoundError:  # 3.10: leitor mínimo abaixo
    _tomllib = None

# Regra de segredo: UMA fonte, o PADRAO_SEGREDO de <casa>/.githooks/regras-segredo.sh (grep -E dos hooks da
# Casa; vale igual em Python re). Esta é a cópia embutida, usada quando a Casa não tem o arquivo ou ele está
# ilegível; um teste confere que é idêntica à do modelo da Casa e ao c_segredo da RPC 0022. Mexeu? Mexa nos três.
PADRAO_SEGREDO = r"((^|[^A-Za-z0-9])sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9]|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY|sk_live_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk-(proj|ant|svcacct|admin)-[A-Za-z0-9_-]{20,})"
RE_SEGREDO = re.compile(PADRAO_SEGREDO)
_REGRA_DA_CASA = re.compile(r"^PADRAO_SEGREDO='([^']*)'[ \t\r]*$", re.M)
_regra_ativa = RE_SEGREDO  # trocada por montar_catalogo(casa) pela regra do arquivo da Casa, se houver


def carregar_regra_segredo(casa: Path) -> re.Pattern:
    """Regra de segredo da Casa: PADRAO_SEGREDO='...' de .githooks/regras-segredo.sh. Sem o arquivo, a cópia
    embutida; arquivo ilegível ou padrão inválido, a cópia embutida com AVISO no stderr (nunca o trecho)."""
    arquivo = casa / ".githooks" / "regras-segredo.sh"
    if not arquivo.is_file():
        return RE_SEGREDO
    try:
        achado = _REGRA_DA_CASA.search(arquivo.read_text(encoding="utf-8-sig"))
        if achado is None:
            raise ValueError("sem PADRAO_SEGREDO")
        return re.compile(achado.group(1))
    except (OSError, UnicodeError, ValueError, re.error) as erro:
        print(f"AVISO: .githooks/regras-segredo.sh da Casa ilegível ({type(erro).__name__}); "
              "usando a regra de segredo embutida.", file=sys.stderr)
        return RE_SEGREDO


RE_NOME_ARTEFATO = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
RE_NOME_AGENTE = re.compile(r"^[a-z0-9-]+$")
TETO_ARQUIVO = 262144
TETO_LOTE = 4 * 1024 * 1024  # bytes do JSON de cada chamada da RPC
TETO_RESUMO = 140
TETO_CURTA = 50
# assets = modelos e binários da skill, não o que ela faz (e podem trazer uma Casa inteira de molde).
PASTAS_IGNORADAS = frozenset({"tests", "fixtures", "__pycache__", "node_modules", "dist", ".git", "assets", "venv", ".venv"})
# Lockfiles são gerados e pesados; não ajudam a entender a skill.
ARQUIVOS_IGNORADOS = frozenset({"package-lock.json"})
SUFIXOS_IGNORADOS = (".lock",)
SUFIXOS_CREDENCIAL = (".pem", ".key", ".p12", ".pfx", ".env", ".dump", ".pgdump")
LINGUAGEM = {
    ".py": "python", ".sh": "bash", ".mjs": "javascript", ".js": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".sql": "sql", ".toml": "toml", ".yml": "yaml",
    ".yaml": "yaml", ".json": "json", ".md": "markdown",
}
ESFORCOS = {"low", "medium", "high", "xhigh"}
SANDBOXES = {"read-only", "workspace-write"}
TIERS = ("terra", "sol", "luna")
TIME_NUCLEO = "sistema"


class ErroSync(Exception):
    def __init__(self, mensagem: str, codigo: int, rotulo: str | None = None) -> None:
        super().__init__(mensagem)
        self.codigo = codigo
        self.rotulo = rotulo  # caminho do arquivo que causou o erro (nunca o trecho)


# ---------------------------------------------------------------- leitura segura

def e_credencial(caminho: Path) -> bool:
    """Alinhada ao caminho_proibido de .githooks/regras-segredo.sh (minúsculas): .env, .env.*, *.env, *.pem,
    *.key, *.p12, *.pfx, id_rsa*, id_ed25519* (menos a chave pública *.pub), *.dump, *.pgdump e operacao/backups/.
    Mais estrita que a Casa: tudo sob credenciais/ (até .md) e .env.example, pois skill nunca mora ali."""
    partes = [p.lower() for p in caminho.parts]
    nome = partes[-1] if partes else ""
    if "credenciais" in partes:
        return True
    if any(partes[i:i + 2] == ["operacao", "backups"] for i in range(len(partes) - 1)):
        return True
    if nome.endswith(".pub"):
        return False
    return (
        nome == ".env"
        or nome.startswith(".env.")
        or nome.endswith(SUFIXOS_CREDENCIAL)
        or nome.startswith(("id_rsa", "id_ed25519"))
    )


def ler_bytes_seguro(caminho: Path, rotulo: str) -> bytes:
    """Lê os bytes. Arquivo de credencial aborta ANTES de abrir o arquivo."""
    if e_credencial(caminho):
        raise ErroSync(f"arquivo de credencial dentro do catálogo: {rotulo}. Tire de lá e rode de novo.", 3, rotulo)
    return caminho.read_bytes()


def texto_seguro(dados: bytes, rotulo: str) -> str | None:
    """Texto dos bytes; None = binário (pulado). Segredo = ErroSync(3) só com o caminho."""
    if b"\x00" in dados:  # binário em qualquer posição; o jsonb do Postgres também não guarda \u0000
        return None
    texto = dados.decode("utf-8", errors="replace")
    if _regra_ativa.search(texto):
        raise ErroSync(f"possível segredo em {rotulo}. Nada foi enviado; tire o segredo e rode de novo.", 3, rotulo)
    return texto


def ler_texto(caminho: Path, rotulo: str) -> str | None:
    """Texto do arquivo; None = binário (pulado). Credencial ou segredo = ErroSync(3)."""
    return texto_seguro(ler_bytes_seguro(caminho, rotulo), rotulo)


def sha256_hex(dados: bytes) -> str:
    return hashlib.sha256(dados).hexdigest()


def linguagem(caminho: Path) -> str:
    return LINGUAGEM.get(caminho.suffix.lower(), "texto")


def resumir(texto: str, teto: int) -> str:
    limpo = " ".join((texto or "").split())
    if len(limpo) <= teto:
        return limpo
    corte = limpo[: teto - 1]
    if " " in corte:
        corte = corte[: corte.rfind(" ")]
    return corte.rstrip(" ,.;:") + "…"


def slug(texto: str) -> str:
    base = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:80] or "automacao"


# ---------------------------------------------------------------- formatos

def ler_toml(texto: str) -> dict[str, str]:
    """Só chaves de topo string (o toml de agente do kit é plano)."""
    if _tomllib is not None:
        try:
            dados = _tomllib.loads(texto)
            return {k: v for k, v in dados.items() if isinstance(v, str)}
        except Exception:  # noqa: BLE001 — cai no leitor mínimo
            pass
    dados: dict[str, str] = {}
    for m in re.finditer(r'^([A-Za-z_][\w-]*)\s*=\s*("""(.*?)"""|\'\'\'(.*?)\'\'\'|"((?:[^"\\]|\\.)*)"|\'([^\']*)\')',
                         texto, re.M | re.S):
        chave = m.group(1)
        if m.group(3) is not None:
            dados[chave] = m.group(3).lstrip("\n")
        elif m.group(4) is not None:
            dados[chave] = m.group(4).lstrip("\n")
        elif m.group(5) is not None:
            try:
                dados[chave] = json.loads(f'"{m.group(5)}"')
            except json.JSONDecodeError:
                dados[chave] = m.group(5)
        else:
            dados[chave] = m.group(6)
    return dados


def valor_yaml(bruto: str) -> str:
    """Valor de uma linha do frontmatter. Aspas duplas: desfaz os escapes do YAML (\\" e \\\\ etc.);
    se não parsear, fica o texto de dentro. Aspas simples: '' vira '."""
    v = bruto.strip()
    if len(v) >= 2 and v[0] == v[-1] == '"':
        try:
            resultado = json.loads(v)
            if isinstance(resultado, str):
                return resultado
        except ValueError:
            pass
        return v[1:-1]
    if len(v) >= 2 and v[0] == v[-1] == "'":
        return v[1:-1].replace("''", "'")
    return v.strip('"').strip("'")


def frontmatter_aninhado(texto: str) -> dict[str, str]:
    """Frontmatter YAML simples: `chave: valor` e um nível de aninhamento (`metadata.le`)."""
    m = re.match(r"^---\r?\n(.*?)\r?\n---", texto.lstrip("\ufeff"), re.S)  # BOM e CRLF do Windows
    dados: dict[str, str] = {}
    if not m:
        return dados
    pai = None
    for linha in m.group(1).splitlines():
        if not linha.strip() or linha.lstrip().startswith("#"):
            continue
        recuo = len(linha) - len(linha.lstrip())
        chave, sep, valor = linha.strip().partition(":")
        if not sep:
            continue
        valor = valor_yaml(valor)
        if recuo == 0:
            pai = chave.strip() if not valor else None
            if valor:
                dados[chave.strip()] = valor
        elif pai:
            dados[f"{pai}.{chave.strip()}"] = valor
    return dados


def comentario_inicial(texto: str) -> str:
    """Bloco de comentário do topo do yml (linhas seguidas com `#`, até a primeira linha que não é
    comentário). Linhas do mesmo parágrafo se juntam com espaço; `#` sozinho separa parágrafos
    (`\\n\\n`). Vazio se o arquivo não começa com comentário."""
    paragrafos: list[list[str]] = [[]]
    for linha in texto.lstrip("\ufeff").splitlines():
        if not linha.lstrip().startswith("#"):
            if not paragrafos[0] and len(paragrafos) == 1 and not linha.strip():
                continue  # linhas em branco antes do 1º comentário
            break
        conteudo = linha.lstrip()[1:]
        conteudo = conteudo[1:] if conteudo.startswith(" ") else conteudo
        if conteudo.strip():
            paragrafos[-1].append(conteudo.strip())
        elif paragrafos[-1]:
            paragrafos.append([])
    return "\n\n".join(" ".join(p) for p in paragrafos if p)


def primeira_frase(bloco: str, teto: int) -> str:
    """Primeira frase do primeiro parágrafo (até o primeiro `. ` ou o fim), sem o ponto final."""
    primeiro = " ".join(bloco.split("\n\n")[0].split())
    corte = re.split(r"\.\s", primeiro, maxsplit=1)[0]
    return resumir(corte.rstrip(". "), teto)


def gatilhos_workflow(texto: str) -> str | None:
    """Chaves diretas do bloco `on:` (ou valor inline `on: push`)."""
    linhas = texto.splitlines()
    for i, linha in enumerate(linhas):
        m = re.match(r"^(?:on|\"on\"|'on')\s*:\s*(.*)$", linha)
        if not m:
            continue
        inline = m.group(1).strip()
        if inline:
            return ", ".join(x.strip() for x in inline.strip("[]").split(",") if x.strip())
        nomes = []
        for seguinte in linhas[i + 1:]:
            if seguinte.strip() == "" or seguinte.lstrip().startswith("#"):
                continue
            if not seguinte.startswith(" "):
                break
            m2 = re.match(r"^  ([A-Za-z_][\w-]*)\s*:", seguinte)
            if m2:
                nomes.append(m2.group(1))
        return ", ".join(nomes) or None
    return None


def bloco_permissions(texto: str) -> tuple[str | None, str | None]:
    """(le, grava) a partir do `permissions:` de topo. read -> le; write -> grava."""
    linhas = texto.splitlines()
    for i, linha in enumerate(linhas):
        m = re.match(r"^permissions\s*:\s*(.*)$", linha)
        if not m:
            continue
        if m.group(1).strip():
            valor = m.group(1).strip()
            return (valor, valor if "write" in valor else None)
        le, grava = [], []
        for seguinte in linhas[i + 1:]:
            if not seguinte.startswith(" "):
                break
            item = seguinte.strip()
            if item.endswith("read"):
                le.append(item)
            elif item.endswith("write"):
                grava.append(item)
        return ("; ".join(le) or None, "; ".join(grava) or None)
    return (None, None)


# ---------------------------------------------------------------- fontes

def nome_time(plugin: str) -> str:
    for prefixo in ("polozi-time-", "polozi-"):
        if plugin.startswith(prefixo):
            return plugin[len(prefixo):]
    return plugin


def nomes_da_casa(casa: Path) -> set[str]:
    """Plugins que a Casa declarou: entrada do marketplace local dela ou linha `ativo` na tabela de times
    do `capacidades/PLUGINS.md` (a marcação que o `--instalar` grava). O cache do Codex é da MÁQUINA
    (plugin pessoal, de terceiro, de outra Casa): sem uma dessas marcas, nada dele vai pro catálogo.
    O estado ligado/desligado que o app grava no config.toml não tem chave documentada; não é lido.
    Linha `ativo` de time da própria Casa (`times/<nome>/time.json`) não puxa plugin homônimo do cache:
    as skills desse time já estão em `.agents/skills`."""
    nomes = {e["name"] for e in it._entradas_marketplace(casa) if e.get("name")}
    times_da_casa = set(it.nomes_dos_times_da_casa(casa))
    nomes |= set(it.times_instalados(casa / "capacidades" / "PLUGINS.md")) - times_da_casa
    return nomes


def fontes(casa: Path) -> list[tuple[str, Path]]:
    saida = []
    da_casa = nomes_da_casa(casa)
    for nome in it.nomes_candidatos(casa):
        if nome not in da_casa:
            continue
        try:
            saida.append((nome, it.resolver_origem_time(casa, nome)))
        except it.ErroTime:
            continue
    return saida


def pastas_agentes(origem: Path) -> list[Path]:
    return [p for p in (origem / "agents", origem / ".codex" / "agents") if p.is_dir()]


def pastas_skills(origem: Path) -> list[Path]:
    return [p for p in (origem / "skills", origem / ".agents" / "skills") if p.is_dir()]


def arquivos_da_pasta(pasta: Path, excluir: set[Path], prefixo_rotulo: str) -> list[dict]:
    arquivos = []
    for caminho in sorted(pasta.rglob("*")):
        rel = caminho.relative_to(pasta)
        if any(parte in PASTAS_IGNORADAS for parte in rel.parts):
            continue
        if caminho in excluir or not caminho.is_file():
            continue
        if caminho.name in ARQUIVOS_IGNORADOS or caminho.name.endswith(SUFIXOS_IGNORADOS):
            continue
        rotulo = f"{prefixo_rotulo}/{rel.as_posix()}"
        # Oculto (.pytest_cache, .DS_Store...) é lixo local, não vai pro catálogo. A credencial vem ANTES:
        # .env, .env.local, id_rsa dentro da skill seguem abortando (ou pulando, em plugin de terceiro).
        if any(parte.startswith(".") for parte in rel.parts) and not e_credencial(caminho):
            continue
        dados = ler_bytes_seguro(caminho, rotulo)
        texto = texto_seguro(dados, rotulo)
        if texto is None:
            continue
        arquivos.append({
            "caminho": rel.as_posix(),
            "linguagem": linguagem(caminho),
            "conteudo": texto if len(dados) <= TETO_ARQUIVO else None,
            "bytes": len(dados),
            "hash": sha256_hex(dados),
        })
    return arquivos


def hash_artefato(principal: str, arquivos: list[dict]) -> str:
    h = hashlib.sha256(principal.encode("utf-8"))
    for f in sorted(arquivos, key=lambda x: x["caminho"]):
        h.update(f["caminho"].encode("utf-8") + b"\0" + f["hash"].encode("ascii"))
    return h.hexdigest()


# ---------------------------------------------------------------- montagem

def montar_catalogo(casa: Path) -> dict:
    global _regra_ativa
    casa = casa.resolve()
    _regra_ativa = carregar_regra_segredo(casa)
    instalados_dir = casa / ".codex" / "agents"
    instalados = {p.stem for p in instalados_dir.glob("*.toml")} if instalados_dir.is_dir() else set()
    times_ativos = set(it.times_instalados(casa / "capacidades" / "PLUGINS.md"))
    nucleo_cfg = _ler_nucleo_cfg(casa)

    agentes: dict[str, dict] = {}
    artefatos: dict[tuple[str, str], dict] = {}
    relacoes: list[dict] = []
    skills_do_agente: dict[str, str] = {}  # nome -> developer_instructions

    def guardar(art: dict) -> None:
        if not RE_NOME_ARTEFATO.match(art["nome"]) or len(art["nome"]) > 80:
            print(f"AVISO: {art['tipo']} '{art['nome']}' em {art['caminho']} tem nome fora do padrão "
                  "([a-z0-9._-], até 80); ficou de fora do catálogo.", file=sys.stderr)
            return
        chave = (art["tipo"], art["nome"])
        atual = artefatos.get(chave)
        if atual is not None:
            print(f"AVISO: {art['tipo']} '{art['nome']}' aparece em {atual['caminho']} e {art['caminho']}; "
                  "fica a instalada (ou a primeira).", file=sys.stderr)
            if atual["estado"] == "instalado" or art["estado"] != "instalado":
                return
        artefatos[chave] = art

    def pular_terceiro(erro: ErroSync, tipo: str, nome: str, terceiro: bool) -> None:
        """Plugin de terceiro: segredo ou credencial tira só o item do catálogo (aviso com o caminho,
        nunca o trecho). Casa, polozi-* e marketplace local: relança e aborta tudo."""
        if not terceiro or erro.codigo != 3:
            raise erro
        print(f"AVISO: {tipo} '{nome}' de plugin de terceiro ficou de fora do catálogo: segredo ou arquivo de "
              f"credencial em {erro.rotulo or nome}. Nada dele foi enviado.", file=sys.stderr)

    def agente_de_toml(caminho: Path, rotulo: str, time: str, origem_tipo: str, estado: str,
                       terceiro: bool = False) -> bool:
        """False = pulado por segredo (só plugin de terceiro); True = tratado (entrou ou foi ignorado)."""
        try:
            _agente_de_toml(caminho, rotulo, time, origem_tipo, estado)
        except ErroSync as erro:
            pular_terceiro(erro, "agente", caminho.stem, terceiro)
            return False
        return True

    def _agente_de_toml(caminho: Path, rotulo: str, time: str, origem_tipo: str, estado: str) -> None:
        texto = ler_texto(caminho, rotulo) or ""
        toml = ler_toml(texto)
        nome = toml.get("name") or caminho.stem
        if not RE_NOME_AGENTE.match(nome):
            print(f"AVISO: agente '{nome}' em {rotulo} tem nome fora do padrão ([a-z0-9-]); "
                  "ficou de fora do catálogo.", file=sys.stderr)
            return
        md = caminho.with_suffix(".md")
        arquivos = []
        descricao_md = None
        if md.is_file():
            rotulo_md = f"{rotulo[:-5]}.md"
            dados = ler_bytes_seguro(md, rotulo_md)
            md_texto = texto_seguro(dados, rotulo_md)
            if md_texto is not None:
                descricao_md = md_texto
                arquivos.append({"caminho": md.name, "linguagem": "markdown",
                                 "conteudo": md_texto if len(dados) <= TETO_ARQUIVO else None,
                                 "bytes": len(dados), "hash": sha256_hex(dados)})
        descricao = (toml.get("description") or "").strip() or (descricao_md or "").strip() or nome
        cfg = nucleo_cfg.get(nome, {})
        modelo = toml.get("model")
        tier = next((t for t in TIERS if modelo and modelo.endswith(f"-{t}")), None)
        esforco = toml.get("model_reasoning_effort")
        if esforco not in ESFORCOS:
            esforco = cfg.get("esforco") if cfg.get("esforco") in ESFORCOS else None
        sandbox = toml.get("sandbox_mode")
        if sandbox not in SANDBOXES:
            sandbox = cfg.get("sandbox") if cfg.get("sandbox") in SANDBOXES else "read-only"
        linha = {
            "name": nome,
            "time": time,
            "descricao_curta": resumir(cfg.get("descricao_curta") or descricao, TETO_CURTA) or nome[:TETO_CURTA],
            "descricao": cfg.get("descricao") or resumir(descricao, 2000) or nome,
            "quando": cfg.get("quando"),
            "tier": cfg.get("tier") if cfg.get("tier") in TIERS else tier,
            "modelo": modelo,
            "esforco": esforco,
            "sandbox": sandbox,
            "skills": [],
            "estado": estado,
        }
        anterior = agentes.get(nome)
        if anterior is not None and (anterior["estado"] == "instalado" or estado != "instalado"):
            return  # mesma regra do guardar: fica a instalada ou a primeira, linha e artefato juntos
        agentes[nome] = linha
        skills_do_agente[nome] = toml.get("developer_instructions", "")
        guardar({
            "tipo": "agente", "nome": nome, "time": time, "origem": origem_tipo,
            "resumo": resumir(descricao, TETO_RESUMO) or nome, "descricao": linha["descricao"],
            "quando": linha["quando"], "gatilho": None,
            "le": "Lê o repositório",
            "grava": None if sandbox == "read-only" else "Escreve no repositório",
            "formato": "toml", "conteudo": texto[:TETO_ARQUIVO], "caminho": rotulo,
            "hash": hash_artefato(texto, arquivos), "estado": estado, "arquivos": arquivos,
        })

    def skill_de_pasta(pasta: Path, rotulo_pasta: str, time: str, origem_tipo: str, estado: str,
                       terceiro: bool = False) -> None:
        try:
            _skill_de_pasta(pasta, rotulo_pasta, time, origem_tipo, estado)
        except ErroSync as erro:
            pular_terceiro(erro, "skill", pasta.name, terceiro)

    def _skill_de_pasta(pasta: Path, rotulo_pasta: str, time: str, origem_tipo: str, estado: str) -> None:
        principal = pasta / "SKILL.md"
        texto = ler_texto(principal, f"{rotulo_pasta}/SKILL.md") or ""
        fm = frontmatter_aninhado(texto)
        nome = fm.get("name") or pasta.name
        descricao_skill = (fm.get("description") or "").strip()
        arquivos = arquivos_da_pasta(pasta, {principal}, rotulo_pasta)
        guardar({
            "tipo": "skill", "nome": nome, "time": time, "origem": origem_tipo,
            "resumo": resumir(descricao_skill or nome, TETO_RESUMO) or nome,
            "descricao": descricao_skill or None, "quando": fm.get("metadata.quando"), "gatilho": None,
            "le": fm.get("metadata.le"), "grava": fm.get("metadata.grava"),
            "formato": "markdown", "conteudo": texto[:TETO_ARQUIVO], "caminho": f"{rotulo_pasta}/SKILL.md",
            "hash": hash_artefato(texto, arquivos), "estado": estado, "arquivos": arquivos,
        })

    # 1) núcleo e agentes já copiados pra Casa
    for caminho in sorted(instalados_dir.glob("*.toml")) if instalados_dir.is_dir() else []:
        nucleo = caminho.stem in it.NOMES_NUCLEO
        agente_de_toml(caminho, f".codex/agents/{caminho.name}",
                       TIME_NUCLEO if nucleo else "casa", "nucleo" if nucleo else "casa", "instalado")

    # 2) fontes dos plugins e times (o instalado da Casa vence; o time real vem daqui)
    for plugin, origem in fontes(casa):
        time = nome_time(plugin)
        cache_instalado = "/.codex/plugins/cache/" in origem.as_posix()
        terceiro = cache_instalado and not plugin.startswith("polozi-")
        for pasta in pastas_agentes(origem):
            for caminho in sorted(pasta.glob("*.toml")):
                if caminho.stem in it.NOMES_NUCLEO:
                    continue
                estado = "instalado" if caminho.stem in instalados else "disponivel"
                da_casa = (caminho.stem in agentes and agentes[caminho.stem]["time"] == "casa")
                linha_casa = agentes.pop(caminho.stem) if da_casa else None
                art_casa = artefatos.pop(("agente", caminho.stem), None) if da_casa else None
                if not agente_de_toml(caminho, f"plugin:{plugin}/{caminho.relative_to(origem).as_posix()}",
                                      time, "plugin" if plugin.startswith("polozi-") else "time", estado, terceiro) \
                        and da_casa:
                    agentes[caminho.stem] = linha_casa  # pulado: o instalado da Casa continua no catálogo
                    if art_casa is not None:
                        artefatos[("agente", caminho.stem)] = art_casa
        tem_agente_instalado = any(p.stem in instalados for d in pastas_agentes(origem) for p in d.glob("*.toml"))
        skill_instalada = cache_instalado or plugin in times_ativos or tem_agente_instalado
        for pasta_skills in pastas_skills(origem):
            for pasta in sorted(p for p in pasta_skills.iterdir() if (p / "SKILL.md").is_file()):
                skill_de_pasta(pasta, f"plugin:{plugin}/{pasta.relative_to(origem).as_posix()}", time,
                               "plugin", "instalado" if skill_instalada else "disponivel", terceiro)

    # 3) skills da própria Casa
    for pasta_skills in pastas_skills(casa):
        for pasta in sorted(p for p in pasta_skills.iterdir() if (p / "SKILL.md").is_file()):
            skill_de_pasta(pasta, pasta.relative_to(casa).as_posix(), "casa", "casa", "instalado")

    # 4) workflows do sistema
    for wf in sorted(casa.glob("sistemas/*/.github/workflows/*.y*ml")):
        sistema = wf.relative_to(casa).parts[1]
        rotulo = wf.relative_to(casa).as_posix()
        texto = ler_texto(wf, rotulo) or ""
        m_nome = re.search(r"^name\s*:\s*(.+)$", texto, re.M)
        nome_wf = m_nome.group(1).strip().strip("'\"").strip() if m_nome else ""
        le, grava = bloco_permissions(texto)
        explicacao = comentario_inicial(texto)  # o kit explica cada yml num comentário no topo
        guardar({
            "tipo": "workflow", "nome": f"{slug(sistema)}.{slug(wf.stem)}",
            "time": TIME_NUCLEO, "origem": "sistema",
            "resumo": (primeira_frase(explicacao, TETO_RESUMO) if explicacao else "")
                      or resumir(nome_wf or wf.name, TETO_RESUMO) or wf.name,
            "descricao": explicacao[:2000] or None, "quando": None, "gatilho": gatilhos_workflow(texto), "le": le, "grava": grava,
            "formato": "yaml", "conteudo": texto[:TETO_ARQUIVO], "caminho": rotulo,
            "hash": hash_artefato(texto, []), "estado": "instalado", "arquivos": [],
        })

    # 5) automações registradas pela Casa
    for linha in _linhas_automacoes(casa):
        texto = " | ".join([linha["automacao"], linha["gatilho"], linha["finalidade"], linha["estado"]])
        ativo = linha["estado"].strip().lower() in {"ativo", "ativa", "ligado", "ligada", "instalado"}
        guardar({
            "tipo": "workflow", "nome": slug(linha["automacao"]), "time": "casa", "origem": "casa",
            "resumo": resumir(linha["finalidade"] or linha["automacao"], TETO_RESUMO) or slug(linha["automacao"]),
            "descricao": linha["finalidade"] or None, "quando": None, "gatilho": linha["gatilho"] or None,
            "le": None, "grava": None, "formato": "texto", "conteudo": texto,
            "caminho": "capacidades/AUTOMACOES.md", "hash": hash_artefato(texto, []),
            "estado": "instalado" if ativo else "disponivel", "arquivos": [],
        })

    # 6) relações: agente usa skill (citada nas instruções); skill usa agente (citado no SKILL.md)
    nomes_skill = {n for (t, n) in artefatos if t == "skill"}
    for nome_agente, instrucoes in skills_do_agente.items():
        usadas = sorted(s for s in nomes_skill if re.search(rf"(?<![\w-]){re.escape(s)}(?![\w-])", instrucoes))
        agentes[nome_agente]["skills"] = usadas
        for s in usadas:
            relacoes.append({"origem_tipo": "agente", "origem_nome": nome_agente,
                             "destino_tipo": "skill", "destino_nome": s, "tipo": "usa"})
    for (tipo, nome), art in artefatos.items():
        if tipo != "skill":
            continue
        for nome_agente in agentes:
            if re.search(rf"(?<![\w-]){re.escape(nome_agente)}(?![\w-])", art["conteudo"]):
                relacoes.append({"origem_tipo": "skill", "origem_nome": nome,
                                 "destino_tipo": "agente", "destino_nome": nome_agente, "tipo": "usa"})

    return {"agentes": list(agentes.values()), "artefatos": list(artefatos.values()), "relacoes": relacoes}


def _ler_nucleo_cfg(casa: Path) -> dict[str, dict]:
    """Campos do núcleo vindos do sistema (só leitura): sistemas/empresa-os/config/agentes-nucleo.json.

    Formato real: objeto `{"descricao": "...", "agentes": [{name, time, descricao_curta, descricao,
    quando, tier, esforco, sandbox, skills, estado}, ...]}`. Aceita também uma lista pura.
    """
    caminho = casa / "sistemas" / "empresa-os" / "config" / "agentes-nucleo.json"
    if not caminho.is_file():
        return {}
    try:
        texto = ler_texto(caminho, "sistemas/empresa-os/config/agentes-nucleo.json")
        dados = json.loads(texto) if texto is not None else {}
    except (OSError, json.JSONDecodeError):
        return {}
    itens = dados if isinstance(dados, list) else dados.get("agentes", []) if isinstance(dados, dict) else []
    return {i["name"]: i for i in itens if isinstance(i, dict) and i.get("name")}


def _linhas_automacoes(casa: Path) -> list[dict]:
    caminho = casa / "capacidades" / "AUTOMACOES.md"
    if not caminho.is_file():
        return []
    texto = ler_texto(caminho, "capacidades/AUTOMACOES.md") or ""
    linhas = [l for l in texto.splitlines() if l.strip().startswith("|")]
    saida = []
    for l in linhas[2:]:  # pula cabeçalho e separador
        celulas = [c.strip() for c in it.analisar_celulas(l)]
        if len(celulas) < 4 or not celulas[0] or all(re.fullmatch(r"-*", c) for c in celulas):
            continue
        saida.append({"automacao": celulas[0], "gatilho": celulas[1], "finalidade": celulas[2], "estado": celulas[3]})
    return saida


# ---------------------------------------------------------------- envio

def credencial(casa: Path) -> tuple[str, str] | None:
    """Mesma convenção de sistemas/whatsapp/src/registro-supabase.mjs: <casa>/credenciais/.env."""
    caminho = casa / "credenciais" / ".env"
    if not caminho.is_file():
        return None
    valores: dict[str, str] = {}
    # utf-8-sig: o Bloco de Notas antigo grava BOM, que colaria na 1ª chave.
    for linha in caminho.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        chave, sep, valor = linha.strip().partition("=")
        if sep and not chave.startswith("#"):
            valores[chave.strip()] = valor.strip().strip('"').strip("'")
    url = valores.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    chave = valores.get("SUPABASE_SERVICE_ROLE_KEY", "")
    return (url, chave) if url and chave else None


def _bytes(objeto: object) -> int:
    return len(json.dumps(objeto, ensure_ascii=False).encode("utf-8"))


def lotes(catalogo: dict, teto: int = TETO_LOTE) -> list[dict]:
    """Parte o catálogo em payloads de até `teto` bytes para a RPC.

    Todo lote leva `manter` (o catálogo COMPLETO, só tipo e nome): é ele que diz à RPC o que
    continua existindo, então lote nenhum aposenta o que está em outro. O 1º lote leva `agentes`;
    o último leva só `relacoes` (+ `manter`). Artefato maior que o teto vai sozinho."""
    agentes = catalogo.get("agentes", [])
    artefatos = catalogo.get("artefatos", [])
    if not artefatos:
        return [{"agentes": agentes, "manter": [], "relacoes": []}]
    manter = [{"tipo": a["tipo"], "nome": a["nome"]} for a in artefatos]
    base = _bytes(manter) + 64  # folga: {"p_catalogo": ...}, chaves e vírgulas
    saida: list[dict] = []
    atual: list[dict] = []
    usado = base + _bytes(agentes)

    def fechar() -> None:
        nonlocal atual, usado
        lote: dict = {} if saida else {"agentes": agentes}
        if atual:
            lote["artefatos"] = atual
        lote["manter"] = manter
        saida.append(lote)
        atual, usado = [], base

    for art in artefatos:
        tamanho = _bytes(art) + 1
        if usado + tamanho > teto and (atual or not saida):
            fechar()  # o 1º lote sai só com agentes se nem um artefato coube junto
        atual.append(art)
        usado += tamanho
    fechar()
    saida.append({"relacoes": catalogo.get("relacoes", []), "manter": manter})
    return saida


def exigir_https(url: str) -> None:
    """A chave de serviço só viaja por https (exceto banco local: localhost e 127.0.0.1)."""
    try:
        partes = urllib.parse.urlsplit(url)
        host = partes.hostname
    except ValueError:
        return  # endereço torto: o erro claro vem de _chamar
    if partes.scheme in ("", "https") or (partes.scheme == "http" and host in ("localhost", "127.0.0.1")):
        return  # sem esquema: o erro claro vem de _chamar
    raise ErroSync(f"NEXT_PUBLIC_SUPABASE_URL começa com {partes.scheme}://; a chave do banco só é enviada por "
                   "https:// (exceto localhost e 127.0.0.1). Corrija em credenciais/.env. Nada foi enviado.", 4)


def _chamar(url: str, chave: str, lote: dict, posicao: str) -> dict:
    corpo = json.dumps({"p_catalogo": lote}, ensure_ascii=False).encode("utf-8")
    aviso = "" if posicao.startswith("lote 1 ") else "Os lotes anteriores já estão gravados; rode de novo para completar."
    try:
        req = urllib.request.Request(  # dentro do try: URL sem esquema levanta ValueError aqui
            f"{url}/rest/v1/rpc/sincronizar_catalogo_ia", data=corpo, method="POST",
            headers={"apikey": chave, "Authorization": f"Bearer {chave}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            resposta = json.loads(resp.read() or b"{}")
            return resposta if isinstance(resposta, dict) else {}
    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode("utf-8", errors="replace")[:500].replace(chave, "***")
        raise ErroSync(f"o banco recusou o catálogo no {posicao} (HTTP {erro.code}): {detalhe} {aviso}".strip(), 4) from None
    except urllib.error.URLError as erro:
        raise ErroSync(f"sem conexão com o banco no {posicao}: {str(erro.reason).replace(chave, '***')}. {aviso}".strip(), 4) from None
    except ValueError as erro:
        if isinstance(erro, (json.JSONDecodeError, UnicodeError)):
            raise ErroSync(f"resposta inválida do banco no {posicao} ({type(erro).__name__}). {aviso}".strip(), 4) from None
        raise ErroSync(f"endereço do banco inválido em NEXT_PUBLIC_SUPABASE_URL ({type(erro).__name__}); "
                       f"confira que começa com https://. Falhou no {posicao}. {aviso}".strip(), 4) from None
    except (OSError, http.client.HTTPException) as erro:  # leitura da resposta, timeout, conexão cortada
        raise ErroSync(f"falha de rede no {posicao} ({type(erro).__name__}). {aviso}".strip(), 4) from None


def enviar(url: str, chave: str, catalogo: dict, teto: int = TETO_LOTE) -> dict:
    """Uma chamada da RPC por lote, em ordem; soma os contadores. `agentes` vem só do 1º lote."""
    exigir_https(url)
    partes = lotes(catalogo, teto)
    total = {"agentes": 0, "artefatos": 0, "arquivos": 0, "relacoes": 0, "aposentados": 0, "lotes": len(partes)}
    for i, lote in enumerate(partes, 1):
        posicao = f"lote {i} de {len(partes)}"
        r = _chamar(url, chave, lote, posicao)
        try:
            for campo in ("artefatos", "arquivos", "relacoes", "aposentados"):
                total[campo] += int(r.get(campo, 0) or 0)
            if i == 1:
                total["agentes"] = int(r.get("agentes", 0) or 0)
        except (TypeError, ValueError):
            raise ErroSync(f"resposta inesperada no {posicao}: contador que não é número. "
                           + ("" if i == 1 else "Os lotes anteriores já estão gravados; rode de novo para completar."),
                           4) from None
    return total


def sincronizar(casa: Path, dry_run: bool = False, saida: Path | None = None,
                calado_sem_credencial: bool = False) -> int:
    """Monta e envia o catálogo. Nunca levanta: devolve o código de saída (0, 2, 3 ou 4).
    `calado_sem_credencial`: quem chama já explica a falta de credencial (o instalador)."""
    try:
        catalogo = montar_catalogo(casa)
        if saida is not None:
            saida.write_text(json.dumps(catalogo, ensure_ascii=False, indent=2), encoding="utf-8")
        partes = lotes(catalogo)
        resumo = (f"{len(catalogo['agentes'])} agente(s), {len(catalogo['artefatos'])} artefato(s), "
                  f"{len(catalogo['relacoes'])} relação(ões), {_bytes(catalogo) // 1024} KB em {len(partes)} lote(s)")
        if dry_run:
            print(f"DRY-RUN: {resumo}. Nada enviado.")
            return 0
        cred = credencial(casa)
        if cred is None:
            if calado_sem_credencial:
                return 2
            print("FALTA: credenciais/.env sem NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY; "
                  "o catálogo não foi pro sistema. Conecte o banco e rode de novo.")
            return 2
        r = enviar(cred[0], cred[1], catalogo)
        print(f"FEITO: catálogo no sistema ({r['lotes']} lote(s)) — {r['agentes']} agente(s), "
              f"{r['artefatos']} artefato(s), {r['arquivos']} arquivo(s), {r['aposentados']} aposentado(s).")
        return 0
    except ErroSync as erro:
        print(f"PAREI: {erro}", file=sys.stderr)
        return erro.codigo
    except (OSError, UnicodeError) as erro:
        print(f"PAREI: falha ao ler ou gravar arquivo ({type(erro).__name__}). Nada foi enviado.", file=sys.stderr)
        return 4


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Espelha agentes, skills e workflows da Casa no sistema.")
    p.add_argument("--casa", required=True, type=Path)
    p.add_argument("--dry-run", action="store_true", help="monta o catálogo e não envia")
    p.add_argument("--saida", type=Path, help="grava o payload em JSON (pra conferir)")
    a = p.parse_args(argv)
    return sincronizar(a.casa, a.dry_run, a.saida)


if __name__ == "__main__":
    sys.exit(main())
