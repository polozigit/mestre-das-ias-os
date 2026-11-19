#!/usr/bin/env python3
"""dossie_para_persona.py: lê o dossiê gravado da empresa e entrega, por bloco, o que a persona e a marca podem usar.

Duas funções, sem rede e sem escrever nada:

  blocos    (padrão) devolve JSON com as respostas das perguntas relevantes de cada bloco: empresa,
            publico, dor, oferta, concorrencia e tom. Pergunta sem resposta NÃO vira texto: sai em
            `lacunas`, para a skill perguntar ao dono (nunca inventar). O dossiê é a transcrição do que
            o dono disse (estado `fonte`), não fato aprovado. A lista `dimensoes` diz, para cada
            dimensão da persona, que perguntas do dossiê a respondem (códigos v1 e v2), o texto de cada
            uma com a resposta (`respostas`, ou `sem_resposta: true`) e se há resposta ou é lacuna (e o
            que fazer quando falta). --so-dimensoes devolve só o resumo do dossiê e essa lista.
  conferir  confere um documento (persona, identidade, tom) contra o dossiê, sem opinar: toda marca
            "(dossiê X.Y)" aponta para uma pergunta que existe e foi respondida; toda frase entre aspas
            com 4 palavras ou mais está no dossiê ou no anexo do próprio documento; toda marca
            "(relato do dono, AAAA-MM-DD)" tem a data no anexo; toda marca "(pesquisa [n])" aponta para
            uma fonte [n] da seção "Fontes da pesquisa" com URL https e data AAAA-MM-DD; toda marca
            "(dados de clientes, AAAA-MM-DD)" tem a data na subseção "Dados de clientes" do anexo; cada
            referência de "(análise: dossiê B5b + pesquisa [3] + relato AAAA-MM-DD)" vale como a marca
            de evidência correspondente (conclusão do especialista, sempre apoiada em evidência). Sem
            --estrito (tom de voz, identidade), linha de exemplo "Certo:", "Errado:" ou "Exemplo:" que
            termina em "(proposta do time)" não é citação. Com --estrito (persona), toda linha das
            seções de fato tem marca de origem, o cabeçalho declara estado e origem da persona e a
            seção "2. Persona" traz uma linha "- Rótulo: ..." para cada dimensão do molde
            (DIMENSOES_DO_MOLDE); dimensão sem dado vai com (não consta no dossiê) ou (hipótese). O molde
            novo (18/11/2026) pede ainda, no --estrito, a linha "- Oferta em foco:" no cabeçalho, a seção
            "5. Descobertas" (1 a 3, "O que você disse" só com dossiê ou relato) e a seção "6. Plano de
            mensagem" (promessa, provas com evidência, onde e quando, dúvidas com resposta); "Faixa de
            idade" só com evidência e só como faixa. Persona do molde antigo sem elas reprova com a
            seção que falta.
            Estudo do cliente ideal (documento com o bloco ```persona-dados, gerado pelo persona_estudo.py):
            a seção "## Dados para o sistema" é ignorada inteira (o JSON tem aspas que não são fala); as marcas
            e as aspas são conferidas linha a linha como sempre, inclusive (hipótese: razão); com --estrito,
            toda linha de fato tem marca, menos as que começam por um rótulo de recomendação (ROTULOS_ISENTOS)
            e as cobertas pela marca do título ou do último parágrafo do bloco; os títulos e rótulos do molde
            antigo NÃO são exigidos (a estrutura é do persona_estudo.py conferir).

Uso (da raiz do projeto):
  dossie_para_persona.py [blocos] [--casa .] [--bloco publico ...] [--so-dimensoes] [--saida arquivo.json]
  dossie_para_persona.py conferir --arquivo empresa/publico/persona.md [--estrito] [--casa .]

Saída: 0 ok; 1 dossiê ausente ou ilegível (blocos) ou problema achado (conferir); 2 uso errado.
Só stdlib (Python 3.10+). O formato lido é o que polozi-registrar-dossie grava em
contexto/dossie/dossie-completo.md: versão 1 (perguntas 1.1 a 12.x, sem linha de versão) ou versão 2
(página do dossiê no app, perguntas A1 a H8, linha "- Questionário: versão 2" no cabeçalho). Versão
desconhecida é recusada (saída 1), nunca lida como v1.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

DOSSIE = "contexto/dossie/dossie-completo.md"
AVISO_FONTE = "O dossiê é o que o dono disse (transcrição), não fato aprovado. Persona montada daqui nasce como hipótese."
MIN_CONVERSAS = 3  # persona só é "validada" com 3 conversas ou mais com clientes reais

# bloco -> (titulo, codigos das perguntas, observacao quando o dossiê não pergunta direto)
BLOCOS: dict[str, tuple[str, list[str], str]] = {
    "empresa": ("Quem é a empresa", ["1.1", "1.2", "1.3", "1.4", "1.5"], ""),
    "publico": ("Para quem a empresa vende", ["2.3", "2.4", "2.5", "2.6", "2.8", "11.1", "12.1"], ""),
    "dor": ("O que trava o cliente e a venda", ["2.4", "11.3", "12.3"],
            "O dossiê pergunta sobre o negócio, não sobre a dor do cliente: 11.3 e 12.3 são indício; "
            "o que faltar, pergunte ao dono com palavras abertas."),
    "oferta": ("O que a empresa vende e promete", ["1.2", "2.1", "2.2", "2.7", "4.2", "5.1", "5.2"], ""),
    "concorrencia": ("Concorrentes e diferencial", ["4.2", "4.5"],
                     "O dossiê não pergunta quem são os concorrentes (4.5 só compara de passagem): "
                     "se for preciso, pergunte ao dono."),
    "tom": ("Como a empresa fala e o que valoriza", ["1.1", "2.3", "4.2", "5.2", "10.1", "11.2"], ""),
}

VERSOES_CONHECIDAS = ("1", "2")
RE_VERSAO = re.compile(r"^- Questionário: versão (\S+)\s*$")

# versão 2 (página do dossiê no app): mesma forma de BLOCOS, ids v2. Paridade com BLOCOS medida pelo campo v1 do questionário.
BLOCOS_V2: dict[str, tuple[str, list[str], str]] = {
    "empresa": ("Quem é a empresa", ["A1", "A2", "A4", "A5", "A6", "A8", "A9"], ""),
    "publico": ("Para quem a empresa vende", ["B2", "B5a", "B6", "C1", "B7", "C6", "B4"], ""),
    "dor": ("O que trava o cliente e a venda", ["B5a", "B5b", "C3", "C7", "C8"],
            "B5b pergunta direto o problema que o cliente queria resolver; C3, C7 e C8 são indício."),
    "oferta": ("O que a empresa vende e promete", ["A2", "B1", "B3", "C9", "B8", "C10", "C11", "B4", "D5", "D6"], ""),
    "concorrencia": ("Concorrentes e diferencial", ["B8", "H5"],
                     "B8 pergunta direto quem são os concorrentes; H5 compara de passagem."),
    "tom": ("Como a empresa fala, o que valoriza e como é a marca",
            ["A1", "B2", "B8", "C11", "F8", "C2", "D1", "D2", "D3", "D4", "D5", "D6"], ""),
}

# dimensões da persona (método, seção 2) e as perguntas do dossiê que as respondem:
# (chave, dimensão, ids v2, códigos v1, o que fazer se faltar). Os códigos v1 são o campo `v1` das perguntas v2
# (mapa-v1-v2.md do polozi-registrar-dossie); um teste confere a equivalência contra o questionário.
DIMENSOES: list[tuple[str, str, list[str], list[str], str]] = [
    ("perfil", "Perfil do cliente", ["B5a", "B2"], ["2.4", "2.3"], "não consta"),
    ("perfil_empresa", "Perfil da empresa cliente (só se vende para empresa)", ["B5a", "B2"], ["2.4", "2.3"], "não consta"),
    ("quem_decide", "Quem decide e quem participa da compra", [], [], "pergunta ao dono (só se vende para empresa)"),
    ("contexto", "Contexto", ["B5a"], ["2.4"], "hipótese"),
    ("objetivo", "O que quer alcançar", ["B5b", "D5"], [], "hipótese"),
    ("resultado", "O que puxa (resultado esperado)", ["D6", "C10"], ["5.1"], "hipótese"),
    ("dores", "O que empurra (dores)", ["B5b"], [], "pesquisa"),
    ("gatilho", "Gatilho de compra", [], [], "pergunta ao dono"),
    ("objecoes", "Objeções e ansiedades", ["C7"], ["12.3"], "pesquisa"),
    ("habito", "Hábito que segura", [], [], "pergunta ao dono (como resolvia antes)"),
    ("alternativas", "Alternativas reais", ["B8"], ["4.2"], "pesquisa e pergunta ao dono"),
    ("criterios", "Critérios de decisão", ["B8"], ["4.2"], "pesquisa"),
    ("jornada", "Jornada e canais", ["C1", "C2", "C8", "C9"], ["11.1", "2.6", "11.2", "12.4", "12.5", "2.7", "12.6"],
     "não consta"),
    ("consciencia", "Nível de consciência", ["C2", "C7"], ["11.2", "12.3"], "pesquisa"),
    ("linguagem", "Linguagem do cliente", ["D6", "C7"], ["12.3"], "pesquisa e pergunta ao dono"),
    ("nao_cliente", "Quem não é o cliente ideal", ["C6"], ["12.1"], "pergunta ao dono"),
]

# rótulos que a seção "2. Persona" do molde precisa ter (uma linha "- Rótulo: ..." cada), normalizados
DIMENSOES_DO_MOLDE: list[tuple[str, str]] = [
    ("contexto", "Contexto"),
    ("o que quer alcancar", "O que quer alcançar"),
    ("o que empurra", "O que empurra (dores)"),
    ("o que puxa", "O que puxa (resultado esperado)"),
    ("gatilho de compra", "Gatilho de compra"),
    ("objecoes e ansiedades", "Objeções e ansiedades"),
    ("habito que segura", "Hábito que segura"),
    ("alternativas reais", "Alternativas reais"),
    ("criterios de decisao", "Critérios de decisão"),
    ("jornada e canais", "Jornada e canais"),
    ("linguagem do cliente", "Linguagem do cliente"),
]
RE_ROTULO = re.compile(r"^- ([^:]{2,60}):")

RE_CABECALHO = re.compile(r"^# Dossiê da Empresa - (.+)$", re.MULTILINE)
RE_PERGUNTA = re.compile(r"^### (\d{1,2}\.\d{1,2}) - (.+)$", re.MULTILINE)
RE_ESTADO = re.compile(r"^- Estado de extração: (.+?)\s*$", re.MULTILINE)
RE_PERGUNTA_V2 = re.compile(r"^### ([A-H]\d{1,2}[a-z]?) - (.+)$", re.MULTILINE)
RE_RESPOSTA_V2 = re.compile(r"^Resposta (marcada|transcrita)( \((.+)\))?:$")
RE_CODIGOS_V1 = re.compile(r"^- Códigos v1: (\d{1,2}\.\d{1,2}(?:, \d{1,2}\.\d{1,2})*|nenhum \(pergunta nova na v2\))\s*$")
RE_CODIGO_V2 = re.compile(r"\b(\d{1,2}\.\d{1,2}|[a-h]\d{1,2}[a-z]?)\b")
RE_FIM_CORPO_V2 = re.compile(r"^##+ ", re.MULTILINE)
SEM_RESPOSTA = "Nenhuma resposta identificada."

SECOES_LIVRES = ("anexo", "o que ainda nao sabemos", "como validar", "fontes da pesquisa")  # texto de método, não afirma fato
RE_MARCA = re.compile(r"\((dossie|relato do dono|hipotese|nao consta|material do dono|proposta do time|pesquisa|dados de clientes|analise)\b([^)]*)\)")
# referências dentro de "(análise: dossiê B5b + pesquisa [3] + relato 2026-11-18)", já sem acento e em minúsculas
RE_ANALISE_DOSSIE = re.compile(r"^dossie\s+(.+)$")
RE_ANALISE_PESQUISA = re.compile(r"^pesquisa\s+((?:\[\d{1,3}\][\s,e]*)+)$")
RE_ANALISE_RELATO = re.compile(r"^relato(?: do dono)?,?\s+(\d{4}-\d{2}-\d{2})$")
EVIDENCIA = ("dossie", "relato do dono", "pesquisa", "material do dono", "dados de clientes")
# molde novo (18/11/2026, spec persona-especialista): seções 5 e 6 e a linha da oferta em foco
CAB_DESCOBERTAS = "descoberta"  # primeira coluna da tabela de descobertas (normalizada)
CAB_DUVIDAS = "duvida do cliente"
ROTULOS_DO_PLANO = (("promessa central", "Promessa central"), ("provas", "Provas"), ("onde e quando falar", "Onde e quando falar"))
MAX_DESCOBERTAS = 3
RE_REF = re.compile(r"\[(\d{1,3})\]")
RE_FONTE_LINHA = re.compile(r"^- \[(\d{1,3})\]")
RE_FONTE = re.compile(r"^- \[(\d{1,3})\] .+?(https://\S+?)\.?\s+Acessado em (\d{4}-\d{2}-\d{2})\.?\s*$")
# exemplo de tom de voz: não é fala de cliente, então não pede o literal (só fora do --estrito)
RE_EXEMPLO = re.compile(r"^(?:- (?:Certo|Errado):|.*\bExemplo:).*\(proposta do time\)\.?\s*$")
RE_CODIGO = re.compile(r"\b(\d{1,2}\.\d{1,2})\b")
RE_DATA = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
RE_ASPAS = re.compile(r'"([^"\n]{8,})"|“([^”\n]{8,})”')
RE_MODELO = re.compile(r"<(?!https?://)(?![^<>\n]*@)[A-Za-zÀ-ÿ#][^<>\n]{2,120}>")  # igual à do publicar_documento.py
RE_APROVACAO = re.compile(r"^Aprovado pelo dono em\b")  # a frase do dono é dele e pode ter qualquer sinal
RE_SEPARADOR = re.compile(r"\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?")  # linha |---|---| de tabela
# estudo do cliente ideal (contrato persona-dados v1): o bloco, a seção dele e as linhas sem marca por natureza
RE_CERCA_ESTUDO = re.compile(r"^```persona-dados[ \t]*$", re.MULTILINE)
TITULO_DADOS = "## Dados para o sistema"
ROTULOS_ISENTOS = ("Por que importa:", "O que fazer:", "O que isso pede:", "Como virar:", "Como chegar:", "O que dizer:",
                   "Como confirmar:", "Por que acredito:", "Tempo:", "Resolve:", "Motivo da troca:", "Como testar:",
                   "Falta confirmar:", "Prova que falta:", "Ressalva:", "O material não alcançou:", "Eixos:",
                   "Conversas:", "Pergunta:")
# nome do arquétipo, inclinação da balança e degrau da escada: o JSON não lhes dá origem (contrato 2.4, 2.9, 2.12)
ESTRUTURAIS_DO_ESTUDO = ("Arquétipo:", "Inclinação:")
RE_DEGRAU = re.compile(r"^Degrau [1-5], ")
RE_ITEM_NUMERADO = re.compile(r"^\d+\. ")


def sem_acento(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")


def normalizar(texto: str) -> str:
    """Minúsculas, sem acento, sem pontuação, espaço único: para comparar frase com fonte."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", sem_acento(texto).lower()).split())


