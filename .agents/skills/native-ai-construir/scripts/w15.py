#!/usr/bin/env python3
"""w15.py: grava 1 linha por gate em operacao/vereditos/erros-e-acertos.md da casa.

Uso:
  python3 w15.py --raiz <repo> --gate <nome> --resultado acerto|erro \
      --unidade <nome> --detalhe "<texto>" [--data AAAA-MM-DD] \
      [--tarefa operacao/tasks/TASK-N] \
      [--tokens "native-ai-construtor=120000,native-ai-avaliador:casos=50000"] \
      [--construido-no-thread --modelo-thread <modelo>] [--aprovado-por <nome>]

  python3 w15.py congelar --raiz <repo> --tarefa operacao/tasks/TASK-N --unidade <nome> \
      --assinado-por <dono> [--tokens "..."] [--data AAAA-MM-DD] [--reiniciar]
      calcula o sha256 de criterio.md e casos.md da tarefa e grava o gate
      criterio-assinado com os 2 hashes e quem assinou (condicao C6; humano, nunca um
      agente do time). O provar.py --tarefa confere depois.
      Depois que a construcao comecou (gate plano-aprovado ou trava-lote da tarefa), so
      congela de novo com --reiniciar: a linha marca o reinicio e os gates anteriores da
      tarefa deixam de valer (plano, trava e veredito precisam ser refeitos).

Gates com regra propria (ValueError se faltar):
  criterio-assinado  so pelo congelar, nunca pela linha de comando comum.
  desenho-aprovado   com resultado acerto: exige --tarefa e grava o sha256 da ficha.json
                     da tarefa (o trava_lote.py le a allowlist dessa ficha e confere o hash).
                     Com --aprovado-por humano, o teto_construcao e o teto_avaliador da
                     ficha passam a valer (C11).
  instalacao         exige --aprovado-por (humano, nunca um agente do time); com resultado
                     acerto, exige tambem o criterio congelado intacto, uma trava-lote acerto
                     depois do congelamento e um veredito acerto do native-ai-avaliador
                     depois da ultima trava-lote (C8/C10).
  reinstalar-time    o CAIO reinstalou o time no meio da tarefa: exige --tarefa e
                     --aprovado-por humano; com acerto, grava o sha256 de cada arquivo da
                     pasta da skill (SKILL.md, referencias/, scripts/; sem __pycache__ e
                     sem os mapas banco.md e repo.md) e dos agentes gerados native-ai-*. A
                     trava so aceita mudanca nesses arquivos com os hashes iguais aos da
                     ultima dessas.

Formato da linha: | data | gate | acerto ou erro | unidade | detalhe |
O detalhe comeca com "tarefa: <pasta>" quando a linha e de uma tarefa.

Importavel: registrar(...), congelar_criterio(...), conferir_criterio(...),
hash_ficha_aprovada(...), teto_construcao(...), teto_avaliador(...), teto_tarefa(...),
hashes_do_time(...), hashes_reinstalacao(...), hash_sem_reinstalacoes_no_fim(...).

Custo medido (condicao C11): tokens reais por subagente, sempre com --tarefa. O script
soma os tokens ja gravados na mesma tarefa com os desta linha e compara com os tetos.
Os tetos da ficha.json valem so quando a ultima linha desenho-aprovado vigente da tarefa
e acerto, tem "aprovado por" humano (nunca native-ai-*) e o sha256 da ficha bate; senao,
os padroes. Construtor: teto_construcao, padrao 250k, maximo 600k. Avaliador:
teto_avaliador {criterio, casos, parecer}, padrao 80k, 100k e 40k, maximos 150k, 200k e
300k. Acima do maximo o check_ficha reprova e o w15 ignora (volta ao padrao).
Parecer (v1.3): o teto vale POR RODADA de veredito, chave native-ai-avaliador:parecer#n
(sem # = rodada 1); no maximo 2 rodadas; rodada n>1 so vale com prova (gate provar:*
acerto) gravada depois do veredito da rodada n-1. Tarefa inteira: max(700k, construtor
+ criterio + casos + parecer x rodadas usadas), no maximo 1,55M. Passou do teto ou
rodada invalida: a linha vira "erro" e o detalhe diz qual regra.

Python so stdlib, sem rede.
"""
import argparse
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path

ARQUIVO_RELATIVO = Path("operacao") / "vereditos" / "erros-e-acertos.md"
COLUNAS = "| data | gate | acerto ou erro | unidade | detalhe |"
CABECALHO = (
    "# Erros e acertos (W15)\n"
    "\n"
    "Uma linha por gate, gravada pelo `w15.py`. Nao edite a mao: o historico e a prova.\n"
    "\n"
    f"{COLUNAS}\n"
    "|---|---|---|---|---|\n"
)
RESULTADOS = ("acerto", "erro")

