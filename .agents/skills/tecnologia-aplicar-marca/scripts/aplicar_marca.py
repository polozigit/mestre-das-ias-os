"""aplicar_marca.py: leva a identidade aprovada (empresa/marca/tokens.json) para o sistema do aluno.

Faz a conta de cor (escala, contraste nos dois temas) e grava, de forma determinística: o tema
(src/app/theme.css), a leitura da marca (config/marca.ts), o logo claro e escuro (public/marca/), o ícone da
aba (src/app/icon.*) e o front matter + a seção gerada do DESIGN.md. Modelo não calcula contraste: o script calcula
e prova.

Uso (da raiz da Casa; --sistema padrão: sistemas/empresa-os):
  aplicar_marca.py ler      --casa . [--json]
  aplicar_marca.py mockup   --casa . [--saida operacao/marca/mockup-sistema.html] [--acento '#HEX'] [--neutros marca|cinza] [--forma geometrica|padrao|amigavel]
  aplicar_marca.py aplicar  --casa . --sistema sistemas/empresa-os [--dry-run] [mesmas opções do mockup]
  aplicar_marca.py conferir --sistema sistemas/empresa-os [--detalhe]
  aplicar_marca.py autor    --casa . [--corrigir] [--gh-json ARQ]

ler        valida a entrada (tokens.json, logos, fontes) e resume. Não grava nada.
mockup     página HTML autocontida com as telas principais em claro e escuro. Grava só o HTML e as escolhas.
aplicar    grava os arquivos do sistema (idempotente: rodar 2x dá os mesmos bytes). --dry-run só lista.
conferir   relê theme.css e config/marca.ts do disco e recalcula TODOS os pares de contraste nos dois temas;
           os dois blocos escuros têm de ser idênticos e marca.ts tem de bater com o tema.
autor      confere o e-mail dos commits da Casa com a conta do GitHub (a Vercel Hobby bloqueia a prévia
           quando o autor não é da conta). --corrigir grava o e-mail noreply no git config LOCAL.

Opções escolhidas (cor de ação, neutros, forma) ficam em operacao/marca/escolhas.json: o mockup e a aplicação dão igual.

Saída: 0 ok; 1 dado inválido, contraste reprovado ou arquivo fora do contrato (lista; nada gravado);
2 uso errado. A mensagem ao aluno não traz token, OKLCH nem número de contraste (só com --detalhe).
Só stdlib (Python 3.10+), sem rede, sem shell.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import math
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

# ---------------------------------------------------------------- contrato (C1 a C4 da spec)

RE_HEX = re.compile(r"^#[0-9A-F]{6}$")
RE_FAMILIA = re.compile(r"^[A-Za-z0-9 ]{1,40}$")
RE_ARQUIVO_LOGO = re.compile(r"^empresa/marca/[a-z0-9][a-z0-9/_.-]*\.(png|jpg|jpeg|webp)$")
RE_ARQUIVO_SVG_IGNORADO = re.compile(r"^empresa/marca/[a-z0-9][a-z0-9/_.-]*\.svg$")
RE_DESCRICAO_FONTE = re.compile(r"^(?P<familia>[A-Za-z0-9 ]{1,40}) \((?P<fonte>google|sistema|outra), licença ")
RE_LOGO_MARCA = re.compile(r"^/marca/(logo|logo-fundo-escuro)\.(png|jpg|jpeg|webp|svg)$")
_PESO = r"(:wght@[0-9]{3}(;[0-9]{3})*)?"
RE_URL_FONTES = re.compile(
    rf"^https://fonts\.googleapis\.com/css2\?family=[A-Za-z0-9+]+{_PESO}(&family=[A-Za-z0-9+]+{_PESO})?&display=swap$")
TETO_TOKENS = 256 * 1024
TETO_LOGO = 2 * 1024 * 1024

FUNCOES = ("principal", "apoio", "destaque", "fundo", "texto", "neutro")
USOS_FONTE = ("titulos", "texto", "reserva")
PAPEIS_LOGO = ("principal", "icone", "claro", "escuro", "svg")
FORMAS = {"geometrica": ("4px", "6px", "10px"), "padrao": ("6px", "10px", "16px"), "amigavel": ("8px", "14px", "20px")}

CABECALHO_MARCA_TS = "// Gerado por tecnologia-aplicar-marca. Não edite à mão: rode a skill de novo (ver DESIGN.md)."
IMPORT_MARCA_TS = 'import type { Marca } from "./marca-tipo";'
INICIO = "<!-- marca:inicio -->"
FIM = "<!-- marca:fim -->"
TEXTO_MARCADORES = ("Ainda não aplicada: o sistema usa o tema padrão do molde. "
                    "Para trocar pela marca da empresa, rode a skill `tecnologia-aplicar-marca`.")

SEL_CLARO = ":root"
SEL_ESCURO_A = ':root[data-theme="dark"]'
SEL_ESCURO_B = "@media (prefers-color-scheme: dark) > :root:not([data-theme])"
ANEL_FOCO = "0 0 0 2px var(--bg), 0 0 0 4px var(--acento)"

PASSOS = (50, 100, 200, 300, 400, 500, 600, 700, 800, 900)
L_ALVO = {50: 0.97, 100: 0.94, 200: 0.89, 300: 0.83, 400: 0.75, 500: 0.67, 600: 0.59, 700: 0.51, 800: 0.43, 900: 0.35}
FATOR_CROMA = {50: 0.15, 100: 0.28, 200: 0.5, 300: 0.75, 400: 0.92, 500: 1.0, 600: 1.0, 700: 0.95, 800: 0.85, 900: 0.7}
NEUTROS_MOLDE = {25: "#FCFCFD", 50: "#F8F8FA", 100: "#EFEFF2", 200: "#DDDDE3", 300: "#BBBBC6", 400: "#8F8F9D",
                 500: "#6A6A78", 600: "#4B4B57", 700: "#313139", 800: "#1D1D22", 900: "#111114"}
PILHA_MOLDE = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
BRANCO = "#FFFFFF"

# Valores do molde para o que o script preserva do theme.css atual (e usa se o arquivo não tem a variável).
PRESERVADOS_CLARO = {
    "--ok": "#2F8F4E", "--ok-suave": "#E5F2E8", "--alerta": "#C97A0F", "--alerta-suave": "#FBEAD2",
    "--erro": "#B5371F", "--erro-suave": "#F8E2DC", "--info": "#2A6F8C", "--info-suave": "#DEECF2",
    "--raio-sm": "6px", "--raio-md": "10px", "--raio-lg": "16px", "--raio-pill": "999px",
    "--sombra-sm": "0 2px 4px rgba(17, 17, 20, 0.05), 0 1px 2px rgba(17, 17, 20, 0.04)",
    "--sombra-md": "0 4px 12px rgba(17, 17, 20, 0.07), 0 2px 4px rgba(17, 17, 20, 0.04)",
}
PRESERVADOS_ESCURO = {
    "--ok-suave": "color-mix(in srgb, var(--ok) 18%, var(--neutro-900))",
    "--alerta-suave": "color-mix(in srgb, var(--alerta) 18%, var(--neutro-900))",
    "--erro-suave": "color-mix(in srgb, var(--erro) 18%, var(--neutro-900))",
    "--info-suave": "color-mix(in srgb, var(--info) 18%, var(--neutro-900))",
}

FUNDOS = ("--bg", "--bg-sutil", "--bg-elevada")
# (nome para o dono, variável do texto, variáveis do fundo, razão mínima). Limiar sem arredondar.
PARES = (
    ("texto principal sobre o fundo", "--fg-1", FUNDOS, 4.5),
    ("texto secundário sobre o fundo", "--fg-2", FUNDOS, 4.5),
    ("texto de apoio sobre o fundo", "--fg-3", FUNDOS, 4.5),
    ("texto auxiliar sobre o fundo", "--fg-4", ("--bg",), 3.0),
    ("cor de ação sobre o fundo", "--acento", ("--bg",), 3.0),
    ("texto de link sobre o fundo", "--acento-texto", FUNDOS, 4.5),
    ("texto do botão sobre a cor de ação", "--fg-sobre-acento", ("--acento",), 4.5),
    ("texto do botão em hover", "--fg-sobre-acento", ("--acento-hover",), 4.5),
)
MIN_TEXTO = 4.5
MIN_COMPONENTE = 3.0

ORDEM_ROOT = ([f"--marca-{p}" for p in PASSOS] + ["--acento", "--acento-hover", "--acento-suave", "--acento-texto", "--fg-sobre-acento"]
              + [f"--neutro-{n}" for n in NEUTROS_MOLDE]
              + ["--ok", "--ok-suave", "--alerta", "--alerta-suave", "--erro", "--erro-suave", "--info", "--info-suave",
                 "--bg", "--bg-sutil", "--bg-elevada", "--fg-1", "--fg-2", "--fg-3", "--fg-4", "--borda", "--borda-suave",
                 "--raio-sm", "--raio-md", "--raio-lg", "--raio-pill", "--fonte-texto", "--fonte-titulo",
                 "--sombra-sm", "--sombra-md", "--anel-foco"])
ORDEM_ESCURO = ["--bg", "--bg-sutil", "--bg-elevada", "--fg-1", "--fg-2", "--fg-3", "--fg-4", "--borda", "--borda-suave",
                "--acento", "--acento-hover", "--acento-suave", "--acento-texto", "--fg-sobre-acento",
                "--ok-suave", "--alerta-suave", "--erro-suave", "--info-suave"]


class Falha(Exception):
    """Erro de dado ou de contrato: sai com a lista e nada gravado."""

    def __init__(self, mensagens, codigo: int = 1):
        self.mensagens = [mensagens] if isinstance(mensagens, str) else list(mensagens)
        self.codigo = codigo
        super().__init__("; ".join(self.mensagens))


# ---------------------------------------------------------------- cor: sRGB, WCAG e OKLCH (conta própria)

def hex_para_rgb(h: str) -> tuple[int, int, int]:
    return int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)


def rgb_para_hex(r: float, g: float, b: float) -> str:
    return "#%02X%02X%02X" % tuple(max(0, min(255, int(round(c)))) for c in (r, g, b))


def _linear(c8: float) -> float:
    c = c8 / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gama(lin: float) -> float:
    lin = max(0.0, min(1.0, lin))
    return 255.0 * (12.92 * lin if lin <= 0.0031308 else 1.055 * lin ** (1 / 2.4) - 0.055)


def luminancia(h: str) -> float:
    r, g, b = (_linear(c) for c in hex_para_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def razao(a: str, b: str) -> float:
    la, lb = luminancia(a), luminancia(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def passa_limiar(r: float, minimo: float) -> bool:
    return r >= minimo


def cortar(r: float) -> float:
    return math.floor(r * 100) / 100


def formatar_razao(r: float) -> str:
    return f"{cortar(r):.2f}".replace(".", ",")


def para_oklch(h: str) -> tuple[float, float, float]:
    r, g, b = (_linear(c) for c in hex_para_rgb(h))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360 if math.hypot(a, bb) > 1e-9 else 0.0


def _oklch_para_linear(L: float, C: float, H: float) -> tuple[float, float, float]:
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)


def _dentro_da_gama(rgb: tuple[float, float, float]) -> bool:
    return all(-1e-6 <= c <= 1 + 1e-6 for c in rgb)


def de_oklch(L: float, C: float, H: float) -> str:
    """Hex sRGB; croma que não cabe na gama é reduzido (mesma luminosidade e matiz)."""
    if L <= 0:
        return "#000000"
    if L >= 1:
        return "#FFFFFF"
    rgb = _oklch_para_linear(L, C, H)
    if not _dentro_da_gama(rgb):
        baixo, alto = 0.0, C
        for _ in range(40):
            meio = (baixo + alto) / 2
            if _dentro_da_gama(_oklch_para_linear(L, meio, H)):
                baixo = meio
            else:
                alto = meio
        rgb = _oklch_para_linear(L, baixo, H)
    return rgb_para_hex(*(_gama(c) for c in rgb))


def distancia_matiz(h1: float, h2: float) -> float:
    d = abs(h1 - h2) % 360
    return min(d, 360 - d)


def escala(p_hex: str) -> tuple[dict[int, str], int]:
    """Escala 50..900 a partir da cor principal; o degrau de luminosidade mais próxima recebe P exato."""
    L, C, H = para_oklch(p_hex)
    degraus = {p: de_oklch(L_ALVO[p], C * FATOR_CROMA[p], H) for p in PASSOS}
    alvo_p = min(PASSOS, key=lambda p: abs(L_ALVO[p] - L))
    degraus[alvo_p] = p_hex
    return degraus, alvo_p


def neutros(matiz: float, croma: float) -> dict[int, str]:
    """Cinzas da interface: mesma luminosidade dos neutros do molde, matiz da marca, croma leve (ou zero)."""
    saida = {}
    for n, h in NEUTROS_MOLDE.items():
        L = para_oklch(h)[0]
        saida[n] = de_oklch(L, croma, matiz)
    return saida


# ---------------------------------------------------------------- leitura e validação do tokens.json

class Entrada:
    def __init__(self):
        self.principal = ""
        self.fundo = self.texto = self.apoio = self.destaque = self.neutro = None
        self.paleta: set[str] = set()
        self.fontes: dict[str, dict] = {}
        self.pesos: dict[str, list[int]] = {}
        self.logos: dict[str, str] = {}
        self.arquetipo: dict = {}
        self.palavras: list[str] = []
        self.sha = ""
        self.avisos: list[str] = []


def _hex_do_token(token) -> str | None:
    if isinstance(token, dict) and isinstance(token.get("$value"), dict):
        h = token["$value"].get("hex")
        if isinstance(h, str) and RE_HEX.match(h):
            return h
    return None


def ler_logo(casa: Path, arquivo: str, papel: str) -> tuple[Path | None, list[str]]:
    """Valida o caminho do logo e devolve o arquivo; erros em português."""
    if ".." in arquivo or not RE_ARQUIVO_LOGO.match(arquivo):
        return None, [f"o logo '{arquivo[:60]}' precisa ficar em empresa/marca/, sem '..' (png, jpg ou webp)"]
    pasta = (casa / "empresa" / "marca").resolve()
    alvo = (casa / arquivo).resolve()
    try:
        alvo.relative_to(pasta)
    except ValueError:
        return None, [f"o logo '{arquivo}' sai da pasta empresa/marca"]
    if not alvo.is_file():
        return None, [f"o arquivo do logo '{arquivo}' não existe"]
    if alvo.stat().st_size > TETO_LOGO:
        return None, [f"o logo '{arquivo}' passa de 2 MB"]
    return alvo, []


def ler_entrada(casa: Path) -> tuple[Entrada | None, list[str]]:
    """(entrada, erros). Entrada é None se há erro; os avisos ficam em entrada.avisos."""
    caminho = casa / "empresa" / "marca" / "tokens.json"
    if not caminho.is_file():
        return None, ["não achei empresa/marca/tokens.json: rode a skill marketing-identidade (tokens) antes"]
    bruto = caminho.read_bytes()
    if len(bruto) > TETO_TOKENS:
        return None, ["empresa/marca/tokens.json passa de 256 KB"]
    try:
        dados = json.loads(bruto.decode("utf-8"))
    except (UnicodeError, ValueError):
        return None, ["empresa/marca/tokens.json não é um JSON válido em UTF-8"]
    if not isinstance(dados, dict):
        return None, ["empresa/marca/tokens.json precisa ser um objeto JSON"]
    erros: list[str] = []
    e = Entrada()
    e.sha = hashlib.sha256(bruto).hexdigest()[:12]

    cor = dados.get("cor")
    if not isinstance(cor, dict):
        erros.append("falta o grupo 'cor' no tokens.json")
        cor = {}
    for chave, token in cor.items():
        h = _hex_do_token(token)
        if h is None:
            erros.append(f"a cor '{chave}' precisa ter hex no formato #RRGGBB com letras maiúsculas")
            continue
        e.paleta.add(h)
        base = re.sub(r"-\d+$", "", chave)
        if base in FUNCOES and getattr(e, "principal" if base == "principal" else base) in (None, ""):
            setattr(e, "principal" if base == "principal" else base, h)
    if not e.principal and not any("'principal" in x for x in erros):
        erros.append("falta a cor principal (cor.principal) no tokens.json")

    fonte = dados.get("fonte") if isinstance(dados.get("fonte"), dict) else {}
    for uso in USOS_FONTE:
        token = fonte.get(uso)
        if token is None:
            continue
        valor = token.get("$value") if isinstance(token, dict) else None
        familias = [valor] if isinstance(valor, str) else valor
        if not (isinstance(familias, list) and familias and all(isinstance(f, str) for f in familias)):
            erros.append(f"a fonte '{uso}' precisa ter ao menos uma família")
            continue
        ruins = [f for f in familias if not RE_FAMILIA.match(f)]
        for f in ruins:
            erros.append(f"a família de fonte '{f[:40]}' precisa ter só letras, números e espaço (até 40)")
        if ruins:
            continue
        descricao = token.get("$description") if isinstance(token.get("$description"), str) else ""
        m = RE_DESCRICAO_FONTE.match(descricao)
        tipo = m.group("fonte") if m else "sistema"
        if not m:
            e.avisos.append(f"a fonte '{familias[0]}' não diz de onde vem: tratada como fonte do computador")
        e.fontes[uso] = {"familias": familias, "tipo": tipo}

    pesos = dados.get("peso") if isinstance(dados.get("peso"), dict) else {}
    for chave, token in pesos.items():
        m = re.match(r"^(titulos|texto|reserva)-(\d{3})$", chave)
        valor = token.get("$value") if isinstance(token, dict) else None
        if m and isinstance(valor, int) and not isinstance(valor, bool) and 100 <= valor <= 900 and valor % 100 == 0:
            e.pesos.setdefault(m.group(1), []).append(valor)
    e.pesos = {k: sorted(set(v)) for k, v in e.pesos.items()}

    ext = (dados.get("$extensions") or {}).get("br.polozi.marca") if isinstance(dados.get("$extensions"), dict) else None
    ext = ext if isinstance(ext, dict) else {}
    arq = ext.get("arquetipo")
    e.arquetipo = arq if isinstance(arq, dict) else {}
    voz = ext.get("palavras_voz")
    palavras = voz.get("palavras") if isinstance(voz, dict) else []
    e.palavras = [p for p in palavras if isinstance(p, str)][:5] if isinstance(palavras, list) else []
    logos = ext.get("logo")
    logos = logos if isinstance(logos, list) else []
    for item in logos:
        if not isinstance(item, dict) or item.get("papel") not in PAPEIS_LOGO or not isinstance(item.get("arquivo"), str):
            erros.append("cada logo do tokens.json precisa ter 'papel' e 'arquivo'")
            continue
        if item["arquivo"].strip().lower().endswith(".svg"):
            if ".." in item["arquivo"] or not RE_ARQUIVO_SVG_IGNORADO.match(item["arquivo"].lower()):
                erros.append(f"o logo '{item['arquivo'][:60]}' precisa ficar em empresa/marca/, sem '..' (png, jpg ou webp)")
                continue
            aviso_svg = "o logo em SVG não é usado; o logo do sistema vem do PNG tratado pela marketing-logo"
            if aviso_svg not in e.avisos:
                e.avisos.append(aviso_svg)
            continue
        alvo, problemas = ler_logo(casa, item["arquivo"], item["papel"])
        erros.extend(problemas)
        if alvo is not None and item["papel"] not in e.logos:
            e.logos[item["papel"]] = item["arquivo"]
    if not e.logos.get("principal") and not erros:
        e.avisos.append("não há logo principal na identidade da marca: o logo do molde fica como está")
    if erros:
        return None, erros
    return e, []


# ---------------------------------------------------------------- escolhas (mockup e aplicação dão igual)

ESCOLHAS_PADRAO = {"acento": None, "neutros": "marca", "forma": None}


def ler_escolhas(casa: Path, entrada: Entrada, cli: dict) -> dict:
    escolhas = dict(ESCOLHAS_PADRAO)
    caminho = casa / "operacao" / "marca" / "escolhas.json"
    if caminho.is_file():
        try:
            salvo = json.loads(caminho.read_bytes().decode("utf-8"))
        except (UnicodeError, ValueError):
            raise Falha("operacao/marca/escolhas.json não é um JSON válido: apague o arquivo e rode de novo")
        if not isinstance(salvo, dict):
            raise Falha("operacao/marca/escolhas.json precisa ser um objeto JSON")
        for k in ESCOLHAS_PADRAO:
            if k in salvo:
                escolhas[k] = salvo[k]
    for k, v in cli.items():
        if v is not None:
            escolhas[k] = v
    erros = []
    if escolhas["acento"] is not None:
        escolhas["acento"] = str(escolhas["acento"]).upper()
        if not RE_HEX.match(escolhas["acento"]) or escolhas["acento"] not in entrada.paleta:
            erros.append("a cor de ação escolhida precisa ser uma das cores da paleta aprovada da marca")
    if escolhas["neutros"] not in ("marca", "cinza"):
        erros.append("os neutros precisam ser 'marca' ou 'cinza'")
    if escolhas["forma"] is not None and escolhas["forma"] not in FORMAS:
        erros.append("a forma precisa ser geometrica, padrao ou amigavel")
    if erros:
        raise Falha(erros)
    return escolhas


def texto_escolhas(escolhas: dict) -> str:
    return json.dumps(escolhas, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


# ---------------------------------------------------------------- CSS: leitura do theme.css

class ErroCss(Exception):
    pass


def _sem_comentarios(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def _decls(corpo: str) -> dict[str, str]:
    saida: dict[str, str] = {}
    for parte in corpo.split(";"):
        if ":" not in parte:
            continue
        nome, valor = parte.split(":", 1)
        nome = nome.strip()
        if nome.startswith("--"):
            saida[nome] = re.sub(r"\s+", " ", valor.strip())
    return saida


def _blocos(css: str, prefixo: str = "") -> list[tuple[str, dict[str, str]]]:
    saida = []
    i, n = 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            if css[i:].strip():
                raise ErroCss("texto solto fora de um bloco")
            break
        seletor = re.sub(r"\s+", " ", css[i:j].strip())
        profundidade, k = 1, j + 1
        while k < n and profundidade:
            profundidade += (css[k] == "{") - (css[k] == "}")
            k += 1
        if profundidade:
            raise ErroCss("chaves sem fechar")
        corpo = css[j + 1:k - 1]
        if "{" in corpo:
            saida += _blocos(corpo, prefixo + seletor + " > ")
        else:
            saida.append((prefixo + seletor, _decls(corpo)))
        i = k
    return saida


def blocos_do_tema(css: str) -> dict[str, dict[str, str]]:
    por_seletor: dict[str, dict[str, str]] = {}
    for seletor, decls in _blocos(_sem_comentarios(css)):
        por_seletor.setdefault(seletor, {}).update(decls)
    return por_seletor


def resolver(nome: str, camada: dict[str, str], visto: tuple = ()) -> str | None:
    valor = camada.get(nome)
    if valor is None or nome in visto:
        return None
    m = re.fullmatch(r"var\(\s*(--[\w-]+)\s*\)", valor)
    if m:
        return resolver(m.group(1), camada, visto + (nome,))
    return valor.upper() if RE_HEX.match(valor.upper()) and valor.startswith("#") else None


def avaliar_tema(css: str) -> tuple[list[str], list[tuple], dict | None]:
    """(problemas, tabela, contexto). tabela = (nome, mínimo, {tema: pior razão}); contexto traz os hex resolvidos."""
    problemas: list[str] = []
    try:
        por_seletor = blocos_do_tema(css)
    except ErroCss as erro:
        return [f"theme.css fora do formato ({erro})"], [], None
    esperados = (SEL_CLARO, SEL_ESCURO_A, SEL_ESCURO_B)
    for s in esperados:
        if s not in por_seletor:
            problemas.append(f"theme.css fora do formato: falta o bloco '{s}'")
    for s in por_seletor:
        if s not in esperados:
            problemas.append(f"theme.css fora do formato: bloco desconhecido '{s}'")
    if problemas:
        return problemas, [], None
    claro, bloco_a, bloco_b = por_seletor[SEL_CLARO], por_seletor[SEL_ESCURO_A], por_seletor[SEL_ESCURO_B]
    if list(bloco_a.items()) != list(bloco_b.items()):
        problemas.append("os dois blocos do tema escuro estão diferentes (precisam ser idênticos)")
    if claro.get("--anel-foco") != ANEL_FOCO:
        problemas.append("o anel de foco do theme.css não é o gerado pela skill")
    temas = {"claro": claro, "escuro": {**claro, **bloco_a}}
    resolvido = {t: {} for t in temas}
    for tema, camada in temas.items():
        for nome in ("--bg", "--bg-sutil", "--bg-elevada", "--fg-1", "--fg-2", "--fg-3", "--fg-4", "--acento",
                     "--acento-hover", "--acento-texto", "--fg-sobre-acento"):
            h = resolver(nome, camada)
            if h is None:
                problemas.append(f"({tema}) a variável {nome} não resolve para uma cor")
            else:
                resolvido[tema][nome] = h
    tabela = []
    for rotulo, texto_var, fundos, minimo in PARES:
        piores = {}
        for tema in temas:
            r = resolvido[tema]
            if texto_var not in r or any(f not in r for f in fundos):
                continue
            pior = min(razao(r[texto_var], r[f]) for f in fundos)
            piores[tema] = pior
            for f in fundos:
                if not passa_limiar(razao(r[texto_var], r[f]), minimo):
                    problemas.append(f"({tema}) {rotulo} não passa na leitura [{texto_var} sobre {f}: "
                                     f"{formatar_razao(razao(r[texto_var], r[f]))}, mínimo {str(minimo).replace('.', ',')}]")
        tabela.append((rotulo, minimo, piores))
    contexto = {"resolvido": resolvido, "claro": claro, "escuro": temas["escuro"]}
    return problemas, tabela, contexto


# ---------------------------------------------------------------- config/marca.ts

def montar_marca_ts(logo_claro: str, logo_escuro: str, fontes: str | None, nav_claro: str, nav_escuro: str) -> str:
    fontes_txt = "null" if fontes is None else f'"{fontes}"'
    linhas = [
        CABECALHO_MARCA_TS,
        IMPORT_MARCA_TS,
        "",
        "export const marca: Marca = {",
        "  aplicada: true,",
        f'  logo: {{ fundoClaro: "{logo_claro}", fundoEscuro: "{logo_escuro}" }},',
        f"  fontesGoogle: {fontes_txt},",
        f'  corDoNavegador: {{ claro: "{nav_claro}", escuro: "{nav_escuro}" }},',
        "};",
    ]
    return "\n".join(linhas) + "\n"


RE_L_APLICADA = re.compile(r"^  aplicada: (true|false),$")
RE_L_LOGO = re.compile(r'^  logo: \{ fundoClaro: "([^"\n]*)", fundoEscuro: "([^"\n]*)" \},$')
RE_L_FONTES = re.compile(r'^  fontesGoogle: (null|"([^"\n]*)"),$')
RE_L_NAV = re.compile(r'^  corDoNavegador: \{ claro: "([^"\n]*)", escuro: "([^"\n]*)" \},$')


def ler_marca_ts(texto: str) -> tuple[dict | None, list[str]]:
    """Lê config/marca.ts linha a linha; linha fora do formato = editado à mão."""
    linhas = texto.replace("\r\n", "\n").split("\n")
    if linhas and linhas[-1] == "":
        linhas = linhas[:-1]
    ruim = ["config/marca.ts editado à mão: rode a skill tecnologia-aplicar-marca de novo"]
    if len(linhas) != 9 or linhas[0] != CABECALHO_MARCA_TS or linhas[1] != IMPORT_MARCA_TS or linhas[2] != "" \
            or linhas[3] != "export const marca: Marca = {" or linhas[8] != "};":
        return None, ruim
    m_ap, m_lg, m_fo, m_nv = (RE_L_APLICADA.match(linhas[4]), RE_L_LOGO.match(linhas[5]),
                               RE_L_FONTES.match(linhas[6]), RE_L_NAV.match(linhas[7]))
    if not (m_ap and m_lg and m_fo and m_nv):
        return None, ruim
    erros = []
    if not RE_LOGO_MARCA.match(m_lg.group(1)) or not RE_LOGO_MARCA.match(m_lg.group(2)):
        erros.append("config/marca.ts: o caminho do logo está fora do formato /marca/logo.<ext>")
    if m_fo.group(2) is not None and not RE_URL_FONTES.match(m_fo.group(2)):
        erros.append("config/marca.ts: o endereço das fontes não é do Google Fonts no formato esperado")
    if not RE_HEX.match(m_nv.group(1)) or not RE_HEX.match(m_nv.group(2)):
        erros.append("config/marca.ts: a cor do navegador precisa ser #RRGGBB com letras maiúsculas")
    dados = {"aplicada": m_ap.group(1) == "true", "fundoClaro": m_lg.group(1), "fundoEscuro": m_lg.group(2),
             "fontes": m_fo.group(2), "claro": m_nv.group(1), "escuro": m_nv.group(2)}
    return dados, erros


# ---------------------------------------------------------------- conferir (relê o disco)

def conferir_sistema(sistema: Path) -> tuple[list[str], list[tuple]]:
    problemas: list[str] = []
    theme = sistema / "src" / "app" / "theme.css"
    marca_ts = sistema / "config" / "marca.ts"
    if not theme.is_file():
        return ["não achei src/app/theme.css no sistema"], []
    if not marca_ts.is_file():
        return ["não achei config/marca.ts no sistema (sistema anterior à marca por skill?)"], []
    achados, tabela, ctx = avaliar_tema(theme.read_bytes().decode("utf-8"))
    problemas += achados
    marca, erros_marca = ler_marca_ts(marca_ts.read_bytes().decode("utf-8"))
    problemas += erros_marca
    if marca is not None and ctx is not None:
        nav_claro, nav_escuro = marca["claro"], marca["escuro"]
        bg_claro, bg_escuro = ctx["resolvido"]["claro"].get("--bg"), ctx["resolvido"]["escuro"].get("--bg")
        if (nav_claro, nav_escuro) != (bg_claro, bg_escuro):
            problemas.append("config/marca.ts não bate com o theme.css: a cor da barra do navegador precisa ser "
                             "igual ao fundo claro e ao fundo escuro")
        for caminho in (marca["fundoClaro"], marca["fundoEscuro"]):
            if RE_LOGO_MARCA.match(caminho) and not (sistema / "public" / caminho.lstrip("/")).is_file():
                problemas.append(f"o logo {caminho} não existe em public/")
    app = sistema / "src" / "app"
    if not any((app / f"icon.{ext}").is_file() for ext in ("png", "jpg", "jpeg", "svg", "ico")):
        problemas.append("não há ícone da aba (src/app/icon.*)")
    return problemas, tabela


# ---------------------------------------------------------------- cálculo do tema

def pilha_atual(valor: str | None) -> str:
    """Pilha de fontes do sistema: o valor atual sem as famílias da marca que a skill pôs na frente."""
    if not valor:
        return PILHA_MOLDE
    itens = [i.strip() for i in re.sub(r"\s+", " ", valor).split(",")]
    while itens and itens[0].startswith('"'):
        itens.pop(0)
    itens = [i for i in itens if i and not i.startswith("var(")]
    return ", ".join(itens) if itens else PILHA_MOLDE


def _preservados(css_atual: str | None) -> tuple[dict[str, str], dict[str, str], str | None]:
    claro = dict(PRESERVADOS_CLARO)
    escuro = dict(PRESERVADOS_ESCURO)
    atual_claro: dict[str, str] = {}
    if css_atual:
        try:
            blocos = blocos_do_tema(css_atual)
        except ErroCss:
            blocos = {}
        atual_claro = blocos.get(SEL_CLARO, {})
        for k in claro:
            if atual_claro.get(k):
                claro[k] = atual_claro[k]
        for k in escuro:
            if blocos.get(SEL_ESCURO_A, {}).get(k):
                escuro[k] = blocos[SEL_ESCURO_A][k]
    return claro, escuro, atual_claro.get("--fonte-texto")


def _primeiro(candidatos, textos_fundos, minimo):
    for c in candidatos:
        if all(passa_limiar(razao(c[1], f), minimo) for f in textos_fundos):
            return c
    return None


def calcular_tema(entrada: Entrada, escolhas: dict, css_atual: str | None) -> tuple[str, list[str], list[str]]:
    """(css do theme.css, ajustes, avisos). Falha com Falha se algum par não passa."""
    ajustes: list[str] = []
    avisos: list[str] = []
    p_hex = escolhas["acento"] or entrada.principal
    L, C, H = para_oklch(p_hex)
    deg, alvo_p = escala(p_hex)
    matiz = para_oklch(entrada.neutro)[2] if entrada.neutro else H
    croma_neutros = 0.0 if (escolhas["neutros"] == "cinza" or C < 0.03) else 0.008
    neu = neutros(matiz, croma_neutros)

    bg_claro_css, bg_claro = "var(--neutro-25)", neu[25]
    if entrada.fundo:
        Lf, Cf, _ = para_oklch(entrada.fundo)
        if Lf >= 0.94 and Cf <= 0.04:
            bg_claro_css, bg_claro = entrada.fundo, entrada.fundo
        else:
            ajustes.append("a cor de fundo da identidade é escura ou forte demais para fundo de tela: usei o fundo padrão")
    fundos_claro = (bg_claro, neu[50], BRANCO)
    fundos_escuro = (neu[900], neu[800], neu[800])

    def candidatos_neutros(passos):
        return [(f"var(--neutro-{n})", neu[n], n) for n in passos]

    # texto cinza: sobe um degrau se o fundo da marca (creme) não deixa o padrão passar
    fg3 = _primeiro(candidatos_neutros((500, 600, 700)), fundos_claro, MIN_TEXTO) or candidatos_neutros((700,))[0]
    fg4 = _primeiro(candidatos_neutros((400, 500, 600)), fundos_claro[:1], MIN_COMPONENTE) or candidatos_neutros((600,))[0]
    if fg3[2] != 500 or fg4[2] != 400:
        ajustes.append("o cinza do texto de apoio ficou mais escuro para dar leitura sobre o fundo da marca")
    fg3e = _primeiro(candidatos_neutros((300, 200, 100)), fundos_escuro, MIN_TEXTO) or candidatos_neutros((100,))[0]
    fg4e = _primeiro(candidatos_neutros((400, 300, 200)), fundos_escuro[:1], MIN_COMPONENTE) or candidatos_neutros((200,))[0]

    # cor de ação no claro: a da marca se der leitura ao texto do botão e ao fundo; senão o primeiro degrau 500..900
    textos_claro = ((BRANCO, BRANCO), ("var(--neutro-900)", neu[900]))
    ordem_claro = [alvo_p] + [p for p in (500, 600, 700, 800, 900) if p != alvo_p]
    escolhido = None
    for p in ordem_claro:
        for css_t, hex_t in textos_claro:
            if passa_limiar(razao(hex_t, deg[p]), MIN_TEXTO) and passa_limiar(razao(deg[p], bg_claro), MIN_COMPONENTE):
                escolhido = (p, css_t, hex_t)
                break
        if escolhido:
            break
    if escolhido is None:
        raise Falha("não achei uma cor de ação com leitura no tema claro para esta marca")
    p_acento, sobre_css, sobre_hex = escolhido
    if p_acento != alvo_p:
        mais_escuro = luminancia(deg[p_acento]) < luminancia(p_hex)
        ajustes.append("sua cor principal não dá leitura como cor de botão: os botões usam um tom "
                       + ("mais escuro" if mais_escuro else "mais claro") + " dela")
    elif sobre_css != BRANCO:
        ajustes.append("sua cor principal é clara: o texto dentro dos botões é escuro para dar leitura")

    L900, C900 = L_ALVO[900], C * FATOR_CROMA[900]
    extra = de_oklch(max(L900 - 0.07, 0.2), C900 * 0.6, H)

    def vizinhos(passo, direcao):
        i = PASSOS.index(passo)
        saida = []
        if direcao > 0:
            saida = [(f"var(--marca-{q})", deg[q]) for q in PASSOS[i + 1:]]
            saida.append((extra, extra))
        else:
            saida = [(f"var(--marca-{q})", deg[q]) for q in reversed(PASSOS[:i])]
        return saida

    def hover(passo, texto_hex, fundo_hex, direcao):
        for css_h, hex_h in vizinhos(passo, direcao) + vizinhos(passo, -direcao):
            if passa_limiar(razao(texto_hex, hex_h), MIN_TEXTO) and passa_limiar(razao(hex_h, fundo_hex), MIN_COMPONENTE):
                return css_h, hex_h
        return f"var(--marca-{passo})", deg[passo]

    hover_claro = hover(p_acento, sobre_hex, bg_claro, 1)

    ordem_texto = [alvo_p] + [p for p in (500, 600, 700, 800, 900) if p != alvo_p]
    texto_claro = None
    for p in ordem_texto:
        if all(passa_limiar(razao(deg[p], f), MIN_TEXTO) for f in fundos_claro):
            texto_claro = p
            break
    if texto_claro is None:
        raise Falha("não achei uma cor de link com leitura no tema claro para esta marca")
    if texto_claro != alvo_p:
        ajustes.append("sua cor principal não dá leitura em texto: os links usam um tom mais escuro dela")

    # escuro: desenhado, não invertido
    textos_escuro = (("var(--neutro-900)", neu[900]), (BRANCO, BRANCO))
    ordem_escuro = [alvo_p] + [p for p in (400, 300, 200, 100, 50) if p != alvo_p]
    escolhido_e = None
    for p in ordem_escuro:
        for css_t, hex_t in textos_escuro:
            if passa_limiar(razao(hex_t, deg[p]), MIN_TEXTO) and passa_limiar(razao(deg[p], neu[900]), MIN_COMPONENTE):
                escolhido_e = (p, css_t, hex_t)
                break
        if escolhido_e:
            break
    if escolhido_e is None:
        raise Falha("não achei uma cor de ação com leitura no tema escuro para esta marca")
    p_acento_e, sobre_css_e, sobre_hex_e = escolhido_e
    hover_escuro = hover(p_acento_e, sobre_hex_e, neu[900], -1)
    texto_escuro = None
    for p in (300, 200, 100, 50):
        if all(passa_limiar(razao(deg[p], f), MIN_TEXTO) for f in fundos_escuro):
            texto_escuro = p
            break
    if texto_escuro is None:
        raise Falha("não achei uma cor de link com leitura no tema escuro para esta marca")
    if p_acento_e != alvo_p:
        ajustes.append("na versão escura a cor dos botões e dos links fica mais clara para dar leitura")

    pres_claro, pres_escuro, fonte_atual = _preservados(css_atual)
    if escolhas["forma"]:
        pres_claro["--raio-sm"], pres_claro["--raio-md"], pres_claro["--raio-lg"] = FORMAS[escolhas["forma"]]

    erro_hex = resolver("--erro", pres_claro)
    if erro_hex:
        Le, Ce, He = para_oklch(erro_hex)
        Lp, Cp, Hp = para_oklch(p_hex)
        if Cp > 0.1 and distancia_matiz(Hp, He) < 25:
            avisos.append("sua cor principal é um vermelho parecido com a cor de erro do sistema: "
                          "mensagens de erro e botões da marca podem se confundir")

    pilha = pilha_atual(fonte_atual)
    f_texto = [f'"{f}"' for f in entrada.fontes.get("texto", {}).get("familias", [])]
    f_titulo = [f'"{f}"' for f in entrada.fontes.get("titulos", {}).get("familias", [])]
    fonte_texto = ", ".join(f_texto + [pilha])
    fonte_titulo = ", ".join(f_titulo + ["var(--fonte-texto)"])

    claro: dict[str, str] = {f"--marca-{p}": deg[p] for p in PASSOS}
    claro.update({
        "--acento": f"var(--marca-{p_acento})", "--acento-hover": hover_claro[0], "--acento-suave": "var(--marca-50)",
        "--acento-texto": f"var(--marca-{texto_claro})", "--fg-sobre-acento": sobre_css,
    })
    claro.update({f"--neutro-{n}": neu[n] for n in NEUTROS_MOLDE})
    for k in ("--ok", "--ok-suave", "--alerta", "--alerta-suave", "--erro", "--erro-suave", "--info", "--info-suave"):
        claro[k] = pres_claro[k]
    claro.update({
        "--bg": bg_claro_css, "--bg-sutil": "var(--neutro-50)", "--bg-elevada": BRANCO,
        "--fg-1": "var(--neutro-900)", "--fg-2": "var(--neutro-700)", "--fg-3": fg3[0], "--fg-4": fg4[0],
        "--borda": "var(--neutro-200)", "--borda-suave": "var(--neutro-100)",
        "--raio-sm": pres_claro["--raio-sm"], "--raio-md": pres_claro["--raio-md"], "--raio-lg": pres_claro["--raio-lg"],
        "--raio-pill": pres_claro["--raio-pill"], "--fonte-texto": fonte_texto, "--fonte-titulo": fonte_titulo,
        "--sombra-sm": pres_claro["--sombra-sm"], "--sombra-md": pres_claro["--sombra-md"], "--anel-foco": ANEL_FOCO,
    })
    escuro: dict[str, str] = {
        "--bg": "var(--neutro-900)", "--bg-sutil": "var(--neutro-800)", "--bg-elevada": "var(--neutro-800)",
        "--fg-1": "var(--neutro-25)", "--fg-2": "var(--neutro-100)", "--fg-3": fg3e[0], "--fg-4": fg4e[0],
        "--borda": "var(--neutro-700)", "--borda-suave": "var(--neutro-800)",
        "--acento": f"var(--marca-{p_acento_e})", "--acento-hover": hover_escuro[0],
        "--acento-suave": "color-mix(in srgb, var(--marca-500) 16%, var(--neutro-900))",
        "--acento-texto": f"var(--marca-{texto_escuro})", "--fg-sobre-acento": sobre_css_e,
        "--ok-suave": pres_escuro["--ok-suave"], "--alerta-suave": pres_escuro["--alerta-suave"],
        "--erro-suave": pres_escuro["--erro-suave"], "--info-suave": pres_escuro["--info-suave"],
    }
    return montar_theme(claro, escuro), ajustes, avisos


def montar_theme(claro: dict[str, str], escuro: dict[str, str]) -> str:
    def bloco(variaveis, ordem, recuo):
        return "".join(f"{recuo}{nome}: {variaveis[nome]};\n" for nome in ordem)

    return (
        "/* =============================================================\n"
        "   TEMA DA EMPRESA: gerado por tecnologia-aplicar-marca a partir de empresa/marca/tokens.json; não edite à mão.\n"
        "   Para trocar a marca, rode a skill tecnologia-aplicar-marca (ver DESIGN.md).\n"
        "   Nenhum componente usa cor literal: só estes tokens.\n"
        "   ============================================================= */\n"
        ":root {\n" + bloco(claro, ORDEM_ROOT, "  ") + "}\n\n"
        "/* Escuro: escolhido pela pessoa (data-theme=\"dark\") ou, sem escolha e sem JS, pelo aparelho. */\n"
        ':root[data-theme="dark"] {\n' + bloco(escuro, ORDEM_ESCURO, "  ") + "}\n"
        "@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n" + bloco(escuro, ORDEM_ESCURO, "    ") + "  }\n}\n"
    )


# ---------------------------------------------------------------- fontes, nome e ícone

def url_fontes(entrada: Entrada) -> str | None:
    familias: dict[str, set[int]] = {}
    for uso in ("titulos", "texto"):
        f = entrada.fontes.get(uso)
        if not f or f["tipo"] != "google":
            continue
        pesos = set(entrada.pesos.get(uso, []))
        if uso == "texto":
            pesos.add(400)
        familias.setdefault(f["familias"][0], set()).update(pesos)
    if not familias:
        return None
    partes = []
    for nome, pesos in familias.items():
        partes.append("family=" + nome.replace(" ", "+") + (":wght@" + ";".join(str(p) for p in sorted(pesos)) if pesos else ""))
    return "https://fonts.googleapis.com/css2?" + "&".join(partes) + "&display=swap"


def nome_da_empresa(sistema: Path) -> str | None:
    """Nome em config/empresa.ts, ou None se ainda é {{placeholder}}."""
    arquivo = sistema / "config" / "empresa.ts"
    if not arquivo.is_file():
        return None
    m = re.search(r'\bnome:\s*"([^"\n]*)"', arquivo.read_bytes().decode("utf-8"))
    if not m or "{{" in m.group(1) or not m.group(1).strip():
        return None
    return m.group(1).strip()


def icone_gerado(nome: str | None, acento: str, sobre: str) -> bytes:
    inicial = "OS"
    if nome:
        letras = [c for c in nome if c.isalnum()]
        inicial = letras[0].upper() if letras else "OS"
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
           f'<rect width="32" height="32" rx="8" fill="{acento}"/>'
           f'<text x="16" y="{22 if len(inicial) == 1 else 21}" text-anchor="middle" '
           f'font-family="system-ui, sans-serif" font-size="{18 if len(inicial) == 1 else 14}" font-weight="700" '
           f'fill="{sobre}">{html.escape(inicial)}</text></svg>\n')
    return svg.encode("utf-8")


# ---------------------------------------------------------------- DESIGN.md

def _limpo(texto: str) -> str:
    return re.sub(r'["\\\x00-\x1f]', "", texto).strip()


def montar_front_matter(nome_sistema: str, descricao: str, cores: dict[str, str], tipo: dict, raios: tuple[str, str, str], nl: str) -> str:
    linhas = ["---", "version: alpha", f'name: "{_limpo(nome_sistema)}"', f'description: "{_limpo(descricao)}"', "colors:"]
    linhas += [f'  {k}: "{v}"' for k, v in cores.items()]
    linhas += ["typography:"]
    for uso in ("titulos", "texto"):
        linhas += [f"  {uso}:", f'    fontFamily: "{_limpo(tipo[uso][0])}"', f"    fontWeight: {int(tipo[uso][1])}"]
    linhas += ["rounded:", f'  sm: "{raios[0]}"', f'  md: "{raios[1]}"', f'  lg: "{raios[2]}"', "---"]
    return nl.join(linhas) + nl


def _linhas(texto: str) -> list[str]:
    return re.findall(r"[^\n]*\n|[^\n]+", texto)


def atualizar_design(texto: str, front_matter: str, miolo: list[str]) -> str:
    """Troca só o front matter e o miolo entre os marcadores; o resto fica byte a byte. Falha = Falha."""
    nl = "\r\n" if "\r\n" in texto else "\n"
    linhas = _linhas(texto)
    if linhas and linhas[0].rstrip("\r\n") == "---":
        fim = next((i for i in range(1, len(linhas)) if linhas[i].rstrip("\r\n") == "---"), None)
        if fim is None:
            raise Falha("DESIGN.md começa com --- mas o front matter não fecha")
        linhas = _linhas(front_matter) + linhas[fim + 1:]
    else:
        linhas = _linhas(front_matter) + [nl] + linhas
    n_inicio = sum(l.count(INICIO) for l in linhas)
    n_fim = sum(l.count(FIM) for l in linhas)
    sozinho_inicio = [i for i, l in enumerate(linhas) if l.rstrip("\r\n") == INICIO]
    sozinho_fim = [i for i, l in enumerate(linhas) if l.rstrip("\r\n") == FIM]
    corpo = [m + nl for m in miolo]
    if n_inicio == 0 and n_fim == 0:
        base = "".join(linhas)
        if base and not base.endswith("\n"):
            base += nl
        if base and not base.endswith(nl + nl) and not base.endswith("\n\n"):
            base += nl
        return base + "## Marca aplicada" + nl + nl + INICIO + nl + "".join(corpo) + FIM + nl
    elif n_inicio != 1 or n_fim != 1:
        raise Falha("DESIGN.md precisa ter exatamente 1 marcador de início e 1 de fim da seção Marca aplicada")
    if len(sozinho_inicio) != 1 or len(sozinho_fim) != 1:
        raise Falha("os marcadores da seção Marca aplicada do DESIGN.md precisam estar sozinhos na linha")
    if sozinho_inicio[0] > sozinho_fim[0]:
        raise Falha("os marcadores da seção Marca aplicada do DESIGN.md estão invertidos")
    return "".join(linhas[:sozinho_inicio[0] + 1] + corpo + linhas[sozinho_fim[0]:])


def montar_miolo(entrada: Entrada, escolhas: dict, tabela: list[tuple], ajustes: list[str], avisos: list[str],
                 data: str, ctx: dict) -> list[str]:
    linhas = [f"Origem: `empresa/marca/tokens.json` (sha256 {entrada.sha}), aplicada em {data}.", "",
              "Contraste dos pares de cor (razão cortada em 2 casas; mínimo 4,5 para texto, 3 para cor de ação e texto auxiliar):", "",
              "| Par | Mínimo | Claro | Escuro | Passa |", "|---|---|---|---|---|"]
    for rotulo, minimo, piores in tabela:
        c, e = piores.get("claro"), piores.get("escuro")
        ok = c is not None and e is not None and passa_limiar(c, minimo) and passa_limiar(e, minimo)
        linhas.append(f"| {rotulo} | {str(minimo).replace('.', ',')} | {formatar_razao(c) if c else '-'} | "
                      f"{formatar_razao(e) if e else '-'} | {'sim' if ok else 'não'} |")
    linhas += ["", "Ajustes feitos para dar leitura:", ""]
    linhas += [f"- {a}" for a in ajustes] or ["- Nenhum."]
    pers = []
    arq = entrada.arquetipo
    if arq.get("principal"):
        pers.append(f"arquétipo {arq['principal']}" + (f" (secundário {arq['secundario']})" if arq.get("secundario") else ""))
    if entrada.palavras:
        pers.append("tom: " + ", ".join(entrada.palavras))
    if pers:
        linhas += ["", "Personalidade: " + "; ".join(pers) + "."]
    extras = []
    if entrada.apoio:
        extras.append(f"cor de apoio {entrada.apoio}")
    if entrada.destaque:
        extras.append(f"cor de destaque {entrada.destaque}")
    if entrada.texto:
        extras.append(f"cor de texto da marca {entrada.texto}")
    if extras:
        linhas += ["", "Ficam só aqui, não viram cor da interface: " + "; ".join(extras) + "."]
    for aviso in avisos:
        linhas += ["", f"Aviso: {aviso}."]
    return linhas


def data_anterior(texto: str, sha: str) -> str | None:
    """Data da aplicação anterior, se o tokens.json (sha) é o mesmo: a data só muda quando o tokens.json muda."""
    i, f = texto.find(INICIO), texto.find(FIM)
    if i < 0 or f < i:
        return None
    m = re.search(r"sha256 ([0-9a-f]{12})\), aplicada em (\d{4}-\d{2}-\d{2})", texto[i:f])
    return m.group(2) if m and m.group(1) == sha else None


# ---------------------------------------------------------------- plano de gravação

def _sistema(casa: Path, arg: str) -> Path:
    p = Path(arg)
    p = p if p.is_absolute() else casa / p
    p = p.resolve()
    try:
        p.relative_to(casa.resolve())
    except ValueError:
        raise Falha("o sistema precisa ficar dentro da pasta da Casa", 2)
    return p


def _sistema_novo(sistema: Path) -> list[str]:
    if not sistema.is_dir():
        return ["o sistema ainda não está instalado nesta Casa (não achei a pasta do sistema)"]
    faltas = []
    if not (sistema / "src" / "components" / "marca" / "LogoMarca.tsx").is_file():
        faltas.append("falta src/components/marca/LogoMarca.tsx")
    layout = sistema / "src" / "app" / "layout.tsx"
    if not layout.is_file() or "config/marca" not in layout.read_bytes().decode("utf-8", "replace"):
        faltas.append("o layout.tsx ainda não lê config/marca")
    if faltas:
        return ["este sistema foi instalado antes da marca por skill e ainda não tem os pontos de leitura da marca "
                "(" + "; ".join(faltas) + "): ele precisa ser atualizado antes; não apliquei nada"]
    return []


class Plano:
    def __init__(self):
        self.gravar: dict[Path, bytes] = {}
        self.apagar: list[Path] = []
        self.ajustes: list[str] = []
        self.avisos: list[str] = []
        self.resumo: list[str] = []
        self.ctx: dict | None = None
        self.css = ""
        self.tabela: list[tuple] = []


def planejar(casa: Path, sistema: Path, entrada: Entrada, escolhas: dict, hoje: str) -> Plano:
    plano = Plano()
    theme_path = sistema / "src" / "app" / "theme.css"
    css_atual = theme_path.read_bytes().decode("utf-8") if theme_path.is_file() else None
    css, ajustes, avisos = calcular_tema(entrada, escolhas, css_atual)
    problemas, tabela, ctx = avaliar_tema(css)
    if problemas:
        raise Falha(["o tema calculado não passou na conferência de leitura; nada foi gravado:"] + problemas)
    plano.css, plano.tabela, plano.ctx = css, tabela, ctx
    plano.ajustes = entrada.avisos + ajustes
    plano.avisos = avisos
    claro, escuro = ctx["resolvido"]["claro"], ctx["resolvido"]["escuro"]
    plano.gravar[theme_path] = css.encode("utf-8")

    # logo e ícone
    gravados: set[Path] = set()
    logo_claro, logo_escuro = None, None
    marca_ts_path = sistema / "config" / "marca.ts"
    atual_marca = None
    if marca_ts_path.is_file():
        atual_marca, _ = ler_marca_ts(marca_ts_path.read_bytes().decode("utf-8"))
    logo_claro = atual_marca["fundoClaro"] if atual_marca else "/marca/logo.svg"
    logo_escuro = atual_marca["fundoEscuro"] if atual_marca else logo_claro
    pasta_marca = sistema / "public" / "marca"
    if entrada.logos.get("principal"):
        origem = casa / entrada.logos["principal"]
        destino = pasta_marca / f"logo{origem.suffix.lower()}"
        plano.gravar[destino] = origem.read_bytes()
        gravados.add(destino)
        logo_claro = f"/marca/{destino.name}"
        logo_escuro = logo_claro
        if entrada.logos.get("claro"):
            o2 = casa / entrada.logos["claro"]
            d2 = pasta_marca / f"logo-fundo-escuro{o2.suffix.lower()}"
            plano.gravar[d2] = o2.read_bytes()
            gravados.add(d2)
            logo_escuro = f"/marca/{d2.name}"
        if pasta_marca.is_dir():
            for f in sorted(pasta_marca.iterdir()):
                if re.match(r"^logo(-fundo-escuro)?\.[A-Za-z0-9]+$", f.name) and f not in gravados and (f.is_file() or f.is_symlink()):
                    plano.apagar.append(f)
    app = sistema / "src" / "app"
    icones: set[Path] = set()
    origem_icone = (casa / entrada.logos["icone"]) if entrada.logos.get("icone") else None
    if origem_icone is not None and origem_icone.suffix.lower() in (".png", ".jpg", ".jpeg"):
        dados = origem_icone.read_bytes()
        for prefixo in ("icon", "apple-icon"):
            alvo = app / f"{prefixo}{origem_icone.suffix.lower()}"
            plano.gravar[alvo] = dados
            icones.add(alvo)
    else:
        alvo = app / "icon.svg"
        plano.gravar[alvo] = icone_gerado(nome_da_empresa(sistema), claro["--acento"], claro["--fg-sobre-acento"])
        icones.add(alvo)
        if origem_icone is not None:
            plano.ajustes.append("o ícone da marca está em webp, que o navegador não aceita como ícone da aba: gerei um ícone com a inicial do nome")
    if app.is_dir():
        for f in sorted(app.iterdir()):
            if (re.match(r"^(icon|apple-icon)\.[A-Za-z0-9]+$", f.name) or f.name == "favicon.ico") and f not in icones \
                    and (f.is_file() or f.is_symlink()):
                plano.apagar.append(f)

    plano.gravar[marca_ts_path] = montar_marca_ts(
        logo_claro, logo_escuro, url_fontes(entrada), claro["--bg"], escuro["--bg"]).encode("utf-8")

    # DESIGN.md
    design = sistema / "DESIGN.md"
    if not design.is_file():
        raise Falha("não achei DESIGN.md no sistema")
    texto = design.read_bytes().decode("utf-8")
    nl = "\r\n" if "\r\n" in texto else "\n"
    nome = nome_da_empresa(sistema)
    nome_sistema = f"{nome} OS" if nome else "Empresa OS"
    cores = {"primary": claro["--acento"], "primary-hover": claro["--acento-hover"], "on-primary": claro["--fg-sobre-acento"],
             "primary-text": claro["--acento-texto"], "surface": claro["--bg"], "surface-dark": escuro["--bg"],
             "on-surface": claro["--fg-1"], "neutral": resolver("--neutro-500", plano.ctx["claro"]) or "#6A6A78",
             "error": resolver("--erro", plano.ctx["claro"]) or PRESERVADOS_CLARO["--erro"]}
    if entrada.apoio:
        cores["secondary"] = entrada.apoio
    if entrada.destaque:
        cores["tertiary"] = entrada.destaque
    tipo = {}
    for uso, padrao in (("titulos", 600), ("texto", 400)):
        fam = entrada.fontes.get(uso, {}).get("familias", ["system-ui"])[0]
        peso = min(entrada.pesos.get(uso, [padrao])) if uso == "titulos" and entrada.pesos.get(uso) else padrao
        tipo[uso] = (fam, peso)
    raios = tuple(plano.ctx["claro"][k] for k in ("--raio-sm", "--raio-md", "--raio-lg"))
    fm = montar_front_matter(nome_sistema, "Tema da marca da empresa, aplicado pela skill tecnologia-aplicar-marca a partir de empresa/marca/tokens.json.",
                             cores, tipo, raios, nl)
    data = data_anterior(texto, entrada.sha) or hoje
    miolo = montar_miolo(entrada, escolhas, tabela, plano.ajustes, avisos, data, ctx)
    plano.gravar[design] = atualizar_design(texto, fm, miolo).encode("utf-8")

    plano.resumo = resumo_cinco_linhas(entrada, claro, escuro, logo_claro, logo_escuro)
    return plano


def resumo_cinco_linhas(entrada: Entrada, claro: dict, escuro: dict, logo_claro: str, logo_escuro: str) -> list[str]:
    fam_t = entrada.fontes.get("titulos", {}).get("familias", [None])[0]
    fam_x = entrada.fontes.get("texto", {}).get("familias", [None])[0]
    fonte = " e ".join(x for x in (f"{fam_t} nos títulos" if fam_t else None, f"{fam_x} no texto" if fam_x else None) if x) or "fonte do computador"
    return [f"Cor dos botões: {claro['--acento']} (claro) e {escuro['--acento']} (escuro)",
            f"Cor dos links: {claro['--acento-texto']} (claro) e {escuro['--acento-texto']} (escuro)",
            f"Fundo: {claro['--bg']} (claro) e {escuro['--bg']} (escuro)",
            f"Fonte: {fonte}",
            f"Logo: {'um para cada versão' if logo_claro != logo_escuro else 'o mesmo nos dois fundos'}"]


def gravar_texto(caminho: Path, dados: bytes) -> bool:
    """Grava só se mudou; devolve True se gravou."""
    if caminho.is_file() and caminho.read_bytes() == dados:
        return False
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(dados)
    return True


# ---------------------------------------------------------------- mockup

TIPOS_IMAGEM = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml"}


def _data_uri(nome: str, dados: bytes) -> str:
    tipo = TIPOS_IMAGEM.get(Path(nome).suffix.lower(), "application/octet-stream")
    return f"data:{tipo};base64," + base64.b64encode(dados).decode("ascii")


def montar_mockup(entrada: Entrada, plano: Plano, nome_sistema: str, imagens: dict[str, str], fontes: str | None) -> str:
    claro_css, escuro_css = plano.ctx["claro"], plano.ctx["escuro"]
    escape = html.escape
    raiz = "".join(f"{k}:{v};" for k, v in claro_css.items() if k != "--anel-foco")
    escuro = "".join(f"{k}:{v};" for k, v in escuro_css.items() if k in ORDEM_ESCURO)
    anel = f"--anel-foco:{ANEL_FOCO};"
    cabeca_fontes = ""
    if fontes:
        cabeca_fontes = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
                         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
                         f'<link rel="stylesheet" href="{escape(fontes)}">')

    def logo(tema: str) -> str:
        src = imagens.get("escuro" if tema == "escuro" else "claro")
        return f'<img class="logo" src="{src}" alt="">' if src else ""

    def tela(tema: str, largura: str) -> str:
        icone = imagens.get("icone")
        aba = f'<img class="aba-icone" src="{icone}" alt="">' if icone else ""
        return f"""<div class="quadro {largura}"><div class="aba">{aba}<span>{escape(nome_sistema)}</span></div>