# ---------------------------------------------------------------- leitura do dossiê

class VersaoDesconhecida(ValueError):
    """O cabeçalho declara uma versão do questionário que este leitor não conhece (ou declara mais de uma)."""

    def __init__(self, versao: str):
        super().__init__(versao)
        self.versao = versao

    def mensagem(self, arquivo: str = "o dossiê") -> str:
        return (f"{arquivo} é da versão {self.versao} do questionário; este leitor conhece as versões 1 e 2. "
                "Atualize o kit antes de montar persona ou marca.")

    arquivo = "o dossiê"

    def with_arquivo(self, arquivo: str) -> "VersaoDesconhecida":
        self.arquivo = arquivo
        return self

    def __str__(self) -> str:
        return self.mensagem(self.arquivo)


def _normalizar_texto(texto: str) -> str:
    return texto.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")


def versao_declarada(texto: str) -> str:
    """'1' (sem linha de versão) ou o valor da linha '- Questionário: versão N' do cabeçalho (antes do 1º '## ')."""
    cabecalho = re.split(r"^## ", _normalizar_texto(texto), maxsplit=1, flags=re.MULTILINE)[0]
    linhas = [l for l in cabecalho.split("\n") if l.startswith("- Questionário:")]
    if not linhas:
        return "1"
    achada = RE_VERSAO.match(linhas[0])
    valor = achada.group(1) if achada else linhas[0].split(":", 1)[1].strip()
    if len(linhas) > 1 or not achada or valor not in VERSOES_CONHECIDAS:
        raise VersaoDesconhecida(valor if len(linhas) == 1 else "duplicada")
    return valor