# Tetos v1 da seccao 4 do desenho (topo da faixa), em tokens reais, POR TAREFA.
# v1.1: o do construtor e o padrao; a ficha aprovada por humano pode subir ate o maximo.
# v1.2: o mesmo para as 3 fases do avaliador (teto_avaliador da ficha). Na Casa v4 o
# parecer de uma fundacao de 35 arquivos gastou 185k contra o teto fixo de 40k. Maximos:
# o parecer vai a 300k porque o auditor do piloto modelar-cargo mediu 275k num pacote;
# criterio e casos sobem menos (150k e 200k), porque nao leem o artefato construido.
CONSTRUTOR = "native-ai-construtor"
AVALIADOR = "native-ai-avaliador"
TETO_CONSTRUCAO_PADRAO = 250_000
TETO_CONSTRUCAO_MAXIMO = 600_000
TETO_AVALIADOR_PADRAO = {"criterio": 80_000, "casos": 100_000, "parecer": 40_000}
TETO_AVALIADOR_MAXIMO = {"criterio": 150_000, "casos": 200_000, "parecer": 300_000}
TETOS_TOKENS = {
    CONSTRUTOR: TETO_CONSTRUCAO_PADRAO,
    **{f"{AVALIADOR}:{fase}": teto for fase, teto in TETO_AVALIADOR_PADRAO.items()},
    AVALIADOR: sum(TETO_AVALIADOR_PADRAO.values()),
}
TETO_TAREFA_TOKENS = 700_000  # piso da tarefa inteira
# v1.3: o teto do parecer vale por rodada de veredito (Casa v4: 185k + 133k = 319k contra
# 250k aprovado). Maximo 2 rodadas: 1 + 1 volta de correcao (A41, teto do kit: sem laco).
CHAVE_PARECER = f"{AVALIADOR}:parecer"
MAX_RODADAS_VEREDITO = 2
# maximo absoluto da tarefa: construtor, criterio e casos no maximo, mais o parecer no
# maximo em cada rodada (600k + 150k + 200k + 300k x 2 = 1,55M)
TETO_TAREFA_MAXIMO = (TETO_CONSTRUCAO_MAXIMO + TETO_AVALIADOR_MAXIMO["criterio"]
                      + TETO_AVALIADOR_MAXIMO["casos"]
                      + TETO_AVALIADOR_MAXIMO["parecer"] * MAX_RODADAS_VEREDITO)

GATE_CRITERIO = "criterio-assinado"
ARQUIVOS_CRITERIO = ("criterio.md", "casos.md")
GATE_DESENHO = "desenho-aprovado"
GATE_INSTALACAO = "instalacao"
GATE_VEREDITO = "veredito"
GATE_TRAVA = "trava-lote"
GATE_REINSTALAR = "reinstalar-time"
PREFIXO_PROVA = "provar:"
MARCA_TETO = "TETO DE TOKENS EXCEDIDO"
MARCA_RODADA = "RODADA DE VEREDITO INVALIDA"
# o que a reinstalacao do time troca: a pasta da skill (a reinstalacao real da v1.2
# mudou o SKILL.md) e os agentes gerados pelo gerar_saidas.py. Ficam fora o __pycache__
# e os mapas que o gerar_mapa.py gera na casa (passo 4).
PASTA_DO_TIME = ".agents/skills/native-ai-construir/"
GUARDA_DO_TIME = PASTA_DO_TIME + "scripts/"
GERADOS_NA_CASA = ("referencias/banco.md", "referencias/repo.md")
_AGENTE_DO_TIME_RE = re.compile(r"^(\.claude/agents/native-ai-[^/]*\.md|\.codex/agents/native-ai-[^/]*\.toml)$")
# depois de qualquer um destes, o criterio nao se congela de novo sem reinicio (C6)
GATES_CONSTRUCAO = ("plano-aprovado", GATE_TRAVA)
MARCA_REINICIO = "reinicio da tarefa: gates anteriores nao valem"
PREFIXO_AGENTES = "native-ai-"
ARQUIVO_FICHA = "ficha.json"

_TAREFA_RE = re.compile(r"(?:^|; )tarefa: ([^;]+)")
_TOKENS_RE = re.compile(r"(?:^|; )tokens: ([^;]+)")
_HASH_RE = re.compile(r"sha256 ([\w./-]+)=([0-9a-f]{64})")
_RODADA_RE = re.compile(r"^(.*)#(\d+)$")
MARCA_APROVADOR = "aprovado por: "


