#!/usr/bin/env python3
"""persona_estudo.py: monta e confere o estudo do cliente ideal (contrato `persona-dados` versão 1).

O modelo escreve só o JSON do estudo (empresa/publico/estudo/6-estudo.json). Este script preenche o que
é dele (empresa, oferta, tipo de cliente, onde atende, a versão e as contagens, as fontes da pesquisa),
gera empresa/publico/persona.md inteiro (markdown legível + a seção "## Dados para o sistema" com o bloco
```persona-dados, JSON compacto) e confere tudo. Sem rede.

  montar    --entrada empresa/publico/estudo/6-estudo.json [--saida empresa/publico/persona.md]
            [--versao N.N] [--data AAAA-MM-DD]
            preenche os campos do script, confere e, sem PROBLEMA, grava o persona.md. Com PROBLEMA, não
            grava nada. --versao: padrão é a versão do persona.md que já existe, ou 1.0. --data: padrão hoje.
  validar   --arquivo empresa/publico/persona.md
            só o bloco: a forma do contrato (estrita: nada é descartado em silêncio), chave desconhecida, e as
            regras que dependem só do JSON (palavras proibidas só no texto da IA: o nome da empresa, a oferta, onde
            atende, a citação entre aspas e o título de fonte vêm do dono ou da página e nunca são barrados;
            parênteses e < >, travessão, idade só como faixa, origem certa por campo, promessa até 20 palavras,
            balança coerente, leitura em cada capítulo, no máximo metade 'disse' em quem, decide e onde, e o
            extra só com a descoberta).
  conferir  --arquivo empresa/publico/persona.md
            tudo do validar mais o que precisa do estudo: código do dossiê existe e tem resposta, relato com a
            data de uma resposta do dono, toda pesquisa [n] é ficha válida e as fontes são iguais às fichas,
            frase entre aspas só se literal, os campos do script iguais aos que o estudo dá, as descobertas
            iguais às da etapa 4, e o persona.md em dia com o bloco (gerado de novo, igual, fora a linha
            "- Estado:" e a linha "Aprovado pelo dono em ...").
  extrair   --arquivo empresa/publico/persona.md     imprime o JSON do bloco (usado nos testes).
  (todos aceitam --casa PASTA, a raiz do projeto; padrão: pasta atual)

Saída: 0 ok; 1 PROBLEMA (cada linha diz o que corrigir) ou dossiê ausente; 2 uso errado (arquivo que não existe).
Só stdlib (Python 3.10+). A leitura do dossiê e as marcas vêm do dossie_para_persona.py (ao lado).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aprovacao  # noqa: E402
import dossie_para_persona as dp  # noqa: E402

ESTUDO = "empresa/publico/estudo"
ENTRADA = f"{ESTUDO}/6-estudo.json"
PERSONA = "empresa/publico/persona.md"
ESCOPO = f"{ESTUDO}/0-escopo.md"
PESQUISA = f"{ESTUDO}/2-pesquisa.json"
DESCOBERTAS = f"{ESTUDO}/4-descobertas.md"
ENTREVISTA = f"{ESTUDO}/5-entrevista.md"
TITULO_DADOS = "## Dados para o sistema"
RE_CERCA = re.compile(r"^```persona-dados[ \t]*\n(.*?)^```[ \t]*$", re.M | re.S)
TETO_BLOCO = 64 * 1024
TETO_DOCUMENTO = 200 * 1024
VERSAO_PADRAO = "1.0"

TIPOS_ORIGEM = ("disse", "pesquisa", "leitura", "hipotese")
IDS_CAPITULO = ("descobertas", "quem", "pensa", "quer", "forcas", "decide", "onde", "sabe", "mensagem", "nao",
                "apostas", "semana")
TIPOS_CLIENTE = ("pessoa", "empresa", "os-dois")
FUNCOES = ("decide", "influencia", "usa")
INCLINACOES = ("empurra", "segura", "equilibrio")
ESTADOS = ("atua", "fora", "vazamento")
ZONAS = ("cruza", "informa", "compara", "escuta")
TEMPOS = ("1-hora", "1-dia", "1-semana", "2-semanas", "1-mes")

RE_REF_DOSSIE = re.compile(r"^(?:[A-H][0-9]{1,2}[a-z]?|[0-9]{1,2}\.[0-9]{1,2})$")
RE_REF_RELATO = re.compile(r"^relato ([0-9]{4}-[0-9]{2}-[0-9]{2})$")
RE_REF_PESQUISA = re.compile(r"^\[([0-9]{1,3})\]$")
RE_DATA = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
RE_URL = re.compile(r"^https://[^\s<>\"'`]{1,490}$")
RE_NUMERO_VERSAO = re.compile(r"^[0-9]{1,2}\.[0-9]{1,2}$")
RE_CONTROLE = re.compile(r"[\x00-\x1f]")
RE_TRAVESSAO = re.compile("[\u2013\u2014]")  # escrito por código: nenhum arquivo do time carrega o caractere
RE_PARENTESES = re.compile(r"[()<>]")
RE_PROIBIDAS = ((re.compile(r"\bempresa\s*os\b", re.I), "Empresa OS"), (re.compile(r"\bf[aá]brica\b", re.I), "fábrica"),
                (re.compile(r"\bpolozi\b", re.I), "Polozi"))
RE_CASA = re.compile(r"\bCasa\b")
RE_IDADE = re.compile(r"\b\d{1,3}\s+anos\b")
RE_FAIXA = re.compile(r"\bde \d{1,3} a \d{1,3} anos\b")
# iguais às do estudo.py (um teste confere): a confirmação do escopo e as perguntas da entrevista
RE_CONFIRMACAO = re.compile(r'^- Confirmação do dono: (\d{4}-\d{2}-\d{2}) \| "(.+)"\s*$', re.MULTILINE)
RE_PERGUNTA = re.compile(r'^- (\d{4}-\d{2}-\d{2}) \| Pergunta do time: (.+?) \| Motivo: (.+?) \| Resposta do dono: "(.+)"\s*$')
RE_TITULO_DESCOBERTA = re.compile(r"^## Descoberta (\d)\b")

# rótulos de recomendação e de apoio: a linha não leva marca de origem (contrato, 4.1)
ROTULOS_ISENTOS = ("Por que importa:", "O que fazer:", "O que isso pede:", "Como virar:", "Como chegar:", "O que dizer:",
                   "Como confirmar:", "Por que acredito:", "Tempo:", "Resolve:", "Motivo da troca:", "Como testar:",
                   "Falta confirmar:", "Prova que falta:", "Ressalva:", "O material não alcançou:", "Eixos:",
                   "Conversas:", "Pergunta:")

TITULOS = {"descobertas": "Descobertas", "quem": "Quem é, e em que momento está", "pensa": "Como pensa",
           "quer": "O que quer resolver", "forcas": "O que empurra para a compra, e o que segura",
           "decide": "Como decide", "onde": "Onde está, e como chegar", "sabe": "O quanto já sabe",
           "mensagem": "O que dizer", "nao": "Quem não é o cliente", "apostas": "O que ainda é aposta, e como confirmar",
           "semana": "O que fazer esta semana"}
COLUNA_PERFIL = {"empresa": "A empresa", "pessoa": "A situação", "os-dois": "O perfil"}
NOME_ZONA = {"cruza": "Já cruza com você", "informa": "Onde se informa", "compara": "Onde aprende e compara",
             "escuta": "Quem escuta"}
NOME_DEGRAU = {1: "Não percebe o problema", 2: "Sente a dor, não conhece a saída", 3: "Conhece saídas, não escolheu",
               4: "Conhece você, não decidiu", 5: "Pronto para comprar"}
NOME_ESTADO = {"atua": "onde a empresa atua", "fora": "fora do alcance", "vazamento": "onde perde gente"}
NOME_TEMPO = {"1-hora": "1 hora", "1-dia": "1 dia", "1-semana": "1 semana", "2-semanas": "2 semanas", "1-mes": "1 mês"}
NOME_INCLINACAO = {"empurra": "o lado que empurra", "segura": "o lado que segura", "equilibrio": "nenhum lado"}
CAPITULOS_COM_LEITURA = ("quem", "pensa", "quer", "forcas", "decide", "onde", "sabe", "mensagem", "nao")
# capítulos de fatos: no máximo metade das afirmações copia o dono (ensaio de 19/11: o estudo parafraseava as respostas)
CAPITULOS_DE_FATOS = ("quem", "decide", "onde")
RE_EXTRA_COM_MOLDURA = re.compile(r"^\s*(e\s+mais\s+uma|e\s+uma\s+quarta|mais\s+uma)\b|cap[ií]tulo", re.I)
RE_ASPAS_TEXTO = re.compile(r'"[^"\n]*"|“[^”\n]*”')


class Falta(Exception):
    """Um arquivo de que o comando precisa não existe."""


# ---------------------------------------------------------------- leitura

def _lf(texto: str) -> str:
    return texto.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")


def _ler(casa: Path, rel: str) -> str | None:
    alvo = Path(rel) if Path(rel).is_absolute() else casa / rel
    return _lf(alvo.read_bytes().decode("utf-8")) if alvo.is_file() else None


def sem_acento(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")


def fichas_validas(pesquisa: dict) -> dict[int, dict]:
    """{n: ficha} das fichas que dá para citar: n de 1 a 999, título, URL https do contrato e data."""
    saida: dict[int, dict] = {}
    for f in pesquisa.get("fichas") or []:
        if not isinstance(f, dict):
            continue
        n, titulo = f.get("n"), f.get("titulo")
        if (type(n) is int and 1 <= n <= 999 and n not in saida and isinstance(titulo, str) and titulo.strip()
                and RE_URL.match(str(f.get("url", ""))) and RE_DATA.match(str(f.get("data_acesso", "")))):
            saida[n] = f
    return saida


def contexto(casa: Path) -> dict:
    """O que o script lê do estudo. Dossiê ausente levanta FileNotFoundError (o resto pode faltar)."""
    dossie, _, _ = dp._carregar(casa, None)
    ctx: dict = {"dossie": dossie, "escopo": _ler(casa, ESCOPO), "pesquisa": None, "entrevista": None,
                 "confirmacao": None, "descobertas": None, "extra": False}
    bruto = _ler(casa, PESQUISA)
    if bruto is not None:
        try:
            dados = json.loads(bruto)
            ctx["pesquisa"] = dados if isinstance(dados, dict) else {}
        except ValueError:
            ctx["pesquisa"] = {}
    texto = _ler(casa, ENTREVISTA)
    if texto is not None:
        ctx["entrevista"] = [(m.group(1), m.group(2), m.group(4))
                             for m in (RE_PERGUNTA.match(l.strip()) for l in texto.split("\n")) if m]
    if ctx["escopo"]:
        m = RE_CONFIRMACAO.search(ctx["escopo"])
        if m:
            ctx["confirmacao"] = (m.group(1), m.group(2))
    texto = _ler(casa, DESCOBERTAS)
    if texto is not None:
        ctx["descobertas"] = len([l for l in texto.split("\n") if RE_TITULO_DESCOBERTA.match(l)])
        ctx["extra"] = any(dp.normalizar(l[3:]) == "mais uma" for l in texto.split("\n") if l.startswith("## "))
    return ctx


# ---------------------------------------------------------------- marcas do markdown do estudo -> origem

RE_MARCA_ORIGINAL = re.compile(r"\((dossi[eê]|relato do dono|an[aá]lise|pesquisa|hip[oó]tese|n[aã]o consta)([^)]*)\)", re.I)
RE_COD_ORIGINAL = re.compile(r"\b([A-H][0-9]{1,2}[a-z]?|[0-9]{1,2}\.[0-9]{1,2})\b")


def origem_das_marcas(linha: str) -> tuple[str, dict | None]:
    """(texto sem as marcas, Origem) de uma linha do estudo, como '- Oferta em foco: X (dossiê B3)'.
    Só dossiê e relato = disse; só pesquisa = pesquisa; mistura ou análise = leitura; hipótese = hipotese."""
    refs: list[str] = []
    tipos: set[str] = set()
    razao = ""
    for m in RE_MARCA_ORIGINAL.finditer(linha):
        tipo, resto = sem_acento(m.group(1)).lower(), m.group(2)
        if tipo == "dossie":
            tipos.add("d")
            refs += RE_COD_ORIGINAL.findall(resto)
        elif tipo == "relato do dono":
            tipos.add("d")
            refs += [f"relato {d}" for d in re.findall(r"\d{4}-\d{2}-\d{2}", resto)]
        elif tipo == "pesquisa":
            tipos.add("p")
            refs += [f"[{n}]" for n in re.findall(r"\[(\d{1,3})\]", resto)]
        elif tipo == "analise":
            tipos.add("a")
            for parte in resto.lstrip(" :").split("+"):
                parte = parte.strip()
                if sem_acento(parte).lower().startswith("dossie"):
                    refs += RE_COD_ORIGINAL.findall(parte)
                elif parte.startswith("pesquisa"):
                    refs += [f"[{n}]" for n in re.findall(r"\[(\d{1,3})\]", parte)]
                elif parte.startswith("relato"):
                    refs += [f"relato {d}" for d in re.findall(r"\d{4}-\d{2}-\d{2}", parte)]
        elif tipo == "hipotese":
            tipos.add("h")
            razao = resto.lstrip(" :").strip()
    texto = RE_MARCA_ORIGINAL.sub("", linha).strip().rstrip(".").strip()
    refs = list(dict.fromkeys(refs))
    if not tipos or "nao consta" in sem_acento(linha).lower() and not refs:
        return texto, None
    if tipos == {"h"}:
        return texto, {"tipo": "hipotese", "razao": razao or "sem evidência direta"}
    if tipos == {"d"}:
        return texto, {"tipo": "disse", "refs": refs[:8]}
    if tipos == {"p"}:
        return texto, {"tipo": "pesquisa", "refs": refs[:8]}
    return texto, {"tipo": "leitura", "refs": refs[:8]}


def linha_do_escopo(escopo: str | None, rotulo: str) -> str | None:
    """O valor da linha '- Rótulo: valor (marca)' do 0-escopo.md, com a marca."""
    if not escopo:
        return None
    m = re.search(rf"^- {re.escape(rotulo)}:\s*(.+?)\s*$", escopo, re.MULTILINE)
    return m.group(1) if m else None


# ---------------------------------------------------------------- campos do script

def nome_da_empresa(dossie: dict) -> str:
    nome = (dossie.get("empresa") or "").strip()
    if nome and "{{" not in nome:
        return nome
    for parte in (dossie["perguntas"].get("A1") or {}).get("partes", []):
        if dp.normalizar(parte.get("rotulo", "")) == "nome da empresa":
            return parte["texto"].strip()
    return nome


def contagens(dossie: dict) -> tuple[int, int]:
    """(perguntas do dossiê, sem resposta), sem contar as que 'não se aplica'."""
    estados = [p["estado"] for p in dossie["perguntas"].values() if p["estado"] != "não se aplica"]
    return len(estados), sum(1 for e in estados if e != "respondida")


def refs_citadas(no, caminho: str = "") -> list[tuple[str, str]]:
    """[(caminho, ref)] de toda lista 'refs' do JSON (fora de 'fontes')."""
    saida: list[tuple[str, str]] = []
    if isinstance(no, dict):
        for k, v in no.items():
            if k == "fontes" and not caminho:
                continue
            c = f"{caminho}.{k}" if caminho else k
            if k == "refs" and isinstance(v, list):
                saida += [(caminho, r) for r in v if isinstance(r, str)]
            else:
                saida += refs_citadas(v, c)
    elif isinstance(no, list):
        for i, v in enumerate(no, 1):
            saida += refs_citadas(v, f"{caminho}[{i}]")
    return saida


def fontes_do_estudo(d: dict, pesquisa: dict | None) -> dict:
    pesquisa = pesquisa or {}
    fichas = fichas_validas(pesquisa)
    citadas = sorted({int(m.group(1)) for _, r in refs_citadas(d) if (m := RE_REF_PESQUISA.match(r))})
    fontes: dict = {"busca_disponivel": pesquisa.get("busca_disponivel") is True}
    if RE_DATA.match(str(pesquisa.get("data_acesso", ""))):
        fontes["data_acesso"] = pesquisa["data_acesso"]
    fontes["itens"] = [{"n": n, "titulo": fichas[n]["titulo"], "url": fichas[n]["url"], "data_acesso": fichas[n]["data_acesso"]}
                       for n in citadas if n in fichas]
    nao = [" ".join(str(x).split())[:300] for x in (pesquisa.get("nao_achado") or []) if isinstance(x, str) and x.strip()]
    if nao:
        fontes["nao_achado"] = nao[:5]
    return fontes


def campos_do_script(d: dict, ctx: dict, numero: str, data: str) -> dict:
    """Os campos [script] do contrato, tirados do estudo, na ordem do contrato."""
    dossie = ctx["dossie"]
    total, sem = contagens(dossie)
    pesquisa = ctx["pesquisa"] or {}
    fichas = fichas_validas(pesquisa) if pesquisa.get("busca_disponivel") is True else {}
    campos: dict = {"versao": 1, "documento": "persona", "empresa": nome_da_empresa(dossie)}
    oferta = linha_do_escopo(ctx["escopo"], "Oferta em foco")
    if oferta:
        texto, origem = origem_das_marcas(oferta)
        campos["oferta"] = {"texto": texto, "origem": origem} if origem else {"texto": texto}
    tipo = dp.normalizar(linha_do_escopo(ctx["escopo"], "Tipo de cliente") or "")
    campos["tipo_cliente"] = ("os-dois" if tipo.startswith("os dois") else "empresa" if tipo.startswith("empresa")
                              else "pessoa" if tipo.startswith("pessoa") else tipo)
    onde = linha_do_escopo(ctx["escopo"], "Onde atende")
    if onde and "nao consta" not in dp.normalizar(onde):
        texto, origem = origem_das_marcas(onde)
        campos["onde_atende"] = {"texto": texto, "origem": origem} if origem else {"texto": texto}
    registro = dossie.get("registro") or ""
    versao: dict = {"numero": numero, "data": data, "registro_dossie": registro}
    if RE_DATA.match(registro[:10]):
        versao["dossie_em"] = registro[:10]
    versao.update({"perguntas_dossie": total, "sem_resposta": sem, "perguntas_dono": len(ctx["entrevista"] or []),
                   "trechos": len(fichas), "paginas": len({f["url"] for f in fichas.values()})})
    campos["versao_abertura"] = versao
    campos["fontes"] = fontes_do_estudo(d, ctx["pesquisa"])
    return campos


def preencher(d: dict, ctx: dict, numero: str, data: str) -> dict:
    """O JSON do modelo com os campos do script por cima, na ordem do contrato (chave desconhecida vai no fim)."""
    campos = campos_do_script(d, ctx, numero, data)
    saida: dict = {k: campos[k] for k in ("versao", "documento", "empresa", "oferta", "tipo_cliente", "onde_atende")
                   if k in campos}
    abertura = d.get("abertura")
    if isinstance(abertura, dict):
        nova = {k: abertura[k] for k in ("arquetipo", "retrato") if k in abertura}
        nova["versao"] = campos["versao_abertura"]
        nova.update({k: v for k, v in abertura.items() if k not in ("arquetipo", "retrato", "versao")})
        saida["abertura"] = nova
    elif abertura is not None:
        saida["abertura"] = abertura
    for cap in IDS_CAPITULO:
        if cap in d:
            saida[cap] = d[cap]
    saida["fontes"] = campos["fontes"]
    for k, v in d.items():
        if k not in saida and k not in ("versao", "documento", "empresa", "oferta", "tipo_cliente", "onde_atende"):
            saida[k] = v
    return saida


def compacto(d: dict) -> str:
    return json.dumps(d, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------- validação da forma (3.1, 3.2 e regras só do JSON)

def _inteiro(v, a: int, b: int) -> bool:
    return type(v) is int and a <= v <= b


class Conferencia:
    """Junta os PROBLEMA. Índices de lista começam em 1."""

    def __init__(self, nomes_do_dono: tuple[str, ...] = ()) -> None:
        self.problemas: list[str] = []
        self.fontes: set[int] = set()
        self.cap = ""
        self.tipos: dict[str, list[str]] = {}
        # nome da empresa, oferta e onde atende vêm do dono (o script copia do dossiê e do escopo): nunca são barrados
        self.nomes = [re.compile(re.escape(n.strip()), re.I) for n in sorted(set(nomes_do_dono), key=len, reverse=True)
                      if isinstance(n, str) and n.strip()]

    def p(self, msg: str) -> None:
        self.problemas.append(msg)

    def chaves(self, c: str, d: dict, permitidas) -> None:
        extra = [k for k in d if k not in permitidas]
        if extra:
            self.p(f"{c}: chave desconhecida {', '.join(map(repr, extra))}; as que valem aqui são {', '.join(permitidas)}")

    def so_da_ia(self, v: str) -> str:
        """O texto sem o que veio do dono: a citação entre aspas (a regra das aspas confere que é literal) e o nome da
        empresa, a oferta e onde atende. A proibição de nome interno vale só para o que a IA escreveu."""
        v = RE_ASPAS_TEXTO.sub(" ", v)
        for nome in self.nomes:
            v = nome.sub(" ", v)
        return v

    def conteudo(self, c: str, v: str) -> None:
        if RE_PARENTESES.search(v):
            self.p(f"{c}: tire os parênteses e os sinais < >: o markdown usa parênteses só para a marca de origem "
                   "(escreva a ressalva com vírgula)")
        if RE_TRAVESSAO.search(v):
            self.p(f"{c}: tire o travessão; use vírgula, ponto ou dois-pontos")
        v = self.so_da_ia(v)
        for m in RE_CASA.finditer(v):
            antes = v[:m.start()].rstrip()
            if antes and antes[-1] not in ".!?:":
                self.p(f"{c}: a palavra 'Casa' com C maiúsculo no meio da frase é nome interno; escreva 'casa' ou o nome do lugar")
        for regra, nome in RE_PROIBIDAS:
            if regra.search(v):
                self.p(f"{c}: a palavra '{nome}' é nome interno e não vai em texto que o dono lê"
                       + ("; para indústria, escreva 'indústria', 'unidade' ou 'planta'" if nome == "fábrica" else ""))

    def txt(self, c: str, v, teto: int, *, obrig: bool = True, livre: bool = False) -> bool:
        if v is None:
            if obrig:
                self.p(f"{c}: falta este texto")
            return False
        if not isinstance(v, str):
            self.p(f"{c}: precisa ser um texto entre aspas")
            return False
        if not v.strip():
            self.p(f"{c}: está vazio")
            return False
        if RE_CONTROLE.search(v):
            self.p(f"{c}: tem quebra de linha ou caractere de controle; escreva numa linha só")
            return False
        if len(v) > teto:
            self.p(f"{c}: tem {len(v)} caracteres e o teto é {teto}; corte")
            return False
        if not livre:
            self.conteudo(c, v)
        return True

    def ref(self, c: str, r) -> str | None:
        """'d' (dossiê ou relato) ou 'p' (pesquisa); None se fora das 3 formas."""
        if not isinstance(r, str):
            self.p(f"{c}: referência precisa ser texto, como \"B5a\", \"relato 2026-11-18\" ou \"[3]\"")
            return None
        m = RE_REF_PESQUISA.match(r)
        if m:
            if int(m.group(1)) not in self.fontes:
                self.p(f"{c}: cita {r}, que não está nas fontes: cite só o n de uma ficha válida do 2-pesquisa.json")
            return "p"
        if RE_REF_DOSSIE.match(r) or RE_REF_RELATO.match(r):
            return "d"
        self.p(f"{c}: a referência {r!r} não vale: use o código do dossiê (B5a, ou 2.4 no dossiê antigo), "
               "\"relato AAAA-MM-DD\" ou \"[n]\" da pesquisa")
        return None

    def origem(self, c: str, o, permitidos: tuple[str, ...] | None = None, contar: bool = True) -> str | None:
        if not isinstance(o, dict):
            self.p(f"{c}: falta a origem: {{\"tipo\": \"disse | pesquisa | leitura | hipotese\", \"refs\": [...]}}")
            return None
        self.chaves(c, o, ("tipo", "refs", "razao"))
        t = o.get("tipo")
        if t not in TIPOS_ORIGEM:
            self.p(f"{c}: o tipo da origem é disse, pesquisa, leitura ou hipotese (veio {t!r})")
            return None
        refs = o.get("refs", [])
        if refs is None:
            refs = []
        if not isinstance(refs, list):
            self.p(f"{c}: 'refs' precisa ser uma lista")
            return None
        if t == "hipotese":
            if refs:
                self.p(f"{c}: hipótese não leva refs; se há evidência, o tipo é leitura com as refs; se não há, tire as refs")
            if "razao" not in o:
                self.p(f"{c}: hipótese precisa de 'razao': uma linha dizendo por que você aposta nisso")
            else:
                self.txt(f"{c}.razao", o.get("razao"), 200)
        else:
            if "razao" in o:
                self.p(f"{c}: 'razao' só vai em hipótese; aqui a origem já mostra as refs")
            if not 1 <= len(refs) <= 8:
                self.p(f"{c}: a origem {t} precisa de 1 a 8 refs (tem {len(refs)})")
            classes = [self.ref(f"{c}.refs", r) for r in refs[:8]]
            if t == "disse" and "p" in classes:
                self.p(f"{c}: 'disse' é o que o dono disse: só código do dossiê ou relato; com pesquisa junto, o tipo é leitura")
            if t == "pesquisa" and "d" in classes:
                self.p(f"{c}: 'pesquisa' leva só [n]; com dossiê ou relato junto, o tipo é leitura")
        if permitidos and t not in permitidos:
            self.p(f"{c}: aqui a origem precisa ser {' ou '.join(permitidos)} (veio {t})")
        if contar and self.cap:
            self.tipos.setdefault(self.cap, []).append(t)
        return t

    def obj(self, c: str, v, permitidas) -> bool:
        if not isinstance(v, dict):
            self.p(f"{c}: precisa ser um objeto {{ ... }}")
            return False
        self.chaves(c, v, permitidas)
        return True

    def lista(self, c: str, v, mn: int, mx: int, f, obrig: bool = False) -> list:
        if v is None:
            if obrig:
                self.p(f"{c}: falta a lista (de {mn} a {mx} itens)")
            return []
        if not isinstance(v, list):
            self.p(f"{c}: precisa ser uma lista [ ... ]")
            return []
        if len(v) < mn or len(v) > mx:
            self.p(f"{c}: precisa de {mn} a {mx} itens (tem {len(v)})")
        for i, x in enumerate(v[:mx], 1):
            f(f"{c}[{i}]", x)
        return v

    def afirmacao(self, c: str, a, teto: int, permitidos=None) -> str | None:
        if not self.obj(c, a, ("texto", "origem")):
            return None
        self.txt(f"{c}.texto", a.get("texto"), teto)
        return self.origem(f"{c}.origem", a.get("origem"), permitidos)

    def evidencia(self, c: str, e) -> None:
        if not self.obj(c, e, ("tipo", "refs", "texto")):
            return
        if e.get("tipo") not in ("disse", "pesquisa"):
            self.p(f"{c}: evidência é 'disse' ou 'pesquisa': o que o dono disse ou o que a página mostra, nunca conclusão")
        elif not isinstance(e.get("refs"), list) or not 1 <= len(e["refs"]) <= 4:
            self.p(f"{c}: evidência precisa de 1 a 4 refs")
        else:
            self.origem(c, {"tipo": e["tipo"], "refs": e["refs"]}, contar=False)
        self.txt(f"{c}.texto", e.get("texto"), 240)

    def evidencias(self, c: str, v, mn: int = 0, mx: int = 8, obrig: bool = False) -> None:
        self.lista(c, v, mn, mx, self.evidencia, obrig)


def _validar_fontes(cf: Conferencia, f) -> None:
    if not isinstance(f, dict) or not isinstance(f.get("itens"), list):
        cf.p("fontes: precisa ser um objeto com a lista 'itens' (rode montar: o script preenche as fontes)")
        return
    cf.chaves("fontes", f, ("busca_disponivel", "data_acesso", "itens", "nao_achado"))
    if not isinstance(f.get("busca_disponivel"), bool):
        cf.p("fontes.busca_disponivel: precisa ser true ou false")
    if f.get("data_acesso") is not None and not RE_DATA.match(str(f["data_acesso"])):
        cf.p("fontes.data_acesso: data AAAA-MM-DD")
    if len(f["itens"]) > 50:
        cf.p(f"fontes.itens: o teto é 50 fontes (tem {len(f['itens'])})")
    for i, x in enumerate(f["itens"][:50], 1):
        c = f"fontes.itens[{i}]"
        if not cf.obj(c, x, ("n", "titulo", "url", "data_acesso")):
            continue
        ok = True
        if not _inteiro(x.get("n"), 1, 999):
            cf.p(f"{c}.n: inteiro de 1 a 999")
            ok = False
        elif x["n"] in cf.fontes:
            cf.p(f"{c}.n: o número {x['n']} está repetido nas fontes")
            ok = False
        ok = cf.txt(f"{c}.titulo", x.get("titulo"), 160, livre=True) and ok
        if not RE_URL.match(str(x.get("url", ""))):
            cf.p(f"{c}.url: precisa começar com https:// e não ter espaço nem aspas")
            ok = False
        if not RE_DATA.match(str(x.get("data_acesso", ""))):
            cf.p(f"{c}.data_acesso: data AAAA-MM-DD")
            ok = False
        if ok:
            cf.fontes.add(x["n"])
    cf.lista("fontes.nao_achado", f.get("nao_achado"), 0, 5, lambda c, x: cf.txt(c, x, 300, livre=True))


def _validar_abertura(cf: Conferencia, a) -> None:
    if not cf.obj("abertura", a, ("arquetipo", "retrato", "versao")):
        return
    arq = a.get("arquetipo")
    if cf.obj("abertura.arquetipo", arq, ("texto", "enfase")):
        cf.txt("abertura.arquetipo.texto", arq.get("texto"), 90)
        if arq.get("enfase") is not None and cf.txt("abertura.arquetipo.enfase", arq["enfase"], 40):
            if isinstance(arq.get("texto"), str) and arq["enfase"] not in arq["texto"]:
                cf.p("abertura.arquetipo.enfase: precisa ser um trecho literal do arquétipo (a tela põe em itálico)")
    tipo = cf.afirmacao("abertura.retrato", a.get("retrato"), 280)
    if tipo in ("disse", "pesquisa"):
        cf.p("abertura.retrato: o retrato é a sua leitura do cliente, juntando as evidências: origem leitura "
             "(ou hipotese com a razão), nunca a resposta do dono copiada")
    v = a.get("versao")
    if not cf.obj("abertura.versao", v, ("numero", "data", "registro_dossie", "dossie_em", "perguntas_dossie",
                                         "sem_resposta", "perguntas_dono", "trechos", "paginas")):
        return
    if not RE_NUMERO_VERSAO.match(str(v.get("numero", ""))):
        cf.p("abertura.versao.numero: no formato N.N, como 1.0")
    if not RE_DATA.match(str(v.get("data", ""))):
        cf.p("abertura.versao.data: data AAAA-MM-DD")
    cf.txt("abertura.versao.registro_dossie", v.get("registro_dossie"), 40, livre=True)
    if v.get("dossie_em") is not None and not RE_DATA.match(str(v["dossie_em"])):
        cf.p("abertura.versao.dossie_em: data AAAA-MM-DD")
    for k, mx in (("perguntas_dossie", 300), ("sem_resposta", 300), ("perguntas_dono", 5), ("trechos", 50), ("paginas", 10)):
        if not _inteiro(v.get(k), 0, mx):
            cf.p(f"abertura.versao.{k}: inteiro de 0 a {mx}")


def _descobertas(cf: Conferencia, ds) -> None:
    if not cf.obj("descobertas", ds, ("itens", "extra")):
        return

    def item(c, x):
        if not cf.obj(c, x, ("titulo", "corpo", "por_que_importa", "o_que_fazer", "origem", "evidencias")):
            return
        cf.txt(f"{c}.titulo", x.get("titulo"), 200)
        cf.txt(f"{c}.corpo", x.get("corpo"), 800)
        cf.txt(f"{c}.por_que_importa", x.get("por_que_importa"), 400)
        cf.txt(f"{c}.o_que_fazer", x.get("o_que_fazer"), 400)
        cf.origem(f"{c}.origem", x.get("origem"), ("leitura",))
        cf.evidencias(f"{c}.evidencias", x.get("evidencias"), 1, 6, obrig=True)

    cf.lista("descobertas.itens", ds.get("itens"), 1, 3, item, obrig=True)
    e = ds.get("extra")
    if e is not None and cf.obj("descobertas.extra", e, ("texto", "capitulo", "origem")):
        if cf.txt("descobertas.extra.texto", e.get("texto"), 360) and RE_EXTRA_COM_MOLDURA.search(e["texto"]):
            cf.p("descobertas.extra.texto: escreva só a descoberta, em uma ou duas frases; o documento já põe 'E mais "
                 "uma:' antes e o nome do capítulo depois, e a tela faz o mesmo")
        if e.get("capitulo") not in IDS_CAPITULO or e.get("capitulo") == "descobertas":
            cf.p("descobertas.extra.capitulo: o id de outro capítulo (quem, pensa, quer, forcas, decide, onde, sabe, "
                 "mensagem, nao, apostas, semana)")
        cf.origem("descobertas.extra.origem", e.get("origem"))


def _quem(cf: Conferencia, q) -> bool:
    if not cf.obj("quem", q, ("momento", "perfil", "pessoa", "grupo_compra", "evidencias")):
        return False
    if q.get("momento") is not None:
        cf.afirmacao("quem.momento", q["momento"], 280)
    perfil = cf.lista("quem.perfil", q.get("perfil"), 0, 6, lambda c, x: cf.afirmacao(c, x, 240))
    pessoa = cf.lista("quem.pessoa", q.get("pessoa"), 0, 6, lambda c, x: cf.afirmacao(c, x, 240))
    g = q.get("grupo_compra")
    if g is not None and cf.obj("quem.grupo_compra", g, ("papeis", "nota")):
        def papel(c, x):
            if not cf.obj(c, x, ("papel", "funcao", "nivel", "texto", "origem")):
                return
            cf.txt(f"{c}.papel", x.get("papel"), 60)
            if x.get("funcao") not in FUNCOES:
                cf.p(f"{c}.funcao: decide, influencia ou usa")
            if not _inteiro(x.get("nivel"), 0, 3):
                cf.p(f"{c}.nivel: inteiro de 0 (centro) a 3 (anel de fora)")
            cf.txt(f"{c}.texto", x.get("texto"), 240, obrig=False)
            cf.origem(f"{c}.origem", x.get("origem"))
        papeis = cf.lista("quem.grupo_compra.papeis", g.get("papeis"), 2, 6, papel, obrig=True)
        niveis = [x.get("nivel") for x in papeis if isinstance(x, dict)]
        if papeis and 0 not in niveis:
            cf.p("quem.grupo_compra.papeis: pelo menos um papel no nível 0 (quem decide, no centro)")
        for n in set(niveis):
            if niveis.count(n) > 2:
                cf.p(f"quem.grupo_compra.papeis: no máximo 2 papéis por anel (o anel {n} tem {niveis.count(n)})")
        if g.get("nota") is not None:
            cf.afirmacao("quem.grupo_compra.nota", g["nota"], 400)
    cf.evidencias("quem.evidencias", q.get("evidencias"))
    return bool(perfil or pessoa)


def _pensa(cf: Conferencia, p) -> bool:
    if not cf.obj("pensa", p, ("acredita", "teme", "deseja", "espelho", "evidencias")):
        return False
    tem = False
    for k in ("acredita", "teme", "deseja"):
        tem = bool(cf.lista(f"pensa.{k}", p.get(k), 0, 5, lambda c, x: cf.afirmacao(c, x, 200))) or tem
    e = p.get("espelho")
    if e is not None and cf.obj("pensa.espelho", e, ("paragrafos", "origem", "evidencias")):
        cf.lista("pensa.espelho.paragrafos", e.get("paragrafos"), 1, 3, lambda c, x: cf.txt(c, x, 600), obrig=True)
        cf.origem("pensa.espelho.origem", e.get("origem"))
        cf.evidencias("pensa.espelho.evidencias", e.get("evidencias"), 1, 6, obrig=True)
    cf.evidencias("pensa.evidencias", p.get("evidencias"))
    return tem


def _quer(cf: Conferencia, q) -> bool:
    if not cf.obj("quer", q, ("pratico", "ser_visto", "sentir", "evidencias")):
        return False
    tem = False
    for k in ("pratico", "ser_visto", "sentir"):
        t = q.get(k)
        if t is None:
            continue
        tem = True
        if cf.obj(f"quer.{k}", t, ("enunciado", "origem", "o_que_pede")):
            cf.txt(f"quer.{k}.enunciado", t.get("enunciado"), 240)
            cf.origem(f"quer.{k}.origem", t.get("origem"))
            cf.txt(f"quer.{k}.o_que_pede", t.get("o_que_pede"), 240)
    cf.evidencias("quer.evidencias", q.get("evidencias"))
    return tem


def _forcas(cf: Conferencia, f) -> bool:
    if not cf.obj("forcas", f, ("empurra", "segura", "inclinacao", "leitura", "como_virar", "evidencias")):
        return False

    def peso(lado):
        def checar(c, x):
            if not cf.obj(c, x, ("texto", "peso", "ausente", "origem")):
                return
            cf.txt(f"{c}.texto", x.get("texto"), 120)
            if not _inteiro(x.get("peso"), 1, 3):
                cf.p(f"{c}.peso: inteiro de 1 a 3 (3 = forte)")
            if "ausente" in x:
                if lado == "segura":
                    cf.p(f"{c}.ausente: só o lado que empurra tem peso ausente; tire 'ausente' daqui")
                elif not isinstance(x["ausente"], bool):
                    cf.p(f"{c}.ausente: true ou false")
            cf.origem(f"{c}.origem", x.get("origem"))
        return checar

    empurra = cf.lista("forcas.empurra", f.get("empurra"), 0, 6, peso("empurra"))
    segura = cf.lista("forcas.segura", f.get("segura"), 0, 6, peso("segura"))
    inc = f.get("inclinacao")
    if inc not in INCLINACOES:
        cf.p("forcas.inclinacao: empurra, segura ou equilibrio (o lado para onde a balança pende)")
    else:
        e = sum(x["peso"] for x in empurra if isinstance(x, dict) and _inteiro(x.get("peso"), 1, 3) and x.get("ausente") is not True)
        s = sum(x["peso"] for x in segura if isinstance(x, dict) and _inteiro(x.get("peso"), 1, 3))
        if (inc == "segura" and s < e) or (inc == "empurra" and e < s) or (inc == "equilibrio" and abs(e - s) > 1):
            cf.p(f"forcas.inclinacao: '{inc}' desmente os pesos (empurra soma {e}, sem os ausentes; segura soma {s}); "
                 "acerte os pesos ou a inclinação")
    if f.get("leitura") is not None:
        cf.afirmacao("forcas.leitura", f["leitura"], 400)
    cf.lista("forcas.como_virar", f.get("como_virar"), 0, 3,
             lambda c, x: cf.obj(c, x, ("titulo", "texto")) and (cf.txt(f"{c}.titulo", x.get("titulo"), 60),
                                                                cf.txt(f"{c}.texto", x.get("texto"), 300)))
    cf.evidencias("forcas.evidencias", f.get("evidencias"))
    return bool(empurra or segura)


def _decide(cf: Conferencia, d) -> bool:
    if not cf.obj("decide", d, ("caminho", "posicao", "criterios", "evidencias")):
        return False
    tem = False
    cam = d.get("caminho")
    if cam is not None and cf.obj("decide.caminho", cam, ("pontos",)):
        def ponto(c, x):
            if not cf.obj(c, x, ("etapa", "texto", "estado", "alerta", "origem")):
                return
            cf.txt(f"{c}.etapa", x.get("etapa"), 40)
            cf.txt(f"{c}.texto", x.get("texto"), 200)
            if x.get("estado") not in ESTADOS:
                cf.p(f"{c}.estado: atua, fora ou vazamento")
            if x.get("estado") == "vazamento" and x.get("alerta") is None:
                cf.p(f"{c}.alerta: ponto de vazamento precisa do alerta: onde e por que a empresa perde gente ali")
            cf.txt(f"{c}.alerta", x.get("alerta"), 200, obrig=False)
            cf.origem(f"{c}.origem", x.get("origem"))
        tem = bool(cf.lista("decide.caminho.pontos", cam.get("pontos"), 3, 8, ponto, obrig=True))
    pos = d.get("posicao")
    if pos is not None and cf.obj("decide.posicao", pos, ("eixo_x", "eixo_y", "pontos", "leitura", "ressalva", "evidencias")):
        tem = True
        for eixo, polos in (("eixo_x", ("esq", "dir")), ("eixo_y", ("baixo", "cima"))):
            e = pos.get(eixo)
            if cf.obj(f"decide.posicao.{eixo}", e, polos):
                for k in polos:
                    cf.txt(f"decide.posicao.{eixo}.{k}", e.get(k), 30)

        def ponto_mapa(c, x):
            if not cf.obj(c, x, ("nome", "x", "y", "nosso", "origem")):
                return
            cf.txt(f"{c}.nome", x.get("nome"), 40)
            for k in ("x", "y"):
                if not _inteiro(x.get(k), 0, 100):
                    cf.p(f"{c}.{k}: inteiro de 0 a 100")
            if "nosso" in x and not isinstance(x["nosso"], bool):
                cf.p(f"{c}.nosso: true ou false")
            if cf.origem(f"{c}.origem", x.get("origem")) == "hipotese":
                cf.p(f"{c}.origem: alternativa no mapa só se o dono citou ou a pesquisa mostrou; hipótese não entra")
        pontos = cf.lista("decide.posicao.pontos", pos.get("pontos"), 2, 7, ponto_mapa, obrig=True)
        nossos = sum(1 for x in pontos if isinstance(x, dict) and x.get("nosso") is True)
        if pontos and nossos != 1:
            cf.p(f"decide.posicao.pontos: exatamente 1 ponto com \"nosso\": true, a própria empresa (tem {nossos})")
        nomes = [x.get("nome") for x in pontos if isinstance(x, dict)]
        if len(nomes) != len(set(map(str, nomes))):
            cf.p("decide.posicao.pontos: nome repetido; cada alternativa aparece uma vez")
        cf.afirmacao("decide.posicao.leitura", pos.get("leitura"), 700)
        cf.txt("decide.posicao.ressalva", pos.get("ressalva"), 300, obrig=False)
        cf.evidencias("decide.posicao.evidencias", pos.get("evidencias"))

    def criterio(c, x):
        if not cf.obj(c, x, ("termo", "significado", "origem")):
            return
        cf.txt(f"{c}.termo", x.get("termo"), 30)
        cf.txt(f"{c}.significado", x.get("significado"), 200)
        cf.origem(f"{c}.origem", x.get("origem"))
    tem = bool(cf.lista("decide.criterios", d.get("criterios"), 0, 6, criterio)) or tem
    cf.evidencias("decide.evidencias", d.get("evidencias"))
    return tem


def _onde(cf: Conferencia, o) -> bool:
    if not cf.obj("onde", o, ("zonas", "nao_alcancado", "evidencias")):
        return False

    def zona(c, z):
        if not cf.obj(c, z, ("tipo", "lugares", "como_chegar")):
            return
        if z.get("tipo") not in ZONAS:
            cf.p(f"{c}.tipo: cruza, informa, compara ou escuta")
        cf.lista(f"{c}.lugares", z.get("lugares"), 1, 5, lambda c2, x: cf.afirmacao(c2, x, 220), obrig=True)
        cf.txt(f"{c}.como_chegar", z.get("como_chegar"), 300)
    zonas = cf.lista("onde.zonas", o.get("zonas"), 1, 4, zona, obrig=True)
    tipos = [z.get("tipo") for z in zonas if isinstance(z, dict)]
    if len(tipos) != len(set(map(str, tipos))):
        cf.p("onde.zonas: tipo de zona repetido; junte os lugares numa zona só")
    cf.txt("onde.nao_alcancado", o.get("nao_alcancado"), 400, obrig=False)
    cf.evidencias("onde.evidencias", o.get("evidencias"))
    return bool(zonas)


def _sabe(cf: Conferencia, s) -> bool:
    if not cf.obj("sabe", s, ("degraus", "foco", "leitura", "evidencias")):
        return False

    def degrau(c, x):
        if not cf.obj(c, x, ("nivel", "sinal", "onde", "o_que_dizer")):
            return
        if not _inteiro(x.get("nivel"), 1, 5):
            cf.p(f"{c}.nivel: inteiro de 1 a 5")
        cf.txt(f"{c}.sinal", x.get("sinal"), 160)
        cf.txt(f"{c}.onde", x.get("onde"), 140, obrig=False)
        cf.txt(f"{c}.o_que_dizer", x.get("o_que_dizer"), 260)
    degraus = cf.lista("sabe.degraus", s.get("degraus"), 5, 5, degrau, obrig=True)
    niveis = sorted(x.get("nivel") for x in degraus if isinstance(x, dict) and _inteiro(x.get("nivel"), 1, 5))
    if degraus and niveis != [1, 2, 3, 4, 5]:
        cf.p("sabe.degraus: os 5 degraus, um de cada nível de 1 a 5")
    if not _inteiro(s.get("foco"), 1, 5):
        cf.p("sabe.foco: o nível de 1 a 5 do degrau de maior oportunidade")
    lei = s.get("leitura")
    if lei is not None and cf.obj("sabe.leitura", lei, ("paragrafos", "origem")):
        cf.lista("sabe.leitura.paragrafos", lei.get("paragrafos"), 1, 3, lambda c, x: cf.txt(c, x, 400), obrig=True)
        cf.origem("sabe.leitura.origem", lei.get("origem"))
    cf.evidencias("sabe.evidencias", s.get("evidencias"))
    return bool(degraus)


def _mensagem(cf: Conferencia, m) -> bool:
    if not cf.obj("mensagem", m, ("promessa_hoje", "promessa_sugerida", "risco", "onde_quando", "provas_tem",
                                  "provas_faltam", "duvidas", "evidencias")):
        return False
    tem = False
    if m.get("promessa_hoje") is not None:
        tem = True
        cf.afirmacao("mensagem.promessa_hoje", m["promessa_hoje"], 280, ("disse",))
    ps = m.get("promessa_sugerida")
    if ps is not None and cf.obj("mensagem.promessa_sugerida", ps, ("texto", "motivos", "origem", "evidencias")):
        tem = True
        if cf.txt("mensagem.promessa_sugerida.texto", ps.get("texto"), 160) and len(ps["texto"].split()) > 20:
            cf.p(f"mensagem.promessa_sugerida.texto: {len(ps['texto'].split())} palavras; a promessa cabe em 20")
        cf.lista("mensagem.promessa_sugerida.motivos", ps.get("motivos"), 0, 4, lambda c, x: cf.txt(c, x, 200))
        cf.origem("mensagem.promessa_sugerida.origem", ps.get("origem"))
        cf.evidencias("mensagem.promessa_sugerida.evidencias", ps.get("evidencias"), 0, 6)
    r = m.get("risco")
    if r is not None and cf.obj("mensagem.risco", r, ("titulo", "texto", "origem", "teste")):
        cf.txt("mensagem.risco.titulo", r.get("titulo"), 160)
        cf.txt("mensagem.risco.texto", r.get("texto"), 700)
        cf.origem("mensagem.risco.origem", r.get("origem"))
        cf.txt("mensagem.risco.teste", r.get("teste"), 300, obrig=False)
    if m.get("onde_quando") is not None:
        cf.afirmacao("mensagem.onde_quando", m["onde_quando"], 300)
    tem = bool(cf.lista("mensagem.provas_tem", m.get("provas_tem"), 0, 6,
                        lambda c, x: cf.afirmacao(c, x, 220, ("disse",)))) or tem

    def falta(c, x):
        if not cf.obj(c, x, ("texto", "origem")):
            return
        cf.txt(f"{c}.texto", x.get("texto"), 220)
        if x.get("origem") is not None:
            cf.origem(f"{c}.origem", x["origem"])
    cf.lista("mensagem.provas_faltam", m.get("provas_faltam"), 0, 6, falta)

    def duvida(c, x):
        if not cf.obj(c, x, ("duvida", "origem_duvida", "resposta", "origem_resposta", "pendencia")):
            return
        cf.txt(f"{c}.duvida", x.get("duvida"), 160)
        cf.origem(f"{c}.origem_duvida", x.get("origem_duvida"), ("disse", "pesquisa"))
        cf.txt(f"{c}.resposta", x.get("resposta"), 400)
        if cf.origem(f"{c}.origem_resposta", x.get("origem_resposta")) == "hipotese":
            cf.p(f"{c}.origem_resposta: resposta que o dono não deu não entra; tire a dúvida daqui e leve para as apostas")
        cf.txt(f"{c}.pendencia", x.get("pendencia"), 200, obrig=False)
    tem = bool(cf.lista("mensagem.duvidas", m.get("duvidas"), 0, 8, duvida)) or tem
    cf.evidencias("mensagem.evidencias", m.get("evidencias"))
    return tem


def _nao(cf: Conferencia, n) -> bool:
    if not cf.obj("nao", n, ("perfis",)):
        return False

    def perfil(c, x):
        if not cf.obj(c, x, ("perfil", "porque", "origem")):
            return
        cf.txt(f"{c}.perfil", x.get("perfil"), 120)
        cf.txt(f"{c}.porque", x.get("porque"), 300)
        cf.origem(f"{c}.origem", x.get("origem"))
    return bool(cf.lista("nao.perfis", n.get("perfis"), 1, 6, perfil, obrig=True))


def _apostas(cf: Conferencia, a) -> bool:
    if not cf.obj("apostas", a, ("itens", "roteiro")):
        return False

    def aposta(c, x):
        if not cf.obj(c, x, ("aposta", "por_que", "como_confirmar", "tempo")):
            return
        cf.txt(f"{c}.aposta", x.get("aposta"), 200)
        cf.txt(f"{c}.por_que", x.get("por_que"), 240)
        cf.txt(f"{c}.como_confirmar", x.get("como_confirmar"), 240)
        if x.get("tempo") not in TEMPOS:
            cf.p(f"{c}.tempo: {', '.join(TEMPOS)}")
    itens = cf.lista("apostas.itens", a.get("itens"), 1, 10, aposta, obrig=True)
    r = a.get("roteiro")
    if r is not None and cf.obj("apostas.roteiro", r, ("conversas", "minutos", "com_quem", "perguntas")):
        if not _inteiro(r.get("conversas"), 3, 10):
            cf.p("apostas.roteiro.conversas: inteiro de 3 a 10")
        if not _inteiro(r.get("minutos"), 10, 60):
            cf.p("apostas.roteiro.minutos: inteiro de 10 a 60")
        cf.txt("apostas.roteiro.com_quem", r.get("com_quem"), 300)
        cf.lista("apostas.roteiro.perguntas", r.get("perguntas"), 3, 5, lambda c, x: cf.txt(c, x, 200), obrig=True)
    return bool(itens)


def _semana(cf: Conferencia, s) -> bool:
    if not cf.obj("semana", s, ("acoes",)):
        return False

    def acao(c, x):
        if not cf.obj(c, x, ("acao", "resolve", "origem")):
            return
        cf.txt(f"{c}.acao", x.get("acao"), 240)
        cf.txt(f"{c}.resolve", x.get("resolve"), 200)
        if x.get("origem") is not None:
            cf.origem(f"{c}.origem", x["origem"])
    return bool(cf.lista("semana.acoes", s.get("acoes"), 1, 5, acao, obrig=True))


VALIDADORES = {"descobertas": None, "quem": _quem, "pensa": _pensa, "quer": _quer, "forcas": _forcas, "decide": _decide,
               "onde": _onde, "sabe": _sabe, "mensagem": _mensagem, "nao": _nao, "apostas": _apostas, "semana": _semana}


def _idade(cf: Conferencia, no, tipo: str | None = None, caminho: str = "") -> None:
    """Número seguido de 'anos' só em faixa ('de 30 a 45 anos') e só em item com origem disse ou pesquisa."""
    if isinstance(no, dict):
        o = no.get("origem")
        if isinstance(o, dict):
            tipo = o.get("tipo")
        for k, v in no.items():
            c = f"{caminho}.{k}" if caminho else k
            if isinstance(v, str):
                for m in RE_IDADE.finditer(v):
                    faixa = any(f.start() <= m.start() and m.end() <= f.end() for f in RE_FAIXA.finditer(v))
                    if not faixa:
                        cf.p(f"{c}: idade só como faixa, por exemplo 'de 30 a 45 anos', nunca um número só")
                    elif tipo not in ("disse", "pesquisa"):
                        cf.p(f"{c}: faixa de idade só com evidência: origem disse ou pesquisa; sem ela, apague a idade")
            else:
                _idade(cf, v, tipo, c)
    elif isinstance(no, list):
        for i, v in enumerate(no, 1):
            _idade(cf, v, tipo, f"{caminho}[{i}]")


def validar(d) -> list[str]:
    """PROBLEMA da forma (estrita) e das regras que dependem só do JSON. Lista vazia = ok."""
    if not isinstance(d, dict):
        return ["o bloco precisa ser um objeto JSON { ... }"]
    nomes = [d.get("empresa")] + [(d.get(k) or {}).get("texto") if isinstance(d.get(k), dict) else None
                                  for k in ("oferta", "onde_atende")]
    cf = Conferencia(tuple(n for n in nomes if isinstance(n, str)))
    cf.chaves("raiz", d, ("versao", "documento", "empresa", "oferta", "tipo_cliente", "onde_atende", "abertura")
              + IDS_CAPITULO + ("fontes",))
    if d.get("versao") != 1 or type(d.get("versao")) is not int:
        cf.p("versao: precisa ser o número 1")
    if d.get("documento") != "persona":
        cf.p("documento: precisa ser \"persona\"")
    cf.txt("empresa", d.get("empresa"), 80)
    if d.get("tipo_cliente") not in TIPOS_CLIENTE:
        cf.p("tipo_cliente: pessoa, empresa ou os-dois (vem da linha 'Tipo de cliente' do 0-escopo.md)")
    _validar_fontes(cf, d.get("fontes"))
    if d.get("oferta") is not None:
        cf.afirmacao("oferta", d["oferta"], 160)
    if d.get("onde_atende") is not None:
        cf.afirmacao("onde_atende", d["onde_atende"], 80)
    if d.get("abertura") is None:
        cf.p("abertura: falta a abertura (arquétipo e retrato)")
    else:
        _validar_abertura(cf, d["abertura"])
    if isinstance(d.get("fontes"), dict) and d["fontes"].get("busca_disponivel") is False and cf.fontes:
        cf.p("fontes: sem pesquisa (busca_disponivel false) não há fontes")
    com_conteudo = []
    for cap in IDS_CAPITULO:
        if d.get(cap) is None:
            continue
        cf.cap = cap
        antes = len(cf.problemas)
        if cap == "descobertas":
            _descobertas(cf, d[cap])
            tem = isinstance(d[cap], dict) and bool(d[cap].get("itens"))
        else:
            tem = VALIDADORES[cap](cf, d[cap])
        if not tem and len(cf.problemas) == antes:
            cf.p(f"{cap}: o capítulo está sem conteúdo; preencha ou tire a chave")
        if tem:
            com_conteudo.append(cap)
        if cap in CAPITULOS_COM_LEITURA and tem and not set(cf.tipos.get(cap, [])) & {"leitura", "hipotese"}:
            cf.p(f"{cap}: nenhuma afirmação é leitura sua nem hipótese. O texto principal é a sua interpretação: junte "
                 "as evidências numa conclusão (origem leitura com as refs) ou afirme uma hipótese com a razão; a "
                 "resposta do dono vai em evidencias")
        tipos = cf.tipos.get(cap, [])
        if cap in CAPITULOS_DE_FATOS and tem and tipos.count("disse") * 2 > len(tipos):
            cf.p(f"{cap}: {tipos.count('disse')} de {len(tipos)} afirmações são 'disse'; neste capítulo de fatos no "
                 "máximo metade copia o dono. Para cada fato, responda o que isso significa para a venda e o que o dono "
                 "não está vendo, e escreva essa resposta como o texto (origem leitura, com a resposta do dono e outra "
                 "resposta ou um trecho nas refs). Onde o dossiê não diz, afirme uma hipótese pelo tipo de negócio, com "
                 "a razão. A resposta copiada vai em evidencias")
    cf.cap = ""
    if not com_conteudo:
        cf.p("nenhum capítulo com conteúdo: o estudo precisa de pelo menos um (comece pelas descobertas)")
    _idade(cf, {k: v for k, v in d.items() if k != "fontes"})
    return cf.problemas


# ---------------------------------------------------------------- regras que precisam do estudo (3.3)

def _literais(ctx: dict) -> str:
    dossie = ctx["dossie"]
    falas = [r for p in dossie["perguntas"].values() for r in p["respostas"]]
    falas += [r for _, _, r in ctx["entrevista"] or []]
    if ctx["confirmacao"]:
        falas.append(ctx["confirmacao"][1])
    return dp.normalizar(" ".join(falas))


def _aspas(problemas: list[str], no, ctx: dict, literal: str, fichas: dict, refs: tuple = (), caminho: str = "") -> None:
    """Frase entre aspas só se literal no dossiê, num relato ou no trecho de uma ficha citada no mesmo item."""
    if isinstance(no, dict):
        proprias = list(refs)
        for k in ("origem", "origem_duvida", "origem_resposta"):
            if isinstance(no.get(k), dict) and isinstance(no[k].get("refs"), list):
                proprias += no[k]["refs"]
        if isinstance(no.get("refs"), list):
            proprias += no["refs"]
        for k, v in no.items():
            c = f"{caminho}.{k}" if caminho else k
            if isinstance(v, str):
                for m in dp.RE_ASPAS.finditer(v):
                    frase = dp.normalizar(m.group(1) or m.group(2))
                    trechos = " ".join(str(fichas[int(r[1:-1])].get("trecho", "")) for r in proprias
                                       if isinstance(r, str) and RE_REF_PESQUISA.match(r) and int(r[1:-1]) in fichas)
                    if frase not in literal and frase not in dp.normalizar(trechos):
                        problemas.append(f"{c}: a frase entre aspas \"{(m.group(1) or m.group(2))[:60]}\" não está, letra por "
                                         "letra, no dossiê, numa resposta do dono nem no trecho de uma ficha citada no item; "
                                         "tire as aspas ou copie a frase literal")
            else:
                _aspas(problemas, v, ctx, literal, fichas, tuple(proprias), c)
    elif isinstance(no, list):
        for i, v in enumerate(no, 1):
            _aspas(problemas, v, ctx, literal, fichas, refs, f"{caminho}[{i}]")


def conferir_estudo(d: dict, ctx: dict, *, campos: bool = True) -> list[str]:
    """Regras 3 a 6 de 3.3 e, com `campos`, os campos do script iguais aos que o estudo dá hoje."""
    problemas: list[str] = []
    dossie = ctx["dossie"]
    perguntas = dossie["perguntas"]
    v2 = dossie.get("versao", 1) == 2
    apelidos: dict[str, list[str]] = {}
    for i, p in perguntas.items():
        for cod in p.get("codigos_v1", []):
            apelidos.setdefault(cod, []).append(i)
    datas = {data for data, _, _ in ctx["entrevista"] or []}
    if ctx["confirmacao"]:
        datas.add(ctx["confirmacao"][0])
    pesquisa = ctx["pesquisa"] or {}
    busca = pesquisa.get("busca_disponivel") is True
    fichas = fichas_validas(pesquisa) if busca else {}
    vistos: set[tuple[str, str]] = set()
    for c, r in refs_citadas(d):
        if (c, r) in vistos:
            continue
        vistos.add((c, r))
        m = RE_REF_RELATO.match(r)
        if m:
            if m.group(1) not in datas:
                problemas.append(f"{c}: cita o relato de {m.group(1)}, mas não há resposta do dono com essa data no "
                                 "5-entrevista.md nem é a data da confirmação do escopo")
            continue
        m = RE_REF_PESQUISA.match(r)
        if m:
            if not busca:
                problemas.append(f"{c}: cita {r}, mas não houve pesquisa (2-pesquisa.json sem busca): sem pesquisa, nada de [n]")
            elif int(m.group(1)) not in fichas:
                problemas.append(f"{c}: cita {r}, que não é ficha válida do 2-pesquisa.json")
            continue
        if not RE_REF_DOSSIE.match(r):
            continue
        alvo = r if r in perguntas else None
        if alvo is None and v2 and r in apelidos:
            if len(apelidos[r]) > 1:
                problemas.append(f"{c}: o código {r} aponta para mais de uma pergunta do dossiê ({', '.join(apelidos[r])})")
                continue
            alvo = apelidos[r][0]
        if alvo is None:
            problemas.append(f"{c}: cita a pergunta {r}, que não existe no dossiê")
        elif perguntas[alvo]["estado"] != "respondida":
            problemas.append(f"{c}: cita a pergunta {r}, mas o dossiê a deixou {perguntas[alvo]['estado']}")
    if not busca:
        for cap, no in d.items():
            if cap != "fontes" and '"tipo":"pesquisa"' in compacto({"x": no}).replace(" ", ""):
                problemas.append(f"{cap}: sem pesquisa, nenhuma origem nem evidência 'pesquisa'")
    _aspas(problemas, {k: v for k, v in d.items() if k != "fontes"}, ctx, _literais(ctx), fichas)
    if ctx["descobertas"] is not None and isinstance(d.get("descobertas"), dict):
        itens = d["descobertas"].get("itens") or []
        if isinstance(itens, list) and len(itens) != min(ctx["descobertas"], 3):
            problemas.append(f"descobertas.itens: o 4-descobertas.md tem {ctx['descobertas']} descoberta(s); "
                             "o estudo traz as mesmas, na mesma ordem")
        if ctx["extra"] != (d["descobertas"].get("extra") is not None):
            problemas.append("descobertas.extra: vai quando, e só quando, o 4-descobertas.md tem a seção '## Mais uma'")
    if campos:
        versao = ((d.get("abertura") or {}).get("versao") or {}) if isinstance(d.get("abertura"), dict) else {}
        esperado = campos_do_script(d, ctx, str(versao.get("numero", VERSAO_PADRAO)), str(versao.get("data", "")))
        for k in ("empresa", "oferta", "tipo_cliente", "onde_atende", "fontes"):
            if d.get(k) != esperado.get(k):
                problemas.append(f"{k}: diferente do que o estudo dá hoje (dossiê, 0-escopo.md, 2-pesquisa.json); "
                                 "rode persona_estudo.py montar de novo")
        if isinstance(versao, dict) and versao != esperado["versao_abertura"]:
            problemas.append("abertura.versao: as contagens não batem com o estudo de hoje; rode persona_estudo.py montar de novo")
    return problemas


# ---------------------------------------------------------------- markdown

def _juntar_e(itens: list[str]) -> str:
    return itens[0] if len(itens) == 1 else ", ".join(itens[:-1]) + " e " + itens[-1]


def marca(o: dict | None) -> str:
    """A marca de origem no fim da linha, na grafia que o dossie_para_persona.py lê."""
    if not o:
        return ""
    t, refs = o["tipo"], o.get("refs") or []
    if t == "hipotese":
        return f"(hipótese: {o['razao']})"
    if t == "pesquisa":
        return " ".join(f"(pesquisa {r})" for r in refs)
    if t == "disse":
        codigos = [r for r in refs if RE_REF_DOSSIE.match(r)]
        partes = [f"(dossiê {_juntar_e(codigos)})"] if codigos else []
        partes += [f"(relato do dono, {RE_REF_RELATO.match(r).group(1)})" for r in refs if RE_REF_RELATO.match(r)]
        return " ".join(partes)
    nomes = [f"dossiê {r}" if RE_REF_DOSSIE.match(r) else f"pesquisa {r}" if RE_REF_PESQUISA.match(r) else r for r in refs]
    return f"(análise: {' + '.join(nomes)})"


def _com(texto: str, o: dict | None) -> str:
    m = marca(o)
    return f"{texto} {m}" if m else texto


def _sem_ponto(texto: str) -> str:
    return texto.rstrip(" .")


def _evid(e: dict, prefixo: str = "- ") -> str:
    return prefixo + _com(e["texto"], {"tipo": e["tipo"], "refs": e["refs"]})


def _bloco_evidencias(linhas: list[str], evs) -> None:
    if evs:
        linhas += ["", "### De onde tirei", ""] + [_evid(e) for e in evs]


def _cap_descobertas(c: dict, d: dict) -> list[str]:
    linhas: list[str] = []
    for n, x in enumerate(c["itens"], 1):
        linhas += ["", f"### {n}. {_com(x['titulo'], x['origem'])}", "", f"- {x['corpo']}",
                   f"- Por que importa: {x['por_que_importa']}", f"- O que fazer: {x['o_que_fazer']}"]
        linhas += [_evid(e, "- De onde tirei: ") for e in x["evidencias"]]
    e = c.get("extra")
    if e:
        linhas += ["", f"- E mais uma: {_com(e['texto'], e['origem'])} Capítulo: {TITULOS[e['capitulo']]}."]
    return linhas


def _cap_quem(c: dict, d: dict) -> list[str]:
    linhas: list[str] = []
    if c.get("momento"):
        linhas += ["", f"- Momento: {_com(c['momento']['texto'], c['momento']['origem'])}"]
    if c.get("perfil"):
        linhas += ["", f"### {COLUNA_PERFIL[d['tipo_cliente']]}", ""] + [f"- {_com(a['texto'], a['origem'])}" for a in c["perfil"]]
    if c.get("pessoa"):
        linhas += ["", "### A pessoa", ""] + [f"- {_com(a['texto'], a['origem'])}" for a in c["pessoa"]]
    g = c.get("grupo_compra")
    if g:
        linhas += ["", "### Quem pesa na compra", ""]
        for p in g["papeis"]:
            base = f"{p['papel']}, {p['funcao']}, anel {p['nivel']}"
            linhas.append(f"- {_com(base + ': ' + p['texto'] if p.get('texto') else base + '.', p['origem'])}")
        if g.get("nota"):
            linhas.append(f"- Nota: {_com(g['nota']['texto'], g['nota']['origem'])}")
    _bloco_evidencias(linhas, c.get("evidencias"))
    return linhas


def _cap_pensa(c: dict, d: dict) -> list[str]:
    linhas: list[str] = []
    for k, nome in (("acredita", "Acredita"), ("teme", "Teme"), ("deseja", "Deseja")):
        if c.get(k):
            linhas += ["", f"### {nome}", ""] + [f"- {_com(a['texto'], a['origem'])}" for a in c[k]]
    e = c.get("espelho")
    if e:
        ps = e["paragrafos"]
        linhas += ["", "### Cuidado com o espelho", ""] + [f"- {p}" for p in ps[:-1]] + [f"- {_com(ps[-1], e['origem'])}"]
        linhas += [_evid(x, "- De onde tirei: ") for x in e["evidencias"]]
    _bloco_evidencias(linhas, c.get("evidencias"))
    return linhas


def _cap_quer(c: dict, d: dict) -> list[str]:
    linhas: list[str] = [""]
    for k, nome in (("pratico", "O prático"), ("ser_visto", "Ser visto"), ("sentir", "Sentir")):
        t = c.get(k)
        if t:
            linhas += [f"- {nome}: {_com(t['enunciado'], t['origem'])}", f"- O que isso pede: {t['o_que_pede']}"]
    _bloco_evidencias(linhas, c.get("evidencias"))
    return linhas


def _cap_forcas(c: dict, d: dict) -> list[str]:
    linhas = ["", f"- Inclinação: a balança pende para {NOME_INCLINACAO[c['inclinacao']]}"]
    if c.get("empurra"):
        linhas += ["", "### Empurra", ""]
        for x in c["empurra"]:
            linhas.append(f"- {_com(_sem_ponto(x['texto']) + ', peso ' + str(x['peso']) + (', ausente hoje' if x.get('ausente') else ''), x['origem'])}")
    if c.get("segura"):
        linhas += ["", "### Segura", ""]
        linhas += [f"- {_com(_sem_ponto(x['texto']) + ', peso ' + str(x['peso']), x['origem'])}" for x in c["segura"]]
    if c.get("leitura") or c.get("como_virar"):
        linhas.append("")
    if c.get("leitura"):
        linhas.append(f"- Leitura: {_com(c['leitura']['texto'], c['leitura']['origem'])}")
    linhas += [f"- Como virar: {_sem_ponto(x['titulo'])}. {x['texto']}" for x in c.get("como_virar") or []]
    _bloco_evidencias(linhas, c.get("evidencias"))
    return linhas


def _cap_decide(c: dict, d: dict) -> list[str]:
    linhas: list[str] = []
    if c.get("caminho"):
        linhas += ["", "### O caminho até comprar", ""]
        for p in c["caminho"]["pontos"]:
            texto = p["texto"] + (f" Alerta: {p['alerta']}" if p.get("alerta") else "")
            linhas.append(f"- {_com(p['etapa'] + ', ' + NOME_ESTADO[p['estado']] + ': ' + texto, p['origem'])}")
    pos = c.get("posicao")
    if pos:
        linhas += ["", "### Com o que o cliente compara", "",
                   f"- Eixos: {pos['eixo_x']['esq']} a {pos['eixo_x']['dir']}, na horizontal; "
                   f"{pos['eixo_y']['baixo']} a {pos['eixo_y']['cima']}, na vertical"]
        for p in pos["pontos"]:
            nome = p["nome"] + (", a própria empresa" if p.get("nosso") else "")
            linhas.append(f"- {_com(f'{nome}: {p['x']} de 100 na horizontal, {p['y']} de 100 na vertical', p['origem'])}")
        linhas.append(f"- {_com(pos['leitura']['texto'], pos['leitura']['origem'])}")
        if pos.get("ressalva"):
            linhas.append(f"- Ressalva: {pos['ressalva']}")
        linhas += [_evid(e, "- De onde tirei: ") for e in pos.get("evidencias") or []]
    if c.get("criterios"):
        linhas += ["", "### O que o cliente quer dizer quando avalia", ""]
        linhas += [f"- {_com(x['termo'] + ': ' + x['significado'], x['origem'])}" for x in c["criterios"]]
    _bloco_evidencias(linhas, c.get("evidencias"))
    return linhas


def _cap_onde(c: dict, d: dict) -> list[str]:
    linhas: list[str] = []
    por_tipo = {z["tipo"]: z for z in c["zonas"]}
    for tipo in ZONAS:
        z = por_tipo.get(tipo)
        if z:
            linhas += ["", f"### {NOME_ZONA[tipo]}", ""] + [f"- {_com(a['texto'], a['origem'])}" for a in z["lugares"]]
            linhas.append(f"- Como chegar: {z['como_chegar']}")
    if c.get("nao_alcancado"):
        linhas += ["", f"- O material não alcançou: {c['nao_alcancado']}"]
    _bloco_evidencias(linhas, c.get("evidencias"))
    return linhas


def _cap_sabe(c: dict, d: dict) -> list[str]:
    linhas: list[str] = [""]
    for g in sorted(c["degraus"], key=lambda x: x["nivel"]):
        nome = NOME_DEGRAU[g["nivel"]] + (", maior oportunidade" if g["nivel"] == c["foco"] else "")
        onde = f" Onde está: {_sem_ponto(g['onde'])}." if g.get("onde") else ""
        linhas += [f"- Degrau {g['nivel']}, {nome}: {g['sinal']}{onde}", f"- O que dizer: {g['o_que_dizer']}"]
    lei = c.get("leitura")
    if lei:
        ps = lei["paragrafos"]
        linhas += [""] + [f"- {p}" for p in ps[:-1]] + [f"- {_com(ps[-1], lei['origem'])}"]
    _bloco_evidencias(linhas, c.get("evidencias"))
    return linhas


def _cap_mensagem(c: dict, d: dict) -> list[str]:
    linhas: list[str] = [""]
    if c.get("promessa_hoje"):
        linhas.append(f"- Promessa hoje: {_com(c['promessa_hoje']['texto'], c['promessa_hoje']['origem'])}")
    ps = c.get("promessa_sugerida")
    if ps:
        linhas.append(f"- Promessa sugerida: {_com(ps['texto'], ps['origem'])}")
        linhas += [f"- Motivo da troca: {m}" for m in ps.get("motivos") or []]
        linhas += [_evid(e, "- De onde tirei: ") for e in ps.get("evidencias") or []]
    r = c.get("risco")
    if r:
        linhas.append(f"- Risco na promessa: {_com(r['titulo'] + ' ' + r['texto'], r['origem'])}")
        if r.get("teste"):
            linhas.append(f"- Como testar: {r['teste']}")
    if c.get("onde_quando"):
        linhas.append(f"- Onde e quando falar: {_com(c['onde_quando']['texto'], c['onde_quando']['origem'])}")
    linhas += [f"- Prova: {_com(a['texto'], a['origem'])}" for a in c.get("provas_tem") or []]
    linhas += [f"- Prova que falta: {_com(x['texto'], x.get('origem'))}" for x in c.get("provas_faltam") or []]
    for x in c.get("duvidas") or []:
        linhas += [f"- Dúvida: {_com(x['duvida'], x['origem_duvida'])}",
                   f"  - Resposta: {_com(x['resposta'], x['origem_resposta'])}"]
        if x.get("pendencia"):
            linhas.append(f"  - Falta confirmar: {x['pendencia']}")
    _bloco_evidencias(linhas, c.get("evidencias"))
    return linhas


def _cap_nao(c: dict, d: dict) -> list[str]:
    return [""] + [f"- {_com(_sem_ponto(x['perfil']) + ': ' + x['porque'], x['origem'])}" for x in c["perfis"]]


def _cap_apostas(c: dict, d: dict) -> list[str]:
    linhas: list[str] = [""]
    for a in c["itens"]:
        linhas += [f"- {a['aposta']} (hipótese: {a['por_que']})", f"- Como confirmar: {a['como_confirmar']}",
                   f"- Tempo: {NOME_TEMPO[a['tempo']]}"]
    r = c.get("roteiro")
    if r:
        linhas += ["", "### Roteiro de conversa", "", f"- Conversas: {r['conversas']}, de {r['minutos']} minutos. {r['com_quem']}"]
        linhas += [f"- Pergunta: {p}" for p in r["perguntas"]]
    return linhas


def _cap_semana(c: dict, d: dict) -> list[str]:
    linhas: list[str] = [""]
    for n, a in enumerate(c["acoes"], 1):
        linhas += [f"{n}. {_com(a['acao'], a.get('origem'))}", f"   - Resolve: {a['resolve']}"]
    return linhas


GERADORES = {"descobertas": _cap_descobertas, "quem": _cap_quem, "pensa": _cap_pensa, "quer": _cap_quer,
             "forcas": _cap_forcas, "decide": _cap_decide, "onde": _cap_onde, "sabe": _cap_sabe,
             "mensagem": _cap_mensagem, "nao": _cap_nao, "apostas": _cap_apostas, "semana": _cap_semana}


def gerar_markdown(d: dict, ctx: dict) -> str:
    """O persona.md inteiro, a partir do bloco já validado e do estudo (cabeçalho e Anexo)."""
    v = d["abertura"]["versao"]
    f = d["fontes"]
    pesquisa_txt = (f"pesquisa pública ({v['trechos']} trechos de {v['paginas']} páginas)"
                    if f["busca_disponivel"] and v["trechos"] else "sem pesquisa pública")
    linhas = [f"# Estudo do cliente ideal - {d['empresa']}", "", "- Estado: rascunho",
              f"- Versão: {v['numero']} ({v['data']})",
              f"- Fonte: dossiê da empresa, registro {v['registro_dossie']} (contexto/dossie/dossie-completo.md)"]
    for rotulo in ("Oferta em foco", "Tipo de cliente"):
        valor = linha_do_escopo(ctx["escopo"], rotulo)
        if valor:
            linhas.append(f"- {rotulo}: {valor}")
    linhas += [f"- Fontes usadas: dossiê ({v['perguntas_dossie']} perguntas, {v['sem_resposta']} sem resposta); "
               f"{pesquisa_txt}; {v['perguntas_dono']} perguntas ao dono",
               "- Origem do estudo: primeira versão, montada do que o dono respondeu e do que é público na internet. "
               "Nenhum cliente foi ouvido.",
               "- Como ler as marcas: (dossiê B5a) é o que o dono respondeu na pergunta B5a do dossiê; (relato do dono, "
               "data) é o que ele disse na conversa da montagem e está no Anexo; (pesquisa [3]) é o trecho número 3 das "
               "Fontes da pesquisa, com o trecho no Anexo; (análise: ...) é leitura do especialista tirada das referências "
               "depois de \"análise:\"; (hipótese: razão) é aposta do especialista, com a razão.",
               "", "## Em uma frase", "", f"- Arquétipo: {d['abertura']['arquetipo']['texto']}",
               f"- {_com(d['abertura']['retrato']['texto'], d['abertura']['retrato']['origem'])}"]
    for cap in IDS_CAPITULO:
        if d.get(cap):
            linhas += ["", f"## {TITULOS[cap]}"] + GERADORES[cap](d[cap], d)
    linhas += ["", "## Fontes da pesquisa", ""]
    if f["itens"]:
        linhas += [f"- [{x['n']}] {x['titulo']}. {x['url']}. Acessado em {x['data_acesso']}." for x in f["itens"]]
    else:
        linhas.append("- sem pesquisa na internet")
    linhas += [f"- Não encontrado: {x}" for x in f.get("nao_achado") or []]
    linhas += ["", "## Anexo: o que o dono disse na montagem", ""]
    entrevista = ctx["entrevista"] or []
    relatos = {RE_REF_RELATO.match(r).group(1) for _, r in refs_citadas(d) if RE_REF_RELATO.match(r)}
    if ctx["confirmacao"] and ctx["confirmacao"][0] in relatos - {data for data, _, _ in entrevista}:
        linhas.append(f'- {ctx["confirmacao"][0]} | Confirmação do escopo | Resposta do dono: "{ctx["confirmacao"][1]}"')
    if entrevista:
        linhas += [f'- {data} | Pergunta do time: {pergunta} | Resposta do dono: "{resposta}"'
                   for data, pergunta, resposta in entrevista]
    else:
        linhas.append("- Nenhuma pergunta foi feita ao dono além do dossiê.")
    if f["itens"]:
        fichas = fichas_validas(ctx["pesquisa"] or {})
        linhas += ["", "### Trechos da pesquisa", ""]
        linhas += [f'- [{x["n"]}] "{str(fichas[x["n"]].get("trecho", "")).strip()}" ({x["url"]})'
                   for x in f["itens"] if x["n"] in fichas]
    linhas += ["", TITULO_DADOS, "", "```persona-dados", compacto(d), "```", ""]
    return "\n".join(linhas)


# ---------------------------------------------------------------- bloco no documento

def extrair_bloco(texto: str) -> tuple[dict | None, list[str]]:
    """(dados, problemas) do bloco ```persona-dados do documento."""
    texto = _lf(texto)
    achados = list(RE_CERCA.finditer(texto))
    if not achados:
        return None, [f"não achei o bloco ```persona-dados na seção '{TITULO_DADOS}': rode persona_estudo.py montar"]
    problemas: list[str] = []
    if len(achados) > 1:
        problemas.append("há mais de um bloco persona-dados no documento; deixe só um (rode montar de novo)")
    m = achados[0]
    antes = [l for l in texto[:m.start()].split("\n") if l.startswith("## ")]
    if not antes or antes[-1].rstrip() != TITULO_DADOS:
        problemas.append(f"o bloco persona-dados precisa ficar dentro da seção '{TITULO_DADOS}'")
    corpo = m.group(1)
    if len(corpo.encode("utf-8")) > TETO_BLOCO:
        return None, problemas + [f"o bloco persona-dados passa de {TETO_BLOCO // 1024} KB; encurte os textos"]
    try:
        dados = json.loads(corpo)
    except ValueError as erro:
        return None, problemas + [f"o JSON do bloco está inválido ({erro})"]
    if not isinstance(dados, dict):
        return None, problemas + ["o bloco persona-dados precisa ser um objeto JSON { ... }"]
    return dados, problemas