def ler_dossie(texto: str) -> dict:
    """Despacha pela versão declarada no cabeçalho: v1 (_ler_v1, sem mudança) ou v2 (_ler_v2)."""
    return _ler_v2(texto) if versao_declarada(texto) == "2" else _ler_v1(texto)


def _ler_v1(texto: str) -> dict:
    """{'empresa','registro','estado_global','perguntas': {codigo: {pergunta, estado, respostas}}}."""
    texto = texto.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    cab = RE_CABECALHO.search(texto)
    info = {"empresa": cab.group(1).strip() if cab else "", "registro": "", "estado_global": ""}
    for chave, rotulo in (("registro", "Registro"), ("estado_global", "Estado global")):
        achado = re.search(rf"^- {rotulo}: (.+?)\s*$", texto, re.MULTILINE)
        if achado:
            info[chave] = achado.group(1)
    perguntas: dict[str, dict] = {}
    marcas = list(RE_PERGUNTA.finditer(texto))
    for i, m in enumerate(marcas):
        fim = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
        corpo = texto[m.end():fim]
        corpo = re.split(r"^## ", corpo, maxsplit=1, flags=re.MULTILINE)[0]  # não vaza para a próxima seção
        est = RE_ESTADO.search(corpo)
        respostas: list[str] = []
        atual: list[str] | None = None  # bloco citado ("> ...") que vem depois de "Resposta transcrita:"
        for linha in corpo.split("\n"):
            if linha.strip() == "Resposta transcrita:":
                if atual:
                    respostas.append("\n".join(atual).strip())
                atual = []
            elif atual is not None and linha.startswith(">"):
                atual.append(linha[2:] if linha.startswith("> ") else linha[1:])
            elif atual is not None:  # linha fora da citação fecha a resposta
                if atual:
                    respostas.append("\n".join(atual).strip())
                atual = None
        if atual:
            respostas.append("\n".join(atual).strip())
        respostas = [r for r in respostas if r and r != SEM_RESPOSTA]
        perguntas[m.group(1)] = {"pergunta": m.group(2).strip(), "estado": est.group(1) if est else "ausente",
                                 "respostas": respostas}
    return {**info, "perguntas": perguntas}


def _ler_v2(texto: str) -> dict:
    """Versão 2: {'versao': 2, 'empresa','registro','estado_global','perguntas': {id: {pergunta, estado, respostas,
    partes, codigos_v1, modo, atencao}}}. Só vira texto o que está em linha '>' logo depois de
    'Resposta marcada|transcrita (rótulo):'; a barra do escape '\\[' é mantida."""
    texto = _normalizar_texto(texto)
    cab = RE_CABECALHO.search(texto)
    topo = re.split(r"^## ", texto, maxsplit=1, flags=re.MULTILINE)[0]
    info = {"empresa": cab.group(1).strip() if cab else "", "registro": "", "estado_global": ""}
    for chave, rotulo in (("registro", "Registro"), ("estado_global", "Estado global")):
        achado = re.search(rf"^- {rotulo}: (.+?)\s*$", topo, re.MULTILINE)
        if achado:
            info[chave] = achado.group(1)
    perguntas: dict[str, dict] = {}
    marcas = list(RE_PERGUNTA_V2.finditer(texto))
    for m in marcas:
        resto = texto[m.end():]
        fim = RE_FIM_CORPO_V2.search(resto)
        corpo = resto[:fim.start()] if fim else resto
        estado, codigos, modo, atencao = "ausente", [], "", False
        partes: list[dict] = []
        grupo: dict | None = None
        em_metadado = True
        for linha in corpo.split("\n"):
            r = RE_RESPOSTA_V2.match(linha)
            if r:
                em_metadado = False
                grupo = {"tipo": r.group(1), "rotulo": r.group(3) or "", "linhas": []}
                partes.append(grupo)
            elif em_metadado:
                if linha.startswith("- Estado de extração: "):
                    estado = linha[len("- Estado de extração: "):].strip()
                elif linha.startswith("- Códigos v1:"):
                    cv = RE_CODIGOS_V1.match(linha)
                    codigos = re.findall(r"\d{1,2}\.\d{1,2}", cv.group(1)) if cv else []
                elif linha.startswith("- Modo da resposta: "):
                    modo = linha[len("- Modo da resposta: "):].strip()
                elif linha.startswith("- Atenção:"):
                    atencao = True
            elif grupo is not None and linha.startswith(">"):
                grupo["linhas"].append(linha[2:] if linha.startswith("> ") else linha[1:])
            else:
                grupo = None  # linha sem '>' fecha o grupo; '>' sem grupo aberto é ignorada
        saida_partes = []
        for g in partes:
            valor = "\n".join(g["linhas"]).strip()
            if valor and valor != SEM_RESPOSTA:
                saida_partes.append({"tipo": g["tipo"], "rotulo": g["rotulo"], "texto": valor})
        item = {"pergunta": m.group(2).strip(), "estado": estado, "respostas": [p["texto"] for p in saida_partes],
                "partes": saida_partes, "codigos_v1": codigos, "modo": modo, "atencao": atencao}
        perguntas[m.group(1)] = item
    return {"versao": 2, **info, "perguntas": perguntas}