def parse_tokens(texto):
    """'a=1,b:c=2' -> {'a': 1, 'b:c': 2}. Levanta ValueError se mal formado."""
    saida = {}
    for parte in texto.split(","):
        parte = parte.strip()
        if not parte:
            continue
        chave, sep, valor = parte.rpartition("=")
        chave = chave.strip()
        if not sep or not chave:
            raise ValueError(f"tokens mal formado: {parte!r} (use nome=numero)")
        try:
            numero = int(valor.strip())
        except ValueError:
            raise ValueError(f"tokens mal formado: {parte!r} (numero invalido)") from None
        if numero < 0:
            raise ValueError(f"tokens mal formado: {parte!r} (negativo)")
        if "#" in chave and rodada_da_chave(chave)[1] is None:
            raise ValueError(f"tokens mal formado: {parte!r} (rodada so no parecer: "
                             f"{CHAVE_PARECER}#n, n a partir de 1)")
        saida[chave] = saida.get(chave, 0) + numero
    if not saida:
        raise ValueError("tokens vazio")
    return saida


def rodada_da_chave(chave):
    """(chave base, rodada) de uma chave de tokens. Parecer sem # e a rodada 1 (chave da
    v1.2); parecer#n e a rodada n (n >= 1). Qualquer outra chave: (chave, None)."""
    if chave == CHAVE_PARECER:
        return CHAVE_PARECER, 1
    m = _RODADA_RE.match(chave)
    if m and m.group(1) == CHAVE_PARECER and int(m.group(2)) >= 1:
        return CHAVE_PARECER, int(m.group(2))
    return chave, None


def por_rodada(tokens):
    """Tokens com o parecer separado por rodada: parecer e parecer#1 viram parecer#1."""
    saida = {}
    for chave, valor in tokens.items():
        base, rodada = rodada_da_chave(chave)
        if rodada is not None:
            chave = f"{base}#{rodada}"
        saida[chave] = saida.get(chave, 0) + valor
    return saida


def rodadas_de(tokens):
    """Numeros das rodadas de veredito presentes nas chaves de tokens."""
    return {r for r in (rodada_da_chave(c)[1] for c in tokens) if r is not None}


def _limpo(texto):
    """Uma celula da tabela: sem quebra de linha e sem pipe."""
    return " ".join(str(texto).replace("|", "/").split())


def _arquivo(raiz):
    return Path(raiz) / ARQUIVO_RELATIVO


def linhas_gravadas(raiz):
    """Lista de dicts {data, gate, resultado, unidade, detalhe} das linhas ja gravadas."""
    caminho = _arquivo(raiz)
    if not caminho.is_file():
        return []
    linhas = (_celulas(l) for l in caminho.read_text(encoding="utf-8").splitlines())
    return [l for l in linhas if l]


def _celulas(linha):
    """Uma linha da tabela como dict, ou None se nao for linha de gate."""
    if not re.match(r"^\| \d{4}-\d{2}-\d{2} \|", linha):
        return None
    celulas = [c.strip() for c in linha.strip().strip("|").split("|")]
    if len(celulas) != 5:
        return None
    return dict(zip(("data", "gate", "resultado", "unidade", "detalhe"), celulas))


def tarefa_da_linha(detalhe):
    m = _TAREFA_RE.search(detalhe)
    return m.group(1).strip() if m else None


def tokens_da_linha(detalhe):
    m = _TOKENS_RE.search(detalhe)
    if not m:
        return {}
    try:
        return parse_tokens(m.group(1))
    except ValueError:
        return {}


def tokens_acumulados(raiz, tarefa):
    """Soma dos tokens ja gravados no W15 para a tarefa."""
    soma = {}
    for linha in linhas_gravadas(raiz):
        if tarefa_da_linha(linha["detalhe"]) != tarefa:
            continue
        for chave, valor in tokens_da_linha(linha["detalhe"]).items():
            soma[chave] = soma.get(chave, 0) + valor
    return soma


def estouros_de_teto(tokens, so_chaves=None, raiz=None, tarefa=None):
    """Compara tokens (ja somados) com os tetos. so_chaves limita as chaves conferidas.
    Com raiz e tarefa, os tetos do construtor, do avaliador e da tarefa saem da ficha
    aprovada (C11). O parecer e conferido por rodada (parecer#n, v1.3)."""
    tetos = dict(TETOS_TOKENS)
    construtor, avaliador = TETO_CONSTRUCAO_PADRAO, dict(TETO_AVALIADOR_PADRAO)
    if raiz is not None and tarefa:
        tetos[CONSTRUTOR] = construtor = teto_construcao(raiz, tarefa)
        avaliador = teto_avaliador(raiz, tarefa)
        tetos.update({f"{AVALIADOR}:{fase}": teto for fase, teto in avaliador.items()})
        tetos[AVALIADOR] = sum(avaliador.values())
    tokens = por_rodada(tokens)
    if so_chaves is not None:
        so_chaves = set(por_rodada(dict.fromkeys(so_chaves, 0)))
    rodadas = rodadas_de(tokens)
    achados = []
    for chave, valor in tokens.items():
        if so_chaves is not None and chave not in so_chaves:
            continue
        rodada = rodada_da_chave(chave)[1]
        if rodada is not None and rodada > MAX_RODADAS_VEREDITO:
            achados.append(f"{chave}: rodada {rodada} de veredito, maximo {MAX_RODADAS_VEREDITO} por tarefa")
        teto = avaliador["parecer"] if rodada is not None else tetos.get(chave)
        if teto is not None and valor > teto:
            achados.append(f"{chave}={valor} > {teto}")
    total = sum(tokens.values())
    teto_total = _teto_tarefa(construtor, avaliador, len(rodadas))
    if total > teto_total:
        achados.append(f"total={total} > {teto_total}")
    return achados


