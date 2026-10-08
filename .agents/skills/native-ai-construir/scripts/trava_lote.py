#!/usr/bin/env python3
"""trava_lote.py: trava de caminho do lote do construtor (condicao C3), por mecanismo.

Uso (da raiz da casa):
  python3 trava_lote.py snapshot <SNAP.json> [--raiz .]
  python3 trava_lote.py check <SNAP.json> --sha256 <hash impresso pelo snapshot>
        --ficha operacao/tasks/TASK-N/ficha.json --tarefa operacao/tasks/TASK-N [--raiz .]
        [--w15 [--unidade <nome>] [--tokens "a=1"] [--data AAAA-MM-DD]]

snapshot  retrato por hash (sha256) de todo arquivo da raiz, inclusive o que o git
          ignora (ex.: .claude/settings.local.json). O git nao e usado como programa: so
          o arquivo .git/HEAD e lido, para recusar (saida 2) quem esta na branch
          principal com o sistema ja no ar (C10: a construcao acontece na branch da
          tarefa). Na Casa ainda sem o sistema publicado (sem
          sistemas/empresa-os/.vercel/project.json, o mesmo sinal da guarda.py, do
          autosave.py e do salvar.py) a main E a branch de trabalho e o retrato sai. Fonte
          do time aninhada em outro repo (C13) nao e Casa: la a principal segue recusada.
          Ficam fora do
          retrato so as pastas de cache em IGNORAR_PASTAS (fora da guarda do time) e o
          interior da .git, menos .git/config e .git/hooks/ (que entram). Imprime o
          sha256 do proprio retrato: o thread guarda esse valor no contexto dele e
          passa no check (C3: quem a trava vigia nao consegue reescrever o retrato sem
          a trava ver).
check     compara o retrato com o estado de agora e RECUSA o lote (saida 1) se:
            - o retrato tem sha256 diferente do --sha256 (retrato reescrito);
            - a ficha nao tem o hash gravado no gate desenho-aprovado da tarefa (W15),
              mudou durante o lote, ou o campo caminhos_permitidos dela e invalido;
            - algum arquivo mudou, nasceu ou sumiu fora de caminhos_permitidos;
            - algum arquivo mudou num caminho sempre humano (referencias/nunca.md),
              mesmo que a allowlist cubra esse caminho; inclui os scripts do time,
              o W15 e o criterio.md e casos.md das tarefas;
            - a propria allowlist cobre um caminho sempre humano.
          Excecao unica (v1.3): o CAIO reinstalou o time no meio da tarefa. A mudanca nos
          arquivos do time (pasta da skill, sem __pycache__ e sem os mapas banco.md e
          repo.md, e agentes gerados native-ai-*) passa SO se os sha256
          de agora forem exatamente os da ultima linha reinstalar-time aprovada por
          humano da tarefa (w15.py), e o registro so pode ter ganho essas linhas no fim.
          A allowlist sai da ficha (campo caminhos_permitidos), nunca da linha de
          comando: a lista conferida e a que o dono aprovou no gate 1.
          Padrao = caminho exato ou padrao com * (dentro de uma pasta) e ** (qualquer
          profundidade). Pasta terminada em / vale como pasta/**.
          Com --w15, grava 1 linha do gate trava-lote (acerto ou erro) via w15.registrar.

Importavel: humano, validar_allowlist, recusa_na_principal, principal_liberada,
sistema_publicado, fonte_aninhada, reinstalacao_aprovada.

Saida: 0 lote ok; 1 lote recusado; 2 uso errado (ou branch principal no snapshot).
So stdlib, sem rede, sem subprocess.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
# cache de bytecode numa pasta vazia: o __pycache__/ ao lado nunca e lido (C3)
_PYC_VAZIO = tempfile.TemporaryDirectory(prefix="native-ai-pyc-")
sys.pycache_prefix = _PYC_VAZIO.name
sys.path.insert(0, str(Path(__file__).resolve().parent))
import w15  # noqa: E402

IGNORAR_PASTAS = {"node_modules", ".next", ".venv", "__pycache__"}
GIT_DENTRO = (".git/config",)  # arquivos da .git que entram no retrato; .git/hooks/ entra inteiro

# Sistema no ar: o MESMO marcador da regra 2 da guarda.py, do autosave.py e do salvar.py da Casa. Enquanto
# ele nao existe, a main e a branch de trabalho da Casa; com ele, a main publica e o trabalho vai por branch + PR.
MARCADOR_PRODUCAO = ("sistemas", "empresa-os", ".vercel", "project.json")

# Caminhos sempre humanos (espelha referencias/nunca.md, secao 2). O construtor so
# escreve proposta em trechos/; trechos/AGENTS.md nao casa (so o AGENTS.md da raiz).
# Entram tambem a guarda do proprio time (os scripts que a trava e a prova rodam logo
# depois do lote) e o que prova o processo: o W15 e o criterio e os casos assinados
# da tarefa. Quem a trava vigia nao reescreve a trava, o registro nem o criterio.
_SETTINGS_RE = re.compile(r"^\.claude/settings[^/]*\.json$")
GUARDA_DO_TIME = w15.GUARDA_DO_TIME
_ASSINADO_RE = re.compile(r"^operacao/tasks/[^/]+/(criterio|casos)\.md$")
EXEMPLOS_HUMANOS = (
    "AGENTS.md", "CLAUDE.md", "sistemas/CLAUDE.md", ".claude/settings.json",
    ".claude/settings.local.json", ".codex/config.toml", ".codex/hooks.json",
    ".codex/hooks/guarda.py", ".claude/hooks/guarda.sh", ".githooks/pre-commit",
    ".git/hooks/pre-commit", ".github/workflows/ci.yml", "supabase/migrations/0001.sql",
    "sistemas/empresa-os/supabase/migrations/0001.sql",
    GUARDA_DO_TIME + "trava_lote.py", w15.ARQUIVO_RELATIVO.as_posix(),
    "operacao/tasks/TASK-1/criterio.md", "operacao/tasks/TASK-1/casos.md",
)


# ------------------------------------------------------------ git (so leitura de arquivo)
BRANCHES_PADRAO = ("main", "master")


def _repo_git(raiz):
    """(gitdir, commondir, pasta do repo) do repositorio que contem raiz, ou (None, None, None).

    Le so arquivos: .git como pasta, ou .git como arquivo 'gitdir: ...' (worktree)."""
    atual = Path(raiz).resolve()
    for pasta in (atual, *atual.parents):
        marca = pasta / ".git"
        if marca.is_dir():
            return marca, marca, pasta
        if marca.is_file():
            try:
                texto = marca.read_text(encoding="utf-8").strip()
            except (OSError, UnicodeDecodeError):
                return None, None, pasta
            if not texto.startswith("gitdir:"):
                return None, None, pasta
            gitdir = (pasta / texto[len("gitdir:"):].strip()).resolve()
            comum = gitdir
            arq_comum = gitdir / "commondir"
            if arq_comum.is_file():
                try:
                    comum = (gitdir / arq_comum.read_text(encoding="utf-8").strip()).resolve()
                except (OSError, UnicodeDecodeError):
                    pass
            return gitdir, comum, pasta
    return None, None, None


def _ref(arquivo, prefixo):
    try:
        texto = Path(arquivo).read_text(encoding="utf-8").strip()
    except (OSError, UnicodeDecodeError):
        return None
    if texto.startswith("ref: " + prefixo):
        return texto[len("ref: " + prefixo):].strip() or None
    return None


def branches_padrao(comum):
    """Nomes que contam como branch principal: main, master e o HEAD do origin, se houver."""
    nomes = set(BRANCHES_PADRAO)
    if comum is not None:
        origem = _ref(Path(comum) / "refs" / "remotes" / "origin" / "HEAD", "refs/remotes/origin/")
        if origem:
            nomes.add(origem)
    return nomes


def sistema_publicado(raiz):
    """True se a Casa ja tem o sistema no ar: o mesmo marcador da guarda.py, do autosave.py e do
    salvar.py (sistemas/empresa-os/.vercel/project.json)."""
    return Path(raiz).joinpath(*MARCADOR_PRODUCAO).is_file()


def principal_liberada(raiz):
    """True se a branch principal e a branch de trabalho desta raiz (C10 relaxada).

    Na Casa do aluno a main e onde se trabalha ate o sistema ir pro ar: a regra 2 da guarda.py so
    nega o push da main quando o marcador existe. Com o sistema no ar a main publica, e o trabalho
    vai por branch + PR. Fonte do time aninhada em outro repo (C13) nao e Casa: la a principal
    continua recusada."""
    return not fonte_aninhada(raiz) and not sistema_publicado(raiz)


def recusa_na_principal(raiz):
    """None se a raiz pode receber a construcao; senao o motivo da recusa (C10).

    Sem repositorio ou HEAD solto = recusa sempre. Branch principal = recusa so quando a principal
    nao e de trabalho aqui (sistema ja no ar, ou fonte aninhada); na Casa sem o sistema publicado a
    main e a branch de trabalho. Com o sistema no ar a proposta de mudanca precisa de uma copia de
    trabalho propria, e escrever na principal ja instala."""
    gitdir, comum, _ = _repo_git(raiz)
    if gitdir is None:
        return ("a raiz nao esta num repositorio git; a construcao precisa da branch da "
                "tarefa (copia de trabalho propria) para virar proposta de mudanca")
    if not (Path(gitdir) / "HEAD").is_file():
        return f"{gitdir}/HEAD ilegivel; nao da pra saber a branch"
    branch = _ref(Path(gitdir) / "HEAD", "refs/heads/")
    if branch is None:
        return "HEAD solto (sem branch); crie a branch da tarefa antes de construir"
    if branch in branches_padrao(comum):
        if principal_liberada(raiz):
            return None
        return (f"a copia de trabalho esta na branch principal ({branch}) e aqui ela nao e de trabalho "
                "(sistema ja no ar, ou fonte do time dentro de outro repositorio); escrever aqui ja "
                "instala o gerado. Crie a branch da tarefa antes (passo 5)")
    return None


def fonte_aninhada(raiz):
    """True se a raiz e a fonte do time guardada dentro de OUTRO repositorio (sem .git
    propria, com um repositorio acima). La nada vai pra .claude/: o Claude Code descobre
    .claude/skills e .claude/agents aninhados e o time entraria no catalogo do repo de
    fora (C13). Na casa (raiz com .git) e numa pasta solta, False."""
    raiz = Path(raiz).resolve()
    if (raiz / ".git").exists():
        return False
    _, _, pasta = _repo_git(raiz)
    return pasta is not None and pasta != raiz


def humano(rel):
    """True se rel (posix, relativo a raiz) e caminho sempre humano."""
    partes = rel.split("/")
    if rel == "AGENTS.md" or partes[-1] == "CLAUDE.md":
        return True
    if _SETTINGS_RE.match(rel) or rel == ".codex/config.toml":
        return True
    if partes[-1] == "hooks.json" or any(p in ("hooks", ".githooks") for p in partes[:-1]):
        return True
    if rel.startswith(".github/workflows/"):
        return True
    if rel.startswith(GUARDA_DO_TIME) or rel == w15.ARQUIVO_RELATIVO.as_posix():
        return True
    if _ASSINADO_RE.match(rel):
        return True
    return "/supabase/migrations/" in "/" + rel


def _normal(padrao):
    p = padrao.strip().replace("\\", "/")
    while p.startswith("./"):
        p = p[2:]
    return p + "**" if p.endswith("/") else p


def instancias(padrao):
    """Caminhos que o padrao cobre: o padrao com x nos curingas e o criterio.md e
    casos.md logo abaixo da pasta fixa dele. Pegam o que os EXEMPLOS_HUMANOS fixos
    nao pegam: outra TASK-N, outro script da guarda."""
    p = _normal(padrao)
    saida = [re.sub(r"\*\*|\*|\?", "x", p)]
    curinga = re.search(r"[*?]", p)
    if curinga:
        pasta = p[:p.rfind("/", 0, curinga.start()) + 1]
        saida += [pasta + meio + nome for meio in ("", "x/") for nome in ("criterio.md", "casos.md")]
    rx = padrao_regex(p)
    return [c for c in saida if rx.match(c)]


def padrao_regex(padrao):
    p = _normal(padrao)
    saida, i = [], 0
    while i < len(p):
        if p.startswith("**/", i):
            saida.append("(?:.*/)?")
            i += 3
        elif p.startswith("**", i):
            saida.append(".*")
            i += 2
        elif p[i] == "*":
            saida.append("[^/]*")
            i += 1
        elif p[i] == "?":
            saida.append("[^/]")
            i += 1
        else:
            saida.append(re.escape(p[i]))
            i += 1
    return re.compile("^" + "".join(saida) + "$")


def validar_allowlist(padroes):
    """Devolve a lista de problemas da allowlist (vazia = ok)."""
    problemas = []
    if not padroes:
        problemas.append("allowlist vazia")
    for padrao in padroes:
        texto = padrao.strip()
        if not texto or texto.startswith("/") or ".." in texto.replace("\\", "/").split("/"):
            problemas.append(f"padrao invalido: {padrao!r} (relativo a raiz, sem ..)")
            continue
        rx = padrao_regex(texto)
        cobre = ([ex for ex in EXEMPLOS_HUMANOS if rx.match(ex)]
                 or [c for c in instancias(texto) if humano(c)])
        if cobre:
            problemas.append(f"padrao {padrao!r} cobre caminho sempre humano ({cobre[0]})")
    return problemas


def _hash(caminho):
    if caminho.is_symlink():
        return "LINK:" + os.readlink(caminho)
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def estado(raiz, pular=None):
    raiz = Path(raiz)
    pular = {Path(p).resolve() for p in (pular or [])}
    saida = {}
    for pasta, subpastas, arquivos in os.walk(raiz, followlinks=False):
        atual = Path(pasta)
        rel_pasta = atual.relative_to(raiz).as_posix()
        mantidas = []
        for nome in subpastas:
            caminho = atual / nome
            rel = (Path(rel_pasta) / nome).as_posix() if rel_pasta != "." else nome
            if caminho.is_symlink():
                saida[rel] = _hash(caminho)
            elif nome in IGNORAR_PASTAS and not rel.startswith(GUARDA_DO_TIME):
                continue  # na guarda do time, ate o __pycache__ entra (pyc plantado)
            elif rel == ".git":
                for dentro in GIT_DENTRO:
                    if (raiz / dentro).is_file():
                        saida[dentro] = _hash(raiz / dentro)
                if (raiz / ".git/hooks").is_dir():
                    for p in sorted((raiz / ".git/hooks").rglob("*")):
                        if p.is_file() or p.is_symlink():
                            saida[p.relative_to(raiz).as_posix()] = _hash(p)
            else:
                mantidas.append(nome)
        subpastas[:] = mantidas
        for nome in arquivos:
            caminho = atual / nome
            if caminho.resolve() in pular:
                continue
            rel = (Path(rel_pasta) / nome).as_posix() if rel_pasta != "." else nome
            saida[rel] = _hash(caminho)
    return saida


def mudancas(antes, depois):
    return sorted(c for c in set(antes) | set(depois) if antes.get(c) != depois.get(c))


def conferir(antes, depois, padroes):
    """Devolve (alterados, fora_da_allowlist, sempre_humanos, problemas_da_allowlist)."""
    alterados = mudancas(antes, depois)
    regexes = [padrao_regex(p) for p in padroes if p.strip()]
    fora = [c for c in alterados if not any(rx.match(c) for rx in regexes)]
    humanos = [c for c in alterados if humano(c)]
    return alterados, fora, humanos, validar_allowlist(padroes)


def reinstalacao_aprovada(raiz, tarefa, antes, depois):
    """Caminhos mudados que a ultima reinstalar-time aprovada da tarefa explica (vazio se
    nenhuma). Vale so se TODOS os arquivos do time agora tem exatamente os sha256 gravados na
    linha; o registro entra junto so se mudou apenas por linhas reinstalar-time no fim."""
    gravados = w15.hashes_reinstalacao(raiz, tarefa)
    if not gravados:
        return set()
    if {c: h for c, h in depois.items() if w15.arquivo_do_time(c)} != gravados:
        return set()
    aceitos = {c for c in mudancas(antes, depois) if w15.arquivo_do_time(c)}
    registro = w15.ARQUIVO_RELATIVO.as_posix()
    if (antes.get(registro) != depois.get(registro)
            and w15.hash_sem_reinstalacoes_no_fim(raiz, tarefa) == antes.get(registro)):
        aceitos.add(registro)
    return aceitos


def _sha256_arquivo(caminho):
    return hashlib.sha256(Path(caminho).read_bytes()).hexdigest()


def _rel_na_raiz(raiz, caminho):
    try:
        return Path(caminho).resolve().relative_to(Path(raiz).resolve()).as_posix()
    except ValueError:
        return None


def allowlist_da_ficha(raiz, ficha, tarefa):
    """(padroes, recusas). A allowlist vem do campo caminhos_permitidos da ficha, e a ficha
    tem que ser a aprovada no gate 1 (sha256 gravado no W15 pelo gate desenho-aprovado)."""
    recusas = []
    try:
        dados = json.loads(Path(ficha).read_text(encoding="utf-8"))
    except (OSError, ValueError) as erro:
        return [], [f"ficha {ficha} ilegivel ({erro})"]
    aprovado = w15.hash_ficha_aprovada(raiz, tarefa)
    atual = _sha256_arquivo(ficha)
    if aprovado is None:
        recusas.append(f"ficha: nenhuma linha desenho-aprovado da tarefa {tarefa} com o sha256 "
                       "da ficha no W15 (o dono nao aprovou este desenho no gate 1)")
    elif aprovado != atual:
        recusas.append("ficha: sha256 diferente do aprovado no gate 1 (desenho-aprovado no W15); "
                       "a ficha mudou depois da aprovacao")
    padroes = dados.get("caminhos_permitidos") if isinstance(dados, dict) else None
    if not isinstance(padroes, list) or not all(isinstance(p, str) for p in padroes):
        recusas.append("ficha: caminhos_permitidos ausente ou nao e lista de textos")
        padroes = []
    return padroes, recusas


def main(argv=None):
    ap = argparse.ArgumentParser(description="Trava de caminho do lote do construtor (C3).")
    sub = ap.add_subparsers(dest="modo", required=True)
    s = sub.add_parser("snapshot")
    s.add_argument("snap")
    s.add_argument("--raiz", default=".")
    c = sub.add_parser("check")
    c.add_argument("snap")
    c.add_argument("--sha256", required=True, help="sha256 do retrato, impresso pelo snapshot")
    c.add_argument("--ficha", required=True, help="ficha.json aprovada; a allowlist sai do "
                                                  "campo caminhos_permitidos dela")
    c.add_argument("--tarefa", required=True, help="pasta da tarefa (operacao/tasks/TASK-N)")
    c.add_argument("--raiz", default=".")
    c.add_argument("--w15", action="store_true", help="grava o gate trava-lote no W15")
    c.add_argument("--unidade", default="native-ai-construtor")
    c.add_argument("--tokens", help="tokens reais do construtor neste lote: nome=numero")
    c.add_argument("--data", help="AAAA-MM-DD para o W15 (padrao: hoje)")
    a = ap.parse_args(argv)

    raiz = Path(a.raiz)
    if not raiz.is_dir():
        print(f"trava_lote: raiz {raiz} nao e uma pasta", file=sys.stderr)
        return 2
    snap = Path(a.snap)
    if a.modo == "snapshot":
        motivo = recusa_na_principal(raiz)
        if motivo:
            print(f"trava_lote: {motivo}", file=sys.stderr)
            return 2
        retrato = estado(raiz, pular=[snap])
        snap.write_text(json.dumps(retrato, sort_keys=True), encoding="utf-8")
        print(f"retrato: {len(retrato)} arquivos em {snap}")
        print(f"sha256: {_sha256_arquivo(snap)}")
        return 0

    try:
        bruto = snap.read_bytes()
        antes = json.loads(bruto.decode("utf-8"))
    except (OSError, ValueError) as erro:
        print(f"trava_lote: retrato {snap} ilegivel ({erro})", file=sys.stderr)
        return 2
    recusas = []
    if hashlib.sha256(bruto).hexdigest() != a.sha256.strip().lower():
        recusas.append(f"retrato: {snap} com sha256 diferente do impresso no snapshot "
                       "(retrato reescrito depois de tirado)")
    padroes, recusas_ficha = allowlist_da_ficha(raiz, a.ficha, a.tarefa)
    recusas += recusas_ficha
    depois = estado(raiz, pular=[snap])
    alterados, fora, humanos, problemas = conferir(antes, depois, padroes)
    reinstalados = reinstalacao_aprovada(raiz, a.tarefa, antes, depois)
    humanos = [c for c in humanos if c not in reinstalados]
    fora = [c for c in fora if c not in reinstalados]
    rel_ficha = _rel_na_raiz(raiz, a.ficha)
    if rel_ficha in alterados:
        recusas.append(f"ficha: {rel_ficha} mudou durante o lote")
    recusas += ([f"allowlist: {p}" for p in problemas]
                + [f"sempre humano: {c}" for c in humanos]
                + [f"fora da allowlist: {c}" for c in fora if c not in humanos])
    if recusas:
        print("LOTE RECUSADO:", *recusas, sep="\n  ")
        detalhe = "LOTE RECUSADO: " + "; ".join(recusas[:5])
        if len(recusas) > 5:
            detalhe += f" (+{len(recusas) - 5})"
    else:
        print(f"OK: {len(alterados)} arquivo(s) mudaram, todos dentro da allowlist")
        for caminho in alterados:
            print(f"  {caminho}")
        detalhe = f"lote ok: {len(alterados)} arquivo(s) dentro da allowlist"
        if reinstalados:
            nota = (f"{len(reinstalados)} da reinstalacao do time (hashes iguais aos da ultima "
                    "reinstalar-time aprovada)")
            print(f"  {nota}")
            detalhe += f"; {nota}"
    if a.w15:
        try:
            tokens = w15.parse_tokens(a.tokens) if a.tokens else None
            w15.registrar(raiz, "trava-lote", "erro" if recusas else "acerto", a.unidade,
                          detalhe, data=a.data, tokens=tokens, tarefa=a.tarefa)
        except ValueError as erro:
            print(f"trava_lote: W15 nao gravado ({erro})", file=sys.stderr)
            return 2
    return 1 if recusas else 0

if __name__ == "__main__":
    sys.exit(main())