def _montar_blocos_v2(dossie: dict, so: list[str] | None = None) -> dict:
    perguntas = dossie["perguntas"]
    blocos: dict[str, dict] = {}
    lacunas: list[dict] = []
    for nome, (titulo, ids, obs) in BLOCOS_V2.items():
        if so and nome not in so:
            continue
        itens, sem, nao_se_aplica = [], [], []
        for cod in ids:
            p = perguntas.get(cod)
            if cod not in perguntas:
                item = {"codigo": cod, "pergunta": "(pergunta não consta neste dossiê)", "estado": "ausente",
                        "respostas": [], "partes": [], "codigos_v1": []}
            else:
                item = {"codigo": cod, "pergunta": p["pergunta"], "estado": p["estado"], "respostas": p["respostas"],
                        "partes": p["partes"], "codigos_v1": p["codigos_v1"]}
                if p["modo"]:
                    item["modo"] = p["modo"]
                if p["atencao"]:
                    item["atencao"] = True
            itens.append(item)
            if item["estado"] == "não se aplica":
                nao_se_aplica.append(cod)
            elif item["estado"] != "respondida":
                sem.append(cod)
                lacunas.append({"bloco": nome, "codigo": cod, "pergunta": item["pergunta"], "estado": item["estado"]})
        bloco = {"titulo": titulo, "perguntas": itens, "sem_resposta": sem, "nao_se_aplica": nao_se_aplica}
        if obs:
            bloco["observacao"] = obs
        blocos[nome] = bloco
    return {"blocos": blocos, "lacunas": lacunas}


def montar_blocos(dossie: dict, so: list[str] | None = None) -> dict:
    if dossie.get("versao", 1) == 2:
        return _montar_blocos_v2(dossie, so)
    perguntas = dossie["perguntas"]
    blocos: dict[str, dict] = {}
    lacunas: list[dict] = []
    for nome, (titulo, codigos, obs) in BLOCOS.items():
        if so and nome not in so:
            continue
        itens, sem = [], []
        for cod in codigos:
            p = perguntas.get(cod, {"pergunta": "(pergunta não consta neste dossiê)", "estado": "ausente", "respostas": []})
            itens.append({"codigo": cod, **p})
            if p["estado"] != "respondida":
                sem.append(cod)
                lacunas.append({"bloco": nome, "codigo": cod, "pergunta": p["pergunta"], "estado": p["estado"]})
        bloco = {"titulo": titulo, "perguntas": itens, "sem_resposta": sem}
        if obs:
            bloco["observacao"] = obs
        blocos[nome] = bloco
    return {"blocos": blocos, "lacunas": lacunas}


def montar_dimensoes(dossie: dict) -> list[dict]:
    """Para cada dimensão da persona: as perguntas do dossiê que a respondem (na versão deste dossiê, com o estado
    de cada uma, o texto dela e a resposta em `respostas`, ou `sem_resposta: true`), os códigos das duas versões e se
    há resposta (`respondida`) ou é `lacuna`. Pergunta que o dossiê não tem conta como ausente. Dimensão que o dossiê
    não pergunta é sempre lacuna."""
    v2 = dossie.get("versao", 1) == 2
    perguntas = dossie["perguntas"]
    saida: list[dict] = []
    for chave, nome, ids_v2, cods_v1, se_faltar in DIMENSOES:
        itens = []
        for cod in (ids_v2 if v2 else cods_v1):
            p = perguntas.get(cod)
            estado = p["estado"] if p else "ausente"
            # o texto da pergunta e a resposta, para a etapa 1 se resolver só com esta lista (aditivo, 18/11/2026)
            pergunta = {"codigo": cod, "estado": estado,
                        "pergunta": p["pergunta"] if p else "(pergunta não consta neste dossiê)",
                        "respostas": list(p["respostas"]) if p and estado == "respondida" else []}
            if not pergunta["respostas"]:
                pergunta["sem_resposta"] = True
            itens.append(pergunta)
        respondida = any(i["estado"] == "respondida" for i in itens)
        item = {"chave": chave, "dimensao": nome, "codigos_v2": list(ids_v2), "codigos_v1": list(cods_v1),
                "perguntas": itens, "situacao": "respondida" if respondida else "lacuna", "se_faltar": se_faltar}
        if not itens:
            item["observacao"] = "o dossiê não pergunta isto"
        saida.append(item)
    return saida


def resumo_dossie(dossie: dict, caminho: str, dados: bytes) -> dict:
    estados = [p["estado"] for p in dossie["perguntas"].values()]
    if dossie.get("versao", 1) == 2:
        return {
            "arquivo": caminho, "empresa": dossie["empresa"], "registro": dossie["registro"],
            "estado_global": dossie["estado_global"], "sha256": hashlib.sha256(dados).hexdigest(),
            "total_perguntas": len(estados), "respondidas": estados.count("respondida"),
            "nao_sei": estados.count("não sei"), "duplicadas": 0, "ausentes": estados.count("ausente"),
            "versao": 2, "nao_se_aplica": estados.count("não se aplica"),
            "atencao": sum(1 for p in dossie["perguntas"].values() if p["atencao"]),
        }
    return {
        "arquivo": caminho,
        "empresa": dossie["empresa"],
        "registro": dossie["registro"],
        "estado_global": dossie["estado_global"],
        "sha256": hashlib.sha256(dados).hexdigest(),
        "total_perguntas": len(estados),
        "respondidas": estados.count("respondida"),
        "nao_sei": estados.count("não sei"),
        "duplicadas": estados.count("duplicada"),
        "ausentes": estados.count("ausente"),
    }


# ---------------------------------------------------------------- conferência de um documento

def secoes(texto: str) -> list[tuple[str, int, list[tuple[int, str]]]]:
    """[(título normalizado, número da linha do título, [(nº da linha, texto)])] por seção '## '."""
    saida: list[tuple[str, int, list[tuple[int, str]]]] = []
    atual: tuple[str, int, list[tuple[int, str]]] | None = None
    for n, linha in enumerate(texto.split("\n"), 1):
        if linha.startswith("## "):
            titulo = normalizar(re.sub(r"^\d+\.\s*", "", linha[3:]))
            atual = (titulo, n, [])
            saida.append(atual)
        elif atual is not None:
            atual[2].append((n, linha))
    return saida