def problemas_de_rodada(raiz, tarefa, tokens):
    """Rodadas de veredito desta linha que nao valem (v1.3): rodada n>1 so vale com prova
    (gate provar:* acerto) gravada no W15 depois da ultima linha com tokens da rodada n-1.
    Nao se re-sorteia veredito sem mudanca."""
    linhas = _linhas_da_tarefa(raiz, tarefa)
    problemas = []
    for n in sorted(rodadas_de(tokens)):
        if n == 1 or n > MAX_RODADAS_VEREDITO:
            continue  # acima do maximo ja sai em estouros_de_teto
        anteriores = [i for i, l in enumerate(linhas)
                      if n - 1 in rodadas_de(tokens_da_linha(l["detalhe"]))]
        if not anteriores:
            problemas.append(f"rodada {n} sem veredito da rodada {n - 1} gravado")
        elif not any(l["gate"].startswith(PREFIXO_PROVA) and l["resultado"] == "acerto"
                     for l in linhas[anteriores[-1] + 1:]):
            problemas.append(f"rodada {n} sem prova ({PREFIXO_PROVA}* acerto) depois do "
                             f"veredito da rodada {n - 1}")
    return problemas


def _tarefa_valida(tarefa):
    if tarefa is None:
        return None
    limpa = _limpo(tarefa).replace("\\", "/").rstrip("/")
    if not limpa or ";" in limpa:
        raise ValueError(f"tarefa invalida: {tarefa!r} (use operacao/tasks/TASK-N)")
    return limpa


def registrar(raiz, gate, resultado, unidade, detalhe="", data=None, tokens=None,
              tarefa=None, construido_no_thread=False, modelo_thread=None,
              aprovado_por=None, _via_congelar=False):
    """Acrescenta 1 linha ao W15 da casa e devolve a linha gravada."""
    if resultado not in RESULTADOS:
        raise ValueError(f"resultado deve ser 'acerto' ou 'erro', veio {resultado!r}")
    if not _limpo(gate):
        raise ValueError("gate vazio")
    if not _limpo(unidade):
        raise ValueError("unidade vazia")
    tarefa = _tarefa_valida(tarefa)
    if tokens and not tarefa:
        raise ValueError("tokens precisam de tarefa: o teto e por tarefa e soma os gates (C11)")
    if construido_no_thread and not (modelo_thread and _limpo(modelo_thread)):
        raise ValueError("construido no thread precisa do modelo do thread (C8: diferente do avaliador)")
    if data is None:
        data = datetime.date.today().isoformat()
    else:
        try:
            datetime.date.fromisoformat(data)
        except (TypeError, ValueError):
            raise ValueError(f"data invalida: {data!r} (use AAAA-MM-DD)") from None
    gate_limpo = _limpo(gate)
    if gate_limpo == GATE_CRITERIO and not _via_congelar:
        raise ValueError(f"o gate {GATE_CRITERIO} so se grava pelo 'w15.py congelar' (C6)")
    extras = []
    if gate_limpo == GATE_DESENHO and resultado == "acerto":
        extras.append(f"sha256 {ARQUIVO_FICHA}={_hash_ficha(raiz, tarefa)}")
    if gate_limpo == GATE_INSTALACAO:
        _exigir_instalacao(raiz, tarefa, resultado, aprovado_por)
    if gate_limpo == GATE_REINSTALAR:
        _humano(aprovado_por, f"o gate {GATE_REINSTALAR}", "--aprovado-por (o CAIO que reinstalou)")
        if not tarefa:
            raise ValueError(f"o gate {GATE_REINSTALAR} precisa de --tarefa")
        if "sha256" in (detalhe or ""):
            raise ValueError(f"o gate {GATE_REINSTALAR} calcula os sha256 sozinho; tire do --detalhe")
        if resultado == "acerto":
            extras += [f"sha256 {rel}={h}" for rel, h in hashes_do_time(raiz).items()]

    partes = [f"tarefa: {tarefa}"] if tarefa else []
    if _limpo(detalhe):
        partes.append(_limpo(detalhe))
    partes += extras
    if tokens:
        acumulado = tokens_acumulados(raiz, tarefa)
        for chave, valor in tokens.items():
            acumulado[chave] = acumulado.get(chave, 0) + valor
        estouros = estouros_de_teto(acumulado, so_chaves=set(tokens), raiz=raiz, tarefa=tarefa)
        if estouros:
            resultado = "erro"
            partes.insert(1, f"{MARCA_TETO} na tarefa (" + " / ".join(estouros) + ")")
        rodadas_invalidas = problemas_de_rodada(raiz, tarefa, tokens)
        if rodadas_invalidas:
            resultado = "erro"
            partes.insert(1, f"{MARCA_RODADA} (" + " / ".join(rodadas_invalidas) + ")")
        partes.append("tokens: " + ", ".join(f"{k}={v}" for k, v in tokens.items()))
    if construido_no_thread:
        partes.append(f"construido no thread (modelo: {_limpo(modelo_thread)})")
    if aprovado_por and _limpo(aprovado_por):
        partes.append(f"aprovado por: {_limpo(aprovado_por)}")

    linha = f"| {data} | {gate_limpo} | {resultado} | {_limpo(unidade)} | {'; '.join(partes)} |"

    caminho = _arquivo(raiz)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    existente = caminho.read_text(encoding="utf-8") if caminho.exists() else ""
    if not existente.strip():
        existente = CABECALHO
    elif not existente.endswith("\n"):
        existente += "\n"
    caminho.write_text(existente + linha + "\n", encoding="utf-8")
    return linha


