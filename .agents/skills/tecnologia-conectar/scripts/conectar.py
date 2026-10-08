#!/usr/bin/env python
"""tecnologia-conectar: liga a Vercel e o Supabase da Casa e prova o sistema no ar.

Subcomandos (todos IDEMPOTENTES: rodar de novo nao duplica nada):

  projeto     confere que o projeto da Vercel ligado a esta Casa tem o nome `slug_os`
  vercel-env  grava as 3 variaveis do Supabase na Vercel (production e preview)
              e prova por NOME que chegaram
  auth-urls   grava o site_url e as Redirect URLs do Auth do Supabase e le de volta
  provar      3 provas (site responde 200, nomes na Vercel, Auth relido);
              imprime TUDO LIGADO so se as 3 passarem
  vault       guarda cada segredo do .env no Vault do Supabase (RPC guardar_segredo),
              registra onde cada um vive em public.conexao e escreve o espelho
              (lista) entre <!-- BANCO:INICIO --> e <!-- BANCO:FIM --> no
              credenciais/CONEXOES.md

Stdlib puro, roda igual em Mac e Windows (PowerShell): caminho por `pathlib`,
binario por `shutil.which`, permissao do temporario por `icacls` no Windows.

Regra de segredo: valor NUNCA vai como argumento de comando e NUNCA e impresso.
Anda do `credenciais/.env` para o STDIN de um arquivo temporario restrito ao
dono (apagado no `finally`). Toda mensagem de erro passa por `mascarar`.
Este script NUNCA escreve no `credenciais/.env` (o `vault` guarda uma COPIA mestre
no Vault e o `.env` fica como esta) e NUNCA le o Vault: so grava pela RPC.

Exit 0 = provado. Exit 2 = parou, com mensagem em portugues no stderr.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

TIMEOUT = 60

API_SUPABASE = "https://api.supabase.com"
PADRAO_PREVIA = "https://*-{time}.vercel.app/**"
PADRAO_DOMINIO = re.compile(r"^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\Z")
PADRAO_TIME = re.compile(r"^[a-z0-9][a-z0-9-]*\Z")
PADRAO_REF = re.compile(r"^[a-z0-9]+\Z")

# Valores que NAO sao segredo: a mensagem de erro precisa deles legiveis.
PUBLICOS = (
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_PROJECT_ID",
)
TAMANHO_MIN_MASCARA = 4

ALVOS_VERCEL = ("production", "preview")
# (nome na Vercel = nome no .env, alvo). D-02: o preview usa o MESMO banco da
# producao, por isso os 2 alvos leem o mesmo nome do .env.
MAPA_VERCEL = (
    ("NEXT_PUBLIC_SUPABASE_URL", "production"),
    ("NEXT_PUBLIC_SUPABASE_ANON_KEY", "production"),
    ("SUPABASE_SERVICE_ROLE_KEY", "production"),
    ("NEXT_PUBLIC_SUPABASE_URL", "preview"),
    ("NEXT_PUBLIC_SUPABASE_ANON_KEY", "preview"),
    ("SUPABASE_SERVICE_ROLE_KEY", "preview"),
)

MENSAGEM_SEM_VERCEL = (
    "A CLI da Vercel não está instalada neste computador. Instale com `npm i -g vercel` "
    "(ou use `npx vercel`) e faça `vercel login`."
)


class ErroConectar(Exception):
    """Parada esperada, mostrada sem traceback. Exit 2."""


# --- plataforma e caminhos -------------------------------------------------


def eh_windows() -> bool:
    return os.name == "nt"


def caminho_env(casa: Path) -> Path:
    return casa / "credenciais" / ".env"


def projeto_dir(casa: Path) -> Path:
    return casa / "sistemas" / "empresa-os"


def caminho_project_json(casa: Path) -> Path:
    return projeto_dir(casa) / ".vercel" / "project.json"


def caminho_instalacao(casa: Path) -> Path:
    return casa / "operacao" / "INSTALACAO.md"


def aplicar_600(caminho: Path) -> None:
    """Restringe o arquivo ao dono. No Windows `chmod` nao vale: usa `icacls`
    (o mesmo gesto do instalar_guardas.py da tecnologia-publicar)."""
    if eh_windows():
        usuario = os.environ.get("USERNAME", "")
        if usuario:
            try:
                subprocess.run(
                    ["icacls", str(caminho), "/inheritance:r", "/grant:r", f"{usuario}:R"],
                    capture_output=True, text=True, timeout=15, check=False,
                )
            except (OSError, subprocess.TimeoutExpired):
                pass
        return
    os.chmod(caminho, 0o600)


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


# --- .env (SO LEITURA) e mascara -------------------------------------------


def ler_env(casa: Path) -> dict[str, str]:
    caminho = caminho_env(casa)
    valores: dict[str, str] = {}
    if not caminho.is_file():
        return valores
    for bruta in caminho.read_text(encoding="utf-8-sig").splitlines():
        achado = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", bruta.strip())
        if achado:
            valores[achado.group(1)] = achado.group(2).strip()
    return valores


def mascarar(texto: str, env: dict[str, str]) -> str:
    """Troca por *** todo valor do .env que NAO e publico (segredo conhecido ou
    nome desconhecido). Valor curto (1 a 3 caracteres) fica: mascara-lo
    destruiria a mensagem inteira."""
    valores = [v for n, v in env.items() if n not in PUBLICOS and len(v) >= TAMANHO_MIN_MASCARA]
    for valor in sorted(valores, key=len, reverse=True):
        texto = texto.replace(valor, "***")
    return texto


# --- processos e rede ------------------------------------------------------


def _mensagem_sem_binario(nome: str) -> str:
    if nome == "vercel":
        return MENSAGEM_SEM_VERCEL
    return f"não achei `{nome}` neste computador (PATH)."


def _rodar(comando: list[str], cwd: Path | None = None, entrada: str | None = None):
    """Roda `comando` com o binario resolvido por `shutil.which` (no Windows a
    CLI da Vercel e `vercel.cmd` e o argv[0] precisa do caminho completo).
    Sem `entrada`: STDIN vazio. Com `entrada`: STDIN de um arquivo temporario
    restrito ao dono, apagado no `finally`. Devolve None se o processo nao
    rodou ou estourou o tempo."""
    executavel = shutil.which(comando[0])
    if executavel is None:
        raise ErroConectar(_mensagem_sem_binario(comando[0]))
    argv = [executavel, *comando[1:]]
    caminho_temp = None
    try:
        if entrada is None:
            # DEVNULL: CLI que pergunta algo recebe EOF e sai, em vez de ficar
            # parada ate o TIMEOUT.
            return subprocess.run(
                argv, cwd=str(cwd) if cwd else None, stdin=subprocess.DEVNULL,
                capture_output=True, encoding="utf-8", errors="replace", timeout=TIMEOUT, check=False,
            )
        descritor, nome = tempfile.mkstemp(prefix="tecnologia-conectar-")
        caminho_temp = Path(nome)
        with os.fdopen(descritor, "w", encoding="utf-8", newline="") as arquivo:
            arquivo.write(entrada)
        aplicar_600(caminho_temp)
        with open(caminho_temp, "r", encoding="utf-8", newline="") as leitura:
            return subprocess.run(
                argv, cwd=str(cwd) if cwd else None, stdin=leitura,
                capture_output=True, encoding="utf-8", errors="replace", timeout=TIMEOUT, check=False,
            )
    except (OSError, subprocess.TimeoutExpired):
        return None
    finally:
        if caminho_temp is not None:
            caminho_temp.unlink(missing_ok=True)


def _saida(resultado) -> str:
    if resultado is None:
        return "(comando não rodou)"
    return ((resultado.stdout or "") + (resultado.stderr or "")).strip()


def _http(metodo: str, url: str, cabecalhos: dict, corpo: dict | None = None) -> tuple[int, object]:
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    requisicao = urllib.request.Request(url, data=dados, method=metodo, headers={
        "User-Agent": "tecnologia-conectar/1", "Accept": "application/json",
        **({"Content-Type": "application/json"} if dados is not None else {}), **cabecalhos,
    })
    try:
        with urllib.request.urlopen(requisicao, timeout=TIMEOUT) as resposta:
            texto = resposta.read().decode("utf-8") or "null"
            return resposta.status, json.loads(texto)
    except urllib.error.HTTPError as erro:
        try:
            return erro.code, json.loads(erro.read().decode("utf-8") or "null")
        except ValueError:
            return erro.code, None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as erro:
        raise ErroConectar(f"sem resposta de {url.split('?')[0]}: {erro}")


class SemRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(newurl, code, "redirect bloqueado", headers, fp)


def _head(url: str) -> int:
    opener = urllib.request.build_opener(SemRedirect)
    try:
        with opener.open(urllib.request.Request(url, method="HEAD"), timeout=15) as resposta:
            return resposta.status
    except urllib.error.HTTPError as erro:
        erro.close()
        return erro.code
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0


def linha(rotulo: str, passo: str, evidencia: str) -> None:
    print(f"[{rotulo}] {passo}: {evidencia}")


# --- leitura da Casa -------------------------------------------------------


def ler_slug_os(casa: Path) -> str:
    caminho = caminho_instalacao(casa)
    if not caminho.is_file():
        raise ErroConectar("operacao/INSTALACAO.md não existe nesta Casa. Rode o instalador antes.")
    achado = re.search(r"(?m)^slug_os:\s*(\S+)", caminho.read_text(encoding="utf-8-sig"))
    slug = achado.group(1) if achado else ""
    if not PADRAO_TIME.match(slug):
        raise ErroConectar("operacao/INSTALACAO.md sem `slug_os:` válido (letras minúsculas, números e hífen).")
    return slug


def _ref(env: dict[str, str]) -> str:
    ref = env.get("SUPABASE_PROJECT_ID", "")
    if not PADRAO_REF.match(ref):
        raise ErroConectar(
            "credenciais/.env sem SUPABASE_PROJECT_ID válido (o código do projeto no Supabase). "
            "Rode a etapa 7-banco do instalador."
        )
    return ref


def _pat(env: dict[str, str]) -> dict:
    token = env.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise ErroConectar(
            "credenciais/.env sem SUPABASE_ACCESS_TOKEN. Rode a etapa 7-banco do instalador."
        )
    return {"Authorization": f"Bearer {token}"}


def _lista(valor) -> set[str]:
    return {item.strip() for item in str(valor or "").split(",") if item.strip()}


# --- projeto ---------------------------------------------------------------


def cmd_projeto(casa: Path, projeto_id: str | None) -> int:
    slug = ler_slug_os(casa)
    arquivo = caminho_project_json(casa)
    if not arquivo.is_file():
        raise ErroConectar(
            "sistemas/empresa-os/.vercel/project.json não existe: o projeto ainda não está ligado a esta Casa. "
            "Rode o .agents/skills/tecnologia-publicar/scripts/instalar_guardas.py antes."
        )
    try:
        dados = json.loads(arquivo.read_text(encoding="utf-8-sig"))
    except ValueError:
        raise ErroConectar("sistemas/empresa-os/.vercel/project.json não é um JSON válido.") from None
    if not isinstance(dados, dict):
        raise ErroConectar("sistemas/empresa-os/.vercel/project.json não é um JSON válido.")
    nome_projeto = dados.get("projectName")
    if not nome_projeto:
        # Sem o nome no arquivo, a prova e o id que a Vercel devolveu ao criar o projeto.
        if not projeto_id:
            raise ErroConectar(
                f".vercel/project.json sem o nome do projeto. Passe --projeto-id com o id que a Vercel "
                f"devolveu ao criar o projeto `{slug}` (o `id` do projeto)."
            )
        if projeto_id != dados.get("projectId"):
            raise ErroConectar(
                f"o projeto ligado a esta Casa não é o `{slug}` que você criou (id diferente). "
                "Rode o instalar_guardas.py de novo ou corrija o link."
            )
        linha("ok", "projeto", f"{slug}: o id do .vercel/project.json é o do projeto criado")
        return 0
    if nome_projeto != slug:
        raise ErroConectar(
            f"o projeto da Vercel ligado a esta Casa se chama `{nome_projeto}`, mas o `slug_os` é `{slug}`. "
            "Crie o projeto com o nome certo e rode o instalar_guardas.py de novo."
        )
    linha("ok", "projeto", f"{slug}: o nome do projeto na Vercel é o slug_os")
    return 0


# --- vercel-env ------------------------------------------------------------


def nomes_presentes(texto: str, esperados) -> set[str]:
    """So NOMES. `\\b` depois do nome impede que ..._URL case com ..._URL_HOMOLOG."""
    return {nome for nome in esperados if re.search(rf"(?m)^\s*{re.escape(nome)}\b", texto)}


def conferir_nomes_na_vercel(casa: Path) -> dict[str, int]:
    """Prova por NOME (`vercel env ls <alvo>`): a doc nao garante formato de
    saida. Faltou nome = ErroConectar. Devolve quantos nomes cada alvo tem."""
    contagem: dict[str, int] = {}
    for alvo in ALVOS_VERCEL:
        esperados = [nome for nome, a in MAPA_VERCEL if a == alvo]
        resultado = _rodar(["vercel", "env", "ls", alvo], cwd=projeto_dir(casa))
        ausentes = sorted(set(esperados) - nomes_presentes(_saida(resultado), esperados))
        if ausentes:
            raise ErroConectar(f"Vercel ({alvo}) sem: {', '.join(ausentes)}. Rode vercel-env de novo.")
        contagem[alvo] = len(esperados)
    return contagem


def cmd_vercel_env(casa: Path) -> int:
    if not caminho_project_json(casa).is_file():
        raise ErroConectar(
            "sistemas/empresa-os/.vercel/project.json não existe: rode o "
            ".agents/skills/tecnologia-publicar/scripts/instalar_guardas.py antes."
        )
    env = ler_env(casa)
    faltando = sorted({nome for nome, _alvo in MAPA_VERCEL if not env.get(nome)})
    if faltando:
        raise ErroConectar(
            f"credenciais/.env sem valor para: {', '.join(faltando)}. "
            "Esses valores entram na etapa 7-banco do instalador (ou pela skill tecnologia-acessos)."
        )
    for nome, alvo in MAPA_VERCEL:
        # --yes: sem ele a CLI pode perguntar a branch de preview mesmo com STDIN
        resultado = _rodar(["vercel", "env", "add", nome, alvo, "--yes"], cwd=projeto_dir(casa), entrada=env[nome])
        saida = _saida(resultado)
        if resultado is not None and resultado.returncode == 0:
            linha("ok", "vercel-env", f"{nome} ({alvo})")
        elif "already" in saida.lower():
            linha("pulado", "vercel-env", f"{nome} ({alvo}) já existe")
        else:
            raise ErroConectar(f"`vercel env add {nome} {alvo}` falhou: {mascarar(saida, env)}")
    for alvo, quantos in conferir_nomes_na_vercel(casa).items():
        linha("ok", "vercel-env", f"prova {alvo}: {quantos}/{quantos} nomes")
    return 0


# --- auth-urls -------------------------------------------------------------


def _validar_time(time_vercel: str) -> None:
    if not PADRAO_TIME.match(time_vercel):
        raise ErroConectar("o time da Vercel tem que ser só o apelido (letras minúsculas, números e hífen).")


def cmd_auth_urls(casa: Path, dominio_prod: str, time_vercel: str) -> int:
    if not PADRAO_DOMINIO.match(dominio_prod):
        raise ErroConectar("passe só o domínio, sem https:// nem barra (ex.: minha-empresa.vercel.app).")
    _validar_time(time_vercel)
    env = ler_env(casa)
    ref = _ref(env)
    cab = _pat(env)
    site = f"https://{dominio_prod}"
    previa = PADRAO_PREVIA.format(time=time_vercel)
    url = f"{API_SUPABASE}/v1/projects/{ref}/config/auth"
    status, atual = _http("GET", url, cab)
    if status != 200 or not isinstance(atual, dict):
        raise ErroConectar(
            f"o token do Supabase não abriu a configuração de login do projeto (HTTP {status}). "
            "Nada foi gravado. Confira o SUPABASE_ACCESS_TOKEN (etapa 7-banco)."
        )
    atual_lista = _lista(atual.get("uri_allow_list"))
    if atual.get("site_url") == site and {f"{site}/**", previa} <= atual_lista:
        linha("pulado", "auth-urls", f"site_url e allow list já têm {dominio_prod} e a prévia")
        return 0
    nova = atual_lista | {f"{site}/**", previa}
    status, _corpo = _http("PATCH", url, cab, {"site_url": site, "uri_allow_list": ",".join(sorted(nova))})
    if status not in (200, 204):
        raise ErroConectar(f"PATCH config/auth devolveu HTTP {status}. Nada foi confirmado.")
    _status, lido = _http("GET", url, cab)
    lido = lido if isinstance(lido, dict) else {}
    if lido.get("site_url") != site:
        raise ErroConectar(f"site_url lido do Supabase não bate com {site}.")
    faltam = sorted({f"{site}/**", previa} - _lista(lido.get("uri_allow_list")))
    if faltam:
        raise ErroConectar(f"a allow list lida do Supabase não tem: {', '.join(faltam)}.")
    linha("ok", "auth-urls", f"site_url = {site}")
    linha("ok", "auth-urls", f"allow list com {site}/** e {previa} (o que já existia ficou)")
    return 0


# --- provar ----------------------------------------------------------------


def _prova_site(dominio: str) -> str:
    status = _head(f"https://{dominio}/login")
    if status != 200:
        raise ErroConectar(
            f"https://{dominio}/login devolveu {status or 'sem resposta'} (esperado 200, sem redirecionar). "
            "500 = env da Vercel errada (rode vercel-env); 3xx = domínio redirecionando."
        )
    return f"200 https://{dominio}/login (o site falou com o Supabase)"


def _prova_nomes_vercel(casa: Path) -> str:
    contagem = conferir_nomes_na_vercel(casa)
    return ", ".join(f"{alvo} {quantos}/{quantos}" for alvo, quantos in contagem.items())


def _prova_auth(casa: Path, dominio: str, time_vercel: str) -> str:
    env = ler_env(casa)
    ref = _ref(env)
    status, config = _http("GET", f"{API_SUPABASE}/v1/projects/{ref}/config/auth", _pat(env))
    if status != 200 or not isinstance(config, dict):
        raise ErroConectar(f"não consegui reler a configuração de login do Supabase (HTTP {status}).")
    site = f"https://{dominio}"
    if config.get("site_url") != site:
        raise ErroConectar(f"o site_url do Supabase não é {site}. Rode auth-urls.")
    esperadas = {f"{site}/**", PADRAO_PREVIA.format(time=time_vercel)}
    faltam = sorted(esperadas - _lista(config.get("uri_allow_list")))
    if faltam:
        raise ErroConectar(f"a allow list do Supabase não tem: {', '.join(faltam)}. Rode auth-urls.")
    return f"site_url = {site} e a allow list tem o domínio e a prévia"


def cmd_provar(casa: Path, dominio: str, time_vercel: str) -> int:
    if not PADRAO_DOMINIO.match(dominio):
        raise ErroConectar("passe só o domínio, sem https:// nem barra (ex.: minha-empresa.vercel.app).")
    _validar_time(time_vercel)
    env = ler_env(casa)
    provas: list[tuple[bool, str]] = []
    for rotulo, funcao in (
        ("site no ar", lambda: _prova_site(dominio)),
        ("nomes na Vercel", lambda: _prova_nomes_vercel(casa)),
        ("Auth do Supabase", lambda: _prova_auth(casa, dominio, time_vercel)),
    ):
        try:
            linha("ok", rotulo, funcao())
            provas.append((True, rotulo))
        except ErroConectar as erro:
            linha("FALHA", rotulo, mascarar(str(erro), env))
            provas.append((False, rotulo))
    if all(ok for ok, _rotulo in provas):
        print("TUDO LIGADO")
        return 0
    falharam = ", ".join(rotulo for ok, rotulo in provas if not ok)
    raise ErroConectar(f"prova(s) que falharam: {falharam}. Corrija e rode provar de novo.")


# --- vault -----------------------------------------------------------------

# Segredos que o `vault` guarda (D-09). Os 3 primeiros são obrigatórios; os 2
# últimos só entram se estiverem no .env.
SEGREDOS = (
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PREVIEW_TEST_TOKEN",
    "PREVIEW_QA_PASSWORD",
)
SEGREDOS_OBRIGATORIOS = SEGREDOS[:3]
PADRAO_NOME_LIVRE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*\Z")
MARCA_BANCO_INICIO = "<!-- BANCO:INICIO -->"
MARCA_BANCO_FIM = "<!-- BANCO:FIM -->"
COLUNAS_ESPELHO = "servico,conta,escopo,segredo_ref,copias,estado,provado_em"
PLANO_B_VAULT = (
    "Plano B: anote 1 linha em operacao/PENDENCIAS.md (o motivo, sem valor de chave) e siga; "
    "nada no fluxo depende do vault."
)


def caminho_conexoes(casa: Path) -> Path:
    return casa / "credenciais" / "CONEXOES.md"


def conexoes_padrao(repo, org_supabase, time_vercel, projeto_vercel, ref, escopo_token, presentes):
    """Inventário que o `vault` registra. TODA conexão com segredo leva
    `arquivo_env` em `copias`: o `.env` não é limpo (D-03), então a cópia de uso
    existe e a rotação precisa saber."""
    def c(servico, conta, escopo, segredo, copias, aplicacao=None):
        return {"servico": servico, "conta": conta, "escopo": escopo, "segredo": segredo,
                "copias": copias, "aplicacao": aplicacao}
    itens = [
        c("supabase", org_supabase, escopo_token, "SUPABASE_ACCESS_TOKEN", ["github_secret", "arquivo_env"]),
        c("supabase", ref, "db_password", "SUPABASE_DB_PASSWORD", ["github_secret", "arquivo_env"]),
        c("supabase", ref, "service_role", "SUPABASE_SERVICE_ROLE_KEY",
          ["vercel_env:production", "vercel_env:preview", "arquivo_env"], projeto_vercel),
    ]
    if "PREVIEW_TEST_TOKEN" in presentes:
        itens.append(c("vercel", time_vercel, "preview_qa", "PREVIEW_TEST_TOKEN",
                       ["vercel_env:preview", "arquivo_env"], projeto_vercel))
    if "PREVIEW_QA_PASSWORD" in presentes:
        itens.append(c("vercel", time_vercel, "preview_qa_login", "PREVIEW_QA_PASSWORD",
                       ["vercel_env:preview", "arquivo_env"], projeto_vercel))
    itens.append(c("github", repo, "vercel_app", None, [], projeto_vercel))
    return itens


def _rpc(env: dict[str, str], funcao: str, parametros: dict):
    url, chave = env.get("NEXT_PUBLIC_SUPABASE_URL", ""), env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url.startswith("https://") or not chave:
        raise ErroConectar(
            "credenciais/.env sem NEXT_PUBLIC_SUPABASE_URL (https) e SUPABASE_SERVICE_ROLE_KEY do banco."
        )
    status, corpo = _http("POST", f"{url.rstrip('/')}/rest/v1/rpc/{funcao}",
                          {"apikey": chave, "Authorization": f"Bearer {chave}"}, parametros)
    if status != 200:
        detalhe = corpo.get("message", "") if isinstance(corpo, dict) else ""
        raise ErroConectar(f"{funcao} devolveu HTTP {status}: {detalhe}")
    return corpo


def _espelho(casa: Path, linhas: list[dict]) -> None:
    """Espelho de `public.conexao` entre os marcadores do `CONEXOES.md`, em LISTA
    (nunca tabela: o provar_conexao.py da fundação trata toda linha que começa
    com `|` como linha da tabela dele). O resto do arquivo fica byte a byte igual."""
    caminho = caminho_conexoes(casa)
    texto = caminho.read_bytes().decode("utf-8") if caminho.is_file() else "# Conexões\n"
    corpo = [MARCA_BANCO_INICIO, "<!-- gerado de public.conexao por tecnologia-conectar: não editar à mão -->"]
    for item in linhas:
        corpo.append("- {servico} . conta `{conta}` . escopo {escopo} . segredo {ref} . copias {copias} . estado {estado} . provado em {provado}".format(
            servico=item.get("servico", ""), conta=item.get("conta", ""), escopo=item.get("escopo", ""),
            ref=item.get("segredo_ref") or "-", copias=", ".join(item.get("copias") or []) or "-",
            estado=item.get("estado", ""), provado=item.get("provado_em") or "-"))
    corpo.append(MARCA_BANCO_FIM)
    bloco = "\n".join(corpo)
    padrao = re.compile(re.escape(MARCA_BANCO_INICIO) + r".*?" + re.escape(MARCA_BANCO_FIM), re.S)
    novo = padrao.sub(lambda _m: bloco, texto, count=1) if padrao.search(texto) \
        else texto.rstrip("\n") + "\n\n" + bloco + "\n"
    if novo != texto:
        escrever_atomico(caminho, novo)


def cmd_vault(casa: Path, repo: str, org_supabase: str, time_vercel: str, projeto_vercel: str, escopo_token: str) -> int:
    if escopo_token not in ("pat", "total"):
        raise ErroConectar("--escopo-token tem que ser pat ou total.")
    for nome, valor in (("--repo", repo), ("--org-supabase", org_supabase)):
        if not PADRAO_NOME_LIVRE.match(valor):
            raise ErroConectar(f"{nome} com caracteres que não podem aparecer num nome: {valor!r}.")
    _validar_time(time_vercel)
    if not PADRAO_TIME.match(projeto_vercel):
        raise ErroConectar("--projeto-vercel tem que ser o slug do sistema (letras minúsculas, números e hífen).")
    env = ler_env(casa)  # retrato do .env: é ele que mascara toda mensagem
    ref = _ref(env)
    faltando = [nome for nome in SEGREDOS_OBRIGATORIOS if not env.get(nome)]
    if faltando:
        raise ErroConectar(
            f"credenciais/.env sem valor para: {', '.join(faltando)}. Esses valores entram na etapa 7-banco do instalador."
        )
    presentes = [nome for nome in SEGREDOS if env.get(nome)]
    try:
        for nome in presentes:
            _rpc(env, "guardar_segredo", {"p_nome": nome, "p_valor": env[nome]})
        linha("ok", "vault", f"{len(presentes)} segredo(s) guardados no Vault (só nomes)")
        hoje = datetime.date.today().isoformat()
        for item in conexoes_padrao(repo, org_supabase, time_vercel, projeto_vercel, ref, escopo_token, presentes):
            _rpc(env, "registrar_conexao", {
                "p_servico": item["servico"], "p_conta": item["conta"], "p_escopo": item["escopo"],
                "p_segredo_ref": item["segredo"], "p_dono_papel": "dono", "p_copias": item["copias"],
                "p_aplicacao_ref": item["aplicacao"], "p_provado_em": hoje,
            })
        url, chave = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), env["SUPABASE_SERVICE_ROLE_KEY"]
        status, linhas = _http(
            "GET", f"{url}/rest/v1/conexao?select={COLUNAS_ESPELHO}&order=servico,conta,escopo",
            {"apikey": chave, "Authorization": f"Bearer {chave}"})
        if status != 200 or not isinstance(linhas, list) or not linhas:
            raise ErroConectar(f"leitura de public.conexao devolveu HTTP {status} ou vazio.")
    except ErroConectar as erro:
        raise ErroConectar(
            f"{erro} Nada foi escrito em credenciais/CONEXOES.md e o .env não foi tocado. {PLANO_B_VAULT}"
        ) from None
    linha("ok", "vault", f"{len(linhas)} conexão(ões) lidas de public.conexao")
    _espelho(casa, linhas)
    linha("ok", "vault", "credenciais/CONEXOES.md: bloco BANCO atualizado (lista de public.conexao)")
    return 0


# --- CLI -------------------------------------------------------------------


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Liga a Vercel e o Supabase da Casa e prova o sistema no ar.")
    sub = parser.add_subparsers(dest="comando", required=True)

    p = sub.add_parser("projeto", help="o projeto da Vercel ligado à Casa se chama como o slug_os")
    p.add_argument("--casa", required=True)
    p.add_argument("--projeto-id", help="id do projeto devolvido pelo conector, se o project.json não tiver o nome")

    p = sub.add_parser("vercel-env", help="variáveis do Supabase na Vercel (production e preview), prova por nomes")
    p.add_argument("--casa", required=True)

    p = sub.add_parser("auth-urls", help="site_url e Redirect URLs do Auth do Supabase")
    p.add_argument("--casa", required=True)
    p.add_argument("--dominio-prod", required=True)
    p.add_argument("--time-vercel", required=True)

    p = sub.add_parser("provar", help="3 provas; imprime TUDO LIGADO só se as 3 passarem")
    p.add_argument("--casa", required=True)
    p.add_argument("--dominio", required=True)
    p.add_argument("--time-vercel", required=True)

    p = sub.add_parser("vault", help="segredos no Vault + public.conexao + espelho no CONEXOES.md (o .env não muda)")
    p.add_argument("--casa", required=True)
    p.add_argument("--repo", required=True, help="dono/repo no GitHub")
    p.add_argument("--org-supabase", required=True)
    p.add_argument("--time-vercel", required=True)
    p.add_argument("--projeto-vercel", required=True)
    p.add_argument("--escopo-token", required=True, choices=["pat", "total"])
    return parser


COMANDOS = {
    "projeto": lambda a, casa: cmd_projeto(casa, a.projeto_id),
    "vercel-env": lambda a, casa: cmd_vercel_env(casa),
    "auth-urls": lambda a, casa: cmd_auth_urls(casa, a.dominio_prod, a.time_vercel),
    "provar": lambda a, casa: cmd_provar(casa, a.dominio, a.time_vercel),
    "vault": lambda a, casa: cmd_vault(casa, a.repo, a.org_supabase, a.time_vercel, a.projeto_vercel, a.escopo_token),
}


def main(argv: list[str] | None = None) -> int:
    for fluxo in (sys.stdout, sys.stderr):
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(errors="replace")  # console do Windows com codificação estreita
    args = _parser().parse_args(argv)
    casa = Path(args.casa).expanduser().resolve()
    if not casa.is_dir():
        print(f"ERRO: --casa não é uma pasta: {casa}", file=sys.stderr)
        return 2
    try:
        return COMANDOS[args.comando](args, casa)
    except ErroConectar as erro:
        print(f"PAROU: {mascarar(str(erro), ler_env(casa))}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
