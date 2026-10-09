#!/usr/bin/env python3
"""Primeira vez neste sistema: liga o caminho seguro de publicação (skill tecnologia-publicar).

Por CLI, liga tudo que faz o caminho seguro de publicação existir: vincula o
projeto Vercel pelo nome do sistema (`vercel link --yes --project <slug_os>`, com
o `slug_os:` de `operacao/INSTALACAO.md`), conecta o git, gera e publica o token
de QA, publica o e-mail do dono (PREVIEW_OWNER_EMAIL) no preview,
cria o "Protection Bypass for Automation" da prévia (segredo no `credenciais/.env`),
confere pelos NOMES que as variáveis do Supabase estão na Vercel (quem as grava
é a skill `tecnologia-conectar`, subcomando `vercel-env`), copia os workflows e o
dependabot para a raiz da Casa, grava os secrets do GitHub e liga o Dependabot.
Só então registra um resumo (sem valor de segredo) em `operacao/INSTALACAO.md`.

Stdlib puro (argparse/subprocess/pathlib/secrets/shutil/filecmp/os/sys/
json/re/tempfile), sem rede própria (quem fala com a rede é `vercel`/`gh`),
sem dependência, roda igual em Mac e Windows. Toda escrita é atômica
(arquivo temporário + `os.replace`). NUNCA imprime valor de segredo: só nome,
contagem de caracteres ou "presente"/"ausente". Escrita de credencial NUNCA
vai como argumento de linha de comando: sempre por STDIN de um arquivo
temporário 600, fora da Casa, apagado no `finally`.

Cada passo é uma função pura e IDEMPOTENTE: rodar duas vezes não regenera o
token, não duplica linha em `operacao/INSTALACAO.md` e não reescreve
`.github/` quando já está igual (comparação por `filecmp.cmp(shallow=False)`,
nunca por data de modificação). O texto gravado descreve o ESTADO final
observado, não a ação tomada nesta rodada; por isso rodar duas vezes deixa os
arquivos byte-idênticos. "pulado" só aparece no stdout desta execução, nunca no
arquivo persistido.

O preview entra como o DONO (sem usuário extra e sem senha): o servidor gera um
magic link com a service role para o e-mail em PREVIEW_OWNER_EMAIL. Este script
só publica essa variável na Vercel (só preview), lendo `email_dono:` do
frontmatter de `operacao/INSTALACAO.md`. Sem e-mail válido (ausente, vazio ou
placeholder `{{EMAIL_DONO}}`), o passo `owner_email` fica `NAO-MEDIDO` com a
instrução e a instalação segue. Nada pede ação do dono.

Exit 0 = tudo provado (ou registrado como "não medido" quando a medição é
aberta). Exit 2 = parou num passo com mensagem acionável em stderr; nada além
do que já foi provado é escrito.

Uso:
  instalar_guardas.py --casa <abs> --dry-run   # só lê, imprime o plano
  instalar_guardas.py --casa <abs>             # instala de verdade
  instalar_guardas.py --casa <abs> --json      # + contrato em JSON
  instalar_guardas.py --casa <abs> --so <id> [--so <id> ...]  # retomar um passo
"""
from __future__ import annotations

import argparse
import filecmp
import json
import os
import re
import secrets
import shutil
import string
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

NOME_TOKEN_QA = "PREVIEW_TEST_TOKEN"
NOME_EMAIL_DONO = "PREVIEW_OWNER_EMAIL"
# Segredo do "Protection Bypass for Automation" da Vercel (existe em todos os planos,
# Hobby incluso; doc vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/
# protection-bypass-automation, lida em 09/10/2026). Vai no header `x-vercel-protection-bypass`
# de quem confere a prévia por script. A proteção da prévia continua ligada.
NOME_BYPASS = "VERCEL_AUTOMATION_BYPASS_SECRET"
EVIDENCIA_BYPASS = f"ok: Protection Bypass for Automation ativo na Vercel; {NOME_BYPASS} em credenciais/.env"