# ------------------------------------------------------------ criterio congelado (C6)
def hashes_criterio(raiz, tarefa):
    """{'criterio.md': sha256, 'casos.md': sha256}. ValueError se faltar arquivo."""
    pasta = Path(raiz) / _tarefa_valida(tarefa)
    saida = {}
    for nome in ARQUIVOS_CRITERIO:
        arq = pasta / nome
        if not arq.is_file():
            raise ValueError(f"{arq} nao existe (o passo 1 grava criterio.md e casos.md)")
        saida[nome] = hashlib.sha256(arq.read_bytes()).hexdigest()
    return saida


def _linhas_da_tarefa(raiz, tarefa):
    tarefa = _tarefa_valida(tarefa)
    return [l for l in linhas_gravadas(raiz) if tarefa_da_linha(l["detalhe"]) == tarefa]


def _e_criterio(linha):
    return linha["gate"] == GATE_CRITERIO and bool(_HASH_RE.search(linha["detalhe"]))


def linhas_vigentes(raiz, tarefa):
    """Linhas da tarefa a partir do ultimo reinicio (congelar --reiniciar). Gates de antes
    do reinicio nao valem: plano, trava e veredito precisam ser refeitos."""
    linhas = _linhas_da_tarefa(raiz, tarefa)
    inicio = 0
    for i, linha in enumerate(linhas):
        if _e_criterio(linha) and MARCA_REINICIO in linha["detalhe"]:
            inicio = i
    return linhas[inicio:]


def _construcao_comecou(linhas):
    return any(l["gate"] in GATES_CONSTRUCAO for l in linhas)


def congelar_criterio(raiz, tarefa, unidade, data=None, tokens=None, reiniciar=False,
                      assinado_por=None):
    quem = _humano(assinado_por, "congelar", "--assinado-por (o dono que assinou o critério; C6)")
    if not reiniciar and _construcao_comecou(linhas_vigentes(raiz, tarefa)):
        raise ValueError(
            "a construcao ja comecou nesta tarefa (plano-aprovado ou trava-lote no W15); o "
            "criterio assinado nao se troca no meio (C6). Para refazer o criterio, use "
            "'congelar --reiniciar': plano, trava e veredito voltam a ser exigidos")
    hashes = hashes_criterio(raiz, tarefa)
    detalhe = "; ".join(f"sha256 {nome}={h}" for nome, h in hashes.items())
    detalhe += f"; assinado por: {quem}"
    if reiniciar:
        detalhe += "; " + MARCA_REINICIO
    return registrar(raiz, GATE_CRITERIO, "acerto", unidade, detalhe, data=data,
                     tokens=tokens, tarefa=tarefa, _via_congelar=True)


def hash_assinado(raiz, tarefa):
    """Hashes da ultima linha criterio-assinado vigente da tarefa no W15, ou None."""
    achado = None
    for linha in linhas_vigentes(raiz, tarefa):
        if _e_criterio(linha):
            achado = dict(_HASH_RE.findall(linha["detalhe"]))
    return achado