def _linhas_de_fato(texto: str, pular: tuple[str, ...] = ()) -> list[tuple[int, str]]:
    """Linhas das seções de fato: sem título, sem linha em branco, sem separador nem cabeçalho de tabela.
    `pular`: começos de título (normalizados) de seções que ficam de fora desta vez."""
    achadas: list[tuple[int, str]] = []
    for titulo, _, linhas in secoes(texto):
        if titulo.startswith(SECOES_LIVRES) or (pular and titulo.startswith(pular)):
            continue
        for i, (n, linha) in enumerate(linhas):
            s = linha.strip()
            if not s or s.startswith("#") or RE_SEPARADOR.fullmatch(s):
                continue
            if s.startswith("|") and i + 1 < len(linhas) and RE_SEPARADOR.fullmatch(linhas[i + 1][1].strip()):
                continue  # cabeçalho da tabela: a linha logo antes do separador |---|
            achadas.append((n, s))
    return achadas


def dimensoes_que_faltam(texto: str) -> list[str] | None:
    """Rótulos do molde que faltam na seção "2. Persona" (a que começa com "Persona"). None = não há essa seção."""
    for titulo, _, linhas in secoes(texto):
        if not titulo.startswith("persona"):
            continue
        rotulos = []
        for _, linha in linhas:
            m = RE_ROTULO.match(linha.strip())
            if m:
                rotulos.append(normalizar(m.group(1)))
        return [nome for chave, nome in DIMENSOES_DO_MOLDE if not any(r.startswith(chave) for r in rotulos)]
    return None


def marcas_da(celula: str) -> list[str]:
    """Tipos de marca de origem (sem acento) achados num pedaço de texto."""
    return [m.group(1) for m in RE_MARCA.finditer(sem_acento(celula).lower())]


def _cita_pesquisa(celula: str) -> bool:
    """A célula se apoia na pesquisa: marca (pesquisa [n]) ou (análise: ... pesquisa [n] ...)."""
    for m in RE_MARCA.finditer(sem_acento(celula).lower()):
        if m.group(1) == "pesquisa" or (m.group(1) == "analise" and re.search(r"pesquisa\s*\[\d", m.group(2))):
            return True
    return False


def linhas_da_tabela(linhas: list[tuple[int, str]], primeira_coluna: str) -> list[tuple[int, list[str]]]:
    """Linhas de dados da tabela cujo cabeçalho começa por `primeira_coluna` (normalizada): [(nº, células)]."""
    saida: list[tuple[int, list[str]]] = []
    dentro = False
    for i, (n, linha) in enumerate(linhas):
        s = linha.strip()
        if not s.startswith("|"):
            dentro = False
            continue
        celulas = [c.strip() for c in s.strip("|").split("|")]
        if RE_SEPARADOR.fullmatch(s):
            continue
        proxima = linhas[i + 1][1].strip() if i + 1 < len(linhas) else ""
        if RE_SEPARADOR.fullmatch(proxima):  # cabeçalho
            dentro = normalizar(celulas[0]).startswith(primeira_coluna)
            continue
        if dentro:
            saida.append((n, celulas))
    return saida


def secao(texto: str, comeco: str) -> tuple[int, list[tuple[int, str]]] | None:
    """(nº da linha do título, linhas) da primeira seção '## ' cujo título normalizado começa por `comeco`."""
    for titulo, n, linhas in secoes(texto):
        if titulo.startswith(comeco):
            return n, linhas
    return None


def conferir_descobertas(texto: str) -> list[str]:
    """Seção "5. Descobertas" do molde novo: tabela com 1 a 3 descobertas, cada célula com marca; "O que você disse"
    só com o que o dono disse (dossiê ou relato); "O que o mercado mostra" apoiado na pesquisa, ou dizendo que não
    houve pesquisa."""
    achada = secao(texto, "descobertas")
    if achada is None:
        return ["falta a seção '## 5. Descobertas' do molde novo da persona: copie a tabela das descobertas da etapa 4 "
                "(documento do molde antigo: refaça pelo roteiro da skill, etapas 4 a 7)"]
    problemas: list[str] = []
    linhas = linhas_da_tabela(achada[1], CAB_DESCOBERTAS)
    if not 1 <= len(linhas) <= MAX_DESCOBERTAS:
        problemas.append(f"linha {achada[0]}: a seção Descobertas precisa de 1 a {MAX_DESCOBERTAS} linhas na tabela "
                         f"'| Descoberta | O que você disse | O que o mercado mostra | O que fazer |' (achei {len(linhas)})")
    for n, celulas in linhas:
        if len(celulas) != 4:
            problemas.append(f"linha {n}: a linha da descoberta precisa de 4 colunas (descoberta, o que você disse, "
                             f"o que o mercado mostra, o que fazer); achei {len(celulas)}")
            continue
        for nome, celula in zip(("Descoberta", "O que você disse", "O que o mercado mostra", "O que fazer"), celulas):
            if not marcas_da(celula):
                problemas.append(f"linha {n}: a coluna '{nome}' da descoberta está sem marca de origem")
        disse = marcas_da(celulas[1])
        if disse and not set(disse) <= {"dossie", "relato do dono"}:
            problemas.append(f"linha {n}: 'O que você disse' só leva o que o dono disse, com (dossiê CÓDIGO) ou "
                             "(relato do dono, data); conclusão do especialista vai na coluna 'Descoberta'")
        mercado = celulas[2]
        sem_pesquisa = "sem pesquisa" in normalizar(mercado) and "nao consta" in marcas_da(mercado)
        if marcas_da(mercado) and not _cita_pesquisa(mercado) and not sem_pesquisa:
            problemas.append(f"linha {n}: 'O que o mercado mostra' precisa citar a pesquisa ((pesquisa [n]) ou "
                             "(análise: ... pesquisa [n])); sem pesquisa, escreva 'sem pesquisa na internet desta vez "
                             "(não consta no dossiê)'")
    return problemas


def conferir_plano(texto: str) -> list[str]:
    """Seção "6. Plano de mensagem": promessa central, provas e onde e quando falar, cada uma com marca, e a tabela
    '| Dúvida do cliente | Resposta pronta |' com pelo menos 1 dúvida respondida. Provas pedem evidência."""
    achada = secao(texto, "plano de mensagem")
    if achada is None:
        return ["falta a seção '## 6. Plano de mensagem' do molde novo da persona (etapa 7 do roteiro)"]
    n0, linhas = achada
    problemas: list[str] = []
    rotulos: dict[str, tuple[int, str]] = {}
    for n, linha in linhas:
        m = RE_ROTULO.match(linha.strip())
        if m:
            rotulos.setdefault(normalizar(m.group(1)), (n, linha))
    for chave, nome in ROTULOS_DO_PLANO:
        if chave not in rotulos:
            problemas.append(f"linha {n0}: o Plano de mensagem está sem a linha '- {nome}: ...' com a origem")
            continue
        n, linha = rotulos[chave]
        tipos = marcas_da(linha)
        if not tipos:
            problemas.append(f"linha {n}: '{nome}' sem marca de origem")
        elif chave == "provas" and not set(tipos) & {*EVIDENCIA, "nao consta"}:
            problemas.append(f"linha {n}: 'Provas' precisa de evidência ((dossiê CÓDIGO), (relato do dono, data) ou "
                             "(pesquisa [n])); hipótese não prova nada. Sem prova, escreva 'ainda não temos prova "
                             "(não consta no dossiê)'")
    duvidas = linhas_da_tabela(linhas, CAB_DUVIDAS)
    if not duvidas:
        problemas.append(f"linha {n0}: o Plano de mensagem precisa da tabela '| Dúvida do cliente | Resposta pronta |' "
                         "com pelo menos 1 dúvida e a resposta")
    for n, celulas in duvidas:
        if len(celulas) != 2 or not all(c and marcas_da(c) for c in celulas):
            problemas.append(f"linha {n}: cada dúvida precisa da resposta pronta, e as duas colunas com marca de origem")
    return problemas


