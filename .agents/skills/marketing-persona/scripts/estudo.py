#!/usr/bin/env python3
"""estudo.py: confere cada etapa do estudo da persona e diz em que etapa retomar.

A skill marketing-persona trabalha como um especialista contratado, em 10 etapas (0 a 9). Cada etapa grava um
arquivo em empresa/publico/estudo/ (as etapas 6 e 7 escrevem empresa/publico/estudo/6-estudo.json e o
persona_estudo.py montar gera empresa/publico/persona.md; a 9 grava o "sim" do dono) e a seguinte só começa quando
`conferir --etapa N` devolve OK. Sem rede e sem escrever nada. As etapas 6, 7 e 9 conferem pelo persona_estudo.py
(contrato persona-dados v1).

  conferir --etapa N   confere a etapa N (o que a tabela da SKILL.md diz que ela exige) e lista cada PROBLEMA
                       dizendo o que corrigir.
  estado               confere as etapas em ordem e diz a primeira que falta ou que tem problema: é onde retomar
                       quando a sessão caiu.

Uso (da raiz do projeto):
  estudo.py conferir --etapa 3 [--casa .]
  estudo.py estado [--casa .]

Na etapa 3, toda resposta do dossiê cortada no meio da frase tem de estar em '## O que ainda não sabemos', e as linhas
'O que isso muda na venda' e 'O que o dono não está vendo' dos blocos 2, 3 e 7 são leitura. Na etapa 4, os 8 cruzamentos
do roteiro vão em '## Cruzamentos testados', cada um com o resultado. Na etapa 5, zero perguntas só vale quando a regra
do roteiro não escolhe nenhuma (perguntas_da_regra).

Na etapa 4, frase entre aspas em "O que o mercado mostra" tem de estar no trecho de uma das fichas que a própria linha
cita ((pesquisa [n]) ou (análise: ... pesquisa [n] ...)); em todas as etapas, toda pesquisa [n] aponta para uma ficha
válida do 2-pesquisa.json.

Saída: 0 ok; 1 problema achado (conferir) ou dossiê ausente; 2 uso errado.
Só stdlib (Python 3.10+). As marcas de origem são as do dossie_para_persona.py, inclusive (análise: ...).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aprovacao  # noqa: E402
import dossie_para_persona as dp  # noqa: E402
import persona_estudo as pe  # noqa: E402

ESTUDO = "empresa/publico/estudo"
PERSONA = "empresa/publico/persona.md"
ROTEIROS = ".agents/skills/marketing-persona/referencias/etapas"
ETAPAS: dict[int, tuple[str, str, str]] = {  # n: (nome, arquivo que a etapa grava, roteiro)
    0: ("Escopo", f"{ESTUDO}/0-escopo.md", "etapa-0-escopo.md"),
    1: ("Hipótese do dono", f"{ESTUDO}/1-hipotese-do-dono.md", "etapa-1-hipotese-do-dono.md"),
    2: ("Pesquisa de mercado", f"{ESTUDO}/2-pesquisa.json", "etapa-2-pesquisa.md"),
    3: ("Análise", f"{ESTUDO}/3-analise.md", "etapa-3-analise.md"),
    4: ("Descobertas", f"{ESTUDO}/4-descobertas.md", "etapa-4-descobertas.md"),
    5: ("Entrevista de confronto", f"{ESTUDO}/5-entrevista.md", "etapa-5-entrevista.md"),
    6: ("Montagem da persona", pe.ENTRADA, "etapa-6-montagem.md"),
    7: ("Plano de mensagem", PERSONA, "etapa-7-plano-de-mensagem.md"),
    8: ("Revisão", f"{ESTUDO}/8-revisao.md", "etapa-8-revisao.md"),
    9: ("Apresentação e aprovação", PERSONA, "etapa-9-apresentacao.md"),
}

TETO_PAGINAS = 10
TETO_TRECHOS = 50
TRECHOS_POR_PAGINA = 5
TETO_PALAVRAS_TRECHO = 40
TETO_PERGUNTAS = 5
FRENTES = ("alternativas", "voz_do_cliente", "duvidas_e_reclamacoes")
TIPOS_DE_CLIENTE = ("pessoa", "empresa", "os dois")
TIPOS_DE_DESCOBERTA = ("dono e mercado discordam", "o cliente fala e a empresa nao",
                       "duvida que nenhum concorrente responde", "duas respostas do dono nao batem")
RASTREIO = re.compile(r"[?&](utm_[a-z]+|fbclid|gclid)=", re.IGNORECASE)
RE_CONFIRMACAO = re.compile(r'^- Confirmação do dono: (\d{4}-\d{2}-\d{2}) \| "(.+)"\s*$', re.MULTILINE)
RE_PERGUNTA = re.compile(r'^- (\d{4}-\d{2}-\d{2}) \| Pergunta do time: (.+?) \| Motivo: (.+?) \| Resposta do dono: "(.+)"\s*$')
NENHUMA_PERGUNTA = "- Nenhuma pergunta foi feita ao dono além do dossiê."
RE_TITULO_DESCOBERTA = re.compile(r"^## Descoberta (\d)\b")

# etapa 3: os 5 moldes, nesta ordem, e as linhas que cada um precisa (começo do rótulo, normalizado)
MOLDES: list[tuple[str, str, list[str]]] = [
    ("valor diferenciado", "1. Valor diferenciado",
     ["alternativas reais", "o que so a empresa tem", "o valor disso para o cliente", "quem mais liga para esse valor",
      "eixo horizontal", "eixo vertical", "leitura do mapa"]),
    ("grupos por comportamento", "2. Grupos por comportamento", ["persona principal", "quem nao e cliente",
                                                                 "o que isso muda na venda", "o que o dono nao esta vendo"]),
    ("decisao de compra", "3. Decisão de compra",
     ["o que dispara", "resultado que espera", "o que barra", "o que compara", "o que as palavras vagas querem dizer",
      "caminho e quem influencia", "ponto do caminho", "quem pesa", "trabalho pratico", "o que isso pede",
      "o que isso muda na venda", "o que o dono nao esta vendo"]),
    ("forcas", "4. Forças", ["empurra", "puxa", "medo", "costume que segura", "inclinacao"]),
    ("nivel de consciencia", "5. Nível de consciência por grupo", ["degrau em foco"]),
    ("como pensa", "6. Como pensa", ["acredita", "teme", "deseja", "teste do espelho"]),
    ("onde esta", "7. Onde está", ["como chegar", "o que isso muda na venda", "o que o dono nao esta vendo"]),
]
# blocos de fatos: as duas perguntas depois dos fatos são leitura, nunca evidência copiada (ensaio de 19/11)
LEITURAS_DA_VENDA = (("o que isso muda na venda", "O que isso muda na venda"),
                     ("o que o dono nao esta vendo", "O que o dono não está vendo"))
# resposta cortada no meio da frase: termina sem ponto, em vírgula ou numa palavra que pede continuação
CONECTIVOS = {"que", "e", "de", "do", "da", "dos", "das", "com", "para", "pra", "porque", "mas", "ou", "o", "a", "os",
              "as", "um", "uma", "se", "em", "no", "na", "nos", "nas", "por", "como", "quando", "pelo", "pela"}
SEM_SABER = "o que ainda nao sabemos"
# etapa 4: os cruzamentos que a caça a descoberta testa um por um (roteiro da etapa 4)
CRUZAMENTOS = (("X1", "O cliente ideal x como vende hoje"), ("X2", "A dúvida que trava x o que ele se recusa a prometer"),
               ("X3", "A prova que tem x a prova que usa"), ("X4", "O que deseja para si x o que atribui ao cliente"),
               ("X5", "O canal que traz cliente x o cliente que ele quer"),
               ("X6", "O que o concorrente promete x o que só ele tem"),
               ("X7", "Quem não compra x quanto custa trazer cada um"),
               ("X8", "O que dá mais lucro x onde ele põe o esforço"))
RESULTADOS_CRUZAMENTO = ("virou", "so resumo", "sem dado")
# etapa 5: a tabela de lacunas do roteiro, (rótulo da etapa 1, linha da etapa 3), na ordem; um teste confere o roteiro
LACUNAS_ETAPA_5 = (("Gatilho de compra", "O que dispara"), ("Hábito que segura", "Costume que segura"),
                   ("Linguagem do cliente", "O que as palavras vagas querem dizer"),
                   ("Quem não é o cliente ideal", "Quem não é cliente"),
                   ("Quem decide e quem participa da compra", "Caminho e quem influencia"),
                   ("Objeções e ansiedades", "O que barra"), ("Alternativas reais", "Alternativas reais do cliente"),
                   ("Critérios de decisão", "O que compara"))
ZONAS_ETAPA3 = (("ja cruza com voce", "Já cruza com você"), ("onde se informa", "Onde se informa"),
                ("onde aprende e compara", "Onde aprende e compara"), ("quem escuta", "Quem escuta"))
RE_PESO = re.compile(r",\s*peso ([1-3])\b")
RE_PONTO_CAMINHO = re.compile(r"^- Ponto do caminho: ([^,]{1,40}), (atua|fora|vazamento): (.+)$")
RE_QUEM_PESA = re.compile(r"^- Quem pesa: ([^,]{1,60}), (decide|influencia|usa), anel ([0-3])\b")
RE_PONTO_MAPA = re.compile(r"^- ([^:]{1,40}): x (\d{1,3}), y (\d{1,3})\b(.*)$")
RE_HIPOTESE_SEM_RAZAO = re.compile(r"\(hip[oó]tese\s*\)", re.IGNORECASE)
RE_FRASE = re.compile(r"[.!?](?:\s|$)")
PERMITIDAS_HIPOTESE = {"dossie", "nao consta"}
PERMITIDAS_ESCOPO = {"dossie", "relato do dono", "nao consta"}
PERMITIDAS_ANALISE = {"dossie", "relato do dono", "pesquisa", "analise", "hipotese", "nao consta"}


class Falta(Exception):
    """Um arquivo de que a etapa precisa ainda não existe."""


# ---------------------------------------------------------------- leitura

def ler(casa: Path, rel: str) -> str:
    alvo = casa / rel
    if not alvo.is_file():
        raise Falta(rel)
    return alvo.read_bytes().decode("utf-8").lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")


def ler_pesquisa(casa: Path) -> dict:
    """O JSON da etapa 2 (sem conferir). Arquivo ilegível vira dicionário vazio (a etapa 2 acusa)."""
    try:
        dados = json.loads(ler(casa, ETAPAS[2][1]))
    except ValueError:
        return {}
    return dados if isinstance(dados, dict) else {}


def fichas_validas(pesquisa: dict) -> list[dict]:
    """Fichas que dá para citar: n inteiro, URL https e data. As outras a etapa 2 acusa."""
    saida = []
    for f in pesquisa.get("fichas") or []:
        if (isinstance(f, dict) and isinstance(f.get("n"), int) and str(f.get("url", "")).startswith("https://")
                and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(f.get("data_acesso", "")))):
            saida.append(f)
    return saida


def houve_pesquisa(pesquisa: dict) -> bool:
    return pesquisa.get("busca_disponivel") is True and bool(fichas_validas(pesquisa))


def respostas_da_entrevista(casa: Path) -> list[tuple[str, str]]:
    """(data, resposta literal do dono) de cada pergunta do 5-entrevista.md."""
    try:
        texto = ler(casa, ETAPAS[5][1])
    except Falta:
        return []
    return [(m.group(1), m.group(4)) for m in (RE_PERGUNTA.match(l.strip()) for l in texto.split("\n")) if m]


def relatos(casa: Path) -> list[tuple[str, str]]:
    """(data, frase literal do dono): a confirmação do escopo e as respostas da entrevista."""
    saida: list[tuple[str, str]] = []
    try:
        m = RE_CONFIRMACAO.search(ler(casa, ETAPAS[0][1]))
        if m:
            saida.append((m.group(1), m.group(2)))
    except Falta:
        pass
    return saida + respostas_da_entrevista(casa)


def virtual(texto: str, fichas: list[dict], falas: list[tuple[str, str]]) -> str:
    """O arquivo da etapa com as fontes da pesquisa e as falas do dono anexadas no fim, no formato que o
    dossie_para_persona.py confere: assim (pesquisa [n]), (relato do dono, data), (análise: ...) e as aspas são
    conferidas do mesmo jeito que na persona. As linhas do arquivo não mudam de número."""
    extra = ["", "## Fontes da pesquisa", ""]
    for f in fichas:
        titulo = str(f.get("titulo") or "Página").replace("\n", " ")
        extra.append(f"- [{f['n']}] {titulo}. {f['url']}. Acessado em {f['data_acesso']}.")
    extra += ["", "## Anexo: falas do dono e trechos da pesquisa", ""]
    extra += [f'- {data} | Resposta do dono: "{frase}"' for data, frase in falas]
    extra += ["", "### Trechos da pesquisa", ""]
    extra += [f'- [{f["n"]}] "{str(f.get("trecho", "")).strip()}"' for f in fichas]
    return texto.rstrip("\n") + "\n" + "\n".join(extra) + "\n"


def conferir_marcas(texto: str, dossie: dict, casa: Path) -> list[str]:
    """Marcas e aspas do arquivo, conferidas pelo dossie_para_persona.py contra o dossiê, a pesquisa e as falas."""
    fichas = fichas_validas(ler_pesquisa(casa)) if (casa / ETAPAS[2][1]).is_file() else []
    total = texto.count("\n") + 1
    problemas, _ = dp.conferir_documento(virtual(texto, fichas, relatos(casa)), dossie, False)
    saida = []
    for p in problemas:
        n = re.match(r"linha (\d+):", p)
        if n and int(n.group(1)) > total:
            continue  # linha do anexo montado aqui, não do arquivo
        saida.append(p.replace("sem registro no Anexo do documento", "que não é a data da confirmação do escopo nem "
                                                                     "de uma resposta da entrevista")
                     .replace("que não está em Fontes da pesquisa com https e data",
                              "que não está entre as fichas válidas do 2-pesquisa.json"))
    return saida


def exigir_marcas(texto: str, permitidas: set[str], pular=lambda linha: False) -> list[str]:
    """Toda linha das seções '## ' tem marca de origem, e só das permitidas nesta etapa."""
    problemas = []
    nomes = {"dossie": "(dossiê CÓDIGO)", "relato do dono": "(relato do dono, data)", "pesquisa": "(pesquisa [n])",
             "analise": "(análise: ...)", "hipotese": "(hipótese)", "nao consta": "(não consta no dossiê)"}
    lista = ", ".join(nomes[t] for t in nomes if t in permitidas)
    for n, linha in dp._linhas_de_fato(texto):
        if pular(linha):
            continue
        tipos = dp.marcas_da(linha)
        if not tipos:
            problemas.append(f"linha {n}: sem marca de origem; termine a linha com uma destas: {lista}: {linha[:60]}")
        elif not set(tipos) <= permitidas:
            fora = sorted(set(tipos) - permitidas)
            problemas.append(f"linha {n}: marca que não vale nesta etapa ({', '.join(fora)}); use só {lista}")
    return problemas


def rotulos(linhas: list[tuple[int, str]]) -> dict[str, tuple[int, str]]:
    saida: dict[str, tuple[int, str]] = {}
    for n, linha in linhas:
        m = dp.RE_ROTULO.match(linha.strip())
        if m:
            saida.setdefault(dp.normalizar(m.group(1)), (n, linha))
    return saida


def tem_rotulo(rots: dict[str, tuple[int, str]], comeco: str) -> tuple[int, str] | None:
    return next((v for k, v in rots.items() if k.startswith(comeco)), None)


def valor(linha: str) -> str:
    """O texto depois de '- Rótulo:' sem as marcas de origem."""
    return dp.RE_MARCA.sub("", dp.sem_acento(linha.split(":", 1)[1]).lower()).strip(" .;")


# ---------------------------------------------------------------- uma função por etapa

def etapa_0(casa: Path, dossie: dict) -> list[str]:
    texto = ler(casa, ETAPAS[0][1])
    problemas: list[str] = []
    if not RE_CONFIRMACAO.search(texto):
        problemas.append("falta a linha '- Confirmação do dono: AAAA-MM-DD | \"frase literal dele\"' no cabeçalho: "
                         "mostre o escopo ao dono e copie a resposta dele entre aspas")
    corpo = dp.secao(texto, "escopo")
    if corpo is None:
        return problemas + ["falta a seção '## Escopo' com a oferta em foco, o tipo de cliente e onde atende"]
    rots = rotulos(corpo[1])
    for chave, nome in (("oferta em foco", "Oferta em foco"), ("tipo de cliente", "Tipo de cliente"), ("onde atende", "Onde atende")):
        achado = tem_rotulo(rots, chave)
        if achado is None:
            problemas.append(f"seção Escopo sem a linha '- {nome}: ...' com a origem")
            continue
        n, linha = achado
        if chave == "oferta em foco" and not set(dp.marcas_da(linha)) & {"dossie", "relato do dono"}:
            problemas.append(f"linha {n}: a oferta em foco precisa vir do dono: (dossiê B3) ou (relato do dono, data)")
        if chave == "tipo de cliente" and not valor(linha).startswith(TIPOS_DE_CLIENTE):
            problemas.append(f"linha {n}: o tipo de cliente começa por 'pessoa', 'empresa' ou 'os dois' (dossiê B2)")
    return problemas + exigir_marcas(texto, PERMITIDAS_ESCOPO) + conferir_marcas(texto, dossie, casa)


def etapa_1(casa: Path, dossie: dict) -> list[str]:
    texto = ler(casa, ETAPAS[1][1])
    problemas: list[str] = []
    corpo = dp.secao(texto, "hipotese do dono")
    if corpo is None:
        return ["falta a seção '## Hipótese do dono' com uma linha por dimensão"]
    rots = rotulos(corpo[1])
    for _, nome, _, _, _ in dp.DIMENSOES:
        if tem_rotulo(rots, dp.normalizar(nome.split(" (")[0])) is None:
            problemas.append(f"falta a linha '- {nome}: ...'; sem resposta no dossiê, escreva (não consta no dossiê)")
    return problemas + exigir_marcas(texto, PERMITIDAS_HIPOTESE) + conferir_marcas(texto, dossie, casa)


def etapa_2(casa: Path, dossie: dict) -> list[str]:
    try:
        dados = json.loads(ler(casa, ETAPAS[2][1]))
    except ValueError:
        return ["2-pesquisa.json não é JSON: grave exatamente o objeto que o marketing-pesquisador devolveu"]
    if not isinstance(dados, dict) or not isinstance(dados.get("busca_disponivel"), bool):
        return ["2-pesquisa.json precisa de 'busca_disponivel': true ou false (o objeto do marketing-pesquisador)"]
    fichas = dados.get("fichas")
    if not isinstance(fichas, list):
        return ["2-pesquisa.json precisa da lista 'fichas' (vazia quando não houve busca)"]
    if not dados["busca_disponivel"]:
        return [] if not fichas else ["busca_disponivel é false, mas há fichas: sem busca, a lista 'fichas' fica vazia"]
    problemas: list[str] = []
    vistos: set[int] = set()
    por_pagina: dict[str, int] = {}
    for i, f in enumerate(fichas, 1):
        if not isinstance(f, dict):
            problemas.append(f"ficha {i}: não é um objeto JSON")
            continue
        n = f.get("n")
        rotulo = f"ficha [{n}]" if isinstance(n, int) else f"ficha {i}"
        if not isinstance(n, int) or isinstance(n, bool) or n < 1:
            problemas.append(f"{rotulo}: 'n' precisa ser um número inteiro a partir de 1")
        elif n in vistos:
            problemas.append(f"{rotulo}: número repetido; cada ficha tem o seu n")
        else:
            vistos.add(n)
        url = str(f.get("url", ""))
        if not url.startswith("https://"):
            problemas.append(f"{rotulo}: 'url' precisa começar com https:// (só página aberta, nunca link montado)")
        elif RASTREIO.search(url):
            problemas.append(f"{rotulo}: tire da url o parâmetro de rastreio (utm_, fbclid, gclid)")
        else:
            por_pagina[url] = por_pagina.get(url, 0) + 1
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(f.get("data_acesso", ""))):
            problemas.append(f"{rotulo}: 'data_acesso' no formato AAAA-MM-DD")
        trecho = str(f.get("trecho", "")).strip()
        if not trecho:
            problemas.append(f"{rotulo}: 'trecho' vazio; a ficha traz o texto copiado da página")
        elif len(trecho.split()) > TETO_PALAVRAS_TRECHO:
            problemas.append(f"{rotulo}: 'trecho' com mais de {TETO_PALAVRAS_TRECHO} palavras; corte na frase que sustenta")
        if f.get("frente") not in FRENTES:
            problemas.append(f"{rotulo}: 'frente' precisa ser {', '.join(FRENTES)}")
        if not str(f.get("tema", "")).strip():
            problemas.append(f"{rotulo}: 'tema' vazio; diga em 1 a 4 palavras do que o trecho fala")
    if len(fichas) > TETO_TRECHOS:
        problemas.append(f"{len(fichas)} fichas: o teto é {TETO_TRECHOS} trechos")
    if len(por_pagina) > TETO_PAGINAS:
        problemas.append(f"{len(por_pagina)} páginas: o teto é {TETO_PAGINAS} páginas abertas")
    for url, conta in por_pagina.items():
        if conta > TRECHOS_POR_PAGINA:
            problemas.append(f"{conta} trechos da mesma página ({url[:60]}): o teto é {TRECHOS_POR_PAGINA} por página")
    return problemas


def _isenta(linha: str) -> bool:
    """Linha de recomendação ('- Como chegar:', '- O que isso pede:' ...): não leva marca de origem."""
    return linha[2:].startswith(pe.ROTULOS_ISENTOS) if linha.startswith("- ") else False


def _leitura_por_bloco(nome: str, linhas: list[tuple[int, str]]) -> list[str]:
    """Todo bloco da análise traz pelo menos uma leitura sua: (análise: ...) ou (hipótese: razão)."""
    if any({"analise", "hipotese"} & set(dp.marcas_da(l)) for _, l in linhas):
        return []
    return [f"bloco '{nome}': nenhuma linha é leitura sua. Junte as evidências numa conclusão com (análise: ...) ou "
            "afirme uma hipótese com a razão, (hipótese: razão); copiar a resposta do dono não é análise"]


def _bloco_valor(nome: str, linhas: list[tuple[int, str]]) -> list[str]:
    pontos = [(n, m) for n, l in linhas if (m := RE_PONTO_MAPA.match(l.strip()))]
    problemas = []
    if not 2 <= len(pontos) <= 7:
        problemas.append(f"bloco '{nome}': o mapa precisa de 2 a 7 linhas '- <alternativa>: x <0 a 100>, y <0 a 100> (marca)' "
                         f"(achei {len(pontos)})")
    nossos = [n for n, m in pontos if "a propria empresa" in dp.normalizar(m.group(4))]
    if pontos and len(nossos) != 1:
        problemas.append(f"bloco '{nome}': exatamente uma linha do mapa com '(a própria empresa)' (achei {len(nossos)})")
    for n, m in pontos:
        if int(m.group(2)) > 100 or int(m.group(3)) > 100:
            problemas.append(f"linha {n}: x e y vão de 0 a 100")
        if "hipotese" in dp.marcas_da(m.group(4)) or not set(dp.marcas_da(m.group(4))) & {"dossie", "pesquisa", "relato do dono", "analise"}:
            problemas.append(f"linha {n}: alternativa no mapa só se o dono citou ou a pesquisa mostrou; sem isso, tire a linha")
    return problemas


def _bloco_decisao(nome: str, linhas: list[tuple[int, str]]) -> list[str]:
    problemas = []
    caminho = [(n, RE_PONTO_CAMINHO.match(l.strip()), l) for n, l in linhas if l.strip().startswith("- Ponto do caminho:")]
    if not 3 <= len(caminho) <= 8:
        problemas.append(f"bloco '{nome}': o caminho tem de 3 a 8 linhas '- Ponto do caminho: <etapa>, <atua | fora | "
                         f"vazamento>: <o que acontece> (marca)' (achei {len(caminho)})")
    for n, m, linha in caminho:
        if not m:
            problemas.append(f"linha {n}: fora do formato '- Ponto do caminho: <etapa>, <atua | fora | vazamento>: <texto> (marca)'")
        elif m.group(2) == "vazamento" and "Alerta:" not in linha:
            problemas.append(f"linha {n}: ponto de vazamento precisa de 'Alerta: <onde e por que a empresa perde gente>' antes da marca")
    papeis = [(n, RE_QUEM_PESA.match(l.strip())) for n, l in linhas if l.strip().startswith("- Quem pesa:")]
    if not 2 <= len(papeis) <= 6:
        problemas.append(f"bloco '{nome}': de 2 a 6 linhas '- Quem pesa: <papel>, <decide | influencia | usa>, anel <0 a 3>: "
                         f"<o que faz> (marca)' (achei {len(papeis)})")
    for n, m in papeis:
        if not m:
            problemas.append(f"linha {n}: fora do formato '- Quem pesa: <papel>, <decide | influencia | usa>, anel <0 a 3>: ...'")
    if papeis and not any(m and m.group(3) == "0" for _, m in papeis):
        problemas.append(f"bloco '{nome}': pelo menos um 'Quem pesa' no anel 0 (quem decide)")
    trabalhos = [l for _, l in linhas if l.strip().startswith("- Trabalho ")]
    pedidos = [l for _, l in linhas if l.strip().startswith("- O que isso pede:")]
    if len(pedidos) < len(trabalhos):
        problemas.append(f"bloco '{nome}': cada '- Trabalho ...' é seguido de '- O que isso pede: ...' (o que ele pede da empresa)")
    return problemas


def _bloco_forcas(nome: str, linhas: list[tuple[int, str]]) -> list[str]:
    problemas = []
    soma = {"empurra": 0, "segura": 0}
    inclinacao = None
    for n, linha in linhas:
        m = dp.RE_ROTULO.match(linha.strip())
        if not m:
            continue
        rot = dp.normalizar(m.group(1))
        if rot.startswith(("empurra", "puxa", "medo", "costume")):
            peso = RE_PESO.search(linha)
            if not peso:
                problemas.append(f"linha {n}: cada força leva o peso antes da marca: ', peso 1' (fraca) a ', peso 3' (forte)")
            elif not rot.startswith("puxa ausente"):
                soma["empurra" if rot.startswith(("empurra", "puxa")) else "segura"] += int(peso.group(1))
        elif rot.startswith("inclinacao"):
            valor_ = dp.normalizar(linha.split(":", 1)[1])
            inclinacao = next((i for i in ("empurra", "segura", "equilibrio") if valor_.startswith(i)), "")
            if not inclinacao:
                problemas.append(f"linha {n}: a inclinação começa por empurra, segura ou equilíbrio")
    e, s = soma["empurra"], soma["segura"]
    if inclinacao and ((inclinacao == "segura" and s < e) or (inclinacao == "empurra" and e < s)
                       or (inclinacao == "equilibrio" and abs(e - s) > 1)):
        problemas.append(f"bloco '{nome}': a inclinação '{inclinacao}' desmente os pesos (empurra e puxa somam {e}, sem o "
                         f"ausente; medo e costume somam {s}); acerte os pesos ou a inclinação")
    return problemas


def _bloco_escada(nome: str, linhas: list[tuple[int, str]]) -> list[str]:
    problemas = []
    tabela = dp.linhas_da_tabela(linhas, "degrau")
    niveis = []
    for n, celulas in tabela:
        if len(celulas) != 4 or not re.match(r"[1-5]\b", celulas[0]):
            problemas.append(f"linha {n}: a linha do degrau precisa de 4 colunas e o degrau começa por 1, 2, 3, 4 ou 5")
        else:
            niveis.append(int(celulas[0][0]))
    if sorted(niveis) != [1, 2, 3, 4, 5]:
        problemas.append(f"bloco '{nome}': a tabela '| Degrau | Sinal que mostra | Quem da empresa está aqui | O que a "
                         "mensagem deve fazer |' tem os 5 degraus, um de cada, de 1 a 5")
    foco = tem_rotulo(rotulos(linhas), "degrau em foco")
    if foco and not re.match(r"[1-5]\b", foco[1].split(":", 1)[1].strip()):
        problemas.append(f"linha {foco[0]}: o degrau em foco começa pelo número do degrau, de 1 a 5")
    return problemas


def _bloco_pensa(nome: str, linhas: list[tuple[int, str]]) -> list[str]:
    rots = [dp.normalizar(m.group(1)) for m in (dp.RE_ROTULO.match(l.strip()) for _, l in linhas) if m]
    conta = {k: rots.count(k) for k in ("acredita", "teme", "deseja")}
    return [f"bloco '{nome}': no máximo 5 linhas '- {k.capitalize()}:' (achei {v})" for k, v in conta.items() if v > 5]


def _bloco_onde(nome: str, linhas: list[tuple[int, str]]) -> list[str]:
    problemas = []
    zona_aberta = None
    vistas = 0
    for n, linha in linhas:
        m = dp.RE_ROTULO.match(linha.strip())
        if not m:
            continue
        rot = dp.normalizar(m.group(1))
        zona = next((z for z, _ in ZONAS_ETAPA3 if rot == z), None)
        if zona:
            if zona_aberta:
                problemas.append(f"linha {zona_aberta[0]}: a zona '{zona_aberta[1]}' está sem a linha '- Como chegar: ...' logo depois")
            zona_aberta = (n, m.group(1))
            vistas += 1
        elif rot == "como chegar":
            zona_aberta = None
    if zona_aberta:
        problemas.append(f"linha {zona_aberta[0]}: a zona '{zona_aberta[1]}' está sem a linha '- Como chegar: ...' logo depois")
    if not vistas:
        problemas.append(f"bloco '{nome}': pelo menos uma zona: " + ", ".join(f"'- {z}:'" for _, z in ZONAS_ETAPA3))
    return problemas


BLOCOS_EXTRA = {"valor diferenciado": _bloco_valor, "decisao de compra": _bloco_decisao, "forcas": _bloco_forcas,
                "nivel de consciencia": _bloco_escada, "como pensa": _bloco_pensa, "onde esta": _bloco_onde}


def cortada(texto: str) -> bool:
    """A resposta parece cortada no meio da frase: termina em vírgula, ou sem ponto numa palavra que pede continuação."""
    s = texto.strip()
    if not s or s[-1] in ".!?…)\"”'":
        return False
    if s[-1] in ",;:":
        return True
    return dp.normalizar(s.split()[-1]) in CONECTIVOS


def respostas_cortadas(dossie: dict) -> list[str]:
    """Códigos das perguntas que o estudo lê (blocos e dimensões) com alguma resposta cortada, na ordem do dossiê."""
    v2 = dossie.get("versao", 1) == 2
    lidas = {c for _, cods, _ in (dp.BLOCOS_V2 if v2 else dp.BLOCOS).values() for c in cods}
    lidas |= {c for _, _, ids, cods, _ in dp.DIMENSOES for c in (ids if v2 else cods)}
    return [cod for cod, p in dossie["perguntas"].items()
            if cod in lidas and p["estado"] == "respondida" and any(cortada(r) for r in p["respostas"])]


def _leituras_da_venda(nome: str, linhas: list[tuple[int, str]]) -> list[str]:
    problemas = []
    for chave, rotulo in LEITURAS_DA_VENDA:
        achada = tem_rotulo(rotulos(linhas), chave)
        if achada and not {"analise", "hipotese"} & set(dp.marcas_da(achada[1])):
            problemas.append(f"linha {achada[0]}: '{rotulo}' é leitura sua: responda o que o fato significa para a venda "
                             "e termine com (análise: ...) ou (hipótese: razão), nunca com a resposta do dono copiada")
    return problemas


def etapa_3(casa: Path, dossie: dict) -> list[str]:
    texto = ler(casa, ETAPAS[3][1])
    problemas: list[str] = []
    sem_saber = dp.secao(texto, SEM_SABER)
    anotado = " ".join(l for _, l in sem_saber[1]) if sem_saber else ""
    for cod in respostas_cortadas(dossie):
        if not re.search(rf"\b{re.escape(cod)}\b", anotado):
            fim = " ".join(dossie["perguntas"][cod]["respostas"][-1].split()[-4:])
            problemas.append(f"a resposta {cod} do dossiê termina no meio da frase (...{fim}): use só o pedaço inteiro, "
                             f"não conclua nada do que falta e anote na seção '## O que ainda não sabemos' a linha "
                             f"'- Resposta cortada: {cod}, <o assunto>', para a etapa 5 perguntar ao dono")
    titulos = [(t, n) for t, n, _ in dp.secoes(texto)]
    posicoes = []
    for comeco, nome, exigidos in MOLDES:
        achada = dp.secao(texto, comeco)
        if achada is None:
            problemas.append(f"falta o bloco '## {nome}' (os 7 moldes vão todos, nesta ordem)")
            continue
        posicoes.append(next(n for t, n in titulos if t.startswith(comeco)))
        rots = rotulos(achada[1])
        for chave in exigidos:
            if tem_rotulo(rots, chave) is None:
                problemas.append(f"bloco '{nome}' sem a linha que começa por '{chave}' (veja o molde no roteiro)")
        if comeco == "grupos por comportamento":
            comps = [k for k in rots if k.startswith("comportamento")]
            if not 2 <= len(comps) <= 4:
                problemas.append(f"bloco '{nome}' precisa de 2 a 4 linhas '- Comportamento N: ...' (achei {len(comps)})")
            if not [k for k in rots if k.startswith("grupo")]:
                problemas.append(f"bloco '{nome}' precisa de pelo menos uma linha '- Grupo A: ...'")
        if comeco in BLOCOS_EXTRA:
            problemas += BLOCOS_EXTRA[comeco](nome, achada[1])
        problemas += _leituras_da_venda(nome, achada[1])
        problemas += _leitura_por_bloco(nome, achada[1])
    if posicoes != sorted(posicoes):
        problemas.append("os 7 blocos estão fora de ordem: valor, grupos, decisão, forças, consciência, como pensa, onde está")
    for n, linha in enumerate(texto.split("\n"), 1):
        if RE_HIPOTESE_SEM_RAZAO.search(linha):
            problemas.append(f"linha {n}: hipótese vai com a razão: (hipótese: por que você aposta nisso)")
    return problemas + exigir_marcas(texto, PERMITIDAS_ANALISE, _isenta) + conferir_marcas(texto, dossie, casa)


def refs_de_pesquisa(linha: str) -> list[int]:
    """Os n citados na linha: em (pesquisa [n]) e dentro de (análise: ... pesquisa [n] ...)."""
    saida: list[int] = []
    for m in dp.RE_MARCA.finditer(dp.sem_acento(linha).lower()):
        if m.group(1) == "pesquisa":
            saida += [int(n) for n in dp.RE_REF.findall(m.group(2))]
        elif m.group(1) == "analise":
            for parte in m.group(2).split("+"):
                if parte.strip(" :").startswith("pesquisa"):
                    saida += [int(n) for n in dp.RE_REF.findall(parte)]
    return saida


def aspas_da_ficha_citada(n: int, linha: str, pesquisa: dict) -> list[str]:
    """Etapa 4, 'O que o mercado mostra': trecho entre aspas tem de estar numa das fichas que a própria linha cita.
    Sem isso, a frase de uma página aparece atribuída a outra (o conferidor das marcas só vê que ela existe em alguma)."""
    fichas = {f["n"]: f for f in fichas_validas(pesquisa)}
    citadas = [r for r in refs_de_pesquisa(linha) if r in fichas]
    problemas = []
    for m in dp.RE_ASPAS.finditer(linha):
        frase = dp.normalizar(m.group(1) or m.group(2))
        if not any(frase in dp.normalizar(str(fichas[r].get("trecho", ""))) for r in citadas):
            lista = ", ".join(f"[{r}]" for r in citadas) or "nenhuma"
            problemas.append(f"linha {n}: o trecho entre aspas não está em nenhuma das fichas citadas na linha ({lista}); "
                             "cite a ficha de onde ele saiu, ou tire as aspas")
    return problemas


def _cruzamentos(texto: str) -> list[str]:
    """A seção '## Cruzamentos testados' tem uma linha por cruzamento do roteiro, com o resultado de cada um."""
    achada = dp.secao(texto, "cruzamentos testados")
    if achada is None:
        return ["falta a seção '## Cruzamentos testados': teste os 8 cruzamentos do roteiro, um por um, e escreva uma "
                "linha por cruzamento, '- X1 <nome>: <virou a descoberta N | virou a Mais uma | só resumo: por quê | "
                "sem dado: o que falta> (marca)'"]
    problemas = []
    linhas = {l.strip()[2:4]: (n, l.strip()) for n, l in achada[1] if re.match(r"^- X[1-8] ", l.strip())}
    for ident, nome in CRUZAMENTOS:
        if ident not in linhas:
            problemas.append(f"linha {achada[0]}: falta a linha do cruzamento {ident} ({nome}); sem dado também se "
                             f"escreve: '- {ident} {nome}: sem dado: <o que falta> (não consta no dossiê)'")
            continue
        n, linha = linhas[ident]
        resultado = dp.normalizar(dp.RE_MARCA.sub("", dp.sem_acento(linha).lower()).split(":", 1)[1]) if ":" in linha else ""
        if not resultado.startswith(RESULTADOS_CRUZAMENTO):
            problemas.append(f"linha {n}: o resultado do cruzamento {ident} começa por 'virou a descoberta N', 'virou a Mais "
                             "uma', 'só resumo:' ou 'sem dado:'")
    return problemas


def etapa_4(casa: Path, dossie: dict) -> list[str]:
    texto = ler(casa, ETAPAS[4][1])
    pesquisa = ler_pesquisa(casa) if (casa / ETAPAS[2][1]).is_file() else None
    if pesquisa is None:
        raise Falta(ETAPAS[2][1])
    com_pesquisa = houve_pesquisa(pesquisa)
    problemas: list[str] = []
    cab = re.search(r"^- Houve pesquisa: (.+)$", texto, re.MULTILINE)
    if not cab:
        problemas.append("falta a linha '- Houve pesquisa: sim' (ou 'não, só do dossiê') no cabeçalho")
    elif dp.normalizar(cab.group(1)).startswith("sim") != com_pesquisa:
        problemas.append("a linha 'Houve pesquisa' não bate com o 2-pesquisa.json: "
                         + ("há fichas, escreva 'sim'" if com_pesquisa else "não há fichas, escreva 'não, só do dossiê'"))
    blocos = []  # (nº da linha do título, título, linhas)
    linhas_txt = texto.split("\n")
    for titulo, n, linhas in dp.secoes(texto):
        if RE_TITULO_DESCOBERTA.match(linhas_txt[n - 1]):
            blocos.append((n, linhas_txt[n - 1], linhas))
    if not 1 <= len(blocos) <= dp.MAX_DESCOBERTAS:
        problemas.append(f"são de 1 a {dp.MAX_DESCOBERTAS} descobertas, cada uma com o título '## Descoberta N: frase "
                         f"(análise: ...)' (achei {len(blocos)})")
    for n0, titulo, linhas in blocos:
        if "analise" not in dp.marcas_da(titulo):
            problemas.append(f"linha {n0}: a frase da descoberta é conclusão do especialista: termine com "
                             "(análise: dossiê CÓDIGO + pesquisa [n])")
        rots = rotulos(linhas)
        disse, mercado, fazer, tipo, explicacao, importa = (
            tem_rotulo(rots, c) for c in ("o que o dono disse", "o que o mercado mostra", "o que fazer", "tipo",
                                          "explicacao em ate 4 frases", "por que importa"))
        for achado, nome in ((explicacao, "Explicação em até 4 frases"), (disse, "O que o dono disse"),
                             (mercado, "O que o mercado mostra"), (importa, "Por que importa"), (fazer, "O que fazer"),
                             (tipo, "Tipo")):
            if achado is None:
                problemas.append(f"linha {n0}: a descoberta está sem a linha '- {nome}: ...'")
        for achado in (explicacao, importa):
            if achado and re.search(r"[()<>]", achado[1].split(":", 1)[1]):
                problemas.append(f"linha {achado[0]}: sem parênteses nem < > nesta linha: ela vira texto do estudo e a marca "
                                 "da descoberta já está no título")
        if explicacao and len(RE_FRASE.findall(explicacao[1].split(":", 1)[1].strip() + " ")) > 4:
            problemas.append(f"linha {explicacao[0]}: a explicação cabe em até 4 frases")
        tipos_disse = set(dp.marcas_da(disse[1])) if disse else set()
        if disse and (not tipos_disse or not tipos_disse <= {"dossie", "relato do dono"}):
            problemas.append(f"linha {disse[0]}: 'O que o dono disse' só com (dossiê CÓDIGO) ou (relato do dono, data): "
                             "é o lado do dono, nunca conclusão sua")
        if mercado:
            if com_pesquisa and not dp._cita_pesquisa(mercado[1]):
                problemas.append(f"linha {mercado[0]}: 'O que o mercado mostra' precisa citar a pesquisa: (pesquisa [n])")
            if not com_pesquisa and not ("so do dossie" in dp.normalizar(mercado[1]) and "nao consta" in dp.marcas_da(mercado[1])):
                problemas.append(f"linha {mercado[0]}: sem pesquisa, escreva '- O que o mercado mostra: só do dossiê, "
                                 "sem pesquisa na internet (não consta no dossiê)'")
            problemas += aspas_da_ficha_citada(mercado[0], mercado[1], pesquisa)
        if tipo and not dp.normalizar(tipo[1].split(":", 1)[1]).startswith(TIPOS_DE_DESCOBERTA):
            problemas.append(f"linha {tipo[0]}: o tipo é um destes: dono e mercado discordam; o cliente fala e a empresa "
                             "não; dúvida que nenhum concorrente responde; duas respostas do dono não batem")
        if tipo and com_pesquisa is False and not dp.normalizar(tipo[1].split(":", 1)[1]).startswith("duas respostas"):
            problemas.append(f"linha {tipo[0]}: sem pesquisa, o tipo é 'duas respostas do dono não batem'")
    problemas += _cruzamentos(texto)
    mais = dp.secao(texto, "mais uma")
    if mais is not None:
        rots = rotulos(mais[1])
        txt, cap = tem_rotulo(rots, "texto"), tem_rotulo(rots, "capitulo")
        if txt is None or "analise" not in dp.marcas_da(txt[1]):
            problemas.append(f"linha {mais[0]}: a seção 'Mais uma' precisa da linha '- Texto: <descoberta curta> (análise: ...)'")
        if cap is None or valor(cap[1]) not in pe.IDS_CAPITULO or valor(cap[1]) == "descobertas":
            problemas.append(f"linha {mais[0]}: a seção 'Mais uma' precisa da linha '- Capítulo: <quem | pensa | quer | forcas | "
                             "decide | onde | sabe | mensagem | nao>', o capítulo para onde ela aponta")
    pular = lambda linha: linha.startswith(("- Tipo:", "- Explicação em até 4 frases:", "- Por que importa:", "- Capítulo:"))  # noqa: E731
    return problemas + exigir_marcas(texto, PERMITIDAS_ANALISE, pular) + conferir_marcas(texto, dossie, casa)


def _so_pesquisa(linha: str) -> bool:
    """A linha tem a marca (pesquisa [n]) sozinha, fora de uma (análise: ...)."""
    return any(m.group(1) == "pesquisa" for m in dp.RE_MARCA.finditer(dp.sem_acento(linha).lower()))


def perguntas_da_regra(casa: Path) -> list[str]:
    """Os motivos das perguntas que a regra da etapa 5 escolhe, na ordem do roteiro e SEM o teto de 5: confronto das
    descobertas, resposta incompleta da análise ('## O que ainda não sabemos') e lacunas da tabela."""
    t1, t3, t4 = (ler(casa, ETAPAS[n][1]) for n in (1, 3, 4))
    tipo = next((valor(l) for l in ler(casa, ETAPAS[0][1]).split("\n") if l.startswith("- Tipo de cliente:")), "")
    blocos = [(int(m.group(1)), m.end()) for m in re.finditer(r"^## Descoberta (\d)\b.*$", t4, re.MULTILINE)]
    corpos = []
    for i, (n, ini) in enumerate(blocos):
        fim = re.search(r"^## ", t4[ini:], re.MULTILINE)
        corpos.append((n, t4[ini:ini + fim.start()] if fim else t4[ini:]))
    motivos = [f"confronto da descoberta {n}" for n, c in corpos if re.search(r"^- Tipo: dono e mercado discordam", c, re.M)]
    for n, c in corpos:
        fazer = re.search(r"^- O que fazer: .*$", c, re.MULTILINE)
        if fazer and "hipotese" in dp.marcas_da(fazer.group(0)) and f"confronto da descoberta {n}" not in motivos:
            motivos.append(f"confronto da descoberta {n}")
    sem_saber = dp.secao(t3, SEM_SABER)
    for _, linha in sem_saber[1] if sem_saber else []:
        m = re.match(r"^- ([^:]{2,60}):\s*([^,]+)", linha.strip())
        if m:
            motivos.append(f"lacuna: {m.group(1)[0].lower()}{m.group(1)[1:]} {m.group(2).strip()}")
    e1 = rotulos(list(enumerate(t1.split("\n"), 1)))
    e3 = rotulos(list(enumerate(t3.split("\n"), 1)))
    for rotulo, linha3 in LACUNAS_ETAPA_5:
        r1, r3 = tem_rotulo(e1, dp.normalizar(rotulo)), tem_rotulo(e3, dp.normalizar(linha3))
        if r1 is None or "nao consta" not in dp.marcas_da(r1[1]) or "dossie" in dp.marcas_da(r1[1]):
            continue
        if r3 is not None and _so_pesquisa(r3[1]):
            continue
        if rotulo.startswith("Quem decide") and not tipo.startswith(("empresa", "os dois")):
            continue
        motivos.append(f"lacuna: {rotulo}")
    return motivos


def etapa_5(casa: Path, dossie: dict) -> list[str]:
    texto = ler(casa, ETAPAS[5][1])
    corpo = dp.secao(texto, "perguntas")
    if corpo is None:
        return ["falta a seção '## Perguntas' (com as perguntas feitas ou a frase de nenhuma pergunta)"]
    problemas: list[str] = []
    feitas, nenhuma = 0, False
    for n, linha in corpo[1]:
        s = linha.strip()
        if not s:
            continue
        if s == NENHUMA_PERGUNTA:
            nenhuma = True
            continue
        m = RE_PERGUNTA.match(s)
        if not m:
            problemas.append(f"linha {n}: fora do formato '- AAAA-MM-DD | Pergunta do time: ... | Motivo: ... | "
                             "Resposta do dono: \"frase literal\"'")
            continue
        feitas += 1
        if not dp.normalizar(m.group(3)).startswith(("lacuna", "confronto")):
            problemas.append(f"linha {n}: o motivo começa por 'lacuna: <dimensão>' ou 'confronto da descoberta N'")
        if not m.group(4).strip():
            problemas.append(f"linha {n}: resposta vazia; copie a frase do dono (\"não sei\" também vale)")
    if feitas > TETO_PERGUNTAS:
        problemas.append(f"{feitas} perguntas: o teto é {TETO_PERGUNTAS}")
    if nenhuma and feitas:
        problemas.append(f"a frase '{NENHUMA_PERGUNTA[2:]}' só vale quando nenhuma pergunta foi feita")
    if nenhuma and not feitas:
        pedidas = perguntas_da_regra(casa)
        if pedidas:
            problemas.append(f"zero perguntas com {len(pedidas)} lacunas que pediam pergunta ({'; '.join(pedidas[:TETO_PERGUNTAS])}): "
                             f"faça ao dono as perguntas que a regra escolhe, uma por mensagem, até {TETO_PERGUNTAS}; a "
                             "frase de nenhuma pergunta só vale quando a regra não escolhe nenhuma")
    if not nenhuma and not feitas:
        problemas.append(f"sem perguntas: escreva '{NENHUMA_PERGUNTA}'")
    return problemas


CAMPOS_DO_SCRIPT = ("versao", "documento", "empresa", "oferta", "tipo_cliente", "onde_atende", "fontes")


def _conferir_estudo(casa: Path, dossie: dict, exigir: tuple[str, ...]) -> list[str]:
    """O persona.md pelo persona_estudo.py (contrato, dossiê, estudo, em dia), montado do 6-estudo.json de agora,
    com os capítulos que a etapa exige; e as marcas linha a linha pelo dossie_para_persona.py --estrito."""
    bruto = ler(casa, pe.ENTRADA)
    if not (casa / PERSONA).is_file():
        return [f"falta {PERSONA}: rode persona_estudo.py montar (ele gera o documento do 6-estudo.json)"]
    texto = ler(casa, PERSONA)
    if not dp.e_estudo(texto):
        return [f"{PERSONA} é do molde antigo: escreva o 6-estudo.json pelo roteiro e rode persona_estudo.py montar"]
    d, problemas = pe.conferir_documento(texto, pe.contexto(casa))
    if d is None:
        return problemas
    try:
        modelo = json.loads(bruto)
    except ValueError:
        return problemas + [f"{pe.ENTRADA} não é JSON válido: confira vírgulas e aspas e rode montar de novo"]
    if not isinstance(modelo, dict):
        return problemas + [f"{pe.ENTRADA} precisa ser um objeto JSON {{ ... }}"]
    abertura = {k: v for k, v in (modelo.get("abertura") or {}).items() if k != "versao"} if isinstance(modelo.get("abertura"), dict) else modelo.get("abertura")
    feito = {k: v for k, v in d.items() if k not in CAMPOS_DO_SCRIPT}
    feito["abertura"] = {k: v for k, v in d.get("abertura", {}).items() if k != "versao"}
    agora = {k: v for k, v in modelo.items() if k not in CAMPOS_DO_SCRIPT}
    agora["abertura"] = abertura
    if feito != agora:
        problemas.append(f"o {PERSONA} não foi montado do {pe.ENTRADA} de agora: rode persona_estudo.py montar de novo")
    for cap in exigir:
        if not d.get(cap):
            problemas.append(f"o estudo está sem o capítulo '{cap}': preencha pelo roteiro desta etapa e rode montar")
    if "mensagem" in exigir and isinstance(d.get("mensagem"), dict):
        m = d["mensagem"]
        for campo, nome in (("promessa_hoje", "a promessa de hoje"), ("promessa_sugerida", "a promessa sugerida"),
                            ("duvidas", "pelo menos uma dúvida com a resposta")):
            if not m.get(campo):
                problemas.append(f"mensagem: falta {nome} ({campo})")
    if "semana" in exigir and isinstance(d.get("semana"), dict) and not 3 <= len(d["semana"].get("acoes") or []) <= 5:
        problemas.append("semana: de 3 a 5 ações, em ordem de prioridade")
    marcas, _ = dp.conferir_documento(texto, dossie, True)
    return problemas + marcas


EXIGIDOS_6 = ("descobertas", "quem", "apostas")
EXIGIDOS_7 = EXIGIDOS_6 + ("mensagem", "semana")


def etapa_6(casa: Path, dossie: dict) -> list[str]:
    return _conferir_estudo(casa, dossie, EXIGIDOS_6)


def etapa_7(casa: Path, dossie: dict) -> list[str]:
    return _conferir_estudo(casa, dossie, EXIGIDOS_7)


def etapa_8(casa: Path, dossie: dict) -> list[str]:
    problemas = etapa_7(casa, dossie)
    if problemas:
        problemas = ["a persona não passa mais na conferência estrita; corrija antes de registrar a revisão:"] + problemas
    texto = ler(casa, ETAPAS[8][1])
    campos = {dp.normalizar(k): v.strip() for k, v in re.findall(r"^- ([^:\n]+):\s*(.*)$", texto, re.MULTILINE)}
    if not campos.get("conferencia mecanica", "").startswith("OK"):
        problemas.append("falta '- Conferência mecânica: OK' (a saída do persona_estudo.py conferir)")
    if campos.get("chamadas do revisor") != "1":
        problemas.append("'- Chamadas do revisor: 1': o revisor é chamado UMA vez por montagem, nunca em loop")
    veredito = campos.get("veredito do revisor", "")
    if veredito not in ("APPROVED", "BLOCKED"):
        problemas.append("'- Veredito do revisor:' é APPROVED ou BLOCKED, a primeira linha da resposta dele")
    if veredito == "BLOCKED":
        for chave, nome in (("o que o revisor apontou", "O que o revisor apontou"), ("correcao feita", "Correção feita")):
            if not campos.get(chave):
                problemas.append(f"veredito BLOCKED: falta '- {nome}: ...' (uma correção só, e segue)")
        if not campos.get("conferencia depois da correcao", "").startswith("OK"):
            problemas.append("veredito BLOCKED: falta '- Conferência depois da correção: OK' (rode montar e o persona_estudo.py conferir de novo)")
    return problemas


def etapa_9(casa: Path, dossie: dict) -> list[str]:
    texto = ler(casa, PERSONA)
    if dp.e_estudo(texto):
        problemas = pe.conferir_documento(texto, pe.contexto(casa))[1] + dp.conferir_documento(texto, dossie, True)[0]
    else:
        problemas = [f"{PERSONA} é do molde antigo: refaça as etapas 6 e 7 (6-estudo.json e persona_estudo.py montar)"]
    ok, motivo = aprovacao.conferir(texto)
    if not ok:
        problemas.append(f"sem o sim do dono valendo: {motivo}")
    return problemas


CONFERIR = {0: etapa_0, 1: etapa_1, 2: etapa_2, 3: etapa_3, 4: etapa_4, 5: etapa_5, 6: etapa_6, 7: etapa_7, 8: etapa_8, 9: etapa_9}


def conferir(casa: Path, etapa: int, dossie: dict) -> list[str]:
    """Lista de problemas da etapa (vazia = OK). Arquivo que falta vira um problema que diz qual etapa fazer."""
    try:
        return CONFERIR[etapa](casa, dossie)
    except Falta as falta:
        dono = next((n for n, (_, arq, _) in ETAPAS.items() if arq == str(falta)), etapa)
        return [f"falta {falta}: " + ("grave o arquivo desta etapa" if dono == etapa else f"faça a etapa {dono} antes")]
    except UnicodeError:
        return [f"um arquivo da etapa {etapa} não está em UTF-8: grave de novo em UTF-8"]


# ---------------------------------------------------------------- linha de comando

def _utf8() -> None:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main(argv: list[str] | None = None) -> int:
    _utf8()
    ap = argparse.ArgumentParser(prog="estudo.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("conferir")
    c.add_argument("--etapa", required=True, type=int, choices=sorted(ETAPAS))
    c.add_argument("--casa", default=".")
    e = sub.add_parser("estado")
    e.add_argument("--casa", default=".")
    try:
        a = ap.parse_args(argv)
    except SystemExit as erro:
        return 2 if erro.code else 0
    casa = Path(a.casa)
    if not casa.is_dir():
        print(f"ERRO: {a.casa} não é uma pasta", file=sys.stderr)
        return 2
    try:
        dossie, _, _ = dp._carregar(casa, None)
    except FileNotFoundError:
        print(f"FALTA: não achei o dossiê em {dp.DOSSIE}. O dossiê vem primeiro (polozi-registrar-dossie); "
              "sem ele não há estudo da persona.", file=sys.stderr)
        return 1
    except dp.VersaoDesconhecida as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: não consegui ler o dossiê ({type(erro).__name__})", file=sys.stderr)
        return 1
    if a.cmd == "conferir":
        nome, arquivo, roteiro = ETAPAS[a.etapa]
        problemas = conferir(casa, a.etapa, dossie)
        for p in problemas:
            print(f"PROBLEMA: {p}")
        if problemas:
            print(f"{len(problemas)} problema(s) na etapa {a.etapa} ({nome}). Corrija {arquivo} e rode de novo.")
            return 1
        seguinte = ETAPAS.get(a.etapa + 1)
        print(f"OK: etapa {a.etapa} ({nome}) conferida."
              + (f" Próxima: etapa {a.etapa + 1} ({seguinte[0]}), leia só {ROTEIROS}/{seguinte[2]}." if seguinte
                 else " O estudo terminou."))
        return 0
    retomar = None
    for n, (nome, arquivo, roteiro) in ETAPAS.items():
        problemas = conferir(casa, n, dossie)
        if not problemas:
            print(f"etapa {n} ({nome}): OK")
            continue
        falta = not (casa / arquivo).is_file() or (n == 9 and not aprovacao.conferir(ler(casa, PERSONA))[0])
        print(f"etapa {n} ({nome}): {'FALTA FAZER' if falta else f'{len(problemas)} PROBLEMA(S)'}")
        retomar = (n, nome, roteiro)
        break
    if retomar is None:
        print("CONCLUÍDO: as 10 etapas conferem. Se o banco estava fora do ar, veja 'Publicar o que ficou pendente' na SKILL.md.")
    else:
        print(f"RETOME: etapa {retomar[0]} ({retomar[1]}). Leia só {ROTEIROS}/{retomar[2]} e rode "
              f"estudo.py conferir --etapa {retomar[0]} ao terminar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
