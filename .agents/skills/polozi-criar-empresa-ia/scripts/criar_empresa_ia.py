#!/usr/bin/env python3
"""Inicializa a Empresa IA (v3) a partir do modelo determinístico.

Dois modos:

1. Cópia (default, legado): COPIA assets/modelo-empresa-ia-v3/ inteiro pra
   uma pasta vazia, inclusive `.codex/` (config.toml + os 4 agentes-núcleo,
   já gerados e versionados a partir de assets/agents-spec/agentes.json) —
   nunca gera nada em tempo de instalação.
2. `--in-place` (o que o D1 usa): a Casa JÁ EXISTE na pasta aberta pelo aluno.
   Este modo só RENDERIZA os placeholders (`{{NOME_EMPRESA}}`, `{{NOME_DONO}}`,
   `{{DATA_ATUAL}}`, `{{EMAIL_DONO}}`) nos `.md` que ainda os têm, grava o
   nome do sistema (`slug_os`, decisão I21) em `operacao/INSTALACAO.md` e
   cuida do git local. Nunca cria arquivo novo, nunca copia nada: a árvore
   já é a do modelo. A Casa chega de 2 jeitos:
   a) descompactada do zip, sem `.git`: `git init` + commit inicial, na branch
      `main`, com os hooks do git ainda DESLIGADOS (a Casa nasce como o kit a
      entregou, com as migrations do modelo, que o pre-commit barraria por não
      terem o veredito do aluno) e SÓ DEPOIS do commit liga o `core.hooksPath`:
      a trava vale a partir da primeira mudança do aluno;
   b) CLONADA do repositório-modelo `polozigit/mestre-das-ias-os` (tem `.git`
      e `origin` apontando pro modelo): mantém o `.git`, liga o hooksPath e
      faz o commit "Casa configurada para <nome>". NUNCA faz push e NUNCA
      troca o `origin`: quem troca pro repositório do aluno e empurra é a
      etapa 4-github do instalador (push no modelo está fora de questão).
   Casa que já foi configurada (tem `.git` com commit, hooksPath ligado, não
   tem mais placeholder e o `origin` não é o do modelo) é recusada. `.git`
   SEM commit (a configuração parou no meio) NÃO é "já configurada": o comando
   continua de onde parou.

Os hooks do Codex: o modelo NÃO traz `.codex/hooks.json` (o Codex leria o
placeholder `{{CASA_ABS}}` e o `PreToolUse` sairia 2 em toda ferramenta). Traz
`.codex/hooks.json.modelo`, nome que o Codex ignora, e este script grava o
`.codex/hooks.json` já RENDERIZADO com o caminho absoluto da Casa. O `.modelo`
fica na Casa (é a fonte pra gerar o arquivo de novo se a pasta mudar de lugar).

No modo de cópia a pasta nasce com git local (init + commit inicial + hooksPath,
sempre na branch `main`).
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import date
from pathlib import Path


MARCADORES = ("AGENTS.md", "EMPRESA-IA.md", "MAPA-DA-EMPRESA-IA.md")
IGNORADOS_NA_PASTA = {".DS_Store"}
ARQUIVOS_DE_ESTRUTURA = {".estrutura"}

# Repositório-modelo da Casa (a aula manda o aluno clonar este). `origin` apontando pra ele = Casa
# clonada, ainda não ligada ao repositório do aluno. Casa pra URL https, ssh e caminho local que
# termine em `polozigit/mestre-das-ias-os[.git]`, sem confundir com `mestre-das-ias-os-outro`.
REPOSITORIO_MODELO = "polozigit/mestre-das-ias-os"
_RE_REMOTE_DO_MODELO = re.compile(
    r"(?:^|[/:])" + re.escape(REPOSITORIO_MODELO) + r"(?:\.git)?/?$", re.IGNORECASE
)
PLACEHOLDER_NAO_CONFIGURADA = "{{NOME_EMPRESA}}"

# `.codex/hooks.json` é o que o Codex lê; o modelo traz só o `.modelo` (ver docstring do topo).
CAMINHO_HOOKS = Path(".codex") / "hooks.json"
CAMINHO_HOOKS_MODELO = Path(".codex") / "hooks.json.modelo"

# Artigos que não contam como "primeiro nome" da empresa ("O Boticário" -> boticario-os).
ARTIGOS_INICIAIS = {"a", "o", "as", "os", "um", "uma", "uns", "umas"}
TETO_SLUG_BASE = 40


class ErroCriacao(Exception):
    """Erro esperado, apresentado sem traceback ao usuário."""


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Cria a estrutura Empresa IA (v3) na pasta de destino existente."
    )
    parser.add_argument("--nome", required=True, help="Nome da empresa.")
    parser.add_argument("--dono", required=True, help="Nome do dono da empresa.")
    parser.add_argument("--email", required=True, help="E-mail do dono (login do sistema).")
    parser.add_argument("--destino", required=True, help="Pasta principal já aberta.")
    parser.add_argument(
        "--in-place",
        action="store_true",
        help=(
            "A Casa já existe na pasta (clonada do repositório-modelo ou descompactada do zip): "
            "só renderiza, grava o nome do sistema e cuida do git local (sem push)."
        ),
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Mostra a prévia sem escrever nem rodar git."
    )
    parser.add_argument(
        "--permitir-pasta-nao-vazia",
        action="store_true",
        help="Permite criar ao lado de itens existentes, sem sobrescrevê-los.",
    )
    return parser.parse_args()


def validar_texto(valor: str, rotulo: str, limite: int = 120) -> str:
    valor = " ".join(valor.split())
    if not valor:
        raise ErroCriacao(f"O {rotulo} não pode ficar vazio.")
    if len(valor) > limite:
        raise ErroCriacao(f"O {rotulo} deve ter no máximo {limite} caracteres.")
    if any(ord(caractere) < 32 for caractere in valor):
        raise ErroCriacao(f"O {rotulo} contém caractere de controle.")
    return valor


def validar_email(valor: str) -> str:
    valor = validar_texto(valor, "e-mail do dono", limite=254)
    if " " in valor:
        raise ErroCriacao("O e-mail do dono não pode ter espaço.")
    if valor.count("@") != 1:
        raise ErroCriacao('O e-mail do dono precisa ter exatamente um "@".')
    dominio = valor.split("@", 1)[1]
    if "." not in dominio:
        raise ErroCriacao('O e-mail do dono precisa ter um ponto depois do "@".')
    return valor


def slug_os(nome: str) -> str:
    """Nome do sistema (decisão I21): primeiro nome da empresa, minúsculo, sem acento, mais `-os`.
    "Clima Sul Ar" -> `clima-os`. É o nome da pasta, do repositório no GitHub, do projeto na Vercel e
    dos projetos no Supabase (`<slug>` e `<slug>-homolog`). Artigo no começo ("O Boticário") não conta
    como nome. Só letras sem acento, números e hífen; no máximo 40 caracteres antes do `-os`."""
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFKD", nome) if not unicodedata.combining(c)
    )
    palavras = [
        re.sub(r"[^a-z0-9]+", "-", palavra.casefold()).strip("-") for palavra in sem_acento.split()
    ]
    palavras = [palavra for palavra in palavras if palavra]
    if len(palavras) > 1 and palavras[0] in ARTIGOS_INICIAIS:
        palavras = palavras[1:]
    base = palavras[0][:TETO_SLUG_BASE].strip("-") if palavras else ""
    if not base:
        raise ErroCriacao(
            f'Não consegui tirar o nome do sistema de "{nome}": o primeiro nome da empresa precisa ter '
            "ao menos uma letra (sem acento) ou número."
        )
    return f"{base}-os"


def localizar_modelo() -> Path:
    modelo = Path(__file__).resolve().parent.parent / "assets" / "modelo-empresa-ia-v3"
    if not modelo.is_dir():
        raise ErroCriacao(f"Modelo da Empresa IA não encontrado: {modelo}")
    return modelo


def listar_modelo(modelo: Path) -> tuple[list[Path], list[Path]]:
    """Árvore inteira do modelo, incluindo `.codex/` — a Casa v3 nasce copiada
    pronta (config.toml + os 4 agentes-núcleo), nunca gerada em tempo de
    instalação."""
    diretorios: set[Path] = set()
    arquivos: list[Path] = []
    for origem in sorted(modelo.rglob("*")):
        relativo = origem.relative_to(modelo)
        if origem.is_dir():
            diretorios.add(relativo)
            continue
        if origem.name in ARQUIVOS_DE_ESTRUTURA:
            diretorios.add(relativo.parent)
            continue
        arquivos.append(relativo)
        diretorios.add(relativo.parent)
    diretorios.discard(Path("."))
    return sorted(diretorios), sorted(arquivos)


def itens_existentes(destino: Path) -> list[str]:
    return sorted(
        item.name for item in destino.iterdir() if item.name not in IGNORADOS_NA_PASTA
    )


def verificar_destino(
    destino: Path, diretorios: list[Path], arquivos: list[Path]
) -> None:
    if not destino.exists():
        raise ErroCriacao(f"A pasta de destino não existe: {destino}")
    if not destino.is_dir():
        raise ErroCriacao(f"O destino não é uma pasta: {destino}")
    for marcador in MARCADORES:
        if (destino / marcador).exists():
            raise ErroCriacao("Esta pasta já foi inicializada como Empresa IA.")
    if (destino / ".git").exists():
        raise ErroCriacao(
            "Esta pasta já tem um repositório git (.git existe) — não é uma instalação nova."
        )
    for relativo in diretorios:
        alvo = destino / relativo
        if alvo.is_symlink() or (alvo.exists() and not alvo.is_dir()):
            raise ErroCriacao(f"Conflito de diretório: {alvo}")
    for relativo in arquivos:
        alvo = destino / relativo
        if alvo.exists() or alvo.is_symlink():
            raise ErroCriacao(f"Arquivo existente não será sobrescrito: {alvo}")
    # o `.codex/hooks.json` não vem no modelo, é GERADO do `.modelo`: um que já exista também não se sobrescreve
    gerado = destino / CAMINHO_HOOKS
    if gerado.exists() or gerado.is_symlink():
        raise ErroCriacao(f"Arquivo existente não será sobrescrito: {gerado}")


def origin_da_casa(destino: Path) -> str | None:
    """URL do remote `origin` da Casa, ou None (sem git, sem origin ou git ausente)."""
    try:
        resultado = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=str(destino),
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return None
    url = resultado.stdout.strip()
    return url if resultado.returncode == 0 and url else None


def remote_e_do_modelo(url: str | None) -> bool:
    """True se a URL (https, ssh ou caminho local) é a do repositório-modelo da Casa."""
    return bool(url) and _RE_REMOTE_DO_MODELO.search(url.strip()) is not None


def casa_tem_placeholder(destino: Path) -> bool:
    """True se algum `.md` da Casa ainda tem `{{NOME_EMPRESA}}`: sinal de que ela não foi configurada."""
    for caminho in sorted(destino.rglob("*.md")):
        partes = caminho.relative_to(destino).parts
        if ".git" in partes or "node_modules" in partes:
            continue
        if PLACEHOLDER_NAO_CONFIGURADA in caminho.read_text(encoding="utf-8", errors="ignore"):
            return True
    return False


def origem_dos_hooks(destino: Path) -> Path | None:
    """De onde sai o `.codex/hooks.json` desta Casa: o `.modelo` (o normal) ou, numa Casa de modelo antigo
    que ainda traz o `hooks.json` com o placeholder, o próprio `hooks.json`. None se nenhum dos dois existe."""
    for candidato in (CAMINHO_HOOKS_MODELO, CAMINHO_HOOKS):
        if (destino / candidato).is_file():
            return destino / candidato
    return None


def casa_tem_commit(destino: Path) -> bool:
    """True se a Casa tem `.git` COM pelo menos um commit. `.git` sem commit = o commit inicial não foi feito
    (a configuração parou no meio): isso não é Casa "já configurada"."""
    if not (destino / ".git").exists():
        return False
    try:
        resultado = subprocess.run(
            ["git", "rev-parse", "--verify", "-q", "HEAD"],
            cwd=str(destino), capture_output=True, text=True, check=False,
        )
    except OSError:
        return False
    return resultado.returncode == 0


def hooks_ligados(destino: Path) -> bool:
    """True se o repositório da Casa já aponta `core.hooksPath` pra `.githooks` (só a config LOCAL conta)."""
    try:
        resultado = subprocess.run(
            ["git", "config", "--local", "--get", "core.hooksPath"],
            cwd=str(destino), capture_output=True, text=True, check=False,
        )
    except OSError:
        return False
    return resultado.returncode == 0 and resultado.stdout.strip() == ".githooks"


def verificar_destino_in_place(destino: Path) -> None:
    """Espelho invertido de verificar_destino: a Casa PRECISA já existir na
    pasta (vem pronta no zip ou clonada do repositório-modelo) e ainda NÃO pode
    ter sido configurada. Sem `.git` (zip) está sempre livre. Com `.git`, só
    vale se for Casa clonada do modelo (`origin` aponta pra `polozigit/mestre-das-ias-os`)
    ou se ainda tiver placeholder `{{NOME_EMPRESA}}`; sem os dois, já foi
    configurada e o comando recusa."""
    if not destino.exists():
        raise ErroCriacao(f"A pasta de destino não existe: {destino}")
    if not destino.is_dir():
        raise ErroCriacao(f"O destino não é uma pasta: {destino}")
    for marcador in MARCADORES:
        if not (destino / marcador).exists():
            raise ErroCriacao(
                "Esta pasta não é a raiz da Casa — abra no Codex a pasta que tem o AGENTS.md."
            )
    if not (destino / ".codex" / "config.toml").exists():
        raise ErroCriacao(
            "Esta pasta não é a raiz da Casa — abra no Codex a pasta que tem o AGENTS.md."
        )
    if origem_dos_hooks(destino) is None:
        raise ErroCriacao(
            "Esta pasta não é a raiz da Casa v4: falta .codex/hooks.json.modelo (o modelo do hook de "
            "verificação de estado, que este comando renderiza em .codex/hooks.json)."
        )
    if (destino / ".git").exists() and not (
        remote_e_do_modelo(origin_da_casa(destino)) or casa_tem_placeholder(destino)
    ):
        if not casa_tem_commit(destino) or not hooks_ligados(destino):
            return  # a configuração parou no meio (sem commit inicial ou sem hooksPath): continua de onde parou
        raise ErroCriacao(
            "Esta Casa já foi configurada (.git existe, sem placeholder e sem o remote do "
            "repositório-modelo). Nada a fazer."
        )


def configurar_in_place(destino: Path, nome: str, dono: str, email: str) -> list[Path]:
    """Renderiza só os .md que ainda têm placeholder — nunca cria arquivo
    novo, nunca toca arquivo sem `{{`."""
    tocados: list[Path] = []
    for caminho in sorted(destino.rglob("*.md")):
        if ".git" in caminho.relative_to(destino).parts:
            continue
        texto = caminho.read_text(encoding="utf-8")
        if "{{" not in texto:
            continue
        novo_texto = renderizar(texto, nome, dono, email)
        with caminho.open("w", encoding="utf-8", newline="\n") as arquivo:
            arquivo.write(novo_texto)
        tocados.append(caminho)
    return tocados


def mostrar_previa(
    nome: str,
    dono: str,
    destino: Path,
    diretorios: list[Path],
    arquivos: list[Path],
    existentes: list[str],
) -> None:
    print("PRÉVIA EMPRESA IA (v3)")
    print(f"Empresa: {nome}")
    print(f"Dono: {dono}")
    print(f"Destino: {destino}")
    print(f"Pasta vazia: {'sim' if not existentes else 'não'}")
    if existentes:
        print("Itens existentes:")
        for item in existentes:
            print(f"  - {item}")
    print(f"Diretórios a criar: {len(diretorios)}")
    for relativo in diretorios:
        print(f"  + {relativo.as_posix()}/")
    print(f"Arquivos a criar: {len(arquivos)}")
    for relativo in arquivos:
        print(f"  + {relativo.as_posix()}")
    print("  + .codex/hooks.json (gerado do .codex/hooks.json.modelo, com o caminho absoluto desta pasta)")
    print("  + credenciais/.env (vazio, permissão 600)")
    print("Depois da escrita: git init + commit inicial (branch main) e, só depois dele, core.hooksPath=.githooks.")


# `{{CASA_ABS}}` (hooks.json) NUNCA entra em `renderizar()` — não vaza
# caminho absoluto de máquina pra dentro de documento de texto (.md).
def renderizar(texto: str, nome: str, dono: str, email: str) -> str:
    return (
        texto.replace("{{NOME_EMPRESA}}", nome)
        .replace("{{NOME_DONO}}", dono)
        .replace("{{DATA_ATUAL}}", date.today().isoformat())
        .replace("{{EMAIL_DONO}}", email)
    )


def ler_comando_python(destino: Path) -> str:
    """Lê `comando_python:` do frontmatter de `operacao/INSTALACAO.md` — o
    preflight já grava `python3` ou `py -3` na ETAPA 0. Nunca hardcodar
    `python3` [24a:windows/f21, f22]: no Windows o instalador oficial põe
    `python.exe`/`py`, não `python3`. Sem o campo (ou ainda `pendente`),
    cai no default convencional `python3`."""
    caminho = destino / "operacao" / "INSTALACAO.md"
    try:
        texto = caminho.read_text(encoding="utf-8")
    except OSError:
        return "python3"
    for linha in texto.splitlines():
        if linha.startswith("comando_python:"):
            valor = linha.split(":", 1)[1].strip()
            if valor and valor != "pendente":
                return valor
    return "python3"


# Casa/.codex/hooks/<script>.py, com args opcionais depois — grupo 1 é o
# NOME do script (preservado), grupo 2 é o RESTO da linha (args originais,
# ex. ` --evento startup`, ou vazio). Aceita `/` OU `\` como separador
# porque o valor gravado no modelo pode já estar num ou noutro conforme o
# campo (`command` sempre `/`, `commandWindows` sempre `\`).
_RE_COMANDO_HOOK = re.compile(
    r'"\{\{CASA_ABS\}\}[/\\]\.codex[/\\]hooks[/\\](\w+\.py)"(.*)$'
)


def renderizar_hooks_json(dados: dict, casa_abs: str, comando_python: str, windows: bool) -> dict:
    """Função PURA: recebe o JSON JÁ PARSEADO do `.codex/hooks.json` do
    modelo (formato oficial com envelope `{"description"?, "hooks": {evento:
    [...]}}`; a função percorre o dict inteiro, então não depende do
    envelope; ainda com `{{CASA_ABS}}` e os interpretadores default `python3`/
    `py -3`) e devolve um dict novo, pronto pra `json.dump`. NUNCA por
    replace no texto cru — caminho Windows com espaço (`C:\\Users\\Fulano
    da Silva\\...`) quebra o JSON com `JSONDecodeError: Invalid \\escape`
    (medido; G26). O campo da PLATAFORMA DA INSTALAÇÃO (`command` se
    `windows=False`, `commandWindows` se `windows=True`) recebe o
    interpretador MEDIDO (`comando_python`); o campo da outra plataforma
    mantém seu default convencional — nunca roda ali mesmo. Caminho sempre
    ABSOLUTO e entre aspas duplas nos 2 campos.

    GENERALIZADA (E1): a função não conhece mais nomes de script fixos —
    ela reescreve QUALQUER comando com `{{CASA_ABS}}` PRESERVANDO o nome do
    script e os argumentos originais (`_RE_COMANDO_HOOK`, grupo 1 = script,
    grupo 2 = resto da linha). Isso permite `guarda.py`/`autosave.py`
    (sem args) conviverem com `verificar_estado.py --evento startup/compact`
    no mesmo arquivo, cada um apontando pro SEU PRÓPRIO script. Valor com
    `{{CASA_ABS}}` que NÃO casar o regex é erro EXPLÍCITO (`ValueError`,
    valor mascarado na mensagem) — nunca silêncio, nunca cai pro script
    errado."""
    chave_da_instalacao = "commandWindows" if windows else "command"

    def _renderizar_valor(valor: str, windows_do_campo: bool, py: str) -> str:
        achado = _RE_COMANDO_HOOK.search(valor)
        if achado is None:
            mascarado = valor.replace(casa_abs, "<CASA_ABS_MEDIDO>")
            raise ValueError(
                f"comando de hook com {{{{CASA_ABS}}}} não casa o formato esperado "
                f'(<script>.py em .codex/hooks/): "{mascarado}"'
            )
        script = achado.group(1)
        args = achado.group(2)
        separador = chr(92) if windows_do_campo else "/"
        casa_normalizada = casa_abs.replace("/", separador) if windows_do_campo else casa_abs.replace(chr(92), "/")
        caminho_script = f"{casa_normalizada}{separador}.codex{separador}hooks{separador}{script}"
        return f'{py} "{caminho_script}"{args}'

    def _percorrer(obj):
        if isinstance(obj, dict):
            novo = {}
            for chave, valor in obj.items():
                eh_comando = chave in ("command", "commandWindows") and isinstance(valor, str)
                if eh_comando and "{{CASA_ABS}}" in valor:
                    windows_do_campo = chave == "commandWindows"
                    if chave == chave_da_instalacao:
                        py = comando_python
                    else:
                        py = "py -3" if windows_do_campo else "python3"
                    novo[chave] = _renderizar_valor(valor, windows_do_campo, py)
                elif isinstance(valor, (dict, list)):
                    novo[chave] = _percorrer(valor)
                else:
                    novo[chave] = valor
            return novo
        if isinstance(obj, list):
            return [_percorrer(item) for item in obj]
        return obj

    return _percorrer(dados)


def renderizar_e_gravar_hooks(destino: Path, casa_abs: Path, comando_python: str) -> Path:
    """Lê o modelo dos hooks (`.codex/hooks.json.modelo`; numa Casa de modelo antigo, o próprio
    `.codex/hooks.json` com o placeholder), renderiza com a função pura e grava o `.codex/hooks.json` que o
    Codex lê, sempre via `json.loads`/`json.dump`, nunca texto cru. O `.modelo` fica onde está: é a fonte
    pra gerar o arquivo de novo se a pasta da Casa mudar de lugar."""
    origem = origem_dos_hooks(destino)
    if origem is None:
        raise ErroCriacao("Falta .codex/hooks.json.modelo: não há de onde gerar o .codex/hooks.json.")
    caminho = destino / CAMINHO_HOOKS
    dados = json.loads(origem.read_text(encoding="utf-8"))
    windows = sys.platform.startswith("win")
    novo = renderizar_hooks_json(dados, str(casa_abs), comando_python, windows)
    with caminho.open("w", encoding="utf-8", newline="\n") as arquivo:
        json.dump(novo, arquivo, ensure_ascii=False, indent=2)
        arquivo.write("\n")
    return caminho


def criar(
    modelo: Path,
    destino: Path,
    diretorios: list[Path],
    arquivos: list[Path],
    nome: str,
    dono: str,
    email: str,
) -> None:
    dirs_criados: list[Path] = []
    arquivos_criados: list[Path] = []
    try:
        for relativo in diretorios:
            alvo = destino / relativo
            if not alvo.exists():
                alvo.mkdir(parents=True, exist_ok=True)
                dirs_criados.append(alvo)
        for relativo in arquivos:
            origem = modelo / relativo
            alvo = destino / relativo
            if origem.suffix == ".md":
                conteudo = renderizar(origem.read_text(encoding="utf-8"), nome, dono, email)
                with alvo.open("x", encoding="utf-8", newline="\n") as arquivo:
                    arquivo.write(conteudo)
            else:
                with alvo.open("xb") as arquivo:
                    arquivo.write(origem.read_bytes())
            shutil.copymode(origem, alvo)
            arquivos_criados.append(alvo)
    except Exception:
        for arquivo in reversed(arquivos_criados):
            arquivo.unlink(missing_ok=True)
        for diretorio in reversed(dirs_criados):
            try:
                diretorio.rmdir()
            except OSError:
                pass
        raise


def criar_env_vazio(destino: Path) -> Path:
    caminho = destino / "credenciais" / ".env"
    conteudo = (
        "# Valores de chave desta empresa. NUNCA cole um valor aqui pelo chat —\n"
        "# só script grava (clipboard -> arquivo). Uso: source credenciais/.env.\n"
        "# Nomes de variável e registro do serviço ficam em credenciais/CONEXOES.md.\n"
    )
    with caminho.open("x", encoding="utf-8", newline="\n") as arquivo:
        arquivo.write(conteudo)
    caminho.chmod(0o600)
    return caminho


def rodar_git(args: list[str], destino: Path, mensagem_erro: str) -> subprocess.CompletedProcess:
    resultado = subprocess.run(
        ["git", *args], cwd=str(destino), capture_output=True, text=True, check=False
    )
    if resultado.returncode != 0:
        detalhe = resultado.stderr.strip() or resultado.stdout.strip()
        raise ErroCriacao(f"{mensagem_erro}: {detalhe}")
    return resultado


def ligar_hooks(destino: Path) -> None:
    """Liga a trava de segredo e de migration sem veredito (`core.hooksPath=.githooks`)."""
    rodar_git(
        ["config", "core.hooksPath", ".githooks"], destino, "git config core.hooksPath falhou"
    )


def garantir_identidade(destino: Path, dono: str) -> None:
    """Se a máquina ainda não tem identidade de git, grava uma local na pasta (o commit não roda sem ela)."""
    identidade = subprocess.run(
        ["git", "config", "user.name"],
        cwd=str(destino),
        capture_output=True,
        text=True,
        check=False,
    )
    if identidade.returncode != 0 or not identidade.stdout.strip():
        rodar_git(["config", "user.name", dono], destino, "git config user.name falhou")
        rodar_git(
            ["config", "user.email", "empresa-ia@local"],
            destino,
            "git config user.email falhou",
        )


def inicializar_git(destino: Path, nome: str, dono: str) -> None:
    """`git init` + commit inicial na branch `main` e, SÓ DEPOIS do commit, liga o `core.hooksPath`.

    O commit inicial é a Casa como o kit a entregou (com as migrations do modelo, que não têm o veredito do
    aluno): com a trava ligada, o pre-commit barraria o commit inteiro e o aluno ficaria sem saída. Por isso o
    `core.hooksPath` só é ligado DEPOIS dele e o commit vai com `--no-verify`, que cobre também o `.git` que uma
    tentativa anterior deixou com a trava já ligada e sem commit (repetir o comando continua de onde parou).
    A trava vale a partir da primeira mudança do aluno. `git init` num `.git` que já existe é inofensivo."""
    rodar_git(["init"], destino, "git init falhou")
    rodar_git(["branch", "-M", "main"], destino, "git branch -M main falhou")
    garantir_identidade(destino, dono)
    rodar_git(["add", "-A"], destino, "git add falhou")
    rodar_git(
        ["commit", "--no-verify", "-m", f"casa inicial da {nome} IA"], destino, "git commit inicial falhou"
    )
    ligar_hooks(destino)


def configurar_git_existente(destino: Path, nome: str, dono: str) -> bool:
    """Casa que chegou com `.git` (clonada do repositório-modelo): MANTÉM o `.git` e o remote
    `origin`, liga o hooksPath e comita o que foi renderizado (hooks.json incluído) como
    "Casa configurada para <nome>". Não faz `git init`, NUNCA faz push e NUNCA troca o remote:
    a etapa 4-github do instalador troca o `origin` pro repositório do aluno e empurra.
    Devolve False quando não havia nada pra comitar (repetir o comando é seguro). Aqui a trava já vale no
    commit: ele só leva os arquivos renderizados, e o histórico do modelo não é tocado."""
    garantir_identidade(destino, dono)
    ligar_hooks(destino)
    rodar_git(["add", "-A"], destino, "git add falhou")
    pendente = rodar_git(["status", "--porcelain"], destino, "git status falhou").stdout.strip()
    if not pendente:
        return False
    rodar_git(
        ["commit", "-m", f"Casa configurada para {nome}"], destino, "git commit da Casa falhou"
    )
    return True


def gravar_slug_instalacao(destino: Path, slug: str) -> bool:
    """Grava `slug_os: <slug>` no frontmatter de `operacao/INSTALACAO.md` (troca a linha se já
    existir, senão acrescenta). As etapas 4 a 8 do instalador leem o nome daqui, em sessões
    diferentes. False se o arquivo ou o frontmatter não existem."""
    caminho = destino / "operacao" / "INSTALACAO.md"
    try:
        texto = caminho.read_text(encoding="utf-8")
    except OSError:
        return False

    def substituir(correspondencia: re.Match) -> str:
        corpo = correspondencia.group(1)
        if re.search(r"^slug_os:.*$", corpo, re.M):
            corpo = re.sub(r"^slug_os:.*$", f"slug_os: {slug}", corpo, flags=re.M)
        else:
            corpo = corpo + f"\nslug_os: {slug}"
        return f"---\n{corpo}\n---"

    novo, quantidade = re.subn(r"^---\n(.*?)\n---", substituir, texto, count=1, flags=re.S)
    if quantidade == 0:
        return False
    with caminho.open("w", encoding="utf-8", newline="\n") as arquivo:
        arquivo.write(novo)
    return True


def main() -> int:
    args = argumentos()
    try:
        nome = validar_texto(args.nome, "nome da empresa")
        dono = validar_texto(args.dono, "nome do dono")
        email = validar_email(args.email)
        destino = Path(args.destino).expanduser().resolve()

        casa_abs = destino.resolve()

        if args.in_place:
            verificar_destino_in_place(destino)
            slug = slug_os(nome)
            tem_historico = casa_tem_commit(destino)  # `.git` COM commit: clonada do modelo ou já comitada
            candidatos = [
                caminho
                for caminho in sorted(destino.rglob("*.md"))
                if ".git" not in caminho.relative_to(destino).parts
                and "{{" in caminho.read_text(encoding="utf-8")
            ]
            print("PRÉVIA CONFIGURAÇÃO IN-PLACE")
            print(f"Empresa: {nome}")
            print(f"Dono: {dono}")
            print(f"E-mail do dono: {email}")
            print(f"Destino: {destino}")
            print(
                f"Nome do sistema: {slug} (pasta, repositório no GitHub, projeto na Vercel e "
                f"projetos no Supabase: {slug} e {slug}-homolog)"
            )
            if tem_historico:
                print(
                    f"Git: Casa com .git (origin = {origin_da_casa(destino) or 'nenhum'}): mantém o "
                    f"repositório e o remote, liga core.hooksPath=.githooks e comita "
                    f'"Casa configurada para {nome}"; sem push.'
                )
            else:
                print(
                    "Git: Casa sem .git (zip, ou .git sem commit): git init + commit inicial (branch "
                    "main) com os hooks ainda desligados e, só depois dele, core.hooksPath=.githooks."
                )
            print(f"Arquivos com placeholder a renderizar: {len(candidatos)}")
            for caminho in candidatos:
                print(f"  ~ {caminho.relative_to(destino).as_posix()}")
            comando_python = ler_comando_python(destino)
            hooks_dados = json.loads(origem_dos_hooks(destino).read_text(encoding="utf-8"))
            hooks_previa = renderizar_hooks_json(
                hooks_dados, str(casa_abs), comando_python, sys.platform.startswith("win")
            )
            grupo_startup = hooks_previa["hooks"]["SessionStart"][0]["hooks"][0]
            print("Hook (comando renderizado):")
            print(f"  command: {grupo_startup['command']}")
            print(f"  commandWindows: {grupo_startup['commandWindows']}")
            if args.dry_run:
                print("DRY-RUN: nenhuma alteração realizada (nada escrito, git não executado).")
                return 0
            tocados = configurar_in_place(destino, nome, dono, email)
            renderizar_e_gravar_hooks(destino, casa_abs, comando_python)
            gravar_slug_instalacao(destino, slug)
            if not (destino / "credenciais" / ".env").exists():
                criar_env_vazio(destino)
            if tem_historico:
                comitou = configurar_git_existente(destino, nome, dono)
                resumo_git = (
                    "Git mantido (origin intacto, sem push): hooksPath .githooks, "
                    + (f'commit "Casa configurada para {nome}".' if comitou else "nada novo pra comitar.")
                )
            else:
                inicializar_git(destino, nome, dono)
                resumo_git = (
                    "Git inicializado: branch main, commit inicial e, depois dele, hooksPath .githooks "
                    "(a trava vale a partir da próxima mudança)."
                )
            print(
                f"CONFIGURADO: {len(tocados)} arquivos renderizados para {nome}. {resumo_git} "
                f"Nome do sistema: {slug}."
            )
            return 0

        modelo = localizar_modelo()
        diretorios, arquivos = listar_modelo(modelo)
        verificar_destino(destino, diretorios, arquivos)
        existentes = itens_existentes(destino)
        mostrar_previa(nome, dono, destino, diretorios, arquivos, existentes)
        if args.dry_run:
            if existentes:
                print("AVISO: a criação exigirá --permitir-pasta-nao-vazia.")
            print("DRY-RUN: nenhuma alteração realizada (nada escrito, git não executado).")
            return 0
        if existentes and not args.permitir_pasta_nao_vazia:
            raise ErroCriacao(
                "A pasta não está vazia. Confirme o destino e use "
                "--permitir-pasta-nao-vazia para continuar sem sobrescrever."
            )
        criar(modelo, destino, diretorios, arquivos, nome, dono, email)
        criar_env_vazio(destino)
        renderizar_e_gravar_hooks(destino, casa_abs, ler_comando_python(destino))
        inicializar_git(destino, nome, dono)
        print(
            f"CRIADO: {len(arquivos)} arquivos e {len(diretorios)} diretórios para {nome}. "
            f"credenciais/.env criado vazio (600). Git inicializado com commit inicial e, depois dele, hooksPath."
        )
        return 0
    except ErroCriacao as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 2
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: falha ao criar a estrutura: {erro}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