def conferir_molde_novo(texto: str, exigir_plano: bool = True) -> list[str]:
    """O que o molde novo (persona-especialista, 18/11/2026) acrescenta: a linha '- Oferta em foco:' no cabeçalho,
    a faixa de idade só com evidência, as Descobertas e o Plano de mensagem (este só se `exigir_plano`)."""
    problemas: list[str] = []
    oferta = re.search(r"^- Oferta em foco:\s*(.*)$", texto, re.MULTILINE)
    if not oferta:
        problemas.append("cabeçalho sem a linha '- Oferta em foco: <oferta> (dossiê B3)' do molde novo (etapa 0)")
    elif not set(marcas_da(oferta.group(1))) & {"dossie", "relato do dono"}:
        problemas.append("a linha '- Oferta em foco:' precisa de (dossiê CÓDIGO) ou (relato do dono, data)")
    persona = secao(texto, "persona")
    for n, linha in (persona[1] if persona else []):
        m = RE_ROTULO.match(linha.strip())
        if not m or not normalizar(m.group(1)).startswith("faixa de idade"):
            continue
        tipos = marcas_da(linha)
        if not set(tipos) & {*EVIDENCIA, "analise"}:
            problemas.append(f"linha {n}: 'Faixa de idade' só entra com evidência (dossiê, relato do dono, pesquisa ou "
                             "análise); sem evidência, apague a linha")
        numeros = re.findall(r"\d+", RE_MARCA.sub("", sem_acento(linha).lower()))
        if len(numeros) == 1:
            problemas.append(f"linha {n}: idade só como faixa (por exemplo 'de 30 a 45 anos'), nunca idade exata")
    problemas += conferir_descobertas(texto)
    if exigir_plano:
        problemas += conferir_plano(texto)
    elif secao(texto, "plano de mensagem") is None:
        problemas.append("falta a seção '## 6. Plano de mensagem' (na etapa 6 ela fica só com o título; a etapa 7 a preenche)")
    return problemas


def e_estudo(texto: str) -> bool:
    """O documento é o estudo do cliente ideal novo: traz o bloco ```persona-dados."""
    return bool(RE_CERCA_ESTUDO.search(texto))


def sem_dados(texto: str) -> str:
    """O texto com a seção 'Dados para o sistema' em branco (mesmo número de linhas): o JSON não é fala."""
    linhas = texto.split("\n")
    for i, l in enumerate(linhas):
        if l.rstrip() == TITULO_DADOS:
            return "\n".join(linhas[:i] + [""] * (len(linhas) - i))
    return texto


def _tem_marca(linha: str) -> bool:
    return bool(RE_MARCA.search(sem_acento(linha).lower()))


def _sem_prefixo(linha: str) -> str:
    return re.sub(r"^(?:- |\d+\. )", "", linha.strip())


def linhas_sem_marca_do_estudo(texto: str) -> list[tuple[int, str]]:
    """Linhas de fato do estudo sem marca de origem e sem desculpa: rótulo de recomendação, nome do arquétipo,
    inclinação, degrau e ação numerada não levam marca; o corpo da descoberta (primeira linha depois de um título
    '### ' com marca) e os parágrafos sem marca seguidos, sem quebra, de um parágrafo com marca ficam cobertos."""
    achadas: list[tuple[int, str]] = []
    for titulo, _, linhas in secoes(texto):
        if titulo.startswith(SECOES_LIVRES) or titulo.startswith("dados para o sistema"):
            continue
        for i, (n, linha) in enumerate(linhas):
            s = linha.strip()
            if not s or s.startswith("#") or _tem_marca(s):
                continue
            corpo = _sem_prefixo(s)
            if RE_ITEM_NUMERADO.match(s) or corpo.startswith(ROTULOS_ISENTOS + ESTRUTURAIS_DO_ESTUDO) or RE_DEGRAU.match(corpo):
                continue
            anterior = next((l.strip() for _, l in reversed(linhas[:i]) if l.strip()), "")
            if anterior.startswith("### ") and _tem_marca(anterior):
                continue
            coberta = False
            for _, seguinte in linhas[i + 1:]:
                t = seguinte.strip()
                if not t or t.startswith("#") or _sem_prefixo(t).startswith(ROTULOS_ISENTOS):
                    break
                if _tem_marca(t):
                    coberta = True
                    break
            if not coberta:
                achadas.append((n, s))
    return achadas