def conferir_criterio(raiz, tarefa):
    """(True, motivo) se criterio.md e casos.md batem com o hash assinado; senao (False, motivo).

    Reprova tambem quando o criterio foi congelado de novo depois que a construcao
    comecou (linha criterio-assinado depois de plano-aprovado ou trava-lote, sem reinicio):
    critério trocado no meio vira o novo assinado, e isso e o que o C6 proibe."""
    linhas = linhas_vigentes(raiz, tarefa)
    idx_crit = [i for i, l in enumerate(linhas) if _e_criterio(l)]
    if not idx_crit:
        return False, f"sem linha {GATE_CRITERIO} da tarefa {tarefa} no W15 (critério nunca foi congelado)"
    ultimo = idx_crit[-1]
    primeira_construcao = next((i for i, l in enumerate(linhas) if l["gate"] in GATES_CONSTRUCAO), None)
    if primeira_construcao is not None and ultimo > primeira_construcao:
        return False, ("critério congelado de novo depois que a construção começou "
                       f"({linhas[primeira_construcao]['gate']} antes da última linha "
                       f"{GATE_CRITERIO}); volta pro passo 1 com 'congelar --reiniciar'")
    assinado = dict(_HASH_RE.findall(linhas[ultimo]["detalhe"]))
    try:
        atual = hashes_criterio(raiz, tarefa)
    except ValueError as erro:
        return False, str(erro)
    divergentes = [n for n in ARQUIVOS_CRITERIO if assinado.get(n) != atual[n]]
    if divergentes:
        return False, ("critério mudou depois da assinatura: " + ", ".join(divergentes)
                       + " com sha256 diferente do gravado no W15; volta pro passo 1")
    return True, "critério e casos iguais aos assinados"


# ------------------------------------------------------------ ficha aprovada (C3)
def _hash_ficha(raiz, tarefa):
    if not tarefa:
        raise ValueError(f"o gate {GATE_DESENHO} precisa de --tarefa: grava o sha256 da ficha "
                         "aprovada, de onde o trava_lote.py tira a allowlist (C3)")
    arq = Path(raiz) / _tarefa_valida(tarefa) / ARQUIVO_FICHA
    if not arq.is_file():
        raise ValueError(f"{arq} nao existe: o gate {GATE_DESENHO} aprova a ficha da tarefa")
    return hashlib.sha256(arq.read_bytes()).hexdigest()


def hash_ficha_aprovada(raiz, tarefa):
    """sha256 da ficha.json gravado na ultima linha desenho-aprovado vigente, ou None."""
    achado = None
    for linha in linhas_vigentes(raiz, tarefa):
        if linha["gate"] == GATE_DESENHO and linha["resultado"] == "acerto":
            hashes = dict(_HASH_RE.findall(linha["detalhe"]))
            if ARQUIVO_FICHA in hashes:
                achado = hashes[ARQUIVO_FICHA]
    return achado


# ------------------------------------------------------------ teto da ficha (C11)
def _aprovador_humano(detalhe):
    """Quem aprovou, se a linha traz 'aprovado por' humano. So vale o ultimo trecho do
    detalhe, que e onde o registrar grava o --aprovado-por: o mesmo texto escrito no
    --detalhe fica antes do sha256 da ficha e nao conta."""
    ultimo = detalhe.split("; ")[-1]
    if not ultimo.startswith(MARCA_APROVADOR):
        return None
    quem = ultimo[len(MARCA_APROVADOR):].strip()
    if not quem or quem.lower().startswith(PREFIXO_AGENTES):
        return None
    return quem


def _ficha_aprovada(raiz, tarefa):
    """A ficha.json da tarefa, se aprovada por humano no gate 1 (ultima linha
    desenho-aprovado vigente, sha256 igual ao da ficha atual); senao None. Fonte unica
    dos tetos que a ficha pode subir (construtor e avaliador)."""
    try:
        tarefa = _tarefa_valida(tarefa)
    except ValueError:
        return None
    if not tarefa:
        return None
    aprovacoes = [l for l in linhas_vigentes(raiz, tarefa)
                  if l["gate"] == GATE_DESENHO and l["resultado"] == "acerto"]
    if not aprovacoes:
        return None
    ultima = aprovacoes[-1]
    if _aprovador_humano(ultima["detalhe"]) is None:
        return None
    arq = Path(raiz) / tarefa / ARQUIVO_FICHA
    try:
        bruto = arq.read_bytes()
        ficha = json.loads(bruto.decode("utf-8"))
    except (OSError, ValueError):
        return None
    if dict(_HASH_RE.findall(ultima["detalhe"])).get(ARQUIVO_FICHA) != hashlib.sha256(bruto).hexdigest():
        return None
    return ficha if isinstance(ficha, dict) else None


def _teto_pedido(valor, padrao, maximo):
    """O teto pedido na ficha, se inteiro maior que 0 e ate o maximo; senao o padrao."""
    if not isinstance(valor, int) or isinstance(valor, bool) or valor <= 0:
        return padrao
    if valor > maximo:
        return padrao
    return valor


def teto_construcao(raiz, tarefa):
    """Teto do construtor na tarefa: o teto_construcao da ficha aprovada por humano, ate o
    maximo; qualquer outra coisa cai no padrao."""
    ficha = _ficha_aprovada(raiz, tarefa) or {}
    return _teto_pedido(ficha.get("teto_construcao"), TETO_CONSTRUCAO_PADRAO,
                        TETO_CONSTRUCAO_MAXIMO)