NOMES_SUPABASE_ESPERADOS = (
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
)

# Os 3 secrets que `deploy-db.yml` e `backup-db.yml` (workflows reais na raiz da
# Casa depois de `copiar_guardas`) consomem, medidos nos arquivos do template:
# `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`.
NOMES_SECRETS_GITHUB = (
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_PROJECT_ID",
)

ENDPOINTS_DEPENDABOT = ("vulnerability-alerts", "automated-security-fixes")

MARCADOR_INICIO = "<!-- DEPLOY:INICIO -->"
MARCADOR_FIM = "<!-- DEPLOY:FIM -->"
TITULO_BLOCO = "## Publicação do sistema (tecnologia-publicar)"

PADRAO_LINHA_ID = re.compile(r"^- \[(OK|NAO-MEDIDO|ERRO)\] ([a-z_]+): ")

TIMEOUT_PADRAO = 60


class ErroInstalacao(Exception):
    """Erro esperado ao instalar, apresentado sem traceback. Exit 2."""


@dataclass
class Resultado:
    ok: bool
    evidencia: str
    pulado: bool = False
    nao_medido: bool = False
    mensagem_erro: str = ""

    @property
    def rotulo(self) -> str:
        if self.nao_medido:
            return "NAO-MEDIDO"
        return "OK" if self.ok else "ERRO"


@dataclass
class Contexto:
    casa: Path
    dry_run: bool
    token_qa: str | None = field(default=None, repr=False)
    linhas_estado: dict[str, str] = field(default_factory=dict)

    @property
    def projeto(self) -> Path:
        return self.casa / "sistemas" / "empresa-os"

    @property
    def env_path(self) -> Path:
        return self.casa / "credenciais" / ".env"