def conferir_documento(texto: str, dossie: dict, estrito: bool = False, *, pesquisa_e_dados: bool = True,
                       isentar_exemplos: bool = False, exigir_dimensoes: bool | None = None,
                       exigir_molde_novo: bool | None = None, exigir_plano: bool = True) -> tuple[list[str], int]:
    """(problemas, quantas marcas de dossiê foram conferidas).

    exigir_dimensoes: a seção "2. Persona" precisa de uma linha por dimensão do molde (DIMENSOES_DO_MOLDE).
    Padrão: igual a `estrito` (a persona). Só o teste que reusa persona do molde antigo desliga.

    exigir_molde_novo: oferta em foco, Descobertas e Plano de mensagem (conferir_molde_novo). Padrão: igual a
    `estrito`. exigir_plano=False é a etapa 6 do roteiro: o Plano ainda é só o título (a etapa 7 o preenche).

    Marca (análise: ...): cada referência depois de "análise:" (dossiê CÓDIGO, pesquisa [n], relato AAAA-MM-DD,
    separadas por "+") é conferida como a marca de evidência correspondente.

    pesquisa_e_dados: confere as marcas (pesquisa [n]) contra "Fontes da pesquisa" e (dados de clientes, data)
    contra o Anexo (persona). A identidade e o tom de voz usam as fontes tipadas de "## 9. Fontes" e quem as
    confere é o marca_dados.py, que desliga esta parte.
    isentar_exemplos: sem --estrito, linha de exemplo ("- Certo:", "- Errado:" ou com "Exemplo:") que termina em
    "(proposta do time)" não é citação. Desligado por padrão: o conferidor de marca (marca_dados.py) tem a sua
    própria exceção e o comando `conferir` continua reprovando essa linha.
    """
    texto = texto.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    estudo = e_estudo(texto)
    if estudo:  # o JSON do bloco não é fala nem afirmação: fica de fora inteiro
        texto = sem_dados(texto)
        exigir_dimensoes = exigir_molde_novo = False
    problemas: list[str] = []
    perguntas = dossie["perguntas"]
    for n, linha in enumerate(texto.split("\n"), 1):
        if RE_APROVACAO.match(linha):
            continue
        sobra = RE_MODELO.search(linha)
        if sobra:
            problemas.append(f"linha {n}: sobrou texto de modelo sem preencher: {sobra.group(0)[:50]}")
    fonte_literal = normalizar(
        " ".join(r for p in perguntas.values() for r in p["respostas"]))
    anexo = " ".join(l for t, _, ls in secoes(texto) if t.startswith("anexo") for _, l in ls)
    datas_do_anexo = {m for m in RE_DATA.findall(anexo)}
    # só as datas da subseção "### Dados de clientes" do anexo valem para a marca (dados de clientes, data)
    datas_dos_dados: set[str] = set()
    for titulo, _, linhas in secoes(texto):
        if not titulo.startswith("anexo"):
            continue
        nos_dados = False
        for _, linha in linhas:
            if linha.startswith("### "):
                nos_dados = normalizar(linha[4:]).startswith("dados de clientes")
            elif nos_dados:
                datas_dos_dados.update(RE_DATA.findall(linha))
    # fontes da pesquisa: cada "- [n] ..." precisa de URL https e data AAAA-MM-DD
    fontes: set[int] = set()
    for titulo, _, linhas in secoes(texto):
        if not titulo.startswith("fontes da pesquisa"):
            continue
        for n, linha in linhas:
            ref = RE_FONTE_LINHA.match(linha)
            if not ref:
                continue
            if RE_FONTE.match(linha.rstrip()):
                fontes.add(int(ref.group(1)))
            else:
                problemas.append(f"linha {n}: fonte [{ref.group(1)}] sem URL https ou sem data AAAA-MM-DD")
    literal = fonte_literal + " " + normalizar(anexo)
    v2 = dossie.get("versao", 1) == 2
    ids_v2 = {i.lower(): i for i in perguntas}
    apelidos: dict[str, list[str]] = {}
    if v2:
        for i, p in perguntas.items():
            for cod in p["codigos_v1"]:
                apelidos.setdefault(cod, []).append(i)
    conferidas = 0

    def codigos_do_dossie(n: int, resto: str) -> int:
        """Confere os códigos de pergunta de uma marca (dossiê ...) ou de uma referência 'dossiê ...' da análise."""
        achados = 0
        if v2:
            codigos = RE_CODIGO_V2.findall(resto)
            if not codigos:
                problemas.append(f"linha {n}: marca (dossiê) sem número de pergunta")
            for cod in codigos:
                achados += 1
                via = ""
                if cod in ids_v2:
                    alvo_id = ids_v2[cod]
                elif cod in apelidos and len(apelidos[cod]) > 1:
                    problemas.append(f"linha {n}: o código {cod} aponta para mais de uma pergunta do dossiê "
                                     f"({', '.join(apelidos[cod])})")
                    continue
                elif cod in apelidos:
                    alvo_id = apelidos[cod][0]
                    via = f" ({alvo_id} na versão 2)"
                else:
                    problemas.append(f"linha {n}: cita a pergunta {cod.upper()}, que não existe no dossiê")
                    continue
                if perguntas[alvo_id]["estado"] != "respondida":
                    problemas.append(f"linha {n}: cita a pergunta {cod.upper() if not via else cod}{via}, "
                                     f"mas o dossiê a deixou {perguntas[alvo_id]['estado']}")
            return achados
        codigos = RE_CODIGO.findall(resto)
        if not codigos:
            problemas.append(f"linha {n}: marca (dossiê) sem número de pergunta")
        for cod in codigos:
            achados += 1
            p = perguntas.get(cod)
            if p is None:
                problemas.append(f"linha {n}: cita a pergunta {cod}, que não existe no dossiê")
            elif p["estado"] != "respondida":
                problemas.append(f"linha {n}: cita a pergunta {cod}, mas o dossiê a deixou {p['estado']}")
        return achados

    def relato(n: int, resto: str) -> None:
        data = RE_DATA.search(resto)
        if not data:
            problemas.append(f"linha {n}: marca (relato do dono) sem data AAAA-MM-DD")
        elif data.group(1) not in datas_do_anexo:
            problemas.append(f"linha {n}: relato do dono de {data.group(1)} sem registro no Anexo do documento")

    def pesquisa(n: int, resto: str) -> None:
        refs = RE_REF.findall(resto)
        if not refs:
            problemas.append(f"linha {n}: marca (pesquisa) sem número de fonte [n]")
        for ref in refs:
            if int(ref) not in fontes:
                problemas.append(f"linha {n}: cita a fonte [{ref}], que não está em Fontes da pesquisa com https e data")

    def analise(n: int, resto: str) -> int:
        """(análise: dossiê B5b + pesquisa [3] + relato 2026-11-18): cada referência existe e vale."""
        corpo = resto.strip()
        partes = [p.strip() for p in corpo[1:].split("+")] if corpo.startswith(":") else []
        if not [p for p in partes if p]:
            problemas.append(f"linha {n}: marca (análise) sem referência: escreva '(análise: dossiê CÓDIGO + pesquisa [n] "
                             "+ relato AAAA-MM-DD)' com pelo menos uma delas")
            return 0
        achados = 0
        for parte in partes:
            d, p, r = RE_ANALISE_DOSSIE.match(parte), RE_ANALISE_PESQUISA.match(parte), RE_ANALISE_RELATO.match(parte)
            if d and re.sub(r"\be\b|,|\s", "", (RE_CODIGO_V2 if v2 else RE_CODIGO).sub("", d.group(1))) == "":
                achados += codigos_do_dossie(n, d.group(1))
            elif p:
                if pesquisa_e_dados:
                    pesquisa(n, p.group(1))
            elif r:
                relato(n, r.group(1))
            else:
                problemas.append(f"linha {n}: na marca (análise), '{parte[:40]}' não é referência: use dossiê CÓDIGO, "
                                 "pesquisa [n] ou relato AAAA-MM-DD, separados por '+'")
        return achados

    corpo = next((n for n, l in enumerate(texto.split("\n"), 1) if l.startswith("## ")), 1)  # o cabeçalho só explica as marcas
    for n, linha in enumerate(texto.split("\n"), 1):
        if n < corpo and not linha.startswith("- Oferta em foco:"):  # a oferta em foco é fato, mesmo no cabeçalho
            continue
        dobrada = sem_acento(linha).lower()
        for m in RE_MARCA.finditer(dobrada):
            tipo, resto = m.group(1), m.group(2)
            if tipo == "dossie":
                conferidas += codigos_do_dossie(n, resto)
            elif tipo == "analise":
                conferidas += analise(n, resto)
            elif tipo == "relato do dono":
                relato(n, resto)
            elif tipo == "pesquisa" and pesquisa_e_dados:
                pesquisa(n, resto)
            elif tipo == "dados de clientes" and pesquisa_e_dados:
                data = RE_DATA.search(resto)
                if not data:
                    problemas.append(f"linha {n}: marca (dados de clientes) sem data AAAA-MM-DD")
                elif data.group(1) not in datas_dos_dados:
                    problemas.append(f"linha {n}: dados de clientes de {data.group(1)} sem registro em Dados de clientes no Anexo")
    # citações literais: fora do anexo e das seções livres, toda frase entre aspas (4 palavras ou mais)
    # tem de estar no dossiê ou no anexo; sem isso, a "fala do cliente" pode ter sido inventada
    for titulo, _, linhas in secoes(texto):
        if titulo.startswith(SECOES_LIVRES):
            continue
        for n, linha in linhas:
            if isentar_exemplos and not estrito and RE_EXEMPLO.match(linha.strip()):
                continue  # exemplo de tom de voz proposto pelo time, não fala de cliente
            for m in RE_ASPAS.finditer(linha):
                frase = m.group(1) or m.group(2)
                if len(frase.split()) >= 4 and normalizar(frase) not in literal:
                    problemas.append(f'linha {n}: frase entre aspas que não está no dossiê nem no Anexo: "{frase[:70]}"')
    if estrito:
        if not re.search(r"^- Estado: (rascunho|em-revisao|em-revisão|aprovado)\s*$", texto, re.MULTILINE):
            problemas.append("cabeçalho sem a linha '- Estado: rascunho' (ou em-revisao, aprovado)")
        origem = re.search(r"^- Origem da persona:\s*(.*)$", texto, re.MULTILINE)
        if estudo:
            for n, linha in linhas_sem_marca_do_estudo(texto):
                problemas.append(f"linha {n}: sem marca de origem (dossiê, relato do dono, pesquisa [n], análise: ..., "
                                 f"hipótese: razão): {linha[:70]}")
        elif not origem or not re.match(r"(proto-persona|validada)\b", origem.group(1), re.IGNORECASE):
            problemas.append("cabeçalho sem '- Origem da persona:' começando por proto-persona ou validada")
        elif origem.group(1).lower().startswith("validada"):
            prova = re.match(r"validada com (\d+) conversas?\b.*\b\d{4}-\d{2}-\d{2}\b", origem.group(1), re.IGNORECASE)
            if not prova or int(prova.group(1)) < MIN_CONVERSAS:
                problemas.append(f"persona 'validada' precisa dizer 'validada com N conversas' de clientes reais "
                                 f"(N de {MIN_CONVERSAS} para cima) e a data da última; senão é proto-persona")
        for n, linha in ([] if estudo else _linhas_de_fato(texto, () if exigir_plano else ("plano de mensagem",))):
            if not RE_MARCA.search(sem_acento(linha).lower()):
                problemas.append(f"linha {n}: sem marca de origem (dossiê X.Y, relato do dono, pesquisa [n], análise: ..., "
                                 f"hipótese, não consta, proposta do time ou dados de clientes, data): {linha[:70]}")
    if estrito if exigir_molde_novo is None else exigir_molde_novo:
        problemas += conferir_molde_novo(texto, exigir_plano)
    if estrito if exigir_dimensoes is None else exigir_dimensoes:
        faltam = dimensoes_que_faltam(texto)
        if faltam is None:
            problemas.append("falta a seção '## 2. Persona: <nome do arquétipo>' com as dimensões do molde")
        for nome in faltam or []:
            problemas.append(f"seção '2. Persona' sem a dimensão '{nome}': escreva a linha '- {nome}: ...' com a "
                             "origem; sem dado, (não consta no dossiê) ou (hipótese)")
    return problemas, conferidas