def teto_avaliador(raiz, tarefa):
    """Tetos do avaliador por fase ({criterio, casos, parecer}): o teto_avaliador da ficha
    aprovada por humano, fase a fase, ate o maximo de cada uma; fase ausente, invalida ou
    acima do maximo cai no padrao (C11 v1.2)."""
    ficha = _ficha_aprovada(raiz, tarefa) or {}
    pedido = ficha.get("teto_avaliador")
    if not isinstance(pedido, dict):
        pedido = {}
    return {fase: _teto_pedido(pedido.get(fase), padrao, TETO_AVALIADOR_MAXIMO[fase])
            for fase, padrao in TETO_AVALIADOR_PADRAO.items()}


def _teto_tarefa(construtor, avaliador, rodadas):
    rodadas = min(max(rodadas, 1), MAX_RODADAS_VEREDITO)
    escalado = construtor + avaliador["criterio"] + avaliador["casos"] + avaliador["parecer"] * rodadas
    return max(TETO_TAREFA_TOKENS, escalado)


def teto_tarefa(raiz, tarefa, rodadas=None):
    """Teto da tarefa inteira: max(700k, construtor + criterio + casos + parecer x rodadas
    de veredito usadas), todos efetivos. Sem rodadas, conta as ja gravadas na tarefa (no
    minimo 1). Nunca passa de TETO_TAREFA_MAXIMO (1,55M): cada parcela para no maximo."""
    if rodadas is None:
        rodadas = len(rodadas_de(tokens_acumulados(raiz, tarefa)))
    return _teto_tarefa(teto_construcao(raiz, tarefa), teto_avaliador(raiz, tarefa), rodadas)


# ------------------------------------------------------------ instalacao (C8/C10)
def _humano(nome, onde, exige):
    """Nome limpo de quem aprovou ou assinou; ValueError se vazio ou agente do time."""
    quem = _limpo(nome or "")
    if not quem:
        raise ValueError(f"{onde} exige {exige}")
    if quem.lower().startswith(PREFIXO_AGENTES):
        raise ValueError(f"{onde}: {quem!r} e agente do time; so o dono ou o CAIO (C8/C10)")
    return quem


def _exigir_instalacao(raiz, tarefa, resultado, aprovado_por):
    _humano(aprovado_por, f"o gate {GATE_INSTALACAO}",
            "--aprovado-por (quem aceitou ou recusou a proposta; C10)")
    if resultado != "acerto":
        return
    if not tarefa:
        raise ValueError(f"o gate {GATE_INSTALACAO} acerto precisa de --tarefa")
    ok, motivo = conferir_criterio(raiz, tarefa)
    if not ok:
        raise ValueError(f"instalacao recusada: {motivo}")
    linhas = linhas_vigentes(raiz, tarefa)
    travas = [i for i, l in enumerate(linhas) if l["gate"] == GATE_TRAVA]
    if not travas:
        raise ValueError("instalacao recusada: nenhuma trava-lote da tarefa depois do critério "
                         "congelado (o lote nunca foi conferido)")
    ultima_trava = travas[-1]
    if linhas[ultima_trava]["resultado"] != "acerto":
        raise ValueError("instalacao recusada: a ultima trava-lote da tarefa foi recusada")
    vereditos = [l for l in linhas[ultima_trava + 1:]
                 if l["gate"] == GATE_VEREDITO and l["resultado"] == "acerto"
                 and l["unidade"] == AVALIADOR]
    if not vereditos:
        raise ValueError(f"instalacao recusada: nenhum veredito acerto do {AVALIADOR} depois "
                         "da ultima trava-lote (o avaliador e a unica aprovacao valida, C8)")


# ------------------------------------------------------------ reinstalacao do time (v1.3)
def arquivo_do_time(rel):
    """True se rel (posix) e arquivo que a reinstalacao do time troca: a pasta da skill
    (sem __pycache__ e sem os mapas da casa) ou um agente gerado native-ai-*."""
    if rel.startswith(PASTA_DO_TIME):
        resto = rel[len(PASTA_DO_TIME):]
        return "__pycache__" not in resto.split("/") and resto not in GERADOS_NA_CASA
    return bool(_AGENTE_DO_TIME_RE.match(rel))


def hashes_do_time(raiz):
    """{caminho: sha256} de cada arquivo do time na raiz agora (link simbolico fica fora:
    a trava o ve como LINK e nunca bate)."""
    raiz = Path(raiz)
    candidatos = [p for pasta in (".claude/agents", ".codex/agents", PASTA_DO_TIME)
                  if (raiz / pasta).is_dir() for p in (raiz / pasta).rglob("*")]
    saida = {}
    for p in sorted(candidatos):
        rel = p.relative_to(raiz).as_posix()
        if p.is_file() and not p.is_symlink() and arquivo_do_time(rel):
            saida[rel] = hashlib.sha256(p.read_bytes()).hexdigest()
    return saida