<div class="app"><nav class="menu">{logo(tema)}<strong>{escape(nome_sistema)}</strong>
<a class="item ativo">Início</a><a class="item">Tarefas</a><a class="item">Clientes</a></nav>
<main><header><h1>Tarefas da semana</h1><span class="selo ok">Em dia</span></header>
<p>Veja o que é de cada pessoa. <a href="#" class="link">Abrir o quadro completo</a></p>
<div class="botoes"><button class="primario">Nova tarefa</button><button class="secundario">Filtrar</button></div>
<div class="cartao"><h2>Entrega do cliente</h2><p class="apoio">Prazo na sexta, falta aprovar o texto.</p>
<span class="selo alerta">Atenção</span> <span class="selo erro">Atrasada</span></div>
<table><tr><th>Tarefa</th><th>Quem</th><th>Prazo</th></tr><tr><td>Revisar proposta</td><td>Ana</td><td>Hoje</td></tr>
<tr><td>Enviar contrato</td><td>Bruno</td><td>Sexta</td></tr></table>
<label class="campo">Nome da tarefa<input class="foco" value="Ligar para o cliente"></label>
<div class="aviso-erro">Não foi possível salvar. Tente de novo.</div></main></div></div>"""

    def painel(tema: str, titulo: str) -> str:
        return f'<section class="tema tema-{tema}"><h2 class="rotulo">{titulo}</h2><div class="telas">{tela(tema, "pc")}{tela(tema, "cel")}</div></section>'

    css = f""":root{{{raiz}}}