# ---------------------------------------------------------------- linha de comando

def _utf8() -> None:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def _carregar(casa: Path, caminho: str | None) -> tuple[dict, str, bytes]:
    rel = caminho or DOSSIE
    alvo = Path(rel) if Path(rel).is_absolute() else casa / rel
    if not alvo.is_file():
        raise FileNotFoundError(rel)
    dados = alvo.read_bytes()
    try:
        return ler_dossie(dados.decode("utf-8")), rel, dados
    except VersaoDesconhecida as erro:
        raise VersaoDesconhecida(erro.versao).with_arquivo(rel) from None


def main(argv: list[str] | None = None) -> int:
    _utf8()
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] not in ("blocos", "conferir", "-h", "--help"):
        argv.insert(0, "blocos")
    ap = argparse.ArgumentParser(prog="dossie_para_persona.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("blocos")
    b.add_argument("--casa", default=".")
    b.add_argument("--dossie", help=f"caminho do dossiê (padrão: {DOSSIE})")
    b.add_argument("--bloco", action="append", choices=sorted(BLOCOS), help="só este bloco (repita para vários)")
    b.add_argument("--so-dimensoes", action="store_true", help="só o resumo do dossiê e a lista `dimensoes` (etapa 1)")
    b.add_argument("--saida", help="grava o JSON neste arquivo em vez de imprimir")
    c = sub.add_parser("conferir")
    c.add_argument("--casa", default=".")
    c.add_argument("--dossie", help=f"caminho do dossiê (padrão: {DOSSIE})")
    c.add_argument("--arquivo", required=True, help="documento .md a conferir")
    c.add_argument("--estrito", action="store_true", help="regras da persona: marca de origem em toda linha de fato "
                   "(dossiê, relato do dono, pesquisa [n], análise: ..., hipótese, não consta, proposta do time, dados "
                   "de clientes), todas as dimensões do molde na seção 2. Persona, a oferta em foco, as Descobertas e o "
                   "Plano de mensagem")
    try:
        a = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    casa = Path(a.casa)
    try:
        dossie, rel, dados = _carregar(casa, a.dossie)
    except FileNotFoundError:
        print(f"FALTA: não achei o dossiê em {a.dossie or DOSSIE}. Registre o dossiê primeiro com "
              "polozi-registrar-dossie (etapa 5-dossie do instalador); sem ele não monto persona nem marca.",
              file=sys.stderr)
        return 1
    except VersaoDesconhecida as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: não consegui ler o dossiê ({type(erro).__name__})", file=sys.stderr)
        return 1
    if not dossie["perguntas"]:
        if dossie.get("versao", 1) == 2:
            print(f"ERRO: {rel} não tem nenhuma pergunta no formato da versão 2 (### A1 - pergunta). "
                  "Registre o dossiê de novo.", file=sys.stderr)
        else:
            print(f"ERRO: {rel} não tem nenhuma pergunta no formato do polozi-registrar-dossie "
                  "(### N.N - pergunta). Registre o dossiê de novo.", file=sys.stderr)
        return 1
    if a.cmd == "blocos":
        blocos = {} if a.so_dimensoes else montar_blocos(dossie, a.bloco)
        saida = {"dossie": resumo_dossie(dossie, rel, dados), **blocos,
                 "dimensoes": montar_dimensoes(dossie), "aviso": AVISO_FONTE}
        texto = json.dumps(saida, ensure_ascii=False, indent=2)
        if a.saida:
            Path(a.saida).write_text(texto + "\n", encoding="utf-8", newline="\n")
            print(f"FEITO: blocos gravados em {a.saida}")
        else:
            print(texto)
        return 0
    alvo = Path(a.arquivo) if Path(a.arquivo).is_absolute() else casa / a.arquivo
    if not alvo.is_file():
        print(f"ERRO: {a.arquivo} não existe", file=sys.stderr)
        return 2
    try:
        texto = alvo.read_bytes().decode("utf-8")
        problemas, conferidas = conferir_documento(texto, dossie, a.estrito)
    except UnicodeError:
        print(f"ERRO: {a.arquivo} não está em UTF-8", file=sys.stderr)
        return 2
    for p in problemas:
        print(f"PROBLEMA: {p}")
    if problemas:
        print(f"{len(problemas)} problema(s) em {a.arquivo}")
        return 1
    if e_estudo(texto):
        extra = ", origem em toda linha de fato do estudo; a estrutura é do persona_estudo.py conferir" if a.estrito else ""
    else:
        extra = (", origem em toda linha de fato, todas as dimensões da persona, descobertas e plano de mensagem"
                 if a.estrito else "")
    print(f"OK: {a.arquivo} confere com o dossiê ({conferidas} marca(s) de dossiê conferida(s){extra}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