def _comparavel(texto: str) -> str:
    linhas = [l for l in _lf(texto).split("\n") if not l.startswith("- Estado:") and not aprovacao.RE_QUALQUER.match(l)]
    return aprovacao.normalizar("\n".join(linhas))


def conferir_documento(texto: str, ctx: dict) -> tuple[dict | None, list[str]]:
    """Tudo de 3.3 sobre o persona.md: o bloco, o estudo e o markdown em dia."""
    if len(texto.encode("utf-8")) > TETO_DOCUMENTO:
        return None, [f"o persona.md passa de {TETO_DOCUMENTO // 1024} KB"]
    d, problemas = extrair_bloco(texto)
    if d is None:
        return None, problemas
    forma = validar(d)
    problemas += forma
    problemas += conferir_estudo(d, ctx)
    if not forma:
        if _comparavel(gerar_markdown(d, ctx)) != _comparavel(texto):
            problemas.append("o persona.md não está em dia com o bloco e o estudo (alguém mexeu no texto ou o estudo "
                             "mudou): rode persona_estudo.py montar de novo, nunca edite o persona.md à mão")
    return d, problemas


def montar(d_modelo, ctx: dict, numero: str, data: str) -> tuple[dict | None, str | None, list[str]]:
    """(bloco, markdown, problemas). Com problema, nada para gravar."""
    if not isinstance(d_modelo, dict):
        return None, None, ["o 6-estudo.json precisa ser um objeto JSON { ... }"]
    faltam = [rel for rel, chave in ((ESCOPO, "escopo"), (PESQUISA, "pesquisa"), (ENTREVISTA, "entrevista"))
              if ctx[chave] is None]
    if faltam:
        return None, None, [f"falta {rel}: faça a etapa dele antes" for rel in faltam]
    if not RE_NUMERO_VERSAO.match(numero):
        return None, None, ["--versao no formato N.N, como 1.0"]
    if not RE_DATA.match(data):
        return None, None, ["--data no formato AAAA-MM-DD"]
    d = preencher(d_modelo, ctx, numero, data)
    problemas = validar(d)
    problemas += conferir_estudo(d, ctx, campos=False)
    if problemas:
        return d, None, problemas
    texto = gerar_markdown(d, ctx)
    if len(compacto(d).encode("utf-8")) > TETO_BLOCO:
        return d, None, [f"o bloco passa de {TETO_BLOCO // 1024} KB; encurte os textos"]
    if len(texto.encode("utf-8")) > TETO_DOCUMENTO:
        return d, None, [f"o persona.md passaria de {TETO_DOCUMENTO // 1024} KB; encurte os textos"]
    return d, texto, []