.tema-claro{{{anel}}}
.tema-escuro{{{escuro}{anel}}}
*{{box-sizing:border-box}}
body{{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#888;}}
.tema{{padding:16px;margin-bottom:24px;background:var(--bg);color:var(--fg-1);font-family:var(--fonte-texto)}}
.rotulo{{font:600 14px system-ui;margin:0 0 12px;color:var(--fg-2)}}
.telas{{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}}
.quadro{{border:1px solid var(--borda);border-radius:var(--raio-lg);overflow:hidden;background:var(--bg)}}
.quadro.pc{{width:720px;max-width:100%}}.quadro.cel{{width:320px;max-width:100%}}
.aba{{display:flex;gap:8px;align-items:center;padding:6px 12px;background:var(--bg-sutil);border-bottom:1px solid var(--borda);font-size:12px;color:var(--fg-3)}}
.aba-icone{{width:16px;height:16px}}
.app{{display:flex}}.cel .app{{flex-direction:column}}
.menu{{width:170px;padding:12px;background:var(--bg-sutil);border-right:1px solid var(--borda);display:flex;flex-direction:column;gap:6px}}
.cel .menu{{width:auto;flex-direction:row;align-items:center;border-right:0;border-bottom:1px solid var(--borda);overflow:hidden}}
.logo{{height:24px;width:auto;max-width:120px}}
.item{{padding:6px 8px;border-radius:var(--raio-sm);color:var(--fg-2)}}
.item.ativo{{background:var(--acento-suave);color:var(--acento-texto)}}
.cel .item:not(.ativo){{display:none}}
main{{flex:1;padding:16px;background:var(--bg)}}
h1{{font:600 20px var(--fonte-titulo);margin:0}}h2{{font:600 16px var(--fonte-titulo);margin:0 0 6px}}
header{{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}}
.link{{color:var(--acento-texto)}}.apoio{{color:var(--fg-3);margin:0 0 8px}}
.botoes{{display:flex;gap:8px;margin:12px 0}}
button{{font:600 14px var(--fonte-texto);padding:8px 14px;border-radius:var(--raio-md);border:1px solid transparent;cursor:pointer}}
.primario{{background:var(--acento);color:var(--fg-sobre-acento)}}.primario:hover{{background:var(--acento-hover)}}
.secundario{{background:var(--bg-elevada);color:var(--fg-1);border-color:var(--borda)}}
.cartao{{background:var(--bg-elevada);border:1px solid var(--borda);border-radius:var(--raio-lg);padding:12px;box-shadow:var(--sombra-sm);margin-bottom:12px}}
.selo{{font-size:12px;padding:2px 8px;border-radius:var(--raio-pill)}}
.selo.ok{{background:var(--ok-suave);color:var(--ok)}}.selo.alerta{{background:var(--alerta-suave);color:var(--alerta)}}.selo.erro{{background:var(--erro-suave);color:var(--erro)}}
table{{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:14px}}
th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid var(--borda-suave)}}th{{color:var(--fg-3);font-weight:600}}
.campo{{display:block;font-size:14px;color:var(--fg-2)}}
input{{display:block;width:100%;margin-top:4px;padding:8px;border-radius:var(--raio-md);border:1px solid var(--borda);background:var(--bg-elevada);color:var(--fg-1);font:inherit}}
input.foco{{outline:none;box-shadow:var(--anel-foco)}}
.aviso-erro{{margin-top:12px;padding:8px 12px;border-radius:var(--raio-md);background:var(--erro-suave);color:var(--erro);font-size:14px}}
"""
    return (f'<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><title>Mockup: {escape(nome_sistema)}</title>'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">{cabeca_fontes}<style>{css}</style></head>'
            f'<body>{painel("claro", "Versão clara")}{painel("escuro", "Versão escura")}</body></html>\n')


# ---------------------------------------------------------------- linha de comando

def _utf8() -> None:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def _falhar(erro: Falha) -> int:
    for m in erro.mensagens:
        print(f"PROBLEMA: {m}", file=sys.stderr if erro.codigo == 2 else sys.stdout)
    return erro.codigo


def _preparar(a) -> tuple[Path, Entrada, dict]:
    casa = Path(a.casa).resolve()
    if not casa.is_dir():
        raise Falha(f"a pasta da Casa '{a.casa}' não existe", 2)
    entrada, erros = ler_entrada(casa)
    if entrada is None:
        raise Falha(erros)
    cli = {"acento": getattr(a, "acento", None), "neutros": getattr(a, "neutros", None), "forma": getattr(a, "forma", None)}
    return casa, entrada, ler_escolhas(casa, entrada, cli)


def cmd_ler(a) -> int:
    casa, entrada, _ = _preparar(a)
    if a.json:
        print(json.dumps({"principal": entrada.principal, "paleta": sorted(entrada.paleta), "fundo": entrada.fundo,
                          "fontes": entrada.fontes, "pesos": entrada.pesos, "logo": entrada.logos,
                          "avisos": entrada.avisos, "sha": entrada.sha}, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    print(f"OK: tokens.json lido (cor principal {entrada.principal}, {len(entrada.paleta)} cores, "
          f"{len(entrada.fontes)} fontes, {len(entrada.logos)} arquivos de logo).")
    for aviso in entrada.avisos:
        print(f"AVISO: {aviso}")
    return 0


def _gravar_escolhas(casa: Path, escolhas: dict) -> None:
    gravar_texto(casa / "operacao" / "marca" / "escolhas.json", texto_escolhas(escolhas).encode("utf-8"))


def cmd_mockup(a) -> int:
    casa, entrada, escolhas = _preparar(a)
    sistema = _sistema(casa, a.sistema)
    saida = Path(a.saida)
    destino = (saida if saida.is_absolute() else casa / saida).resolve()
    try:
        rel = destino.relative_to((casa / "operacao" / "marca").resolve())
    except ValueError:
        raise Falha("--saida precisa ser um .html dentro de operacao/marca/", 2)
    if destino.suffix != ".html" or not rel.name:
        raise Falha("--saida precisa ser um .html dentro de operacao/marca/", 2)
    theme = sistema / "src" / "app" / "theme.css"
    css_atual = theme.read_bytes().decode("utf-8") if theme.is_file() else None
    css, ajustes, avisos = calcular_tema(entrada, escolhas, css_atual)
    problemas, tabela, ctx = avaliar_tema(css)
    if problemas:
        raise Falha(["o tema calculado não passou na conferência de leitura:"] + problemas)
    plano = Plano()
    plano.css, plano.tabela, plano.ctx = css, tabela, ctx
    imagens: dict[str, str] = {}
    for papel, chave in (("principal", "claro"), ("claro", "escuro"), ("icone", "icone")):
        if entrada.logos.get(papel):
            alvo = casa / entrada.logos[papel]
            imagens[chave] = _data_uri(alvo.name, alvo.read_bytes())
    if "escuro" not in imagens and "claro" in imagens:
        imagens["escuro"] = imagens["claro"]
    claro, escuro = ctx["resolvido"]["claro"], ctx["resolvido"]["escuro"]
    if "icone" not in imagens or Path(entrada.logos["icone"]).suffix.lower() == ".webp":
        imagens["icone"] = _data_uri("icon.svg", icone_gerado(nome_da_empresa(sistema), claro["--acento"], claro["--fg-sobre-acento"]))
    nome = nome_da_empresa(sistema)
    pagina = montar_mockup(entrada, plano, f"{nome} OS" if nome else "Empresa OS", imagens, url_fontes(entrada))
    gravar_texto(destino, pagina.encode("utf-8"))
    _gravar_escolhas(casa, escolhas)
    print(f"MOCKUP: {destino.relative_to(casa).as_posix()}")
    for linha in resumo_cinco_linhas(entrada, claro, escuro, "a" if imagens.get("claro") != imagens.get("escuro") else "b", "b"):
        print(linha)
    for aj in entrada.avisos + ajustes + avisos:
        print(f"AJUSTE: {aj}")
    return 0


def cmd_aplicar(a) -> int:
    casa, entrada, escolhas = _preparar(a)
    sistema = _sistema(casa, a.sistema)
    antigo = _sistema_novo(sistema)
    if antigo:
        raise Falha(antigo)
    hoje = a.hoje or date.today().isoformat()
    plano = planejar(casa, sistema, entrada, escolhas, hoje)
    rotulo = lambda p: p.relative_to(casa).as_posix()
    if a.dry_run:
        for p in plano.gravar:
            print(f"GRAVARIA: {rotulo(p)}")
        for p in plano.apagar:
            print(f"APAGARIA: {rotulo(p)}")
        for linha in plano.resumo:
            print(linha)
        return 0
    for p, dados in plano.gravar.items():
        print(("GRAVADO: " if gravar_texto(p, dados) else "igual: ") + rotulo(p))
    for p in plano.apagar:
        p.unlink()
        print(f"APAGADO: {rotulo(p)}")
    _gravar_escolhas(casa, escolhas)
    for linha in plano.resumo:
        print(linha)
    for aj in plano.ajustes + plano.avisos:
        print(f"AJUSTE: {aj}")
    print("FEITO: marca aplicada. Rode o conferir antes de seguir.")
    return 0


def cmd_conferir(a) -> int:
    sistema = Path(a.sistema).resolve()
    if not sistema.is_dir():
        raise Falha(f"o sistema '{a.sistema}' não existe", 2)
    problemas, tabela = conferir_sistema(sistema)
    if problemas:
        for p in problemas:
            texto = p if a.detalhe else re.sub(r" \[[^\]]*\]$", "", p)
            print(f"FALHA: {texto}")
        return 1
    print("OK: o tema passa na leitura nos dois temas e config/marca.ts bate com o tema.")
    if a.detalhe:
        for rotulo, minimo, piores in tabela:
            print(f"  {rotulo}: " + ", ".join(f"{t} {formatar_razao(r)}" for t, r in piores.items()) + f" (mínimo {minimo})")
    return 0


def cmd_autor(a) -> int:
    casa = Path(a.casa).resolve()
    if a.gh_json:
        try:
            dados = json.loads(Path(a.gh_json).read_bytes().decode("utf-8"))
        except (OSError, UnicodeError, ValueError):
            raise Falha("não consegui ler o arquivo do --gh-json", 2)
    else:
        gh = shutil.which("gh")
        if not gh:
            raise Falha("não achei o gh (GitHub CLI): entre com `gh auth login` antes")
        r = subprocess.run([gh, "api", "user"], capture_output=True, text=True, encoding="utf-8", timeout=60)
        if r.returncode != 0:
            raise Falha("o gh não conseguiu ler a conta do GitHub: entre com `gh auth login`")
        try:
            dados = json.loads(r.stdout)
        except ValueError:
            raise Falha("a resposta do gh não é um JSON válido")
    if not isinstance(dados, dict) or not isinstance(dados.get("id"), int) or not isinstance(dados.get("login"), str) \
            or not re.match(r"^[A-Za-z0-9-]{1,39}$", dados["login"]):
        raise Falha("a resposta da conta do GitHub não tem id e login")
    email = dados.get("email") if isinstance(dados.get("email"), str) and dados.get("email") else None
    noreply = f"{dados['id']}+{dados['login']}@users.noreply.github.com"
    git = shutil.which("git")
    if not git:
        raise Falha("não achei o git no computador")
    r = subprocess.run([git, "-C", str(casa), "config", "--local", "user.email"], capture_output=True, text=True, encoding="utf-8")
    if r.returncode not in (0, 1):
        raise Falha("esta pasta não é um repositório git")
    atual = r.stdout.strip()
    aceitos = {noreply.lower()} | ({email.lower()} if email else set())
    if atual.lower() in aceitos:
        print("OK: o e-mail dos commits desta Casa é o da sua conta do GitHub.")
        return 0
    if not a.corrigir:
        print("DIVERGE: o e-mail dos commits desta Casa não é o da sua conta do GitHub; rode de novo com --corrigir.")
        return 1
    r = subprocess.run([git, "-C", str(casa), "config", "--local", "user.email", noreply], capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise Falha("não consegui gravar o e-mail no git desta Casa")
    print(f"CORRIGIDO: o e-mail dos commits desta Casa agora é {noreply}.")
    return 0


def main(argv: list[str] | None = None) -> int:
    _utf8()
    ap = argparse.ArgumentParser(prog="aplicar_marca.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    def comum(p, sistema=True):
        p.add_argument("--casa", default=".", help="raiz da Casa (padrão: pasta atual)")
        if sistema:
            p.add_argument("--sistema", default="sistemas/empresa-os", help="pasta do sistema, dentro da Casa")

    def opcoes(p):
        p.add_argument("--acento", help="cor de ação (#HEX) escolhida entre as cores da paleta aprovada")
        p.add_argument("--neutros", choices=("marca", "cinza"))
        p.add_argument("--forma", choices=tuple(FORMAS))

    p = sub.add_parser("ler")
    comum(p, False)
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("mockup")
    comum(p)
    opcoes(p)
    p.add_argument("--saida", default="operacao/marca/mockup-sistema.html")
    p = sub.add_parser("aplicar")
    comum(p)
    opcoes(p)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--hoje", help=argparse.SUPPRESS)
    p = sub.add_parser("conferir")
    p.add_argument("--sistema", default="sistemas/empresa-os")
    p.add_argument("--detalhe", action="store_true", help="mostra as razões de contraste")
    p = sub.add_parser("autor")
    comum(p, False)
    p.add_argument("--corrigir", action="store_true")
    p.add_argument("--gh-json", help="resposta de `gh api user` em arquivo (teste, sem rede)")
    try:
        a = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    try:
        return {"ler": cmd_ler, "mockup": cmd_mockup, "aplicar": cmd_aplicar, "conferir": cmd_conferir, "autor": cmd_autor}[a.cmd](a)
    except Falha as erro:
        return _falhar(erro)


if __name__ == "__main__":
    sys.exit(main())