def _reinstalacao_aprovada(linha, tarefa):
    return (linha is not None and linha["gate"] == GATE_REINSTALAR
            and linha["resultado"] == "acerto" and tarefa_da_linha(linha["detalhe"]) == tarefa
            and _aprovador_humano(linha["detalhe"]) is not None)


def hashes_reinstalacao(raiz, tarefa):
    """{caminho: sha256} gravados na ultima linha reinstalar-time acerto, aprovada por
    humano, da tarefa; None se nao houver. E o unico estado da guarda que a trava aceita
    diferente do retrato."""
    tarefa = _tarefa_valida(tarefa)
    achado = None
    for linha in linhas_gravadas(raiz):
        if _reinstalacao_aprovada(linha, tarefa):
            achado = dict(_HASH_RE.findall(linha["detalhe"]))
    return achado


def hash_sem_reinstalacoes_no_fim(raiz, tarefa):
    """sha256 do W15 sem as linhas reinstalar-time aprovadas da tarefa no fim do arquivo.
    Igual ao do retrato = a unica coisa gravada no registro durante o lote foi a
    reinstalacao."""
    try:
        linhas = _arquivo(raiz).read_bytes().decode("utf-8").splitlines(keepends=True)
    except (OSError, UnicodeDecodeError):
        return None
    tarefa = _tarefa_valida(tarefa)
    while linhas and _reinstalacao_aprovada(_celulas(linhas[-1]), tarefa):
        linhas.pop()
    return hashlib.sha256("".join(linhas).encode("utf-8")).hexdigest()


# ------------------------------------------------------------------ CLI
def _linha_com_erro(linha):
    return MARCA_TETO in linha or MARCA_RODADA in linha


def _main_congelar(argv):
    p = argparse.ArgumentParser(prog="w15.py congelar",
                                description="Congela criterio.md e casos.md (C6).")
    p.add_argument("--raiz", required=True)
    p.add_argument("--tarefa", required=True)
    p.add_argument("--unidade", required=True)
    p.add_argument("--assinado-por", required=True,
                   help="quem assinou o criterio (o dono; nunca agente do time)")
    p.add_argument("--tokens", default=None)
    p.add_argument("--data", default=None)
    p.add_argument("--reiniciar", action="store_true",
                   help="congela de novo depois da construcao: os gates anteriores deixam de valer")
    a = p.parse_args(argv)
    try:
        tokens = parse_tokens(a.tokens) if a.tokens else None
        linha = congelar_criterio(a.raiz, a.tarefa, a.unidade, data=a.data, tokens=tokens,
                                  reiniciar=a.reiniciar, assinado_por=a.assinado_por)
    except ValueError as erro:
        print(f"w15: {erro}", file=sys.stderr)
        return 2
    print(linha)
    return 1 if _linha_com_erro(linha) else 0


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] == "congelar":
        return _main_congelar(argv[1:])
    p = argparse.ArgumentParser(description="Grava 1 linha do W15 (erros e acertos).")
    p.add_argument("--raiz", required=True, help="raiz do repo (a casa)")
    p.add_argument("--gate", required=True)
    p.add_argument("--resultado", required=True, choices=RESULTADOS)
    p.add_argument("--unidade", required=True)
    p.add_argument("--detalhe", default="")
    p.add_argument("--data", default=None, help="AAAA-MM-DD (padrao: hoje)")
    p.add_argument("--tarefa", default=None, help="pasta da tarefa: operacao/tasks/TASK-N")
    p.add_argument("--tokens", default=None,
                   help="tokens reais por subagente: nome=numero,nome:fase=numero (exige --tarefa)")
    p.add_argument("--construido-no-thread", action="store_true",
                   help="marca 'construido no thread' (recuo da prova de subida); exige --modelo-thread")
    p.add_argument("--modelo-thread", default=None,
                   help="modelo do thread que construiu (diferente do avaliador, C8)")
    p.add_argument("--aprovado-por", default=None,
                   help="quem aprovou (obrigatorio no gate instalacao; humano, nunca agente)")
    args = p.parse_args(argv)

    try:
        tokens = parse_tokens(args.tokens) if args.tokens else None
        linha = registrar(
            args.raiz, args.gate, args.resultado, args.unidade, args.detalhe,
            data=args.data, tokens=tokens, tarefa=args.tarefa,
            construido_no_thread=args.construido_no_thread, modelo_thread=args.modelo_thread,
            aprovado_por=args.aprovado_por,
        )
    except ValueError as erro:
        print(f"w15: {erro}", file=sys.stderr)
        return 2
    print(linha)
    if _linha_com_erro(linha):
        print("w15: gravado como erro (teto de tokens ou rodada de veredito invalida); volte "
              "ao degrau de baixo.",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
