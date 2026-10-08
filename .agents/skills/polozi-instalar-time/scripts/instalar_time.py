#!/usr/bin/env python3
"""Liga e desliga a CAMADA 2 (agentes) de um time de área na Casa: grava os
subagentes (`*.toml`) do time em `.codex/agents/` e mantém a tabela "Times da
empresa" de `capacidades/PLUGINS.md`. O time vem de um plugin de reserva
(`agents/*.toml`) ou, na Casa montada do kit, de `times/<time>/time.json`.

Python 3 puro (stdlib), sem rede, sem dependência, mesmo comportamento em
Mac e Windows. Escrita sempre atômica (tmp + os.replace). Quem decide se um
time está instalado é o disco (tomls + linha `ativo`), nunca uma promessa.

Modos:
  --listar [--gravar]
      Mostra o catálogo (time, origem, agentes, estado). Com --gravar,
      grava/atualiza a tabela "Times da empresa" de capacidades/PLUGINS.md
      — time sem linha ainda entra como "disponível, não instalado";
      time já registrado mantém o Estado que já tinha.

  --time <nome> --instalar [--dry-run]
      Copia SÓ os `agents/*.toml` do time pra `.codex/agents/`. Mede o
      orçamento de listagem ANTES de copiar (G3) e sai 4 sem escrever nada
      se a projeção passar de TETO_CHARS. Recusa (exit 3) qualquer toml com
      resto de outra plataforma ('claude', case-insensitive). Idempotente:
      só reescreve o que mudou byte a byte.
      Time do kit (`times/<nome>/time.json` na Casa): confere que as skills
      dele estão em `.agents/skills/` (senão sai 2), GERA os tomls do
      time.json (o mesmo texto do gerar_saidas.py do Native AI) e grava os
      que faltam ou mudaram. Aqui o 'claude' NÃO é recusado (o kit serve às
      duas plataformas) e o orçamento não é medido (as skills já estão na
      Casa e já entram na conta).

  --time <nome> --remover
      Apaga só os tomls registrados na linha daquele time, e só se o
      conteúdo bater byte a byte com a origem — qualquer divergência sai 5
      sem apagar nada. Os tomls do núcleo nunca são tocados (não estão
      registrados em nenhuma linha de time). NÃO desliga nem desinstala o
      plugin — isso é gesto de UI/CLI, descrito na SKILL.md.

  --verificar <nome>
      Exit 0 = time instalado (linha "ativo" + tomls no lugar). Exit 2 =
      não instalado. Modo consumido pela skill irmã `polozi-chamar-time`
      antes de qualquer delegação.

  --medir
      Soma name+description (chars) de todo SKILL.md que o Codex consegue
      enxergar hoje (Casa, skills pessoais do aluno, cache de plugin
      instalado) e imprime a folga contra TETO_CHARS.

Resolução da ORIGEM de um time, nesta ordem, sem inventar caminho por
convenção:
  1. `<casa>/times/<time>/time.json`: o time que já vive na própria Casa
     (é assim que a Casa montada traz Native AI, Tecnologia, PMO e Marketing)
  2. entrada `local` do marketplace de repositório
     `<casa>/.agents/plugins/marketplace.json` [24a:plugins/f6, plugins/f7]
  3. glob no cache de plugin instalado
     `~/.codex/plugins/cache/*/<time>/*/`, mtime mais recente, NUNCA
     hardcoda a versão [24a:plugins/n11]
  4. nenhum dos três: exit 2 (o time não veio na Casa).

O script NUNCA chama a CLI `codex` (zero subprocess), NUNCA escreve em
`~/.codex/config.toml` nem em `AGENTS.md`, e ele mesmo NUNCA fala com banco ou rede:
quando `credenciais/CONEXOES.md` já tem o banco, ao fim de --instalar e --remover delega
ao `sincronizar_catalogo.py` (irmão, import tardio), que espelha agentes, skills e
workflows no sistema. Se o espelho falhar, o time continua instalado e a saída avisa.
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import date
from pathlib import Path

# Garante o import do irmão `sincronizar_catalogo` rodando direto ou importado por teste.
sys.path.insert(0, str(Path(__file__).resolve().parent))

TETO_CHARS = 8000

NOMES_NUCLEO = frozenset(
    {
        "polozi-gerente-de-trabalho",
        "polozi-sistema-qa",
    }
)

TITULO_TIMES = "## Times da empresa"
ESTADO_ATIVO = "ativo"
ESTADO_DISPONIVEL = "disponível, não instalado"
CELULA_VAZIA = "—"


class ErroTime(Exception):
    def __init__(self, mensagem: str, codigo: int = 4) -> None:
        super().__init__(mensagem)
        self.codigo = codigo


# --------------------------------------------------------------------------
# Casa / arquivo texto — helpers
# --------------------------------------------------------------------------


def validar_casa(casa: Path) -> None:
    exigidos = [casa / "EMPRESA-IA.md", casa / "capacidades" / "PLUGINS.md"]
    ausentes = [str(caminho.relative_to(casa)) for caminho in exigidos if not caminho.is_file()]
    if ausentes:
        raise ErroTime(
            f"Esta pasta não é uma Casa (Empresa IA) válida. Ausentes: {', '.join(ausentes)}.",
            2,
        )


def escrever_atomico_texto(caminho: Path, conteudo: str) -> None:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", newline="\n", dir=caminho.parent, delete=False
    ) as temporario:
        temporario.write(conteudo)
        nome_temporario = temporario.name
    try:
        os.replace(nome_temporario, caminho)
    except Exception:
        Path(nome_temporario).unlink(missing_ok=True)
        raise


def escrever_atomico_bytes(caminho: Path, conteudo: bytes) -> None:
    with tempfile.NamedTemporaryFile(
        "wb", dir=caminho.parent, delete=False
    ) as temporario:
        temporario.write(conteudo)
        nome_temporario = temporario.name
    try:
        os.replace(nome_temporario, caminho)
    except Exception:
        Path(nome_temporario).unlink(missing_ok=True)
        raise


def sha256_curto(caminho: Path) -> str:
    return hashlib.sha256(caminho.read_bytes()).hexdigest()[:12]


def frontmatter(caminho: Path) -> dict[str, str]:
    texto = caminho.read_text(encoding="utf-8", errors="replace")
    correspondencia = re.match(r"^---\n(.*?)\n---", texto, re.S)
    dados: dict[str, str] = {}
    if correspondencia:
        for linha in correspondencia.group(1).splitlines():
            chave, separador, valor = linha.partition(":")
            if separador:
                dados[chave.strip()] = valor.strip().strip('"').strip("'")
    return dados


def analisar_celulas(linha: str) -> list[str]:
    interior = linha.strip()
    if interior.startswith("|"):
        interior = interior[1:]
    if interior.endswith("|"):
        interior = interior[:-1]
    return [celula.strip() for celula in interior.split("|")]


def montar_linha_tabela(celulas: list[str]) -> str:
    return "| " + " | ".join(celulas) + " |"


# --------------------------------------------------------------------------
# Tabela "Times da empresa" em capacidades/PLUGINS.md
# --------------------------------------------------------------------------


def secao_texto(texto: str, titulo: str) -> tuple[int, int]:
    inicio = texto.find(titulo)
    if inicio == -1:
        return -1, -1
    resto = texto[inicio:]
    proximo = re.search(r"\n## ", resto[1:])
    fim = inicio + 1 + proximo.start() + 1 if proximo else len(texto)
    return inicio, fim


def ler_tabela_times(caminho: Path) -> list[dict[str, str]]:
    if not caminho.is_file():
        return []
    texto = caminho.read_text(encoding="utf-8")
    inicio, fim = secao_texto(texto, TITULO_TIMES)
    if inicio == -1:
        return []
    linhas = texto[inicio:fim].splitlines()
    indices = [indice for indice, linha in enumerate(linhas) if linha.strip().startswith("|")]
    if len(indices) < 2:
        return []
    resultado = []
    for indice in indices[2:]:
        celulas = analisar_celulas(linhas[indice])
        if len(celulas) < 4:
            continue
        resultado.append(
            {
                "time": celulas[0],
                "agentes": celulas[1],
                "estado": celulas[2],
                "verificado_em": celulas[3],
            }
        )
    return resultado


def ler_linha_time(caminho: Path, nome: str) -> dict[str, str] | None:
    chave = nome.strip().lower()
    for linha in ler_tabela_times(caminho):
        if linha["time"].strip().lower() == chave:
            return linha
    return None


def times_instalados(caminho: Path) -> list[str]:
    return [
        linha["time"]
        for linha in ler_tabela_times(caminho)
        if linha["estado"].strip().lower() == ESTADO_ATIVO
    ]


def upsert_linha_times(caminho: Path, nome_time: str, agentes: str, estado: str) -> None:
    texto = caminho.read_text(encoding="utf-8")
    inicio, fim = secao_texto(texto, TITULO_TIMES)
    if inicio == -1:
        raise ErroTime(
            f"{caminho} não tem a seção {TITULO_TIMES!r} — o modelo da Casa está desatualizado.",
            4,
        )
    bloco = texto[inicio:fim]
    linhas = bloco.splitlines()
    indices = [indice for indice, linha in enumerate(linhas) if linha.strip().startswith("|")]
    if len(indices) < 2:
        raise ErroTime(f"{caminho}: tabela de times sem cabeçalho válido.", 4)

    data = date.today().isoformat()
    chave = nome_time.strip().lower()
    nova_linha = montar_linha_tabela([nome_time, agentes, estado, data])

    encontrado = None
    for indice in indices[2:]:
        celulas = analisar_celulas(linhas[indice])
        if celulas and celulas[0].strip().lower() == chave:
            encontrado = indice
            break

    if encontrado is not None:
        linhas[encontrado] = nova_linha
    else:
        linhas.insert(indices[1] + 1, nova_linha)

    novo_bloco = "\n".join(linhas)
    if bloco.endswith("\n"):
        novo_bloco += "\n"
    texto_novo = texto[:inicio] + novo_bloco + texto[fim:]
    escrever_atomico_texto(caminho, texto_novo)


def nomes_da_celula(celula: str) -> list[str]:
    valor = celula.strip()
    if not valor or valor == CELULA_VAZIA:
        return []
    return [parte.strip() for parte in valor.split(",") if parte.strip()]


# --------------------------------------------------------------------------
# Descoberta e resolução de origem (marketplace + cache) — G4
# --------------------------------------------------------------------------


def _ler_json(caminho: Path) -> dict:
    try:
        dados = json.loads(caminho.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, UnicodeDecodeError):
        return {}
    return dados if isinstance(dados, dict) else {}


def _entradas_marketplace(casa: Path) -> list[dict]:
    marketplace = casa / ".agents" / "plugins" / "marketplace.json"
    if not marketplace.is_file():
        return []
    dados = _ler_json(marketplace)
    entradas = dados.get("plugins", [])
    return [entrada for entrada in entradas if isinstance(entrada, dict)]


def nomes_candidatos(casa: Path) -> list[str]:
    nomes: set[str] = set()
    for entrada in _entradas_marketplace(casa):
        fonte = entrada.get("source") or {}
        if isinstance(fonte, dict) and fonte.get("type") == "local" and entrada.get("name"):
            nomes.add(entrada["name"])
    padrao_cache = os.path.expanduser("~/.codex/plugins/cache/*/*/*/.codex-plugin/plugin.json")
    for caminho_str in glob.glob(padrao_cache):
        dados = _ler_json(Path(caminho_str))
        nome = dados.get("name")
        if nome:
            nomes.add(nome)
    return sorted(nomes)


def resolver_origem_time(casa: Path, nome: str) -> Path:
    for entrada in _entradas_marketplace(casa):
        if entrada.get("name") != nome:
            continue
        fonte = entrada.get("source") or {}
        if not isinstance(fonte, dict) or fonte.get("type") != "local":
            continue
        caminho_relativo = fonte.get("path")
        if not caminho_relativo:
            continue
        candidato = (casa / caminho_relativo).resolve()
        if candidato.is_dir():
            return candidato

    padrao_glob = os.path.expanduser(f"~/.codex/plugins/cache/*/{nome}/*/")
    candidatos = [caminho for caminho in glob.glob(padrao_glob) if os.path.isdir(caminho)]
    if candidatos:
        candidatos.sort(key=os.path.getmtime, reverse=True)
        return Path(candidatos[0])

    raise ErroTime(
        f"O time '{nome}' não veio na Casa (ausente de times/{nome}/time.json, do marketplace de "
        "repositório e do cache de plugin instalado). Não invento caminho por convenção.",
        2,
    )


# --------------------------------------------------------------------------
# Time do kit que vive na própria Casa: times/<nome>/time.json
# --------------------------------------------------------------------------
# A Casa montada traz cada time em `times/<nome>/` (time.json, agentes/*.md, LEIA-ME.md), as skills dele em
# `.agents/skills/` e os subagentes já GERADOS em `.codex/agents/`. Não há plugin, marketplace nem cache.
# Instalar = conferir as skills, gerar os tomls do time.json e registrar a linha `ativo`. O texto gerado é
# o MESMO do gerar_saidas.py do time Native AI (um teste compara byte a byte com ele e com os tomls
# versionados dos 4 times do kit); aqui ele é refeito porque esta skill é empacotada à parte e não pode
# importar a do Native AI.

MARCA_TOML = "# GERADO de time.json - nao edite a mao"
NOME_DO_TIME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
NOME_DO_AGENTE_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def nomes_dos_times_da_casa(casa: Path) -> list[str]:
    pasta = casa / "times"
    if not pasta.is_dir():
        return []
    return sorted(p.name for p in pasta.iterdir() if p.is_dir() and (p / "time.json").is_file())


def resolver_time_da_casa(casa: Path, nome: str) -> Path | None:
    """`<casa>/times/<nome>` se tiver `time.json`; None se não for um time da Casa (nome com `/`, `..` ou
    começando por ponto também é None: o nome vem da linha de comando)."""
    if not NOME_DO_TIME_RE.match(nome):
        return None
    raiz = casa / "times" / nome
    return raiz if (raiz / "time.json").is_file() else None


def _texto_simples(valor) -> bool:
    return isinstance(valor, str) and valor.strip() != "" and "\n" not in valor and "\r" not in valor


def ler_time_json(raiz_time: Path) -> dict:
    try:
        dados = json.loads((raiz_time / "time.json").read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError) as erro:
        raise ErroTime(f"times/{raiz_time.name}/time.json ilegível: {erro}", 4)
    agentes = dados.get("agentes") if isinstance(dados, dict) else None
    if not isinstance(agentes, list) or not agentes:
        raise ErroTime(f"times/{raiz_time.name}/time.json sem a lista `agentes`.", 4)
    return dados


def _toml_texto(valor: str) -> str:
    return json.dumps(valor, ensure_ascii=False).replace("\x7f", "\\u007f")


def _tem_controle(texto: str) -> bool:
    return any((ord(c) < 0x20 and c not in "\n\t") or ord(c) == 0x7F for c in texto)


def _toml_multilinha(texto: str) -> str:
    """String TOML multilinha segura. Literal (aspas simples triplas), sem escapes, quando possível."""
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


def toml_do_agente(agente: dict, instrucoes: str) -> str:
    """O `.codex/agents/<name>.toml` de um agente do time.json: igual ao do gerar_saidas.py do Native AI."""
    codex = agente["codex"]
    linhas = [
        MARCA_TOML,
        f"name = {_toml_texto(agente['name'])}",
        f"description = {_toml_texto(agente['descricao'] + '. ' + agente['quando'])}",
    ]
    if codex.get("model"):
        linhas.append(f"model = {_toml_texto(codex['model'])}")
    linhas += [
        f"model_reasoning_effort = {_toml_texto(codex['model_reasoning_effort'])}",
        f"sandbox_mode = {_toml_texto(codex['sandbox_mode'])}",
        f"developer_instructions = {_toml_multilinha(instrucoes)}",
    ]
    return "\n".join(linhas) + "\n"


def tomls_do_time_da_casa(raiz_time: Path, dados: dict) -> dict[str, bytes]:
    """Nome do arquivo (`<agente>.toml`) -> bytes que vão pra `.codex/agents/`. ErroTime 4 se o time.json
    estiver incompleto (agente sem nome, descrição, gatilho ou bloco codex); 2 se faltarem as instruções."""
    saida: dict[str, bytes] = {}
    for posicao, agente in enumerate(dados["agentes"]):
        rotulo = f"times/{raiz_time.name}/time.json, agentes[{posicao}]"
        if not isinstance(agente, dict):
            raise ErroTime(f"{rotulo}: deve ser um objeto.", 4)
        nome = agente.get("name")
        if not isinstance(nome, str) or not NOME_DO_AGENTE_RE.match(nome):
            raise ErroTime(f"{rotulo}: `name` inválido ({nome!r}).", 4)
        for campo in ("descricao", "quando"):
            if not _texto_simples(agente.get(campo)):
                raise ErroTime(f"{rotulo} ({nome}): `{campo}` ausente ou com quebra de linha.", 4)
        codex = agente.get("codex")
        if (
            not isinstance(codex, dict)
            or not _texto_simples(codex.get("model_reasoning_effort"))
            or not _texto_simples(codex.get("sandbox_mode"))
        ):
            raise ErroTime(f"{rotulo} ({nome}): bloco `codex` sem esforço ou sandbox.", 4)
        relativo = agente.get("instrucoes")
        arquivo = (raiz_time / relativo).resolve() if isinstance(relativo, str) and relativo.strip() else None
        if arquivo is None or raiz_time.resolve() not in arquivo.parents or not arquivo.is_file():
            raise ErroTime(
                f"{rotulo} ({nome}): as instruções {relativo!r} não estão em times/{raiz_time.name}/. "
                "A Casa veio incompleta: clone de novo o repositório-modelo.",
                2,
            )
        try:
            instrucoes = arquivo.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeError) as erro:
            raise ErroTime(f"{rotulo} ({nome}): instruções ilegíveis: {erro}", 4)
        saida[f"{nome}.toml"] = toml_do_agente(agente, instrucoes).encode("utf-8")
    return saida


def skills_do_time_ausentes(casa: Path, dados: dict) -> list[str]:
    """Skills que o time.json declara e que não estão em `<casa>/.agents/skills/<nome>/SKILL.md`."""
    ausentes = []
    for skill in dados.get("skills") or []:
        nome = skill.get("name") if isinstance(skill, dict) else None
        if not isinstance(nome, str) or not (casa / ".agents" / "skills" / nome / "SKILL.md").is_file():
            ausentes.append(str(nome))
    return ausentes


def gravar_tomls_mudados(destino_dir: Path, tomls: dict[str, bytes]) -> list[Path]:
    """Grava em `.codex/agents/` só o que não existe ou mudou byte a byte; devolve os caminhos tocados."""
    destino_dir.mkdir(parents=True, exist_ok=True)
    tocados: list[Path] = []
    for arquivo, conteudo in sorted(tomls.items()):
        destino = destino_dir / arquivo
        if not destino.is_file() or destino.read_bytes() != conteudo:
            escrever_atomico_bytes(destino, conteudo)
            tocados.append(destino)
    return tocados


# --------------------------------------------------------------------------
# Orçamento de listagem — G3
# --------------------------------------------------------------------------


def medir_orcamento(casa: Path) -> tuple[int, int]:
    """Soma name+description (chars) de todo SKILL.md que o Codex enxerga
    hoje: Casa, skills pessoais do aluno e cache de plugin instalado. Medida
    conservadora por baixo — não conta skill de sistema nem
    /etc/codex/skills [24a:skills/f8]."""
    padroes = [
        str(casa / ".agents" / "skills" / "*" / "SKILL.md"),
        os.path.expanduser("~/.agents/skills/*/SKILL.md"),
        os.path.expanduser("~/.codex/plugins/cache/*/*/*/skills/*/SKILL.md"),
    ]
    soma = 0
    contagem = 0
    for padrao in padroes:
        for caminho_str in glob.glob(padrao):
            dados = frontmatter(Path(caminho_str))
            soma += len(dados.get("name", "")) + len(dados.get("description", ""))
            contagem += 1
    return soma, contagem


def medir_time(origem: Path) -> int:
    soma = 0
    for caminho in sorted((origem / "skills").glob("*/SKILL.md")):
        dados = frontmatter(caminho)
        soma += len(dados.get("name", "")) + len(dados.get("description", ""))
    return soma


# --------------------------------------------------------------------------
# Banco (delegação, nunca fala direto) — G9
# --------------------------------------------------------------------------


def banco_conectado(casa: Path) -> bool:
    """Mesmo critério de `polozi-concluir-trabalho/scripts/concluir_trabalho.py`
    (coluna "Serviço" achada pelo NOME do cabeçalho, nunca por posição fixa),
    reimplementado aqui porque skills empacotadas separadamente não têm
    import cruzado garantido."""
    caminho = casa / "credenciais" / "CONEXOES.md"
    if not caminho.is_file():
        return False
    texto = caminho.read_text(encoding="utf-8", errors="replace")
    linhas = texto.splitlines()
    indices = [indice for indice, linha in enumerate(linhas) if linha.strip().startswith("|")]
    indice_cabecalho = None
    indice_servico = None
    for indice in indices:
        celulas = [celula.strip().lower() for celula in analisar_celulas(linhas[indice])]
        if "serviço" in celulas or "servico" in celulas:
            indice_cabecalho = indice
            indice_servico = celulas.index("serviço") if "serviço" in celulas else celulas.index("servico")
            break
    if indice_cabecalho is None:
        return False
    for indice in indices:
        if indice <= indice_cabecalho:
            continue
        celulas = analisar_celulas(linhas[indice])
        if all(re.fullmatch(r"-*", celula.strip()) for celula in celulas):
            continue
        if indice_servico < len(celulas) and celulas[indice_servico].strip().lower() == "supabase":
            return True
    return False


# --------------------------------------------------------------------------
# Ações
# --------------------------------------------------------------------------


def _python_de_quem_rodou() -> str:
    """Nome do Python que está rodando (python, python3, py.exe...): no Windows `python3` costuma ser
    o atalho da loja, então a mensagem usa o mesmo que o aluno usou."""
    nome = re.split(r"[\\/]", sys.executable or "")[-1]
    return nome or "python"


def espelhar_catalogo(casa: Path) -> int:
    """Com banco conectado, espelha o catálogo de IA no sistema. Nunca derruba o comando:
    o time já foi instalado ou removido; se o espelho falhar, só avisa e diz como refazer.
    Devolve o código do espelho (0 = ok ou sem banco)."""
    if not banco_conectado(casa):
        return 0
    try:
        import sincronizar_catalogo  # import tardio: sem banco o instalador não precisa dele

        codigo = sincronizar_catalogo.sincronizar(casa, calado_sem_credencial=True)
    except Exception as erro:  # noqa: BLE001 — o espelho nunca pode quebrar a instalação
        print(f"PAREI: o espelho do catálogo falhou ({type(erro).__name__}).", file=sys.stderr)
        codigo = 4
    if codigo != 0:
        motivo = (" (faltam a URL e a chave de serviço do banco em credenciais/)"
                  if codigo == 2 else "")
        print(
            f"FALTA: o time foi atualizado, mas o catálogo não chegou ao sistema{motivo}; "
            f"rode `{_python_de_quem_rodou()} {Path(__file__).resolve().parent / 'sincronizar_catalogo.py'} --casa .` "
            f"(saída {codigo}) e leia a primeira linha: FEITO, FALTA ou PAREI."
        )
    return codigo


def instalar_time_da_casa(casa: Path, nome: str, raiz_time: Path, dry_run: bool) -> int:
    """`--instalar` de um time do kit (`times/<nome>/time.json` na Casa): confere as skills, gera os tomls do
    time.json, grava os que faltam ou mudaram e registra a linha `ativo`. Aqui NÃO há recusa de 'outra
    plataforma' (o kit serve às duas) nem medida de orçamento (as skills já estão em `.agents/skills/` e já
    entram na conta)."""
    dados = ler_time_json(raiz_time)
    ausentes = skills_do_time_ausentes(casa, dados)
    if ausentes:
        raise ErroTime(
            f"As skills do time '{nome}' não estão na Casa (.agents/skills/): {', '.join(ausentes)}. "
            "Esta skill não cria skill: clone de novo o repositório-modelo, que já traz o time.",
            2,
        )
    tomls = tomls_do_time_da_casa(raiz_time, dados)
    agentes_do_time = ", ".join(Path(arquivo).stem for arquivo in tomls)  # a ordem do time.json, como a montagem grava
    if dry_run:
        print(
            f"DRY-RUN: instalaria {len(tomls)} agente(s) de '{nome}', gerados de "
            f"times/{nome}/time.json: {agentes_do_time}."
        )
        print("Projeção de orçamento: as skills do time já estão em .agents/skills/ e já entram na conta.")
        return 0

    tocados = gravar_tomls_mudados(casa / ".codex" / "agents", tomls)
    upsert_linha_times(casa / "capacidades" / "PLUGINS.md", nome, agentes_do_time, ESTADO_ATIVO)

    print(f"FEITO: time '{nome}' instalado com {len(tomls)} agente(s), gerados de times/{nome}/time.json.")
    if tocados:
        print("MUDOU:")
        for caminho in tocados:
            print(f"  {caminho.relative_to(casa)} (sha256 {sha256_curto(caminho)})")
    else:
        print("MUDOU: nada nos arquivos (já estava instalado, byte a byte igual); linha do catálogo conferida.")
    if banco_conectado(casa):
        espelhar_catalogo(casa)
    else:
        print("FALTA: nada. O time já pode ser chamado com $polozi-chamar-time.")
    return 0


def remover_time_da_casa(casa: Path, nome: str, raiz_time: Path, linha: dict) -> int:
    """`--remover` de um time do kit: apaga só os tomls registrados na linha do time, e só se baterem byte a
    byte com o que o time.json gera (divergência sai 5 sem apagar nada). As skills ficam: moram na Casa."""
    esperados = tomls_do_time_da_casa(raiz_time, ler_time_json(raiz_time))
    pasta_agentes = casa / ".codex" / "agents"
    divergentes: list[str] = []
    para_remover: list[Path] = []
    for agente in nomes_da_celula(linha["agentes"]):
        atual = pasta_agentes / f"{agente}.toml"
        if not atual.is_file():
            continue
        if atual.read_bytes() != esperados.get(atual.name):
            divergentes.append(str(atual.relative_to(casa)))
            continue
        para_remover.append(atual)

    if divergentes:
        raise ErroTime(
            "Arquivo(s) diferente(s) do que o time.json gera, NADA foi apagado (pode ter sido "
            f"editado à mão): {', '.join(divergentes)}. Resolva a diferença antes de remover.",
            5,
        )

    for caminho in para_remover:
        caminho.unlink()
    upsert_linha_times(casa / "capacidades" / "PLUGINS.md", nome, linha["agentes"], ESTADO_DISPONIVEL)

    print(f"FEITO: time '{nome}' removido da Casa (agentes).")
    print("MUDOU:")
    if para_remover:
        for caminho in para_remover:
            print(f"  removido {caminho.relative_to(casa)}")
    else:
        print("  nenhum arquivo (nenhum toml deste time estava em .codex/agents/)")
    codigo_espelho = espelhar_catalogo(casa)
    print(
        ("Sobre as skills: " if codigo_espelho else "FALTA: nada nesta Casa: ")
        + f"as skills do time '{nome}' CONTINUAM em .agents/skills/ (só os agentes saíram); "
        f"pra ligar o time de novo, use --time {nome} --instalar."
    )
    return 0


def acao_listar(casa: Path, gravar: bool) -> int:
    caminho_plugins = casa / "capacidades" / "PLUGINS.md"
    linhas_atuais = {linha["time"].strip().lower(): linha for linha in ler_tabela_times(caminho_plugins)}
    nomes_da_casa = nomes_dos_times_da_casa(casa)
    # o time que mora na Casa vence um plugin de mesmo nome (é a ordem de resolução do --instalar)
    nomes = [nome for nome in nomes_candidatos(casa) if nome not in nomes_da_casa]

    print("Time | Origem | Agentes | Estado")
    if not nomes and not nomes_da_casa:
        print("(nenhum time encontrado em times/ da Casa, no marketplace de repositório nem no cache de plugin)")
        return 0

    def mostrar(nome: str, origem, agentes_celula: str) -> None:
        existente = linhas_atuais.get(nome.strip().lower())
        estado = existente["estado"] if existente else ESTADO_DISPONIVEL
        print(f"{nome} | {origem} | {agentes_celula} | {estado}")
        if gravar:
            upsert_linha_times(caminho_plugins, nome, agentes_celula, estado)

    for nome in nomes_da_casa:
        raiz_time = casa / "times" / nome
        try:
            tomls = tomls_do_time_da_casa(raiz_time, ler_time_json(raiz_time))
        except ErroTime as erro:
            print(f"AVISO: time '{nome}' ficou fora da lista: {erro}", file=sys.stderr)
            continue
        mostrar(nome, raiz_time / "time.json", ", ".join(Path(arquivo).stem for arquivo in tomls))

    for nome in nomes:
        try:
            origem = resolver_origem_time(casa, nome)
        except ErroTime:
            continue
        nomes_agentes = sorted(caminho.stem for caminho in (origem / "agents").glob("*.toml"))
        mostrar(nome, origem, ", ".join(nomes_agentes) if nomes_agentes else CELULA_VAZIA)
    return 0


def acao_instalar(casa: Path, nome: str, dry_run: bool) -> int:
    raiz_time = resolver_time_da_casa(casa, nome)
    if raiz_time is not None:
        return instalar_time_da_casa(casa, nome, raiz_time, dry_run)
    origem = resolver_origem_time(casa, nome)

    tomls = sorted((origem / "agents").glob("*.toml"))
    for caminho in tomls:
        if "claude" in caminho.read_text(encoding="utf-8", errors="replace").lower():
            raise ErroTime(
                f"{caminho.relative_to(origem)} contém resto de outra plataforma "
                "('claude') e não pode ser instalado nesta Casa.",
                3,
            )

    soma_atual, _ = medir_orcamento(casa)
    soma_time = medir_time(origem)
    projecao = soma_atual + soma_time
    if projecao > TETO_CHARS:
        instalados = times_instalados(casa / "capacidades" / "PLUGINS.md")
        remover_sugestao = ", ".join(instalados) if instalados else "(nenhum time instalado ainda)"
        raise ErroTime(
            f"Instalar '{nome}' projeta {projecao} chars de name+description do orçamento "
            f"de listagem (teto {TETO_CHARS}): {soma_atual} já em uso + {soma_time} deste "
            f"time. Remova um time primeiro — instalados hoje: {remover_sugestao}.",
            4,
        )

    nomes_agentes = [caminho.stem for caminho in tomls]
    agentes_celula = ", ".join(nomes_agentes) if nomes_agentes else CELULA_VAZIA

    if dry_run:
        print(
            f"DRY-RUN: instalaria {len(tomls)} agente(s) de '{nome}': "
            f"{agentes_celula if tomls else '(nenhum, módulo só-skill)'}."
        )
        print(f"Projeção de orçamento: {soma_atual} + {soma_time} = {projecao} de {TETO_CHARS}.")
        return 0

    destino_dir = casa / ".codex" / "agents"
    destino_dir.mkdir(parents=True, exist_ok=True)
    tocados: list[Path] = []
    for caminho in tomls:
        destino = destino_dir / caminho.name
        origem_bytes = caminho.read_bytes()
        if not destino.is_file() or destino.read_bytes() != origem_bytes:
            escrever_atomico_bytes(destino, origem_bytes)
            tocados.append(destino)

    upsert_linha_times(casa / "capacidades" / "PLUGINS.md", nome, agentes_celula, ESTADO_ATIVO)

    print(f"FEITO: time '{nome}' instalado com {len(nomes_agentes)} agente(s).")
    if tocados:
        print("MUDOU:")
        for caminho in tocados:
            print(f"  {caminho.relative_to(casa)} (sha256 {sha256_curto(caminho)})")
    else:
        print("MUDOU: nada nos arquivos (já estava instalado, byte a byte igual); linha do catálogo conferida.")
    if banco_conectado(casa):
        espelhar_catalogo(casa)
    else:
        print("FALTA: nada — o time já pode ser chamado com $polozi-chamar-time.")
    return 0


def acao_remover(casa: Path, nome: str) -> int:
    caminho_plugins = casa / "capacidades" / "PLUGINS.md"
    linha = ler_linha_time(caminho_plugins, nome)
    if linha is None or linha["estado"].strip().lower() != ESTADO_ATIVO:
        raise ErroTime(
            f"Time '{nome}' não está registrado como instalado em {caminho_plugins.name}.",
            4,
        )

    raiz_time = resolver_time_da_casa(casa, nome)
    if raiz_time is not None:
        return remover_time_da_casa(casa, nome, raiz_time, linha)

    origem = resolver_origem_time(casa, nome)
    nomes_agentes = nomes_da_celula(linha["agentes"])
    destino_dir = casa / ".codex" / "agents"

    divergentes = []
    para_apagar = []
    for nome_agente in nomes_agentes:
        destino = destino_dir / f"{nome_agente}.toml"
        origem_toml = origem / "agents" / f"{nome_agente}.toml"
        if not destino.is_file():
            continue
        if not origem_toml.is_file() or destino.read_bytes() != origem_toml.read_bytes():
            divergentes.append(str(destino.relative_to(casa)))
            continue
        para_apagar.append(destino)

    if divergentes:
        raise ErroTime(
            "Arquivo(s) divergente(s) da origem do time, NADA foi apagado (pode ter sido "
            f"editado à mão): {', '.join(divergentes)}. Resolva a diferença antes de remover.",
            5,
        )

    for caminho in para_apagar:
        caminho.unlink()

    upsert_linha_times(caminho_plugins, nome, linha["agentes"], ESTADO_DISPONIVEL)

    print(f"FEITO: time '{nome}' removido da Casa (camada 2 — agentes).")
    print("MUDOU:")
    if para_apagar:
        for caminho in para_apagar:
            print(f"  removido {caminho.relative_to(casa)}")
    else:
        print("  nenhum arquivo (nenhum toml deste time estava em .codex/agents/)")
    codigo_espelho = espelhar_catalogo(casa)
    # Um FALTA só e verdadeiro: se o catálogo falhou, o FALTA dele já saiu; senão não falta nada na Casa.
    print(
        ("Sobre o plugin: " if codigo_espelho else "FALTA: nada nesta Casa — ")
        + f"o plugin '{nome}' CONTINUA instalado; desligar/desinstalar "
        "o plugin é gesto do CLI plugin browser (Space) ou de um plugin browser suportado "
        "('Uninstall plugin'), ver SKILL.md."
    )
    return 0


def acao_verificar(casa: Path, nome: str) -> int:
    caminho_plugins = casa / "capacidades" / "PLUGINS.md"
    linha = ler_linha_time(caminho_plugins, nome)
    if linha is None or linha["estado"].strip().lower() != ESTADO_ATIVO:
        print(f"Time '{nome}' não está instalado. Use $polozi-instalar-time.", file=sys.stderr)
        return 2

    nomes_agentes = nomes_da_celula(linha["agentes"])
    for nome_agente in nomes_agentes:
        caminho_toml = casa / ".codex" / "agents" / f"{nome_agente}.toml"
        if not caminho_toml.is_file():
            print(
                f"Time '{nome}' está marcado ativo mas falta {caminho_toml.name} em "
                ".codex/agents/. Use $polozi-instalar-time. ",
                file=sys.stderr,
            )
            return 2

    print(f"Time '{nome}' instalado ({len(nomes_agentes)} agente(s)).")
    return 0


def acao_medir(casa: Path) -> int:
    soma, contagem = medir_orcamento(casa)
    folga = TETO_CHARS - soma
    print(
        f"ORÇAMENTO DE LISTAGEM: {soma} de {TETO_CHARS} chars em {contagem} SKILL.md "
        f"descobertos (Casa + skills pessoais + cache de plugin). Folga: {folga}."
    )
    return 0


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--casa", default=".", help="Pasta raiz da Casa (default: cwd).")
    parser.add_argument("--listar", action="store_true")
    parser.add_argument("--gravar", action="store_true", help="Com --listar, grava capacidades/PLUGINS.md.")
    parser.add_argument("--time", help="Nome do time (plugin) a instalar/remover.")
    parser.add_argument("--instalar", action="store_true")
    parser.add_argument("--remover", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verificar", help="Nome do time a verificar (exit 0 instalado, 2 não).")
    parser.add_argument("--medir", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = argumentos()
    try:
        casa = Path(args.casa).expanduser().resolve()
        modos = [args.listar, bool(args.time), bool(args.verificar), args.medir]
        if sum(1 for modo in modos if modo) != 1:
            raise ErroTime(
                "Use exatamente um modo: --listar, --time (com --instalar/--remover), "
                "--verificar ou --medir."
            )
        validar_casa(casa)

        if args.medir:
            return acao_medir(casa)
        if args.verificar:
            return acao_verificar(casa, args.verificar)
        if args.listar:
            if args.instalar or args.remover or args.dry_run:
                raise ErroTime("--listar não combina com --instalar/--remover/--dry-run.")
            return acao_listar(casa, gravar=args.gravar)

        # --time
        if sum([args.instalar, args.remover]) != 1:
            raise ErroTime("--time exige exatamente um de --instalar ou --remover.")
        if args.remover and args.dry_run:
            raise ErroTime("--dry-run só existe junto com --instalar.")
        if args.instalar:
            return acao_instalar(casa, args.time, dry_run=args.dry_run)
        return acao_remover(casa, args.time)
    except ErroTime as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return erro.codigo
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: falha de arquivo: {erro}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
