#!/usr/bin/env python3
"""Guarda de PreToolUse da Casa, rodada ANTES de toda chamada de ferramenta
(este arquivo mora DENTRO da Casa, em `.codex/hooks/`).

D24: camada mecânica de defesa: 13 regras de texto puro que negam a classe
de comando mais perigosa antes dela rodar (push forçado, push da main com
sistema já em produção, migration de banco linked, deploy de produção, remoção recursiva,
DROP/TRUNCATE, leitura de credencial, compra por MCP, leitura de segredo do
vault, schema por MCP sem veredito, edição de sistema em produção na main,
pular as travas do git (opcao no-verify) ou trocar o core.hooksPath, e push
pro repositório-modelo do curso enquanto o origin ainda aponta pra ele).

AVISO IMPORTANTE, pra ninguém vender isto como segurança forte: a detecção é
por TEXTO (regex/substring) e é burlável por construção (variação de
espaçamento, alias, script intermediário, base64...). Esta guarda é rede pra
ERRO do dono/IA, não defesa contra adversário. A defesa real de banco
continua sendo o veredito de migration (`.githooks/pre-commit` + regra 10
abaixo) e a Action como única porta de escrita em produção.

CONTRATO (payload do PreToolUse no stdin):
  session_id, cwd, hook_event_name, turn_id, tool_name, tool_use_id,
  tool_input, permission_mode.

SAÍDA:
  DENY -> 1 linha JSON:
    {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                             "permissionDecision": "deny",
                             "permissionDecisionReason": <motivo>}}
  ALLOW -> stdout VAZIO (nada a dizer é o caminho de 99% dos turnos).

Escolha de forma: NÃO usamos "exit 2 + stderr" (a doc permite, mas o JSON é
explícito e testável — decisão registrada aqui em comentário, não reabrir
sem motivo novo).

MAIN E BRANCH (07/10/2026): a Casa vive na `main` — o guardião commita e
envia a cada checkpoint, o autosave do fim de turno envia, e
`polozi-criar-github` faz o primeiro `git push -u origin main`. Por isso a
regra 2 NÃO nega push da main em geral (negava, e travava esses três
caminhos oficiais). Ela nega só quando a Casa tem sistema publicado em
produção (mesmo marcador da regra 11, `sistemas/empresa-os/.vercel/
project.json`): aí a main publica, e o trabalho vai por branch + PR. Push
forçado continua negado sempre (regra 1); segredo é barrado pelo
`.githooks/pre-push` em todo push, com falha fechada. `permissionDecision` é o shape de PreToolUse; o shape
`decision.behavior` é de PermissionRequest e não se usa aqui.

FAIL-OPEN: `main()` inteiro roda dentro de um único try/except — qualquer
erro (stdin vazio, JSON inválido, `tool_input` fora do formato esperado,
timeout de subprocesso, arquivo inacessível) vira ALLOW silencioso, nunca
derruba o turno do dono por bug da própria guarda.

NUNCA lê `.env`, nunca imprime conteúdo de arquivo, nunca roda git de
escrita. O motivo do deny é sempre uma frase CONSTANTE por regra — nunca
ecoa o comando ou valor do payload (pode carregar segredo).

TELEMETRIA: 1 linha por DENY (nunca em allow) em `operacao/telemetria.jsonl`
— só a regra e o `tool_name`, nunca o comando. Falha ao escrever é engolida
(o deny vale mesmo sem log).

Stdlib puro, sem dependência, roda igual em Mac e Windows.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# hooks/ -> .codex/ -> raiz da Casa.
CASA_PADRAO = Path(__file__).resolve().parents[2]

TIMEOUT_BRANCH = 3

# Repositório-modelo do curso: o aluno clona este e o `origin` fica apontando
# pra ele até a etapa 4 do instalador criar o repositório dele e trocar o
# origin. Mesma regex do preflight.py e do criar_empresa_ia.py: casa URL https,
# ssh e caminho local que TERMINE em `polozigit/mestre-das-ias-os[.git]`, sem
# confundir com `mestre-das-ias-os-outro` nem com `aluno-polozigit/...`.
REPOSITORIO_MODELO = "polozigit/mestre-das-ias-os"
_RE_REMOTE_DO_MODELO = re.compile(
    r"(?:^|[/:])" + re.escape(REPOSITORIO_MODELO) + r"(?:\.git)?/?$", re.IGNORECASE
)
# opções do `git push` que levam um valor no argumento seguinte
OPCOES_PUSH_COM_VALOR = ("-o", "--push-option", "--receive-pack", "--exec")
# `git push` com as opções globais do git entre `git` e `push` (grupo 1) e o resto do comando (grupo 2)
_RE_GIT_PUSH = re.compile(
    r"\bgit((?:\s+-{1,2}[\w-]+(?:[= ]\S+)?)*)"
    r"\s+push\b(.*)"
)

MOTIVOS = {
    "r01_push_forcado": (
        "Push que reescreve o historico remoto bloqueado. Resolva o "
        "conflito normalmente, ou peca ajuda antes de sobrescrever."
    ),
    "r02_push_main": (
        "Push da main bloqueado: esta Casa ja tem sistema publicado em "
        "producao e a main publica. Crie uma branch (git switch -c ...) "
        "e abra uma PR."
    ),
    "r03_supabase_db_push": (
        "Migration linked direto no banco bloqueada. Isso passa pela peca "
        "de veredito da migration antes de tocar o banco de verdade."
    ),
    "r04_vercel_producao": (
        "Publicar em producao por comando solto bloqueado. Siga o fluxo "
        "de publicacao com revisao humana, nunca direto por este caminho."
    ),
    "r05_rm_recursivo": (
        "Remocao recursiva forcada bloqueada. Confirme o alvo com o dono "
        "antes de apagar uma pasta inteira."
    ),
    "r06_drop_truncate": (
        "Instrucao destrutiva de banco (DROP/TRUNCATE) bloqueada sem "
        "veredito aprovado da migration. Rode a auditoria de migration "
        "antes."
    ),
    "r07_leitura_de_credenciais": (
        "Leitura de arquivo de acesso/segredo bloqueada. Esse conteudo "
        "nao deve entrar no contexto da conversa."
    ),
    "r08_mcp_compra": (
        "Chamada de compra/pagamento por MCP bloqueada. Essa acao exige "
        "confirmacao humana fora deste fluxo."
    ),
    "r09_vault_segredo": (
        "Consulta a segredo do cofre bloqueada. Valor de credencial nunca "
        "entra no contexto da conversa."
    ),
    "r10_mcp_schema": (
        "Alteracao de schema por MCP bloqueada sem veredito aprovado da "
        "migration. Rode a auditoria de migration antes."
    ),
    "r11_sistemas_na_main": (
        "Edicao de sistemas/ na branch principal, com producao ja "
        "publicada, bloqueada. Trabalhe numa branch e publique com o "
        "fluxo revisado."
    ),
    "r12_pular_trava_do_git": (
        "Pular ou desligar a trava de segredo bloqueado. Corrija o que a "
        "trava apontou e salve de novo pelo tecnologia-publicar; se ela "
        "estiver desligada, o salvar explica como religar."
    ),
    "r13_push_no_modelo": (
        "Esta pasta ainda aponta pro repositório-modelo do curso; a etapa 4 "
        "do instalador cria o seu repositório e troca o origin. Até lá, "
        "salve só neste computador (commit local), sem enviar."
    ),
}


def _comando(contexto: dict) -> str:
    valor = contexto["tool_input"].get("command")
    return valor if isinstance(valor, str) else ""


def _resto_do_push(comando: str) -> str | None:
    # aceita opção global entre `git` e `push` (`git -C . push ...`)
    achado = re.search(r"\bgit((?:\s+-{1,2}[\w-]+(?:[= ]\S+)?)*)\s+push\b(.*)", comando)
    if achado is None:
        return None
    resto = achado.group(2)
    for separador in ("&&", "||", ";", "|"):
        indice = resto.find(separador)
        if indice != -1:
            resto = resto[:indice]
    return resto


def _branch_atual(contexto: dict) -> str | None:
    casa = contexto.get("cwd") or str(CASA_PADRAO)
    try:
        resultado = subprocess.run(
            ["git", "-C", casa, "rev-parse", "--abbrev-ref", "HEAD"],
            timeout=TIMEOUT_BRANCH,
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        return None
    if resultado.returncode != 0:
        return None
    valor = resultado.stdout.strip()
    return valor or None


def _producao_publicada() -> bool:
    marcador = CASA_PADRAO / "sistemas" / "empresa-os" / ".vercel" / "project.json"
    return marcador.is_file()


def _tem_veredito(basename: str) -> bool:
    """Contrato compartilhado com a peça (c) (spec e1-vault-migration).
    Caminho: `operacao/vereditos/<basename-da-migration-SEM-.sql>.json`.
    Chaves do arquivo: `migration`, `sha256`, `autor`, `resultado`, `nota`,
    `data`.

    Divisão de trabalho DELIBERADA entre os dois consumidores — não
    unificar: esta função confere só EXISTÊNCIA do arquivo de veredito +
    `resultado == "APPROVED"`. Quem confere o `sha256` (a migration não
    mudou depois do veredito) é o `.githooks/pre-commit` (peça (c)). Motivo:
    este hook roda em TODA chamada de ferramenta e não pode pagar o custo
    de abrir e fazer hash do `.sql`; o pre-commit roda 1x no commit e é a
    trava que pega migration editada depois do veredito. Mexer num lado sem
    o outro abre buraco — as duas travas são complementares, não
    redundantes.

    Pasta ausente, JSON inválido ou qualquer erro de leitura = sem veredito
    (False)."""
    try:
        caminho = CASA_PADRAO / "operacao" / "vereditos" / f"{basename}.json"
        conteudo = json.loads(caminho.read_text(encoding="utf-8"))
        return conteudo.get("resultado") == "APPROVED"
    except Exception:
        return False


def r01_push_forcado(tool_name: str, texto: str, contexto: dict) -> str | None:
    if tool_name != "Bash":
        return None
    resto = _resto_do_push(_comando(contexto))
    if resto is None:
        return None
    if re.search(r"(--force-with-lease|--force\b|(?<!\S)-f\b)", resto):
        return MOTIVOS["r01_push_forcado"]
    return None


def r02_push_main(tool_name: str, texto: str, contexto: dict) -> str | None:
    if tool_name != "Bash":
        return None
    resto = _resto_do_push(_comando(contexto))
    if resto is None:
        return None
    if not _producao_publicada():
        return None
    # `--all`/`--mirror` sobem todas as branches, main inclusive
    if re.search(r"(^|\s)--(all|mirror)\b", resto):
        return MOTIVOS["r02_push_main"]
    args = [token for token in resto.split() if not token.startswith("-")]
    principais = ("main", "master")
    refspecs = args[1:]
    # destino de cada refspec: `x:main`, `HEAD:refs/heads/main`, `+main`
    destinos = [re.sub(r"^refs/heads/", "", r.split(":")[-1].lstrip("+")) for r in refspecs]
    if any(destino in principais for destino in destinos):
        return MOTIVOS["r02_push_main"]
    # sem refspec, ou `HEAD`/`@`: sobe a branch atual
    if not refspecs or any(r.split(":")[0].lstrip("+") in ("HEAD", "@") and ":" not in r for r in refspecs):
        if _branch_atual(contexto) in principais:
            return MOTIVOS["r02_push_main"]
    return None


def r03_supabase_db_push(tool_name: str, texto: str, contexto: dict) -> str | None:
    if tool_name != "Bash":
        return None
    comando = _comando(contexto)
    if re.search(r"supabase\s+db\s+push\b", comando):
        return MOTIVOS["r03_supabase_db_push"]
    if re.search(r"supabase\s+db\s+reset\b[^\n]*--linked\b", comando):
        return MOTIVOS["r03_supabase_db_push"]
    if re.search(r"supabase\s+migration\s+up\b[^\n]*--linked\b", comando):
        return MOTIVOS["r03_supabase_db_push"]
    return None


def r04_vercel_producao(tool_name: str, texto: str, contexto: dict) -> str | None:
    if tool_name != "Bash":
        return None
    comando = _comando(contexto)
    if not re.search(r"\bvercel\b", comando):
        return None
    if re.search(r"--prod\b", comando):
        return MOTIVOS["r04_vercel_producao"]
    if re.search(r"vercel\s+promote\b", comando) or re.search(r"vercel\s+rollback\b", comando):
        return MOTIVOS["r04_vercel_producao"]
    return None


def r05_rm_recursivo(tool_name: str, texto: str, contexto: dict) -> str | None:
    if tool_name != "Bash":
        return None
    comando = _comando(contexto)
    baixo = comando.lower()
    if re.search(r"\brm\s+(-\w*r\w*f\w*|-\w*f\w*r\w*)\b", comando, re.IGNORECASE):
        return MOTIVOS["r05_rm_recursivo"]
    if "rmdir" in baixo and "/s" in baixo:
        return MOTIVOS["r05_rm_recursivo"]
    if "remove-item" in baixo and "-recurse" in baixo:
        return MOTIVOS["r05_rm_recursivo"]
    return None


def r06_drop_truncate(tool_name: str, texto: str, contexto: dict) -> str | None:
    if not re.search(r"\b(DROP\s+TABLE|DROP\s+SCHEMA|DROP\s+DATABASE|TRUNCATE)\b", texto, re.IGNORECASE):
        return None
    baixo = texto.lower()
    if "_smoke" in baixo or "_probe" in baixo:
        return None
    tool_input = contexto["tool_input"]
    caminho = tool_input.get("path") or tool_input.get("file_path")
    if isinstance(caminho, str):
        achado = re.search(r"supabase/migrations/([^/]+)\.sql$", caminho)
        if achado is not None and _tem_veredito(achado.group(1)):
            return None
    return MOTIVOS["r06_drop_truncate"]


def r07_leitura_de_credenciais(tool_name: str, texto: str, contexto: dict) -> str | None:
    tool_input = contexto["tool_input"]
    caminho = tool_input.get("path") or tool_input.get("file_path")
    if tool_name in ("apply_patch", "read_file"):
        if isinstance(caminho, str) and "credenciais/" in caminho and not caminho.endswith(".md"):
            return MOTIVOS["r07_leitura_de_credenciais"]
        return None
    if tool_name != "Bash":
        return None
    comando = _comando(contexto)
    if "credenciais/" not in comando:
        return None
    if re.search(r"credenciais/\S*\.md\b", comando):
        return None
    baixo = comando.lower()
    leitores = ("cat ", "type ", "get-content", "sed ", "head ", "tail ", "less ", "more ", "open ")
    if any(leitor in baixo for leitor in leitores):
        return MOTIVOS["r07_leitura_de_credenciais"]
    return None


def r08_mcp_compra(tool_name: str, texto: str, contexto: dict) -> str | None:
    if re.match(r"^mcp__.+__(buy|purchase)_", tool_name or ""):
        return MOTIVOS["r08_mcp_compra"]
    return None


def r09_vault_segredo(tool_name: str, texto: str, contexto: dict) -> str | None:
    baixo = texto.lower()
    if "decrypted_secrets" in baixo or "vault.secrets" in baixo:
        return MOTIVOS["r09_vault_segredo"]
    return None


def r10_mcp_schema(tool_name: str, texto: str, contexto: dict) -> str | None:
    nome_ferramenta = tool_name or ""
    tool_input = contexto["tool_input"]
    if re.search(r"__apply_migration$", nome_ferramenta):
        nome = tool_input.get("name")
        if isinstance(nome, str) and _tem_veredito(nome):
            return None
        return MOTIVOS["r10_mcp_schema"]
    if re.search(r"__execute_sql$", nome_ferramenta):
        query = tool_input.get("query")
        if isinstance(query, str):
            for instrucao in query.split(";"):
                linha = re.sub(r"--.*$", "", instrucao, flags=re.MULTILINE).strip()
                if not linha:
                    continue
                if re.match(r"(?i)^(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b", linha):
                    return MOTIVOS["r10_mcp_schema"]
    return None


def r11_sistemas_na_main(tool_name: str, texto: str, contexto: dict) -> str | None:
    if tool_name != "apply_patch":
        return None
    if "sistemas/" not in texto:
        return None
    if not _producao_publicada():
        return None
    branch = _branch_atual(contexto)
    if branch in ("main", "master"):
        return MOTIVOS["r11_sistemas_na_main"]
    return None


def r12_pular_trava_do_git(tool_name: str, texto: str, contexto: dict) -> str | None:
    if tool_name != "Bash":
        return None
    comando = _comando(contexto)
    for trecho in re.split(r"&&|\|\||;|\|", comando):
        if not re.search(r"\bgit\b", trecho):
            continue
        # `git -c core.hooksPath=...` em qualquer subcomando
        if re.search(r"(?<!\S)-c\s*core\.hookspath\s*=", trecho, re.IGNORECASE):
            return MOTIVOS["r12_pular_trava_do_git"]
        if re.search(r"\b(commit|push|merge|am|rebase|cherry-pick|revert)\b[^\n]*(?<!\S)--no-verif[y]\b", trecho):
            return MOTIVOS["r12_pular_trava_do_git"]
        # `git commit -n` = pular o hook (no push, -n é ensaio e não pula hook);
        # pula o valor de -m/-F/-C/-c pra mensagem "-n" não virar flag.
        achado = re.search(r"\bcommit\b(.*)", trecho)
        if achado:
            pular_valor = False
            for token in achado.group(1).split():
                if pular_valor:
                    pular_valor = False
                    continue
                if token in ("-m", "-F", "-C", "-c", "--author", "--date"):
                    pular_valor = True
                    continue
                if re.fullmatch(r"-[A-Za-z]*n[A-Za-z]*", token):
                    return MOTIVOS["r12_pular_trava_do_git"]
        achado = re.search(r"\bconfig\b(.*\bcore\.hookspath\b.*)", trecho, re.IGNORECASE)
        if achado:
            resto = achado.group(1)
            if re.search(r"--unset", resto):
                return MOTIVOS["r12_pular_trava_do_git"]
            valor = re.search(r"core\.hookspath\s+(\S+)", resto, re.IGNORECASE)
            if valor and valor.group(1).strip("'\"").rstrip("/") != ".githooks":
                return MOTIVOS["r12_pular_trava_do_git"]
    return None


def _pasta_do_git(opcoes: str, contexto: dict) -> str:
    """Pasta onde o git do comando roda: o cwd da sessão (ou a Casa), ou o `-C <pasta>`."""
    base = contexto.get("cwd") or str(CASA_PADRAO)
    achado = re.search(r"(?<!\S)-C\s+(\S+)", opcoes)
    if achado is None:
        return base
    return os.path.join(base, achado.group(1).strip("'\""))


def _remoto_do_push(resto: str) -> str:
    """Remoto que o `git push` ataca: o 1º argumento que não é opção; sem ele, o
    `--repo=<url>`; sem nenhum dos dois, `origin` (o argumento do comando vence o
    `--repo`, como no git)."""
    # redirecionamento (`2>&1`, `> log`) não é argumento do push
    resto = re.split(r"(?:^|\s)\d*(?:>|<|&>)", resto, maxsplit=1)[0]
    tokens = resto.split()
    posicionais: list[str] = []
    repo = ""
    indice = 0
    while indice < len(tokens):
        token = tokens[indice].strip("'\"")
        if token.startswith("--repo="):
            repo = token.split("=", 1)[1].strip("'\"")
        elif token in OPCOES_PUSH_COM_VALOR:
            indice += 1  # o valor da opção não é o remoto
        elif not token.startswith("-"):
            posicionais.append(token)
        indice += 1
    return posicionais[0] if posicionais else (repo or "origin")


def _urls_do_remoto(remoto: str, pasta: str) -> list[str]:
    """URLs de PUSH do remoto (a de push, não a de fetch: `pushurl` e
    `pushInsteadOf` valem). Remoto dado como URL ou caminho vale como está."""
    if "/" in remoto or ":" in remoto or remoto.startswith("."):
        return [remoto]
    try:
        resultado = subprocess.run(
            ["git", "-C", pasta, "remote", "get-url", "--push", "--all", remoto],
            timeout=TIMEOUT_BRANCH,
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        return []
    if resultado.returncode != 0:
        return []
    return [linha.strip() for linha in resultado.stdout.splitlines() if linha.strip()]


def r13_push_no_modelo(tool_name: str, texto: str, contexto: dict) -> str | None:
    if tool_name != "Bash":
        return None
    for trecho in re.split(r"&&|\|\||;|\|", _comando(contexto)):
        achado = _RE_GIT_PUSH.search(trecho)
        if achado is None:
            continue
        pasta = _pasta_do_git(achado.group(1), contexto)
        for url in _urls_do_remoto(_remoto_do_push(achado.group(2)), pasta):
            if _RE_REMOTE_DO_MODELO.search(url.strip().strip("'\"")):
                return MOTIVOS["r13_push_no_modelo"]
    return None


REGRAS = (
    r01_push_forcado,
    r02_push_main,
    r03_supabase_db_push,
    r04_vercel_producao,
    r05_rm_recursivo,
    r06_drop_truncate,
    r07_leitura_de_credenciais,
    r08_mcp_compra,
    r09_vault_segredo,
    r10_mcp_schema,
    r11_sistemas_na_main,
    r12_pular_trava_do_git,
    r13_push_no_modelo,
)


def _motivo(tool_name: str, texto: str, contexto: dict) -> str | None:
    """A PRIMEIRA regra que devolver motivo, vence."""
    for regra in REGRAS:
        motivo = regra(tool_name, texto, contexto)
        if motivo:
            return motivo
    return None


def _regra_disparada(tool_name: str, texto: str, contexto: dict) -> str:
    for candidata in REGRAS:
        if candidata(tool_name, texto, contexto):
            return candidata.__name__
    return "desconhecida"


def _serializar(tool_input: dict) -> str:
    partes = [json.dumps(tool_input, ensure_ascii=False)]
    for chave in ("command", "query", "sql", "path", "file_path", "input"):
        valor = tool_input.get(chave)
        if isinstance(valor, str):
            partes.append(valor)
    texto = " ".join(partes)
    return re.sub(r"\s+", " ", texto)


def _deny(motivo: str) -> dict:
    return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": motivo}}


def _agora() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _registrar_telemetria(nome: str, tool_name: str) -> None:
    try:
        linha = {"ts": _agora(), "hook": "guarda", "regra": nome, "tool_name": tool_name}
        caminho = CASA_PADRAO / "operacao" / "telemetria.jsonl"
        caminho.parent.mkdir(parents=True, exist_ok=True)
        with caminho.open("a", encoding="utf-8") as arquivo:
            arquivo.write(json.dumps(linha, ensure_ascii=False) + "\n")
    except Exception:
        pass


def main() -> int:
    try:
        bruto = sys.stdin.read()
        if not bruto.strip():
            return 0
        payload = json.loads(bruto)
        if not isinstance(payload, dict):
            return 0
        tool_name = payload.get("tool_name")
        if not isinstance(tool_name, str):
            tool_name = ""
        tool_input = payload.get("tool_input")
        if not isinstance(tool_input, dict):
            tool_input = {}
        cwd = payload.get("cwd")
        contexto = {"cwd": cwd if isinstance(cwd, str) and cwd else None, "tool_input": tool_input}
        texto = _serializar(tool_input)

        motivo = _motivo(tool_name, texto, contexto)
        if not motivo:
            return 0

        nome_regra = _regra_disparada(tool_name, texto, contexto)
        _registrar_telemetria(nome_regra, tool_name)
        print(json.dumps(_deny(motivo)))
        return 0
    except Exception:
        return 0


if __name__ == "__main__":
    sys.exit(main())
