#!/usr/bin/env python3
"""Prova por comando se um serviço externo está conectado à Casa, e só então
grava (idempotente) a linha em `credenciais/CONEXOES.md`. Quem decide se está
conectado é a PROVA, nunca o agente — falha de prova nunca escreve nada
(exit 2, mensagem acionável em stderr).

Stdlib puro, sem rede, sem dependência, roda igual em Mac e Windows. Nunca
imprime valor de segredo. Escrita sempre atômica (tmp + os.replace), e a
ÚNICA escrita deste script é a linha de `credenciais/CONEXOES.md` — ele
nunca abre nenhum `config.toml` pra escrita, nem o desta Casa nem o global
do aluno [D24-18]. Quem registra o MCP é o DONO, pelo app desktop (aba de
plugins, botão `+`) [D24-29] — diagnóstico, se travar: `codex mcp add`/
`codex mcp login` no terminal dele.

Modos:
  --servico github|supabase|vercel --para "<texto>"
      Roda a prova fixa do serviço (tabela abaixo). OK -> upsert da linha e
      exit 0. Falhou -> exit 2, nada é escrito.

  --servico outro --nome "X" --tipo chave --variavel NOME_X --para "<texto>"
      Último recurso: a prova é a EXISTÊNCIA do nome da variável em
      `credenciais/.env` (nunca o valor). Ausente = exit 2.

  --listar-nomes
      Imprime só os NOMES de variável de `credenciais/.env`, um por linha
      (substitui o bashismo `cut -d= -f1`). Nome de variável é reconhecido
      SÓ pela regex ancorada de `nome_de_variavel()`, nunca por
      `partition("=")` — evita que a última linha base64 de um PEM colado
      (que pode terminar em `=`/`==`) vire "nome" e vá pro stdout.

  --ultimos-4 NOME_DA_VARIAVEL
      Imprime no máximo os últimos 4 caracteres do valor daquela variável
      (substitui o bashismo `awk -F=`). Nunca o valor inteiro.

Tabela de prova (fixa, não configurável):
  github   -> `gh auth status` (exit 0); se `gh api user --jq .login` também
              sair 0, o login enriquece a célula Prova (nunca substitui a
              prova principal, nunca entra truncado).
  supabase -> DUAS FORMAS aceitas do MESMO `~/.codex/config.toml` GLOBAL,
              LIDO por `Path.home()` (nunca escrito por este script) [D24-29]:
              (A) `[plugins."supabase@<marketplace>"]` com `enabled = true`
              — plugin instalado pelo APP desktop (aba de plugins, botão
              "+"), caminho principal; (B) `[mcp_servers.supabase]` com
              `url = "https://mcp.supabase.com/mcp"` e SEM `command` — quem
              caiu no bloco "Se travar" e usou a CLI. A prova tenta A
              primeiro; só cai pra B se A não achou NENHUMA tabela deste
              plugin. Nenhuma das duas = exit 2 com o gesto do app PRIMEIRO
              e os dois comandos do DONO depois, como diagnóstico.
  vercel   -> mesma leitura, duas formas, para `vercel`/`https://mcp.vercel.com`;
              quando a prova sai pela forma B (MCP global) E `vercel --version`
              responder E `vercel whoami` sair 0, o whoami entra como prova
              EXTRA (ausência da CLI ou erro tipo "not logged in" nunca
              reprova nem vira prova truncada).

Ordem do D1: `--servico supabase` e `--servico vercel` recusam enquanto não
existir uma linha `GitHub` em `credenciais/CONEXOES.md` (as duas contas
nascem por "Continue with GitHub").
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tempfile
import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

URL_SUPABASE = "https://mcp.supabase.com/mcp"
URL_VERCEL = "https://mcp.vercel.com"

ORDEM_DEPOIS_DE_GITHUB = {"supabase", "vercel"}

# (tipo, variável, nome de exibição na coluna Serviço) — fallback só usado
# quando `ResultadoProva.tipo` vem vazio; supabase/vercel sempre preenchem
# `tipo` (D-C: "plugin do app" ou "MCP global", conforme a forma que casou).
INFO_SERVICO_FIXO = {
    "github": ("login navegador", "n/a", "GitHub"),
    "supabase": ("plugin do app", "n/a", "Supabase"),
    "vercel": ("plugin do app", "n/a", "Vercel"),
}

TAMANHO_MAX_CELULA_PROVA = 60

# Prefixos genéricos só pra reconhecer início/fim de um bloco colado por
# engano (ex.: PEM multilinha) — NUNCA o literal completo com "PRIVATE KEY",
# que dispararia a regra de private-key do gitleaks neste próprio script.
MARCA_INICIO_BLOCO = "-----BEGIN"
MARCA_FIM_BLOCO = "-----END"

PADRAO_NOME_VARIAVEL = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=")

# Título `[plugins."<nome>@<marketplace>"]` (ou sem aspas) — o app desktop
# grava o slug assim [MEDIDO 07/09, D24-29]; a chave e o formato exato NÃO
# são documentados [24a:plugins/n18], por isso a leitura é tolerante.
PADRAO_TITULO_PLUGIN = re.compile(r'^\[plugins\.\s*(?:"([^"]+)"|([^\]\s]+))\s*\]$')

MARKETPLACE_CURADO = "openai-curated"


class ErroConexao(Exception):
    """Erro esperado, apresentado sem traceback ao usuário. Exit 2."""


@dataclass
class ResultadoProva:
    ok: bool
    comando: str
    mensagem_falha: str = ""
    # [D-C/D24-29] Qual forma casou: "plugin do app" (A) ou "MCP global"
    # (B). None = usa o fallback fixo de INFO_SERVICO_FIXO.
    tipo: str | None = None
    # True só quando a FORMA A achou uma tabela `[plugins."<id>@..."]` com o
    # NOME certo (ligada ou não) — é o que diferencia "não achei nada,
    # tenta a forma B" de "achei, e está errada" em `provar_conector`.
    tabela_achada: bool = False
    # Aviso não-bloqueante (D-G: marketplace fora do curado) — impresso em
    # stdout só quando a prova sai OK.
    aviso: str | None = None


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prova por comando e registra conexões da Empresa IA."
    )
    parser.add_argument("--casa", default=".", help="Pasta raiz da Casa (default: cwd).")
    parser.add_argument(
        "--servico", choices=["github", "supabase", "vercel", "outro"],
        help="Serviço a provar/registrar.",
    )
    parser.add_argument("--para", help="Para que serve esta conexão (texto livre).")
    parser.add_argument("--nome", help="Nome de exibição do serviço, só com --servico outro.")
    parser.add_argument("--tipo", help="Tipo da conexão, só com --servico outro.")
    parser.add_argument("--variavel", help="Nome da variável em credenciais/.env.")
    parser.add_argument("--listar-nomes", action="store_true", help="Lista nomes de credenciais/.env.")
    parser.add_argument("--ultimos-4", metavar="NOME_DA_VARIAVEL", help="Imprime só os 4 últimos chars.")
    return parser.parse_args()


def nome_de_variavel(linha: str) -> str | None:
    """Reconhece nome de variável SÓ pela regex ancorada — nunca por
    `partition("=")`: a última linha base64 de um PEM real pode ser toda
    alfanumérica e terminar em `=`/`==`, casando com um partition ingênuo."""
    correspondencia = PADRAO_NOME_VARIAVEL.match(linha)
    return correspondencia.group(1) if correspondencia else None


def atribuicoes(texto: str):
    """Gera (nome, valor) só das linhas que são atribuição de verdade:
    pula vazia/comentário e tudo que estiver DENTRO de um bloco colado por
    engano (ex.: PEM multilinha) — a linha cujo VALOR contém
    MARCA_INICIO_BLOCO liga a supressão; a que contém MARCA_FIM_BLOCO
    desliga. Enquanto ligado, nenhuma linha vira nome, não importa o que
    pareça (a linha de padding base64 terminada em `==` casaria com a
    regex ancorada sozinha — por isso os DOIS mecanismos são exigidos)."""
    dentro_de_bloco = False
    for linha in texto.splitlines():
        bruta = linha.strip()
        if dentro_de_bloco:
            if MARCA_FIM_BLOCO in bruta:
                dentro_de_bloco = False
            continue
        if not bruta or bruta.startswith("#"):
            continue
        nome = nome_de_variavel(bruta)
        if nome is None:
            continue
        valor = bruta.partition("=")[2].strip()
        if MARCA_INICIO_BLOCO in valor:
            dentro_de_bloco = True
        yield nome, valor


def frontmatter(texto: str) -> dict[str, str]:
    correspondencia = re.match(r"^---\n(.*?)\n---", texto, re.S)
    dados: dict[str, str] = {}
    if not correspondencia:
        return dados
    for linha in correspondencia.group(1).splitlines():
        chave, separador, valor = linha.partition(":")
        if separador:
            dados[chave.strip()] = valor.strip().strip('"').strip("'")
    return dados


def validar_casa(casa: Path) -> None:
    exigidos = [casa / "EMPRESA-IA.md", casa / "credenciais" / "CONEXOES.md"]
    ausentes = [str(caminho.relative_to(casa)) for caminho in exigidos if not caminho.is_file()]
    if ausentes:
        raise ErroConexao(
            "Esta pasta não parece a raiz de uma Empresa IA. "
            f"Ausentes: {', '.join(ausentes)}."
        )


def analisar_celulas(linha: str) -> list[str]:
    interior = linha.strip()
    if interior.startswith("|"):
        interior = interior[1:]
    if interior.endswith("|"):
        interior = interior[:-1]
    return [celula.strip() for celula in interior.split("|")]


def montar_linha_tabela(celulas: list[str]) -> str:
    return "| " + " | ".join(celulas) + " |"


def indices_linhas_tabela(texto: str) -> list[int]:
    return [indice for indice, linha in enumerate(texto.splitlines()) if linha.strip().startswith("|")]


def tem_github(texto_conexoes: str) -> bool:
    for indice in indices_linhas_tabela(texto_conexoes):
        linha = texto_conexoes.splitlines()[indice]
        celulas = analisar_celulas(linha)
        if celulas and celulas[0].strip().lower() == "github":
            return True
    return False


def _rodar(comando: list[str]):
    try:
        return subprocess.run(comando, capture_output=True, text=True, timeout=15, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None


def provar_github() -> ResultadoProva:
    resultado = _rodar(["gh", "auth", "status"])
    comando = "gh auth status"
    if resultado is None or resultado.returncode != 0:
        saida = ((resultado.stdout or "") + (resultado.stderr or "")).strip() if resultado else "binário `gh` não encontrado."
        return ResultadoProva(
            False, comando,
            f"{comando}\n{saida}\n\n"
            "Faltou: rode `gh auth login`, escolha GitHub.com -> HTTPS -> "
            "Login with a web browser, e digite o código que aparecer no navegador.",
        )
    # Enriquecimento OPCIONAL da célula Prova com o login (`gh api user
    # --jq .login`), só quando sai 0 — nunca substitui a prova principal
    # (gh auth status), e nunca entra truncado no meio de uma palavra: ou
    # cabe inteiro em TAMANHO_MAX_CELULA_PROVA, ou a célula fica só com
    # `gh auth status`.
    login_resultado = _rodar(["gh", "api", "user", "--jq", ".login"])
    if login_resultado is not None and login_resultado.returncode == 0:
        login = (login_resultado.stdout or "").strip()
        if login:
            candidato = f"{comando} ({login})"
            if len(candidato) <= TAMANHO_MAX_CELULA_PROVA:
                return ResultadoProva(True, candidato)
    return ResultadoProva(True, comando)


def caminho_config_global() -> Path:
    """Único uso de `Path.home()` no módulo — e só pra LEITURA. No Windows
    sai de USERPROFILE. A IA nunca escreve este arquivo [D24-18]; quem
    registra o MCP é o dono, pelo app desktop (aba de plugins, `+`)
    [D24-29] — diagnóstico, se travar: `codex mcp add`/`codex mcp login`
    no terminal dele."""
    return Path.home() / ".codex" / "config.toml"


def normalizar_url(url: str) -> str:
    """Quem escreve o config agora é a CLI da OpenAI, não este script (D-B)
    — a leitura tem que tolerar barra final."""
    return url.strip().rstrip("/")


def mensagem_conector_ausente(id_mcp: str, url_esperada: str) -> str:
    """[D-E, emenda 07/09/2026 (D24-29)] Exit 2 quando NENHUMA das duas
    formas foi achada: o gesto do APP vem PRIMEIRO (caminho principal); os
    dois comandos de terminal do dono aparecem DEPOIS, como diagnóstico —
    nunca como passo do D1."""
    return (
        f"~/.codex/config.toml sem conexão pra {id_mcp}.\n"
        "No app desktop do ChatGPT: aba de plugins, botão \"+\", ache o "
        f"plugin de {id_mcp}, instale e faça o login/OAuth na tela do app.\n\n"
        "Se travar (diagnóstico, não é passo do D1), no terminal DO DONO:\n"
        f"codex mcp add {id_mcp} --url {url_esperada}\n"
        f"codex mcp login {id_mcp}  (se o navegador não abrir sozinho)\n"
        "Depois repita esta prova. A IA nunca escreve esse arquivo."
    )


def ler_bloco_plugin(caminho_config: Path, id_plugin: str) -> tuple[str, dict[str, str]] | None:
    """Lê a tabela `[plugins."<id_plugin>@<marketplace>"]` (ou sem aspas) de
    um config.toml — função SEPARADA de `ler_bloco_mcp` pra cada mutação de
    G18 ter alvo único. Exige que o NOME do plugin (parte antes do `@`)
    bata com `id_plugin` e que exista marketplace não vazio; slug de outro
    serviço ou sem `@marketplace` não conta como achado (devolve None, e
    `provar_conector` cai pra forma B). Para no próximo `[`, mesma mecânica
    de `ler_bloco_mcp` — a chave `enabled` e o formato exato do título são
    MEDIÇÃO, não fato de doc [24a:plugins/n18]."""
    texto = caminho_config.read_text(encoding="utf-8") if caminho_config.is_file() else ""
    linhas = texto.splitlines()
    for indice, linha in enumerate(linhas):
        correspondencia = PADRAO_TITULO_PLUGIN.match(linha.strip())
        if not correspondencia:
            continue
        slug = correspondencia.group(1) or correspondencia.group(2)
        nome_plugin, arroba, marketplace = slug.partition("@")
        if nome_plugin.strip() != id_plugin or not arroba or not marketplace.strip():
            continue
        chaves: dict[str, str] = {}
        for linha_seguinte in linhas[indice + 1:]:
            bruta = linha_seguinte.strip()
            if bruta.startswith("["):
                break
            if not bruta or bruta.startswith("#"):
                continue
            chave, separador, valor = bruta.partition("=")
            if separador:
                chaves[chave.strip()] = valor.strip().strip('"').strip("'")
        return slug, chaves
    return None


def habilitado(chaves: dict[str, str]) -> bool:
    """True só quando o valor de `enabled`, sem espaços e case-insensitive,
    é `true` bare — ausente, `false`, ou qualquer outra coisa reprova
    (G18b)."""
    valor = chaves.get("enabled")
    if valor is None:
        return False
    return valor.strip().lower() == "true"


def celula_prova_plugin(slug: str) -> str:
    """D-H: candidatos em ordem, o primeiro que couber em
    TAMANHO_MAX_CELULA_PROVA (60) — mesmo padrão do whoami em
    `enriquecer_vercel_whoami`. Sem a palavra `enabled` (67 chars com o
    slug pedido estoura o teto); a condição em si não se perde: sem ela a
    prova nem chega a montar a célula."""
    id_plugin = slug.partition("@")[0]
    candidatos = (
        f'~/.codex/config.toml -> [plugins."{slug}"]',
        f'config.toml -> [plugins."{slug}"]',
        f"config.toml -> plugin {id_plugin} ligado",
    )
    for candidato in candidatos:
        if len(candidato) <= TAMANHO_MAX_CELULA_PROVA:
            return candidato
    return candidatos[-1]


def provar_plugin_do_app(id_plugin: str) -> ResultadoProva:
    """FORMA A (D-G): plugin instalado pelo app desktop, lido do MESMO
    `~/.codex/config.toml` que `provar_mcp_global` lê. `tabela_achada`
    distingue "não achei nenhuma tabela deste plugin" (o chamador cai pra
    forma B) de "achei a tabela, mas está desligada ou é de outro
    serviço/sem marketplace" (recusa AQUI MESMO, exit 2, nunca cai pra B —
    ver `ler_bloco_plugin`)."""
    caminho_config = caminho_config_global()
    encontrado = ler_bloco_plugin(caminho_config, id_plugin)
    if encontrado is None:
        return ResultadoProva(False, "", tabela_achada=False)
    slug, chaves = encontrado
    comando = celula_prova_plugin(slug)
    if not habilitado(chaves):
        return ResultadoProva(
            False, comando,
            f"{comando}\nO plugin {slug!r} está instalado mas DESLIGADO. "
            "Ligue-o na aba de plugins do app desktop e repita esta prova.",
            tabela_achada=True,
        )
    marketplace = slug.partition("@")[2]
    aviso = None
    if marketplace != MARKETPLACE_CURADO:
        # D-G: NÃO reprova por marketplace — a doc não confirma o
        # identificador formal [24a:conectores_mcp/f06] e a própria máquina
        # de referência do kit tem Vercel de outro marketplace.
        aviso = (
            f"AVISO: {id_plugin} está no marketplace {marketplace!r}, não "
            f"{MARKETPLACE_CURADO!r} — a doc não confirma esse identificador "
            "[24a:conectores_mcp/f06]; a prova passa mesmo assim."
        )
    return ResultadoProva(True, comando, tipo="plugin do app", tabela_achada=True, aviso=aviso)


def provar_conector(id_plugin: str, url_esperada: str) -> ResultadoProva:
    """D-G: tenta a FORMA A (plugin do app) e, só se ela não achou NENHUMA
    tabela deste plugin, cai pra FORMA B (`[mcp_servers.<id>]`, CLI, bloco
    "Se travar"). Se A achou a tabela — ligada ou não —, a resposta de A é
    final; nunca mistura com B."""
    resultado = provar_plugin_do_app(id_plugin)
    if not resultado.tabela_achada:
        resultado = provar_mcp_global(id_plugin, url_esperada)
    return resultado


def ler_bloco_mcp(caminho_config: Path, id_mcp: str) -> dict[str, str] | None:
    """Lê o bloco `[mcp_servers.<id_mcp>]` de um config.toml — aceita o
    título com ou sem aspas, como a CLI da OpenAI pode gravar. Retorna
    None se a seção não existir; dict (possivelmente vazio) se existir.
    Para no próximo `[`, então a sub-tabela `[mcp_servers.<id_mcp>.oauth]`
    que a CLI grava logo abaixo não atrapalha [24a:conectores_mcp/n12]."""
    texto = caminho_config.read_text(encoding="utf-8") if caminho_config.is_file() else ""
    titulos_validos = {f"[mcp_servers.{id_mcp}]", f'[mcp_servers."{id_mcp}"]'}
    linhas = texto.splitlines()
    inicio = None
    for indice, linha in enumerate(linhas):
        if linha.strip() in titulos_validos:
            inicio = indice
            break
    if inicio is None:
        return None
    chaves: dict[str, str] = {}
    for linha in linhas[inicio + 1:]:
        bruta = linha.strip()
        if bruta.startswith("["):
            break
        if not bruta or bruta.startswith("#"):
            continue
        chave, separador, valor = bruta.partition("=")
        if separador:
            chaves[chave.strip()] = valor.strip().strip('"').strip("'")
    return chaves


def provar_mcp_global(id_mcp: str, url_esperada: str) -> ResultadoProva:
    caminho_config = caminho_config_global()
    comando = f"~/.codex/config.toml -> [mcp_servers.{id_mcp}]"
    bloco = ler_bloco_mcp(caminho_config, id_mcp)
    if bloco is None:
        return ResultadoProva(False, comando, mensagem_conector_ausente(id_mcp, url_esperada))
    if "command" in bloco:
        return ResultadoProva(
            False, comando,
            f"{comando}\nTem 'command' em vez de 'url' — isso é a forma stdio; "
            "este servidor remoto exige 'url'.",
        )
    if normalizar_url(bloco.get("url", "")) != normalizar_url(url_esperada):
        return ResultadoProva(
            False, comando,
            f"{comando}\nurl gravada não bate: esperado {url_esperada!r}, "
            f"achado {bloco.get('url')!r}.",
        )
    return ResultadoProva(True, comando, tipo="MCP global")


def enriquecer_vercel_whoami(base: ResultadoProva) -> ResultadoProva:
    """Só chamada quando a prova de vercel saiu pela FORMA B (MCP global) —
    `vercel whoami` é conferência EXTRA da CLI, não existe pro plugin do
    app."""
    versao = _rodar(["vercel", "--version"])
    if versao is None or versao.returncode != 0:
        return base
    whoami = _rodar(["vercel", "whoami"])
    if whoami is None or whoami.returncode != 0:
        # `vercel whoami` só entra como prova EXTRA quando sai 0 — erro tipo
        # "You are not logged in" (returncode != 0) NUNCA vira prova.
        return base
    saida = (whoami.stdout or "").strip()
    primeira_linha = saida.splitlines()[0] if saida else ""
    # Nunca grava trecho truncado no meio de uma palavra: cada candidato só
    # entra se couber INTEIRO em TAMANHO_MAX_CELULA_PROVA; senão cai pro
    # próximo, e no limite fica só com a prova base (nunca um `:` sem nada
    # depois).
    candidatos = []
    if primeira_linha:
        candidatos.append(f"{base.comando} + whoami: {primeira_linha}")
    candidatos.append(f"{base.comando} + whoami OK")
    for candidato in candidatos:
        if len(candidato) <= TAMANHO_MAX_CELULA_PROVA:
            return ResultadoProva(True, candidato, tipo=base.tipo)
    return base


def provar_servico(servico: str, texto_conexoes: str) -> ResultadoProva:
    if servico in ORDEM_DEPOIS_DE_GITHUB and not tem_github(texto_conexoes):
        return ResultadoProva(
            False, "ordem do D1",
            "Falta conectar o GitHub primeiro — Supabase e Vercel nascem por "
            "'Continue with GitHub' [D24-11]. Rode --servico github antes.",
        )
    if servico == "github":
        return provar_github()
    if servico == "supabase":
        return provar_conector("supabase", URL_SUPABASE)
    if servico == "vercel":
        resultado = provar_conector("vercel", URL_VERCEL)
        if resultado.ok and resultado.tipo == "MCP global":
            resultado = enriquecer_vercel_whoami(resultado)
        return resultado
    raise ErroConexao(f"serviço desconhecido: {servico}")


def upsert_linha_conexoes(
    caminho: Path, servico_exibicao: str, para: str, tipo: str, variavel: str, comando_prova: str
) -> None:
    """Chave = 1ª célula, comparada em minúsculas sem espaço nas bordas.
    Serviço já presente = só Prova e Conectado em são reescritas na mesma
    linha (nunca uma linha nova). Rodar 2x deixa 1 linha só."""
    texto_atual = caminho.read_text(encoding="utf-8")
    linhas = texto_atual.splitlines()
    indices = indices_linhas_tabela(texto_atual)
    if not indices:
        raise ErroConexao("credenciais/CONEXOES.md não contém uma tabela válida.")

    data = date.today().isoformat()
    prova_celula = comando_prova[:TAMANHO_MAX_CELULA_PROVA]
    chave = servico_exibicao.strip().lower()

    encontrado = None
    for indice in indices:
        celulas = analisar_celulas(linhas[indice])
        if celulas and celulas[0].strip().lower() == chave:
            encontrado = indice
            break

    if encontrado is not None:
        celulas = analisar_celulas(linhas[encontrado])
        while len(celulas) < 6:
            celulas.append("")
        celulas[4] = prova_celula
        celulas[5] = data
        linhas[encontrado] = montar_linha_tabela(celulas)
    else:
        nova = [servico_exibicao, para, tipo, variavel, prova_celula, data]
        linhas.insert(indices[-1] + 1, montar_linha_tabela(nova))

    texto_novo = "\n".join(linhas).rstrip("\n") + "\n"
    escrever_atomico(caminho, texto_novo)


def escrever_atomico(caminho: Path, conteudo: str) -> None:
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


def acao_provar_fixo(casa: Path, servico: str, para: str) -> int:
    if not para:
        raise ErroConexao("--para é obrigatório junto com --servico github|supabase|vercel.")
    caminho_conexoes = casa / "credenciais" / "CONEXOES.md"
    texto_conexoes = caminho_conexoes.read_text(encoding="utf-8")

    resultado = provar_servico(servico, texto_conexoes)
    if not resultado.ok:
        print(resultado.mensagem_falha, file=sys.stderr)
        return 2
    if resultado.aviso:
        print(resultado.aviso)

    tipo_fixo, variavel, servico_exibicao = INFO_SERVICO_FIXO[servico]
    tipo = resultado.tipo or tipo_fixo
    upsert_linha_conexoes(caminho_conexoes, servico_exibicao, para, tipo, variavel, resultado.comando)
    print(f"OK: {servico_exibicao} registrado em credenciais/CONEXOES.md (prova: {resultado.comando}).")
    return 0


def acao_provar_chave(casa: Path, nome: str, tipo: str, variavel: str, para: str) -> int:
    for campo, valor in (("--nome", nome), ("--tipo", tipo), ("--variavel", variavel), ("--para", para)):
        if not valor:
            raise ErroConexao(f"{campo} é obrigatório junto com --servico outro.")

    caminho_env = casa / "credenciais" / ".env"
    texto_env = caminho_env.read_text(encoding="utf-8") if caminho_env.is_file() else ""
    nomes = {nome for nome, _valor in atribuicoes(texto_env)}

    if variavel not in nomes:
        print(
            f"credenciais/.env não tem a variável {variavel}. Capture a chave "
            "(clipboard -> credenciais/.env) e rode de novo.",
            file=sys.stderr,
        )
        return 2

    caminho_conexoes = casa / "credenciais" / "CONEXOES.md"
    comando_prova = f"variável {variavel} presente em credenciais/.env"
    upsert_linha_conexoes(caminho_conexoes, nome, para, tipo, variavel, comando_prova)
    print(f"OK: {nome} registrado em credenciais/CONEXOES.md (prova: variável presente).")
    return 0


def acao_listar_nomes(casa: Path) -> int:
    caminho_env = casa / "credenciais" / ".env"
    if not caminho_env.is_file():
        return 0
    for nome, _valor in atribuicoes(caminho_env.read_text(encoding="utf-8")):
        print(nome)
    return 0


def acao_ultimos_4(casa: Path, variavel: str) -> int:
    caminho_env = casa / "credenciais" / ".env"
    if not caminho_env.is_file():
        print("credenciais/.env não existe.", file=sys.stderr)
        return 2
    for nome, valor in atribuicoes(caminho_env.read_text(encoding="utf-8")):
        if nome == variavel:
            print(valor[-4:])
            return 0
    print(f"variável {variavel} não encontrada em credenciais/.env.", file=sys.stderr)
    return 2


def main() -> int:
    args = argumentos()
    try:
        casa = Path(args.casa).expanduser().resolve()
        if not casa.is_dir():
            raise ErroConexao(f"--casa não é uma pasta: {casa}")
        validar_casa(casa)

        acoes_escolhidas = [
            bool(args.listar_nomes),
            bool(args.ultimos_4),
            bool(args.servico),
        ]
        if sum(1 for escolhida in acoes_escolhidas if escolhida) != 1:
            raise ErroConexao(
                "Use exatamente uma ação: --servico, --listar-nomes ou --ultimos-4."
            )

        if args.listar_nomes:
            return acao_listar_nomes(casa)
        if args.ultimos_4:
            return acao_ultimos_4(casa, args.ultimos_4)
        if args.servico == "outro":
            return acao_provar_chave(casa, args.nome, args.tipo, args.variavel, args.para)
        return acao_provar_fixo(casa, args.servico, args.para)
    except ErroConexao as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 2
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: falha de arquivo: {erro}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