def versao_existente(casa: Path, saida: str) -> str:
    texto = _ler(casa, saida)
    if texto:
        d, _ = extrair_bloco(texto)
        numero = (((d or {}).get("abertura") or {}).get("versao") or {}).get("numero") if isinstance(d, dict) else None
        if isinstance(numero, str) and RE_NUMERO_VERSAO.match(numero):
            return numero
    return VERSAO_PADRAO


# ---------------------------------------------------------------- linha de comando

def _utf8() -> None:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def _imprimir(problemas: list[str], onde: str) -> int:
    for p in problemas:
        print(f"PROBLEMA: {p}")
    print(f"{len(problemas)} problema(s) em {onde}. Corrija o 6-estudo.json e rode montar de novo.")
    return 1


def main(argv: list[str] | None = None) -> int:
    _utf8()
    ap = argparse.ArgumentParser(prog="persona_estudo.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("montar")
    m.add_argument("--entrada", default=ENTRADA)
    m.add_argument("--saida", default=PERSONA)
    m.add_argument("--versao")
    m.add_argument("--data")
    m.add_argument("--casa", default=".")
    for nome in ("validar", "conferir", "extrair"):
        s = sub.add_parser(nome)
        s.add_argument("--arquivo", default=PERSONA)
        s.add_argument("--casa", default=".")
    try:
        a = ap.parse_args(argv)
    except SystemExit as erro:
        return 2 if erro.code else 0
    casa = Path(a.casa)
    if not casa.is_dir():
        print(f"ERRO: {a.casa} não é uma pasta", file=sys.stderr)
        return 2
    alvo = a.entrada if a.cmd == "montar" else a.arquivo
    try:
        texto = _ler(casa, alvo)
    except UnicodeError:
        print(f"ERRO: {alvo} não está em UTF-8", file=sys.stderr)
        return 2
    if texto is None:
        print(f"ERRO: {alvo} não existe" + (" (escreva o JSON do estudo pela etapa 6)" if a.cmd == "montar" else
                                            " (rode persona_estudo.py montar)"), file=sys.stderr)
        return 2
    if a.cmd in ("validar", "extrair"):
        d, problemas = extrair_bloco(texto)
        if d is not None and a.cmd == "validar":
            problemas += validar(d)
        if problemas:
            return _imprimir(problemas, alvo)
        if a.cmd == "extrair":
            print(json.dumps(d, ensure_ascii=False, indent=2))
        else:
            print(f"OK: o bloco de {alvo} tem a forma do contrato.")
        return 0
    try:
        ctx = contexto(casa)
    except FileNotFoundError:
        print(f"FALTA: não achei o dossiê em {dp.DOSSIE}. O dossiê vem primeiro; sem ele não há estudo.", file=sys.stderr)
        return 1
    except dp.VersaoDesconhecida as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: não consegui ler o estudo ({type(erro).__name__})", file=sys.stderr)
        return 1
    if a.cmd == "conferir":
        _, problemas = conferir_documento(texto, ctx)
        if problemas:
            return _imprimir(problemas, alvo)
        print(f"OK: {alvo} confere com o contrato, o dossiê e o estudo.")
        return 0
    try:
        d_modelo = json.loads(texto)
    except ValueError as erro:
        return _imprimir([f"o 6-estudo.json não é JSON válido ({erro}); confira vírgulas e aspas"], alvo)
    numero = a.versao or versao_existente(casa, a.saida)
    _, md, problemas = montar(d_modelo, ctx, numero, a.data or date.today().isoformat())
    if problemas:
        return _imprimir(problemas, alvo)
    destino = Path(a.saida) if Path(a.saida).is_absolute() else casa / a.saida
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(md, encoding="utf-8", newline="\n")
    print(f"FEITO: {a.saida} montado (versão {numero}). Rode persona_estudo.py conferir para conferir.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
