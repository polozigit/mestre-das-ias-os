#!/usr/bin/env python3
"""marca_dados.py: confere o bloco `marca-dados` dos documentos da marca e gera os tokens do sistema.

O bloco é JSON cercado por ```marca-dados, um por documento, dentro da seção "## Dados para o sistema"
(só o bloco). É a fonte única para a tela Marca (mostra a identidade inteira) e para
empresa/marca/tokens.json (o que a etapa de aplicar a marca no sistema lê). Três documentos carregam o
bloco: identidade-visual.md ("documento": "identidade"), tom-de-voz.md ("voz") e logo/logo.md ("logo").

Uso (da raiz do projeto):
  marca_dados.py validar  --arquivo empresa/marca/identidade-visual.md
  marca_dados.py conferir --arquivo empresa/marca/identidade-visual.md [--dossie contexto/dossie/dossie-completo.md]
  marca_dados.py tokens   --arquivo empresa/marca/identidade-visual.md [--saida empresa/marca/tokens.json] [--check]
  marca_dados.py extrair  --arquivo empresa/marca/tom-de-voz.md
  (todos aceitam --casa PASTA, a raiz do projeto; padrão: pasta atual)

validar   confere só o bloco: HEX #RRGGBB maiúsculo, função da cor, nomes únicos, todo HEX do bloco na tabela
          da seção Cores (e o contrário), razão de contraste recalculada pela MESMA conta do paleta.py
          (cortada em 2 casas; diferente é erro; par de texto precisa de 4,5), tipografia (até 2 famílias
          fora a reserva, licença conferida), as 4 escalas de voz (posição de 1 a 5), arquivos do logo
          (empresa/marca/, existem) e materiais iguais à seção Fontes (número, tipo e data). Bloco até 32 KB.
conferir  tudo do validar mais: títulos das seções na ordem do modelo, marcas de origem (dossiê, persona,
          site [n], instagram [n], apresentação [n], logo [n], pesquisa [n], proposta do time, hipótese),
          cada [n] existe em Fontes com o tipo certo, marca de dossiê aponta pergunta respondida, frase entre
          aspas (4 palavras ou mais) está no dossiê ou no Anexo, e sobrou algum <...> de modelo. Uma linha de
          exemplo (começa com "- Certo:" ou "- Errado:", ou tem "Exemplo:") marcada (proposta do time) pode ter
          frase entre aspas que não está no dossiê: é redação nova, não fala do cliente.
tokens    escreve empresa/marca/tokens.json (DTCG 2025.10) a partir do bloco da identidade; lê, ao lado, o
          tom-de-voz.md e o logo/logo.md se existirem. Determinístico. --check não escreve: sai 1 se o
          arquivo no disco difere do que sairia.
extrair   imprime o JSON do bloco (usado nos testes).

Saída: 0 ok; 1 problema achado (a lista sai em linhas PROBLEMA); 2 uso errado (arquivo que não existe).
Só stdlib (Python 3.10+), sem rede. A conta de contraste vem do paleta.py (ao lado) e a leitura do dossiê
vem do dossie_para_persona.py (marketing-persona): nada é copiado.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from datetime import date
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SKILLS = AQUI.parent.parent


def _carregar(nome: str, caminho: Path):
    """Importa um script vizinho por caminho (reusa o módulo se o processo já o carregou)."""
    atual = sys.modules.get(nome)
    if atual is not None and Path(getattr(atual, "__file__", "") or "").resolve() == caminho.resolve():
        return atual
    spec = importlib.util.spec_from_file_location(nome, caminho)
    if spec is None or spec.loader is None:
        raise ImportError(f"não achei {caminho}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    sys.modules.setdefault(nome, modulo)  # quem importar o mesmo nome depois recebe este módulo, não uma segunda cópia
    return modulo


paleta = _carregar("paleta", AQUI / "paleta.py")
dp = _carregar("dossie_para_persona", SKILLS / "marketing-persona" / "scripts" / "dossie_para_persona.py")

ORIGENS = ("dossie", "persona", "site", "instagram", "apresentacao", "logo", "pesquisa", "proposta", "hipotese")
FUNCOES = ("principal", "apoio", "destaque", "fundo", "texto", "neutro")
USOS_PAR = ("texto", "destaque")
USOS_FONTE = ("titulos", "texto", "reserva")
TIPOS_FONTE = ("google", "sistema", "outra")
LICENCAS = ("OFL", "Apache", "sistema")
EIXOS = ("formal-casual", "serio-engracado", "respeitoso-irreverente", "factual-entusiasmado")
PAPEIS_LOGO = ("principal", "icone", "claro", "escuro", "svg")
TIPOS_MATERIAL = ("site", "instagram", "apresentacao", "logo", "pesquisa")
DOCUMENTOS = ("identidade", "voz", "logo")
TETO_BLOCO = 32 * 1024
MAX_PALAVRAS = 5

RE_HEX = re.compile(r"^#[0-9A-F]{6}$")
RE_FAMILIA = re.compile(r"^[A-Za-z0-9 ]{1,40}$")
RE_ARQUIVO_LOGO = re.compile(r"^empresa/marca/[a-z0-9][a-z0-9/_.-]*\.(png|jpg|jpeg|webp|svg)$")
RE_NOME_COR = re.compile(r"^[^/|=\r\n]{1,40}$")
RE_ARQUETIPO = re.compile(r"^[A-Za-zÀ-ÿ ]{1,40}$")
RE_ALVO = re.compile(r"^(https?://\S+|contexto/fontes-originais/\S+|@[A-Za-z0-9_.]{1,30})$")
RE_CERCA = re.compile(r"^```marca-dados[ \t]*\n(.*?)^```[ \t]*$", re.M | re.S)
RE_FONTE = re.compile(r"^- \[(\d+)\] ([^:]+): (.+?)\.? Visto em (\d{4}-\d{2}-\d{2})\.?$")
RE_MARCA_NOVA = re.compile(r"\((site|instagram|apresentacao|logo|pesquisa)((?:\s*\[\d+\])*)\)")
PREFIXO_ASPAS = "frase entre aspas que não está no dossiê nem no Anexo"
RE_PROBLEMA_ASPAS = re.compile(r"^linha (\d+): " + re.escape(PREFIXO_ASPAS))
TITULO_DADOS = "## Dados para o sistema"

SECOES_IDENTIDADE = ("## 1. Plataforma da marca", "## 2. Personalidade e arquétipo", "## 3. Logo", "## 4. Cores",
                     "## 5. Tipografia", "## 6. Imagem e elementos", "## 7. Aplicações", "## 8. Regras de ouro",
                     "## 9. Fontes", "## Anexo", TITULO_DADOS)
SECOES_VOZ = ("## 1. Como a marca soa", "## 2. Traços de voz", "## 3. Tom por situação", "## 4. Faça e não faça",
              "## 5. Vocabulário", "## 6. Exemplos certo e errado por canal", "## 7. O que nunca prometemos",
              "## 8. Teste com leitores reais", "## 9. Fontes", "## Anexo", TITULO_DADOS)
SUBSECOES_ANEXO_IDENTIDADE = ("### O que o dono disse", "### Trechos dos materiais")


def sem_acento(texto: str) -> str:
    return dp.sem_acento(texto)


def _lf(texto: str) -> str:
    return texto.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")


# ---------------------------------------------------------------- leitura do bloco

def extrair_bloco(texto: str) -> tuple[dict | None, list[str]]:
    """(dados, erros). Dados é None se não há bloco legível."""
    texto = _lf(texto)
    achados = list(RE_CERCA.finditer(texto))
    if not achados:
        return None, [f"não achei o bloco ```marca-dados dentro de '{TITULO_DADOS}'"]
    erros: list[str] = []
    if len(achados) > 1:
        erros.append("há mais de um bloco marca-dados no documento; deixe só um")
    m = achados[0]
    linhas_antes = texto[:m.start()].split("\n")
    posicoes = [i for i, l in enumerate(linhas_antes) if l.startswith("## ")]
    if not posicoes or linhas_antes[posicoes[-1]].rstrip() != TITULO_DADOS:
        erros.append(f"o bloco marca-dados precisa ficar dentro da seção '{TITULO_DADOS}'")
    elif any(l.strip() for l in linhas_antes[posicoes[-1] + 1:]):
        erros.append(f"a seção '{TITULO_DADOS}' deve ter só o bloco, sem texto antes dele")
    if texto[m.end():].strip():
        erros.append(f"a seção '{TITULO_DADOS}' deve ter só o bloco, sem texto depois dele")
    corpo = m.group(1)
    if len(corpo.encode("utf-8")) > TETO_BLOCO:
        erros.append(f"o bloco marca-dados passa de {TETO_BLOCO // 1024} KB")
        return None, erros
    inicio = texto[:m.start(1)].count("\n")
    try:
        dados = json.loads(corpo)
    except json.JSONDecodeError as erro:
        erros.append(f"o JSON do bloco está inválido (linha {inicio + erro.lineno}, coluna {erro.colno}: {erro.msg})")
        return None, erros
    if not isinstance(dados, dict):
        erros.append("o bloco marca-dados precisa ser um objeto JSON { ... }")
        return None, erros
    return dados, erros


# ---------------------------------------------------------------- Fontes do documento

def ler_fontes(texto: str) -> tuple[dict[int, tuple[str, str, str]], list[str]]:
    """({n: (tipo, alvo, data)}, problemas) da seção '## 9. Fontes'."""
    fontes: dict[int, tuple[str, str, str]] = {}
    problemas: list[str] = []
    for titulo, _, linhas in dp.secoes(_lf(texto)):
        if titulo != "fontes":
            continue
        for numero, linha in linhas:
            s = linha.strip()
            if not s.startswith("- ["):
                continue
            m = RE_FONTE.match(s)
            if not m:
                problemas.append(f"linha {numero}: fonte fora do formato '- [n] tipo: endereço Visto em AAAA-MM-DD.'")
                continue
            n, tipo, alvo, data = int(m.group(1)), sem_acento(m.group(2)).strip().lower(), m.group(3).strip(), m.group(4)
            if n in fontes:
                problemas.append(f"linha {numero}: a fonte [{n}] está repetida")
            if tipo not in TIPOS_MATERIAL:
                problemas.append(f"linha {numero}: tipo de fonte '{m.group(2).strip()}' não existe "
                                 "(use site, instagram, apresentação, logo ou pesquisa)")
            if not RE_ALVO.match(alvo):
                problemas.append(f"linha {numero}: o alvo da fonte [{n}] precisa ser https://..., "
                                 "contexto/fontes-originais/... ou @perfil")
            try:
                if date.fromisoformat(data) > date.today():
                    problemas.append(f"linha {numero}: a data da fonte [{n}] está no futuro ({data})")
            except ValueError:
                problemas.append(f"linha {numero}: a data da fonte [{n}] não existe ({data})")
            fontes[n] = (tipo, alvo, data)
    return fontes, problemas


# ---------------------------------------------------------------- validação do bloco

def _inteiro(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _numero(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _texto(v, teto: int = 300) -> bool:
    return isinstance(v, str) and 0 < len(v.strip()) <= teto and not re.search(r"[\x00-\x1f]", v)


def _lista_de_palavras(rotulo: str, v, erros: list[str], minimo: int = 0) -> None:
    if not isinstance(v, list):
        erros.append(f"{rotulo} precisa ser uma lista")
        return
    if len(v) > MAX_PALAVRAS:
        erros.append(f"{rotulo} tem {len(v)} itens; o máximo é {MAX_PALAVRAS}")
    if len(v) < minimo:
        erros.append(f"{rotulo} precisa de pelo menos {minimo} item")
    for i, p in enumerate(v):
        if not _texto(p, 40):
            erros.append(f"{rotulo}[{i}] precisa ser uma palavra de até 40 caracteres")


def hex_da_tabela_de_cores(texto: str) -> set[str] | None:
    for titulo, _, linhas in dp.secoes(_lf(texto)):
        if titulo == "cores":
            return {h.upper() for _, l in linhas if l.lstrip().startswith("|") for h in re.findall(r"#[0-9A-Fa-f]{6}\b", l)}
    return None


def _validar_identidade(d: dict, texto: str) -> list[str]:
    erros: list[str] = []
    pers = d.get("personalidade")
    if not isinstance(pers, dict):
        erros.append("falta 'personalidade' (palavras e arquétipo)")
    else:
        _lista_de_palavras("personalidade.palavras", pers.get("palavras"), erros, 1)
        arq = pers.get("arquetipo")
        if not isinstance(arq, dict):
            erros.append("falta 'personalidade.arquetipo' com 'principal' e 'secundario'")
        else:
            if not (isinstance(arq.get("principal"), str) and RE_ARQUETIPO.match(arq["principal"])):
                erros.append("personalidade.arquetipo.principal precisa ser o nome de um arquétipo")
            sec = arq.get("secundario")
            if sec is not None and not (isinstance(sec, str) and RE_ARQUETIPO.match(sec)):
                erros.append("personalidade.arquetipo.secundario precisa ser um nome ou null")
    cores = d.get("cores")
    hex_do_bloco: set[str] = set()
    por_nome: dict[str, str] = {}
    if not isinstance(cores, list) or not 2 <= len(cores) <= 12:
        erros.append("'cores' precisa ser uma lista de 2 a 12 cores")
        cores = []
    for i, c in enumerate(cores):
        rotulo = f"cores[{i}]"
        if not isinstance(c, dict):
            erros.append(f"{rotulo} precisa ser um objeto")
            continue
        nome, hex_ = c.get("nome"), c.get("hex")
        if not (isinstance(nome, str) and RE_NOME_COR.match(nome) and nome == nome.strip()):
            erros.append(f"{rotulo}.nome precisa ter de 1 a 40 caracteres, sem / | nem =")
        elif nome in por_nome:
            erros.append(f"{rotulo}.nome '{nome}' está repetido")
        if not (isinstance(hex_, str) and RE_HEX.match(hex_)):
            erros.append(f"{rotulo}.hex {str(hex_)[:12]!r} precisa ser #RRGGBB com letras maiúsculas")
        else:
            hex_do_bloco.add(hex_)
            if isinstance(nome, str):
                por_nome.setdefault(nome, hex_)
        if c.get("funcao") not in FUNCOES:
            erros.append(f"{rotulo}.funcao precisa ser uma de: {', '.join(FUNCOES)}")
        if c.get("origem") not in ORIGENS:
            erros.append(f"{rotulo}.origem precisa ser uma de: {', '.join(ORIGENS)}")
    na_tabela = hex_da_tabela_de_cores(texto)
    if na_tabela is None:
        erros.append("não achei a seção '## 4. Cores' com a tabela de cores")
    else:
        for h in sorted(hex_do_bloco - na_tabela):
            erros.append(f"o HEX {h} está no bloco mas não na tabela da seção Cores")
        for h in sorted(na_tabela - hex_do_bloco):
            erros.append(f"o HEX {h} está na tabela da seção Cores mas não no bloco")
    pares = d.get("pares")
    if not isinstance(pares, list):
        erros.append("'pares' precisa ser uma lista (pode ser vazia)")
        pares = []
    for i, p in enumerate(pares):
        rotulo = f"pares[{i}]"
        if not isinstance(p, dict):
            erros.append(f"{rotulo} precisa ser um objeto")
            continue
        t, f = p.get("texto"), p.get("fundo")
        if t not in por_nome or f not in por_nome:
            erros.append(f"{rotulo}: 'texto' e 'fundo' precisam ser nomes de cores do bloco")
            continue
        if p.get("uso") not in USOS_PAR:
            erros.append(f"{rotulo}.uso precisa ser 'texto' ou 'destaque'")
        if not _numero(p.get("razao")):
            erros.append(f"{rotulo}.razao precisa ser um número")
            continue
        real = paleta.razao(por_nome[t], por_nome[f])
        if round(p["razao"] * 100) != round(paleta.cortar(real) * 100):
            erros.append(f"{rotulo} ({t} sobre {f}): razão declarada {p['razao']}, a conta do paleta.py dá "
                         f"{paleta.cortar(real)}")
        if p.get("uso") == "texto" and real < paleta.MIN_TEXTO:
            erros.append(f"{rotulo} ({t} sobre {f}): razão {paleta.cortar(real)} não serve como texto "
                         f"(mínimo {paleta.MIN_TEXTO}); use 'destaque' ou troque a cor")
    tipografia = d.get("tipografia")
    if not isinstance(tipografia, list):
        erros.append("'tipografia' precisa ser uma lista (pode ser vazia)")
        tipografia = []
    familias_de_texto: set[str] = set()
    for i, t in enumerate(tipografia):
        rotulo = f"tipografia[{i}]"
        if not isinstance(t, dict):
            erros.append(f"{rotulo} precisa ser um objeto")
            continue
        if t.get("uso") not in USOS_FONTE:
            erros.append(f"{rotulo}.uso precisa ser uma de: {', '.join(USOS_FONTE)}")
        fam = t.get("familia")
        if not (isinstance(fam, str) and RE_FAMILIA.match(fam)):
            erros.append(f"{rotulo}.familia precisa ter só letras, números e espaço (até 40)")
        elif t.get("uso") != "reserva":
            familias_de_texto.add(fam)
        pesos = t.get("pesos")
        if not (isinstance(pesos, list) and pesos and all(_inteiro(p) and 100 <= p <= 900 and p % 100 == 0 for p in pesos)):
            erros.append(f"{rotulo}.pesos precisa ser uma lista de pesos como 400 e 700")
        if t.get("fonte") not in TIPOS_FONTE:
            erros.append(f"{rotulo}.fonte precisa ser uma de: {', '.join(TIPOS_FONTE)}")
        if t.get("licenca") not in LICENCAS:
            erros.append(f"{rotulo}.licenca precisa ser {', '.join(LICENCAS)}: fonte sem licença conferida não entra no bloco")
        if t.get("origem") not in ORIGENS:
            erros.append(f"{rotulo}.origem precisa ser uma de: {', '.join(ORIGENS)}")
    if len(familias_de_texto) > 2:
        erros.append(f"são {len(familias_de_texto)} famílias fora a reserva; o máximo é 2")
    materiais = d.get("materiais")
    if not isinstance(materiais, list):
        erros.append("'materiais' precisa ser uma lista (pode ser vazia)")
        materiais = []
    fontes, problemas_fontes = ler_fontes(texto)
    erros.extend(problemas_fontes)
    vistos: set[int] = set()
    for i, mat in enumerate(materiais):
        rotulo = f"materiais[{i}]"
        if not isinstance(mat, dict):
            erros.append(f"{rotulo} precisa ser um objeto")
            continue
        n = mat.get("n")
        if not _inteiro(n) or n < 1:
            erros.append(f"{rotulo}.n precisa ser um número inteiro a partir de 1")
            continue
        if n in vistos:
            erros.append(f"{rotulo}.n {n} está repetido")
        vistos.add(n)
        if mat.get("tipo") not in TIPOS_MATERIAL:
            erros.append(f"{rotulo}.tipo precisa ser uma de: {', '.join(TIPOS_MATERIAL)}")
        if not (isinstance(mat.get("alvo"), str) and RE_ALVO.match(mat["alvo"])):
            erros.append(f"{rotulo}.alvo precisa ser https://..., contexto/fontes-originais/... ou @perfil")
        try:
            if date.fromisoformat(str(mat.get("visto_em"))) > date.today():
                erros.append(f"{rotulo}.visto_em está no futuro")
        except ValueError:
            erros.append(f"{rotulo}.visto_em precisa ser uma data AAAA-MM-DD")
        achada = fontes.get(n)
        if achada is None:
            erros.append(f"{rotulo}: o [{n}] não existe na seção '## 9. Fontes'")
        else:
            if achada[0] != mat.get("tipo"):
                erros.append(f"{rotulo}: o tipo é '{mat.get('tipo')}' no bloco e '{achada[0]}' em Fontes [{n}]")
            if achada[2] != mat.get("visto_em"):
                erros.append(f"{rotulo}: a data é {mat.get('visto_em')} no bloco e {achada[2]} em Fontes [{n}]")
            if achada[1] != mat.get("alvo"):
                erros.append(f"{rotulo}: o alvo do bloco é diferente do que está em Fontes [{n}]")
    return erros


def _validar_voz(d: dict) -> list[str]:
    erros: list[str] = []
    escalas = d.get("escalas")
    if not isinstance(escalas, list):
        erros.append("'escalas' precisa ser uma lista com os 4 eixos")
        escalas = []
    eixos = []
    for i, e in enumerate(escalas):
        rotulo = f"escalas[{i}]"
        if not isinstance(e, dict):
            erros.append(f"{rotulo} precisa ser um objeto")
            continue
        eixos.append(e.get("eixo"))
        if e.get("eixo") not in EIXOS:
            erros.append(f"{rotulo}.eixo precisa ser um de: {', '.join(EIXOS)}")
        pos = e.get("posicao")
        if not (_inteiro(pos) and 1 <= pos <= 5):
            erros.append(f"{rotulo}.posicao precisa ser um número inteiro de 1 a 5")
        if e.get("origem") not in ORIGENS:
            erros.append(f"{rotulo}.origem precisa ser uma de: {', '.join(ORIGENS)}")
    if sorted(map(str, eixos)) != sorted(EIXOS):
        erros.append(f"'escalas' precisa ter exatamente os 4 eixos, cada um uma vez: {', '.join(EIXOS)}")
    _lista_de_palavras("palavras", d.get("palavras"), erros)
    _lista_de_palavras("anti", d.get("anti"), erros)
    return erros


def _validar_logo(d: dict, casa: Path) -> list[str]:
    erros: list[str] = []
    arquivos = d.get("arquivos")
    if not isinstance(arquivos, list) or not arquivos:
        return ["'arquivos' precisa ser uma lista com pelo menos o logo principal"]
    papeis: list[str] = []
    caminhos: list[str] = []
    for i, a in enumerate(arquivos):
        rotulo = f"arquivos[{i}]"
        if not isinstance(a, dict):
            erros.append(f"{rotulo} precisa ser um objeto")
            continue
        papel, arq = a.get("papel"), a.get("arquivo")
        if papel not in PAPEIS_LOGO:
            erros.append(f"{rotulo}.papel precisa ser um de: {', '.join(PAPEIS_LOGO)}")
        else:
            papeis.append(papel)
        if not (isinstance(arq, str) and RE_ARQUIVO_LOGO.match(arq)) or (isinstance(arq, str) and ".." in arq):
            erros.append(f"{rotulo}.arquivo precisa ser um caminho em empresa/marca/ (png, jpg, webp ou svg), sem ..")
            continue
        if arq in caminhos:
            erros.append(f"{rotulo}.arquivo {arq} está repetido")
        caminhos.append(arq)
        if not (casa / arq).is_file():
            erros.append(f"{rotulo}: o arquivo {arq} não existe")
    if len(papeis) != len(set(papeis)):
        erros.append("cada papel do logo aparece uma vez só")
    if "principal" not in papeis:
        erros.append("falta o logo com papel 'principal' (é o que o sistema usa de capa)")
    return erros


def validar_texto(texto: str, casa: Path) -> tuple[dict | None, list[str]]:
    dados, erros = extrair_bloco(texto)
    if dados is None:
        return None, erros
    if dados.get("documento") not in DOCUMENTOS:
        return dados, erros + [f"'documento' precisa ser um de: {', '.join(DOCUMENTOS)}"]
    if not _inteiro(dados.get("versao")) or dados["versao"] != 1:
        erros.append("'versao' precisa ser 1")
    doc = dados["documento"]
    if doc == "identidade":
        erros += _validar_identidade(dados, texto)
    elif doc == "voz":
        erros += _validar_voz(dados)
    else:
        erros += _validar_logo(dados, casa)
    return dados, erros


# ---------------------------------------------------------------- conferência completa

def _sem_dados(texto: str) -> str:
    """O texto com a seção 'Dados para o sistema' em branco (mesmo número de linhas): o JSON não é fala."""
    linhas = _lf(texto).split("\n")
    for i, l in enumerate(linhas):
        if l.rstrip() == TITULO_DADOS:
            return "\n".join(linhas[:i] + [""] * (len(linhas) - i))
    return "\n".join(linhas)


def _e_exemplo_da_proposta(linha: str) -> bool:
    """Linha de exemplo ('- Certo:', '- Errado:' ou com 'Exemplo:') marcada (proposta do time)."""
    s = linha.strip()
    exemplo = s.startswith(("- Certo:", "- Errado:")) or "Exemplo:" in s
    return exemplo and "(proposta do time)" in sem_acento(s).lower()


def _titulos_na_ordem(texto: str, esperados: tuple[str, ...]) -> list[str]:
    problemas: list[str] = []
    achados = [l.rstrip() for l in _lf(texto).split("\n") if l.startswith("## ")]
    ultimo = -1
    for titulo in esperados:
        if titulo not in achados:
            problemas.append(f"falta a seção '{titulo}'")
            continue
        pos = achados.index(titulo)
        if pos < ultimo:
            problemas.append(f"a seção '{titulo}' está fora da ordem do modelo")
        ultimo = max(ultimo, pos)
    return problemas


def conferir_texto(texto: str, casa: Path, dossie: dict) -> tuple[list[str], dict | None]:
    dados, problemas = validar_texto(texto, casa)
    corpo = _lf(texto)
    linhas = corpo.split("\n")
    doc = dados.get("documento") if dados else None
    if doc == "identidade":
        if not linhas[0].startswith("# Identidade da marca - "):
            problemas.append("o título (linha 1) precisa começar com '# Identidade da marca - '")
        problemas += _titulos_na_ordem(corpo, SECOES_IDENTIDADE)
        for sub in SUBSECOES_ANEXO_IDENTIDADE:
            if sub not in [l.rstrip() for l in linhas]:
                problemas.append(f"falta '{sub}' no Anexo")
    elif doc == "voz":
        if not linhas[0].startswith("# Tom de voz - "):
            problemas.append("o título (linha 1) precisa começar com '# Tom de voz - '")
        problemas += _titulos_na_ordem(corpo, SECOES_VOZ)
    if doc in ("identidade", "voz"):
        fontes, _ = ler_fontes(corpo)
        primeiro = next((n for n, l in enumerate(linhas, 1) if l.startswith("## ")), 1)
        for titulo, _, trechos in dp.secoes(corpo):
            if titulo.startswith(("fontes", "anexo", "dados para o sistema")):
                continue
            for n, linha in trechos:
                if n < primeiro:
                    continue
                for m in RE_MARCA_NOVA.finditer(sem_acento(linha).lower()):
                    tipo, numeros = m.group(1), re.findall(r"\d+", m.group(2))
                    if not numeros:
                        problemas.append(f"linha {n}: marca ({tipo}) sem o número da fonte, como ({tipo} [1])")
                    for num in numeros:
                        achada = fontes.get(int(num))
                        if achada is None:
                            problemas.append(f"linha {n}: a marca ({tipo} [{num}]) aponta a fonte [{num}], que não está em Fontes")
                        elif achada[0] != tipo:
                            problemas.append(f"linha {n}: a marca ({tipo} [{num}]) diz {tipo}, mas a fonte [{num}] é {achada[0]}")
    mecanicos, _ = dp.conferir_documento(_sem_dados(corpo), dossie, False, pesquisa_e_dados=False)  # [n] tipadas: conferidas acima
    todas = _lf(corpo).split("\n")
    for p in mecanicos:
        m = RE_PROBLEMA_ASPAS.match(p)
        if m and _e_exemplo_da_proposta(todas[int(m.group(1)) - 1]):
            continue
        problemas.append(p)
    vistos: set[str] = set()
    unicos = [p for p in problemas if not (p in vistos or vistos.add(p))]
    return unicos, dados


# ---------------------------------------------------------------- tokens DTCG

def _chave(base: str, usadas: set[str]) -> str:
    chave, i = base, 2
    while chave in usadas:
        chave, i = f"{base}-{i}", i + 1
    usadas.add(chave)
    return chave


def _componentes(hex_: str) -> list[float]:
    return [round(int(hex_[i:i + 2], 16) / 255, 4) for i in (1, 3, 5)]


def montar_tokens(identidade: dict, voz: dict | None, logo: dict | None) -> dict:
    cor: dict[str, dict] = {}
    usadas: set[str] = set()
    for c in identidade["cores"]:
        cor[_chave(c["funcao"], usadas)] = {
            "$type": "color",
            "$value": {"colorSpace": "srgb", "components": _componentes(c["hex"]), "hex": c["hex"]},
            "$description": f"{c['nome']} (origem: {c['origem']})",
        }
    reserva = next((t["familia"] for t in identidade["tipografia"] if t["uso"] == "reserva"), None)
    fonte: dict[str, dict] = {}
    peso: dict[str, dict] = {}
    usadas_f: set[str] = set()
    for t in identidade["tipografia"]:
        chave = _chave(t["uso"], usadas_f)
        familias = [t["familia"]] + ([reserva] if reserva and t["uso"] != "reserva" and reserva != t["familia"] else [])
        fonte[chave] = {"$type": "fontFamily", "$value": familias,
                        "$description": f"{t['familia']} ({t['fonte']}, licença {t['licenca']}, origem: {t['origem']})"}
        for p in sorted(set(t["pesos"])):
            peso[f"{chave}-{p}"] = {"$type": "fontWeight", "$value": p}
    return {
        "cor": cor,
        "fonte": fonte,
        "peso": peso,
        "$extensions": {"br.polozi.marca": {
            "arquetipo": identidade["personalidade"]["arquetipo"],
            "logo": (logo or {}).get("arquivos", []),
            "palavras_voz": {"palavras": (voz or {}).get("palavras", []), "anti": (voz or {}).get("anti", [])},
            "pares": identidade["pares"],
        }},
    }


def tokens_em_texto(tokens: dict) -> str:
    return json.dumps(tokens, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


# ---------------------------------------------------------------- linha de comando

def _utf8() -> None:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def _ler(casa: Path, arquivo: str) -> tuple[Path, str]:
    alvo = Path(arquivo) if Path(arquivo).is_absolute() else casa / arquivo
    if not alvo.is_file():
        raise FileNotFoundError(arquivo)
    return alvo, alvo.read_bytes().decode("utf-8")


def _irmao(pasta: Path, nome: str, casa: Path, esperado: str) -> dict | None:
    """Bloco do documento vizinho (tom-de-voz.md, logo/logo.md), ou None (com aviso) se faltar ou não valer."""
    alvo = pasta / nome
    if not alvo.is_file():
        return None
    try:
        dados, erros = validar_texto(alvo.read_bytes().decode("utf-8"), casa)
    except UnicodeError:
        dados, erros = None, ["não está em UTF-8"]
    if dados is None or erros or dados.get("documento") != esperado:
        print(f"AVISO: {nome} ao lado não entrou nos tokens (bloco ausente ou inválido; rode validar nele).", file=sys.stderr)
        return None
    return dados


def main(argv: list[str] | None = None) -> int:
    _utf8()
    ap = argparse.ArgumentParser(prog="marca_dados.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for nome in ("validar", "conferir", "tokens", "extrair"):
        p = sub.add_parser(nome)
        p.add_argument("--casa", default=".", help="raiz do projeto (padrão: pasta atual)")
        p.add_argument("--arquivo", required=True, help="documento .md da marca")
        if nome == "conferir":
            p.add_argument("--dossie", help=f"caminho do dossiê (padrão: {dp.DOSSIE})")
        if nome == "tokens":
            p.add_argument("--saida", default="empresa/marca/tokens.json", help="arquivo de tokens (padrão: empresa/marca/tokens.json)")
            p.add_argument("--check", action="store_true", help="não escreve: sai 1 se o arquivo no disco difere")
    try:
        a = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    casa = Path(a.casa)
    try:
        alvo, texto = _ler(casa, a.arquivo)
    except FileNotFoundError:
        print(f"ERRO: {a.arquivo} não existe", file=sys.stderr)
        return 2
    except (OSError, UnicodeError):
        print(f"ERRO: não consegui ler {a.arquivo} (precisa estar em UTF-8)", file=sys.stderr)
        return 2

    if a.cmd == "extrair":
        dados, erros = extrair_bloco(texto)
        for e in erros:
            print(f"PROBLEMA: {e}")
        if dados is None or erros:
            return 1
        print(json.dumps(dados, ensure_ascii=False, indent=2))
        return 0

    if a.cmd == "conferir":
        try:
            dossie, _, _ = dp._carregar(casa, a.dossie)
        except FileNotFoundError:
            print(f"FALTA: não achei o dossiê em {a.dossie or dp.DOSSIE}. Registre o dossiê primeiro "
                  "(polozi-registrar-dossie); sem ele não confiro a origem.", file=sys.stderr)
            return 1
        except (OSError, UnicodeError):
            print("ERRO: não consegui ler o dossiê", file=sys.stderr)
            return 1
        problemas, dados = conferir_texto(texto, casa, dossie)
        for p in problemas:
            print(f"PROBLEMA: {p}")
        if problemas:
            print(f"{len(problemas)} problema(s) em {a.arquivo}")
            return 1
        print(f"OK: {a.arquivo} confere (bloco {dados['documento']} válido, origens e fontes conferidas).")
        return 0

    dados, problemas = validar_texto(texto, casa)
    if a.cmd == "validar":
        for p in problemas:
            print(f"PROBLEMA: {p}")
        if problemas:
            print(f"{len(problemas)} problema(s) em {a.arquivo}")
            return 1
        print(f"OK: bloco {dados['documento']} de {a.arquivo} é válido.")
        return 0

    # tokens
    if dados is not None and dados.get("documento") != "identidade" and not problemas:
        problemas.append("tokens saem do documento da identidade (identidade-visual.md)")
    for p in problemas:
        print(f"PROBLEMA: {p}")
    if problemas or dados is None:
        print(f"{len(problemas)} problema(s) em {a.arquivo}; não gerei os tokens.")
        return 1
    raiz = casa.resolve()
    destino = (Path(a.saida) if Path(a.saida).is_absolute() else raiz / a.saida).resolve()
    try:
        rel = destino.relative_to(raiz).as_posix()
    except ValueError:
        rel = ""
    if not rel.startswith("empresa/marca/") or destino.suffix != ".json":
        print("ERRO: --saida precisa ser um .json dentro de empresa/marca/", file=sys.stderr)
        return 2
    pasta = alvo.parent
    voz = _irmao(pasta, "tom-de-voz.md", casa, "voz")
    logo = _irmao(pasta / "logo", "logo.md", casa, "logo")
    novo = tokens_em_texto(montar_tokens(dados, voz, logo))
    if a.check:
        atual = destino.read_text(encoding="utf-8") if destino.is_file() else None
        if atual != novo:
            print(f"DIFERENTE: {rel} {'não existe' if atual is None else 'não bate com o bloco'}. "
                  "Rode tokens sem --check para atualizar.")
            return 1
        print(f"OK: {rel} está em dia com o bloco.")
        return 0
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(novo, encoding="utf-8", newline="\n")
    print(f"FEITO: {rel} gravado ({len(novo.encode('utf-8'))} bytes).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