def _rodar(comando: list[str], cwd: Path | None = None, stdin_handle=None) -> subprocess.CompletedProcess | None:
    # Binário pelo caminho completo: no Windows a CLI da Vercel é `vercel.cmd`, que o
    # `subprocess` com lista não acha sem o caminho inteiro.
    executavel = shutil.which(comando[0])
    if executavel is None:
        return None
    try:
        return subprocess.run(
            [executavel, *comando[1:]], cwd=str(cwd) if cwd else None,
            # sem handle: STDIN vazio (CLI que pergunta algo recebe EOF em vez de herdar o do processo pai)
            stdin=stdin_handle if stdin_handle is not None else subprocess.DEVNULL,
            capture_output=True, text=True, timeout=TIMEOUT_PADRAO, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None


def _saida(resultado: subprocess.CompletedProcess | None) -> str:
    if resultado is None:
        return ""
    return ((resultado.stdout or "") + (resultado.stderr or "")).strip()


def escrever_atomico(caminho: Path, conteudo: str) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
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


def copiar_atomico(origem: Path, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    conteudo = origem.read_bytes()
    with tempfile.NamedTemporaryFile(dir=destino.parent, delete=False) as temporario:
        temporario.write(conteudo)
        nome_temporario = temporario.name
    try:
        os.replace(nome_temporario, destino)
    except Exception:
        Path(nome_temporario).unlink(missing_ok=True)
        raise


def aplicar_permissao_600(caminho: Path) -> None:
    """Restringe leitura ao dono. No Windows, `chmod` não vale: usa `icacls`
    (mesmo gesto da skill `polozi-registrar-conexao`); falha de `icacls` não
    derruba a instalação, só fica sem a restrição extra do sistema (o arquivo já
    está fora do controle de versão pelo `.gitignore`)."""
    if os.name == "nt":
        usuario = os.environ.get("USERNAME", "")
        if usuario:
            subprocess.run(
                ["icacls", str(caminho), "/inheritance:r", "/grant:r", f"{usuario}:R"],
                capture_output=True, text=True, timeout=15, check=False,
            )
        return
    os.chmod(caminho, 0o600)


def _ler_env(ctx: Contexto) -> dict[str, str]:
    texto = ctx.env_path.read_text(encoding="utf-8") if ctx.env_path.is_file() else ""
    valores: dict[str, str] = {}
    for linha in texto.splitlines():
        bruta = linha.strip()
        if not bruta or bruta.startswith("#") or "=" not in bruta:
            continue
        nome, _, valor = bruta.partition("=")
        valores[nome.strip()] = valor.strip()
    return valores


def _com_valor_em_arquivo(prefixo: str, valor: str, comando: list[str], cwd: Path) -> subprocess.CompletedProcess | None:
    """Roda `comando` com o VALOR no stdin, vindo de um arquivo temporário 600
    que some no `finally`. O valor nunca aparece em argumento de linha de comando
    (a lista de processos do computador mostraria)."""
    descritor, caminho_temp_str = tempfile.mkstemp(prefix=prefixo)
    caminho_temp = Path(caminho_temp_str)
    try:
        os.chmod(caminho_temp, 0o600)
        with os.fdopen(descritor, "w", encoding="utf-8") as arquivo_temp:
            arquivo_temp.write(valor)
        with open(caminho_temp, "r", encoding="utf-8") as leitura:
            return _rodar(comando, cwd=cwd, stdin_handle=leitura)
    finally:
        caminho_temp.unlink(missing_ok=True)


def _publicar_variavel_preview(ctx: Contexto, nome: str, valor: str) -> tuple[str | None, bool]:
    """Publica `nome` no ambiente preview da Vercel. Devolve (erro, ja_existia):
    erro é None quando deu certo ou quando a variável já existia."""
    resultado = _com_valor_em_arquivo(
        "tecnologia-preview-", valor, ["vercel", "env", "add", nome, "preview"], ctx.projeto,
    )
    saida = _saida(resultado)
    if resultado is not None and resultado.returncode == 0:
        return None, False
    if "already" in saida.lower() or "já existe" in saida.lower():
        return None, True
    return f"`vercel env add {nome} preview` falhou: {saida}", False


# ---------------------------------------------------------------------------
# Passo 1


def checar_pre_requisitos(ctx: Contexto) -> Resultado:
    faltando = [nome for nome in ("vercel", "gh") if shutil.which(nome) is None]
    if faltando:
        return Resultado(
            False, "",
            mensagem_erro=(
                f"binário(s) ausente(s) na PATH: {', '.join(faltando)}. "
                "Instale a Vercel CLI (`npm i -g vercel`) e o GitHub CLI (`gh`) antes de continuar."
            ),
        )
    resultado = _rodar(["gh", "auth", "status"])
    if resultado is None or resultado.returncode != 0:
        return Resultado(
            False, "",
            mensagem_erro=(
                "`gh auth status` falhou. Rode `gh auth login` (GitHub.com -> HTTPS -> "
                "Login with a web browser) antes de continuar."
            ),
        )
    return Resultado(True, "ok: vercel e gh na PATH, gh autenticado")


# ---------------------------------------------------------------------------
# Passo 2


def _ler_slug_os(ctx: Contexto) -> str:
    """`slug_os:` do frontmatter de `operacao/INSTALACAO.md`, ou "" se faltar ou for
    inválido. Lido DENTRO do passo (nunca no Contexto): o `--so gravar_secrets` da
    `7-banco` roda antes de existir projeto e não pode depender dele."""
    caminho = ctx.casa / "operacao" / "INSTALACAO.md"
    if not caminho.is_file():
        return ""
    frontmatter = re.match(r"---\r?\n(.*?)\r?\n---", caminho.read_text(encoding="utf-8-sig"), re.S)
    achado = re.search(r"(?m)^slug_os:\s*(\S+)", frontmatter.group(1)) if frontmatter else None
    slug = achado.group(1) if achado else ""
    return slug if re.fullmatch(r"[a-z0-9][a-z0-9-]*", slug) else ""


def _ler_email_dono(ctx: Contexto) -> str:
    """`email_dono:` do frontmatter de `operacao/INSTALACAO.md`, ou "" se faltar, estiver
    vazio, for placeholder (`{{EMAIL_DONO}}`) ou não parecer um e-mail."""
    caminho = ctx.casa / "operacao" / "INSTALACAO.md"
    if not caminho.is_file():
        return ""
    frontmatter = re.match(r"---\r?\n(.*?)\r?\n---", caminho.read_text(encoding="utf-8-sig"), re.S)
    achado = re.search(r"(?m)^email_dono:[ \t]*(\S+)[ \t]*$", frontmatter.group(1)) if frontmatter else None
    email = achado.group(1).strip("\"'") if achado else ""
    return email if re.fullmatch(r"[^@\s{}]+@[^@\s{}]+\.[^@\s{}]+", email) else ""


def vincular_projeto(ctx: Contexto) -> Resultado:
    if not ctx.projeto.is_dir():
        return Resultado(False, "", mensagem_erro=f"pasta do projeto não existe: {ctx.projeto}")
    project_json = ctx.projeto / ".vercel" / "project.json"
    if not project_json.is_file():
        slug = _ler_slug_os(ctx)
        if not slug:
            return Resultado(
                False, "",
                mensagem_erro=(
                    "operacao/INSTALACAO.md sem `slug_os:` válido (letras minúsculas, números e hífen). "
                    "O projeto da Vercel tem que se chamar como o sistema; volte à etapa 3-casa do instalador."
                ),
            )
        resultado = _rodar(["vercel", "link", "--yes", "--project", slug], cwd=ctx.projeto)
        if resultado is None or resultado.returncode != 0:
            return Resultado(
                False, "", mensagem_erro=f"`vercel link --yes --project {slug}` falhou: {_saida(resultado)}"
            )
    if not project_json.is_file() or "projectId" not in project_json.read_text(encoding="utf-8"):
        return Resultado(False, "", mensagem_erro="`.vercel/project.json` sem `projectId` após `vercel link`.")
    return Resultado(
        True,
        "ok: .vercel/project.json com projectId; a partir de agora, editar "
        "sistemas/** na main é negado pelo hook (regra 11) e o push na main também (regra 2)",
    )


# ---------------------------------------------------------------------------
# Passo 3


def conectar_git(ctx: Contexto) -> Resultado:
    resultado = _rodar(["vercel", "git", "connect"], cwd=ctx.projeto)
    saida = _saida(resultado)
    if "already" in saida.lower():
        # O conector da Vercel já ligou o git ao criar o projeto: é "pulado", não erro.
        return Resultado(True, "ok: vercel git connect (idempotente)", pulado=True)
    if resultado is None or resultado.returncode != 0:
        return Resultado(False, "", mensagem_erro=f"`vercel git connect` falhou: {_saida(resultado)}")
    return Resultado(True, "ok: vercel git connect (idempotente)")


# ---------------------------------------------------------------------------
# Passo 4


def gerar_token_qa(ctx: Contexto) -> Resultado:
    texto = ctx.env_path.read_text(encoding="utf-8") if ctx.env_path.is_file() else ""
    ja_tem = any(linha.startswith(f"{NOME_TOKEN_QA}=") for linha in texto.splitlines())
    if ja_tem:
        for linha in texto.splitlines():
            if linha.startswith(f"{NOME_TOKEN_QA}="):
                ctx.token_qa = linha.partition("=")[2].strip()
                break
        return Resultado(True, f"ok: {NOME_TOKEN_QA} presente em credenciais/.env", pulado=True)
    token = secrets.token_urlsafe(32)
    nova_linha = f"{NOME_TOKEN_QA}={token}\n"
    texto_novo = (texto if texto.endswith("\n") or not texto else texto + "\n") + nova_linha
    escrever_atomico(ctx.env_path, texto_novo)
    aplicar_permissao_600(ctx.env_path)
    ctx.token_qa = token
    return Resultado(True, f"ok: {NOME_TOKEN_QA} presente em credenciais/.env")


# ---------------------------------------------------------------------------
# Passo 5


def publicar_token_na_vercel(ctx: Contexto) -> Resultado:
    if not ctx.token_qa:
        return Resultado(False, "", mensagem_erro="token de QA ausente: rode gerar_token_qa antes.")
    erro, ja_existia = _publicar_variavel_preview(ctx, NOME_TOKEN_QA, ctx.token_qa)
    if erro:
        return Resultado(False, "", mensagem_erro=erro)
    return Resultado(True, f"ok: {NOME_TOKEN_QA} publicado no ambiente preview da Vercel", pulado=ja_existia)


# ---------------------------------------------------------------------------
# Passo 6


def publicar_email_dono_na_vercel(ctx: Contexto) -> Resultado:
    """Publica o e-mail do dono (`email_dono:` de operacao/INSTALACAO.md) como
    PREVIEW_OWNER_EMAIL no ambiente preview. Sem e-mail válido registra NAO-MEDIDO
    com a instrução e deixa a instalação seguir. O valor nunca é impresso nem vai
    em argumento."""
    email = _ler_email_dono(ctx)
    if not email:
        return Resultado(
            True,
            f"nao medido: sem e-mail do dono em operacao/INSTALACAO.md (campo email_dono); "
            f"rode o instalador até o e-mail do dono estar lá e depois `--so owner_email` ({NOME_EMAIL_DONO})",
            nao_medido=True,
        )
    erro, ja_existia = _publicar_variavel_preview(ctx, NOME_EMAIL_DONO, email)
    if erro:
        return Resultado(False, "", mensagem_erro=erro)
    return Resultado(True, f"ok: {NOME_EMAIL_DONO} publicado no ambiente preview da Vercel", pulado=ja_existia)


# ---------------------------------------------------------------------------
# Passo 6b


def gravar_bypass_automacao(ctx: Contexto) -> Resultado:
    """Cria o "Protection Bypass for Automation" do projeto na Vercel e guarda o
    segredo em `credenciais/.env`. A prévia da Vercel nasce protegida (login da
    Vercel); com o segredo, a conferência da prévia por script entra sem desligar
    a proteção, que NUNCA é desligada. O segredo nasce aqui (32 letras e números,
    o formato que a API aceita), vai para a API por STDIN (`vercel api --input -`)
    e só entra no `.env` depois que a Vercel aceitou. Falhou (CLI antiga, sem
    login, plano sem a opção): NAO-MEDIDO e a instalação segue; a prévia continua
    abrindo no Chrome do dono, já logado na Vercel."""
    env = _ler_env(ctx)
    if env.get(NOME_BYPASS):
        return Resultado(True, EVIDENCIA_BYPASS, pulado=True)
    project_json = ctx.projeto / ".vercel" / "project.json"
    try:
        dados = json.loads(project_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        dados = {}
    projeto_id = str(dados.get("projectId", ""))
    org_id = str(dados.get("orgId", ""))
    if not re.fullmatch(r"[A-Za-z0-9_-]+", projeto_id):
        return Resultado(False, "", mensagem_erro="`.vercel/project.json` sem `projectId`: rode vincular_projeto antes.")
    endpoint = f"/v1/projects/{projeto_id}/protection-bypass"
    if re.fullmatch(r"team_[A-Za-z0-9]+", org_id):
        endpoint += f"?teamId={org_id}"
    segredo = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
    corpo = json.dumps({"generate": {"secret": segredo, "note": "conferencia da previa (tecnologia-publicar)"}})
    resultado = _com_valor_em_arquivo(
        "tecnologia-bypass-", corpo,
        ["vercel", "api", endpoint, "-X", "PATCH", "--input", "-", "--silent"], ctx.projeto,
    )
    if resultado is None or resultado.returncode != 0:
        motivo = _saida(resultado).replace(segredo, "***")[:300] or "CLI da Vercel ausente ou sem resposta"
        return Resultado(
            True,
            f"nao medido: a Vercel recusou criar o bypass ({motivo}); a prévia abre no Chrome do dono "
            "já logado na Vercel e a proteção continua ligada",
            nao_medido=True,
        )
    texto = ctx.env_path.read_text(encoding="utf-8") if ctx.env_path.is_file() else ""
    texto_novo = (texto if texto.endswith("\n") or not texto else texto + "\n") + f"{NOME_BYPASS}={segredo}\n"
    escrever_atomico(ctx.env_path, texto_novo)
    aplicar_permissao_600(ctx.env_path)
    return Resultado(True, EVIDENCIA_BYPASS)


# ---------------------------------------------------------------------------
# Passo 7


def conferir_integracao_supabase(ctx: Contexto) -> Resultado:
    resultado = _rodar(["vercel", "env", "ls"], cwd=ctx.projeto)
    texto_bruto = _saida(resultado)
    # Filtra a saída para SÓ NOMES antes de qualquer print: nenhum valor cru da
    # CLI vai para o stdout.
    achados = sorted({nome for nome in NOMES_SUPABASE_ESPERADOS if nome in texto_bruto})
    ausentes = sorted(set(NOMES_SUPABASE_ESPERADOS) - set(achados))
    if ausentes:
        return Resultado(
            True,
            f"nao medido: faltam {', '.join(ausentes)} em vercel env ls; "
            "quem grava é $tecnologia-conectar vercel-env (próximo passo do instalador)",
            nao_medido=True,
        )
    return Resultado(True, "ok: 3/3 nomes das variáveis do Supabase presentes em vercel env ls")


# ---------------------------------------------------------------------------
# Passo 8


def copiar_guardas(ctx: Contexto) -> Resultado:
    origem_dir = ctx.projeto / ".github"
    if not origem_dir.is_dir():
        return Resultado(
            False, "",
            mensagem_erro=(
                f"{origem_dir} não existe: o template está incompleto "
                "(faltam .github/workflows e dependabot.yml)."
            ),
        )
    arquivos = sorted(origem_dir.rglob("*"))
    arquivos = [caminho for caminho in arquivos if caminho.is_file()]
    if not arquivos:
        return Resultado(False, "", mensagem_erro=f"{origem_dir} está vazio: template incompleto.")

    destino_dir = ctx.casa / ".github"
    for origem in arquivos:
        relativo = origem.relative_to(origem_dir)
        destino = destino_dir / relativo
        if destino.is_file() and filecmp.cmp(origem, destino, shallow=False):
            continue
        copiar_atomico(origem, destino)
    # O texto persistido é sempre o mesmo (estado final), não a ação desta rodada.
    return Resultado(
        True, f"ok: .github/ sincronizado com sistemas/empresa-os/.github/ ({len(arquivos)} arquivo(s))",
    )


# ---------------------------------------------------------------------------
# Passo 9


def gravar_secrets(ctx: Contexto) -> Resultado:
    env = _ler_env(ctx)
    project_ref_path = ctx.projeto / "supabase" / ".temp" / "project-ref"

    valores: dict[str, str] = {}
    for nome in NOMES_SECRETS_GITHUB:
        if nome == "SUPABASE_PROJECT_ID" and project_ref_path.is_file():
            valores[nome] = project_ref_path.read_text(encoding="utf-8").strip()
        else:
            valores[nome] = env.get(nome, "")

    faltando = [nome for nome, valor in valores.items() if not valor]
    if faltando:
        return Resultado(
            False, "",
            mensagem_erro=(
                f"credenciais/.env sem valor para: {', '.join(faltando)}. "
                "Chame a skill tecnologia-acessos para guardar a chave antes."
            ),
        )

    for nome, valor in valores.items():
        resultado = _com_valor_em_arquivo(
            "tecnologia-secret-", valor, ["gh", "secret", "set", nome], ctx.casa,
        )
        if resultado is None or resultado.returncode != 0:
            return Resultado(False, "", mensagem_erro=f"`gh secret set {nome}` falhou: {_saida(resultado)}")

    return Resultado(True, f"ok: {len(NOMES_SECRETS_GITHUB)} secrets gravados via gh secret set")


# ---------------------------------------------------------------------------
# Passo 10


def ligar_dependabot(ctx: Contexto) -> Resultado:
    resultado_owner = _rodar(["gh", "repo", "view", "--json", "nameWithOwner"], cwd=ctx.casa)
    if resultado_owner is None or resultado_owner.returncode != 0:
        return Resultado(False, "", mensagem_erro=f"`gh repo view` falhou: {_saida(resultado_owner)}")
    try:
        owner_repo = json.loads(resultado_owner.stdout or "{}").get("nameWithOwner", "")
    except json.JSONDecodeError:
        owner_repo = ""
    if not owner_repo:
        return Resultado(False, "", mensagem_erro="não foi possível ler nameWithOwner de `gh repo view`.")

    for endpoint in ENDPOINTS_DEPENDABOT:
        resultado = _rodar(["gh", "api", "-X", "PUT", f"repos/{owner_repo}/{endpoint}"], cwd=ctx.casa)
        if resultado is None or resultado.returncode != 0:
            return Resultado(
                False, "", mensagem_erro=f"`gh api -X PUT repos/{owner_repo}/{endpoint}` falhou: {_saida(resultado)}"
            )
    return Resultado(True, "ok: vulnerability-alerts + automated-security-fixes ligados")


PASSOS: list[tuple[str, str, "callable"]] = [
    ("pre_requisitos", "Pré-requisitos (vercel/gh na PATH, gh autenticado)", checar_pre_requisitos),
    ("vincular_projeto", "Vincular projeto Vercel", vincular_projeto),
    ("conectar_git", "Conectar git", conectar_git),
    ("gerar_token_qa", "Gerar token de QA", gerar_token_qa),
    ("publicar_token_na_vercel", "Publicar token na Vercel (preview)", publicar_token_na_vercel),
    ("owner_email", "Publicar o e-mail do dono na Vercel (preview)", publicar_email_dono_na_vercel),
    ("bypass_automacao", "Criar o bypass de automação da prévia (proteção continua ligada)", gravar_bypass_automacao),
    ("conferir_integracao_supabase", "Conferir variáveis do Supabase na Vercel", conferir_integracao_supabase),
    ("copiar_guardas", "Copiar workflows/dependabot para .github/ da raiz", copiar_guardas),
    ("gravar_secrets", "Gravar secrets do GitHub", gravar_secrets),
    ("ligar_dependabot", "Ligar Dependabot", ligar_dependabot),
]


# ---------------------------------------------------------------------------
# Registro em operacao/INSTALACAO.md


def registrar(ctx: Contexto) -> None:
    """Grava uma linha por passo entre os marcadores DEPLOY. O modelo da Casa
    não traz esses marcadores: quando faltam, o bloco nasce no fim do arquivo
    (uma vez); nas rodadas seguintes só as linhas mudam."""
    caminho = ctx.casa / "operacao" / "INSTALACAO.md"
    if not caminho.is_file():
        raise ErroInstalacao(f"operacao/INSTALACAO.md não encontrado em {ctx.casa}")
    texto = caminho.read_text(encoding="utf-8")

    linhas_existentes: dict[str, str] = {}
    padrao_bloco = re.compile(re.escape(MARCADOR_INICIO) + r"\n(.*?)\n?" + re.escape(MARCADOR_FIM), re.S)
    correspondencia = padrao_bloco.search(texto)
    if correspondencia:
        for linha in correspondencia.group(1).splitlines():
            id_correspondente = PADRAO_LINHA_ID.match(linha)
            if id_correspondente:
                linhas_existentes[id_correspondente.group(2)] = linha

    linhas_existentes.update(ctx.linhas_estado)

    linhas = [linhas_existentes[id_] for id_, _titulo, _funcao in PASSOS if id_ in linhas_existentes]
    bloco_novo = f"{MARCADOR_INICIO}\n" + "\n".join(linhas) + f"\n{MARCADOR_FIM}"

    if correspondencia:
        if correspondencia.group(0) == bloco_novo:
            return  # nada mudou: não toca o arquivo (idempotência byte a byte)
        texto_novo = texto[: correspondencia.start()] + bloco_novo + texto[correspondencia.end():]
    else:
        base = texto if texto.endswith("\n") else texto + "\n"
        texto_novo = f"{base}\n{TITULO_BLOCO}\n\n{bloco_novo}\n"
    escrever_atomico(caminho, texto_novo)


# ---------------------------------------------------------------------------
# Orquestração


def rodar(ctx: Contexto, ids_selecionados: list[str] | None) -> int:
    for id_, titulo, funcao in PASSOS:
        if ids_selecionados and id_ not in ids_selecionados:
            continue
        resultado = funcao(ctx)
        if not resultado.ok:
            print(f"ERRO no passo {id_} ({titulo}): {resultado.mensagem_erro}", file=sys.stderr)
            return 2
        rotulo_execucao = "pulado" if resultado.pulado else resultado.rotulo.lower()
        print(f"[{rotulo_execucao}] {id_}: {resultado.evidencia}")
        ctx.linhas_estado[id_] = f"- [{resultado.rotulo}] {id_}: {resultado.evidencia}"
    registrar(ctx)
    print("OK: instalação registrada em operacao/INSTALACAO.md")
    return 0


def imprimir_plano_dry_run(ctx: Contexto) -> int:
    resultado_pre = checar_pre_requisitos(ctx)
    if not resultado_pre.ok:
        print(f"ERRO no passo pre_requisitos: {resultado_pre.mensagem_erro}", file=sys.stderr)
        return 2
    print(f"[ok] pre_requisitos: {resultado_pre.evidencia}")
    print("Plano (--dry-run, nada escrito):")
    for id_, titulo, _funcao in PASSOS[1:]:
        print(f"  - {id_}: {titulo}")
    return 0


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Liga o caminho seguro de publicação (primeira vez neste sistema)."
    )
    parser.add_argument("--casa", required=True, help="Pasta raiz absoluta da Casa.")
    parser.add_argument("--dry-run", action="store_true", help="Só lê e imprime o plano; não escreve nada.")
    parser.add_argument("--json", action="store_true", help="Imprime o resultado também em JSON.")
    parser.add_argument(
        "--so", action="append", dest="so", metavar="PASSO",
        help="Roda só este passo (repetível, para retomar uma instalação parcial).",
    )
    return parser.parse_args()


def main() -> int:
    args = argumentos()
    casa = Path(args.casa).expanduser().resolve()
    if not casa.is_dir():
        print(f"ERRO: --casa não é uma pasta: {casa}", file=sys.stderr)
        return 2

    ctx = Contexto(casa=casa, dry_run=bool(args.dry_run))

    if args.dry_run:
        return imprimir_plano_dry_run(ctx)

    ids_validos = {id_ for id_, _titulo, _funcao in PASSOS}
    desconhecidos = sorted(set(args.so or []) - ids_validos)
    if desconhecidos:
        print(
            f"ERRO: passo(s) desconhecido(s) em --so: {', '.join(desconhecidos)}. "
            f"Válidos: {', '.join(id_ for id_, _t, _f in PASSOS)}.",
            file=sys.stderr,
        )
        return 2

    try:
        codigo = rodar(ctx, args.so)
    except ErroInstalacao as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps({"ok": codigo == 0, "casa": str(casa)}, ensure_ascii=False))
    return codigo


if __name__ == "__main__":
    raise SystemExit(main())
