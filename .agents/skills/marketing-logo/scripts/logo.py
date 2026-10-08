#!/usr/bin/env python3
"""logo.py: trata o logo que o DONO entregou. Nunca cria logo.

Usa o Pillow (biblioteca de imagem do Python) SE ele estiver instalado. Sem Pillow, imprime a
instrução exata de instalação e sai com 2, sem inventar nada e sem tocar em arquivo.

Comandos (da raiz do projeto; o arquivo de entrada nunca é alterado nem sobrescrito):
  logo.py analisar ARQUIVO [--json]
      formato, tamanho, se já tem fundo transparente, se o fundo é uma cor só e o que fazer.
  logo.py cores ARQUIVO [--n 6] [--json]
      cores dominantes do logo (HEX e % da área), sem contar o fundo liso. Alimenta a paleta.
  logo.py tirar-fundo ARQUIVO --saida logo-principal.png [--tolerancia 32] [--miolos] [--sem-suavizar]
                      [--sem-recortar] [--sobrescrever]
      PNG com fundo transparente. Preenche a partir dos 4 cantos o que for da cor do fundo (diferença
      de até --tolerancia em cada canal, 0 a 255) e suaviza a borda para não sobrar halo claro. Se o
      fundo não for uma cor só, RECUSA (sai 1) em vez de estragar o desenho. --miolos também apaga
      áreas fechadas da cor do fundo (miolo de letras como o O); sem ele elas ficam e são contadas.
  logo.py icone ARQUIVO_TRANSPARENTE --saida logo-icone.png [--lado 512] [--margem 10]
                      [--recorte X0,Y0,X1,Y1] [--sobrescrever]
      ícone quadrado, centralizado, com margem em %. Sem --recorte usa o logo inteiro; se o logo
      tem símbolo separado do nome, passe o --recorte do símbolo (em pixels do arquivo de entrada).
  logo.py variante ARQUIVO_TRANSPARENTE --saida logo-claro.png --modo inversao|branca|preta [--sobrescrever]
      variante para fundo escuro ou claro, só quando o dono pedir. inversao troca as cores (azul vira
      laranja); branca e preta mantêm só o formato. Exige fundo transparente.
  logo.py svg ARQUIVO.png --saida logo.svg [--sobrescrever]
      SVG que apenas EMBUTE o PNG. NÃO é vetorização: amplia com perda de nitidez. O vetor de
      verdade vem do arquivo original de quem desenhou o logo.

Saída: 0 ok; 1 recusa (o arquivo não serve para esse tratamento; nada foi escrito); 2 uso errado,
arquivo ilegível ou Pillow ausente. Imagens com lado maior que 2000 px são reduzidas antes de tratar
(o aviso diz). Só stdlib + Pillow opcional (Python 3.10+).
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import sys
import warnings
from pathlib import Path

LADO_MAX = 2000
TETO_BYTES = 25_000_000
MAX_PIXELS = 40_000_000
TOLERANCIA_PADRAO = 32
EXTENSOES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
ASSINATURA_PNG = b"\x89PNG\r\n\x1a\n"
MODOS = ("inversao", "branca", "preta")


class Recusa(Exception):
    """O arquivo não serve para este tratamento: nada foi escrito (saída 1)."""


class Uso(Exception):
    """Pedido mal feito ou arquivo ilegível (saída 2)."""


def pil():
    """Importa o Pillow só na hora de usar; None se não estiver instalado."""
    try:
        from PIL import Image, ImageChops, ImageFilter, ImageOps, ImageStat
    except ImportError:
        return None
    return Image, ImageChops, ImageFilter, ImageOps, ImageStat


def mensagem_sem_pillow() -> str:
    py = f'"{sys.executable}"' if sys.executable else "python3"
    return (
        "FALTA: o Pillow (biblioteca de imagem do Python) não está instalado neste computador.\n"
        "Sem ele eu não trato o logo, e também não invento um: nada foi feito.\n"
        "Para instalar, uma vez só, rode no terminal:\n"
        f"  {py} -m pip install --user Pillow\n"
        'Se aparecer "externally-managed-environment" (comum no Mac com Homebrew), use:\n'
        f"  {py} -m pip install --user --break-system-packages Pillow\n"
        "Depois repita o pedido."
    )


def hex_de(rgb) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb[:3])


def dif_max(a, b) -> int:
    return max(abs(a[i] - b[i]) for i in range(3))


# ---------------------------------------------------------------- abrir e escrever

def abrir(caminho: str, modulos):
    """(imagem RGBA, info). Reduz o que passar de LADO_MAX. Arquivo ruim sai como Uso ou Recusa."""
    Image, _, _, ImageOps, _ = modulos
    p = Path(caminho)
    if p.suffix.lower() == ".svg":
        raise Recusa("este arquivo é SVG (vetor): guarde-o como mestre em empresa/marca/logo/. Este script só trata "
                     "PNG, JPG ou WEBP; para gerar PNG a partir do SVG, peça ao dono para exportar do programa "
                     "em que abre o SVG (navegador, Canva, Figma).")
    if p.suffix.lower() not in EXTENSOES:
        raise Uso(f"formato {p.suffix or 'sem extensão'} não é aceito; use png, jpg, jpeg, webp, gif ou bmp")
    if not p.is_file():
        raise Uso(f"o arquivo não existe: {caminho}")
    if p.stat().st_size > TETO_BYTES:
        raise Uso(f"o arquivo passa de {TETO_BYTES // 1_000_000} MB; peça uma versão menor ao dono")
    sha = hashlib.sha256(p.read_bytes()).hexdigest()
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(p) as bruto:
                formato, modo = bruto.format, bruto.mode
                animada = getattr(bruto, "n_frames", 1) > 1
                img = ImageOps.exif_transpose(bruto).convert("RGBA")
    except (OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as erro:
        raise Uso(f"não consegui abrir a imagem ({type(erro).__name__}): confira se o arquivo não está corrompido "
                  "e se tem menos de 40 milhões de pixels") from None
    info = {"arquivo": caminho, "formato": formato, "modo": modo, "animada": animada, "sha256": sha,
            "tamanho": list(img.size), "reduzida_de": None}
    if max(img.size) > LADO_MAX:
        info["reduzida_de"] = list(img.size)
        img.thumbnail((LADO_MAX, LADO_MAX), Image.LANCZOS)
        info["tamanho"] = list(img.size)
    return img, info


def conferir_saida(saida: str, entrada: str, sobrescrever: bool, sufixo: str) -> Path:
    destino = Path(saida)
    if destino.suffix.lower() != sufixo:
        raise Uso(f"a saída precisa terminar em {sufixo} (veio {saida})")
    if destino.resolve() == Path(entrada).resolve():
        raise Uso("a saída é o próprio arquivo de entrada: o original nunca é sobrescrito")
    if destino.exists() and not sobrescrever:
        raise Uso(f"{saida} já existe; use --sobrescrever se for para trocar")
    return destino


def salvar_png(img, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    img.save(destino, format="PNG", optimize=True)


# ---------------------------------------------------------------- análise

def cantos_de(img) -> list[tuple[int, int, int, int]]:
    w, h = img.size
    px = img.load()
    return [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]


def cor_do_fundo(cantos) -> tuple[int, int, int] | None:
    """Mediana por canal dos 4 cantos, se os 4 forem opacos."""
    if any(c[3] < 128 for c in cantos):
        return None
    return tuple(sorted(c[i] for c in cantos)[1] for i in range(3))  # type: ignore[return-value]


def analisar(img, info: dict, tolerancia: int = TOLERANCIA_PADRAO) -> dict:
    w, h = img.size
    cantos = cantos_de(img)
    n_transp_cantos = sum(1 for c in cantos if c[3] < 128)
    hist = img.getchannel("A").histogram()
    fundo = cor_do_fundo(cantos)
    uniforme = fundo is not None and all(dif_max(c, fundo) <= tolerancia for c in cantos)
    if n_transp_cantos == 4:
        recomendacao = "ja-transparente"
    elif n_transp_cantos > 0:
        recomendacao = "fundo-misto"
    elif uniforme:
        recomendacao = "tirar-fundo"
    else:
        recomendacao = "fundo-nao-uniforme"
    return {
        **info,
        "tem_transparencia": sum(hist[:255]) > 0,
        "transparente_pct": round(100 * sum(hist[:128]) / (w * h), 1),
        "cantos": ["transparente" if c[3] < 128 else hex_de(c) for c in cantos],
        "fundo": hex_de(fundo) if uniforme and fundo else None,
        "fundo_uniforme": bool(uniforme),
        "recomendacao": recomendacao,
    }


def cores_dominantes(img, n: int, modulos) -> list[dict]:
    """Cores mais presentes (agrupadas em faixas de 16 níveis), sem o fundo liso e sem o transparente."""
    Image = modulos[0]
    pequeno = img.copy()
    pequeno.thumbnail((256, 256), Image.BOX)
    cantos = cantos_de(pequeno)
    fundo = cor_do_fundo(cantos)
    if fundo is not None and any(dif_max(c, fundo) > TOLERANCIA_PADRAO for c in cantos):
        fundo = None  # cantos de cores diferentes: não há fundo liso para descontar, nada é descartado
    bruto = pequeno.tobytes()
    baldes: dict[tuple[int, int, int], list[int]] = {}
    total = 0
    for i in range(0, len(bruto), 4):
        r, g, b, a = bruto[i], bruto[i + 1], bruto[i + 2], bruto[i + 3]
        if a < 200 or (fundo is not None and dif_max((r, g, b), fundo) <= 24):
            continue
        total += 1
        soma = baldes.setdefault((r >> 4, g >> 4, b >> 4), [0, 0, 0, 0])
        soma[0] += 1
        soma[1] += r
        soma[2] += g
        soma[3] += b
    if total == 0:
        return []
    candidatos = sorted(((s[0], (s[1] // s[0], s[2] // s[0], s[3] // s[0])) for s in baldes.values()), reverse=True)
    escolhidas: list[list] = []
    for qtd, cor in candidatos:  # junta faixas vizinhas: cor perto de uma já escolhida soma nela
        dono = next((e for e in escolhidas if dif_max(e[1], cor) <= 40), None)
        if dono:
            dono[0] += qtd
        else:
            escolhidas.append([qtd, cor])
    escolhidas.sort(reverse=True)
    return [{"hex": hex_de(cor), "percentual": round(100 * qtd / total, 1)}
            for qtd, cor in escolhidas[:n] if 100 * qtd / total >= 1]


# ---------------------------------------------------------------- tirar o fundo

def _mascara_do_fundo(img, ref, tolerancia: int, modulos) -> bytes:
    """Bytes 0/1 por pixel: 1 = parece fundo (diferença <= tolerância em todos os canais)."""
    Image, ImageChops, _, _, _ = modulos
    rgb = img.convert("RGB")
    dif = ImageChops.difference(rgb, Image.new("RGB", rgb.size, ref))
    r, g, b = dif.split()
    maximo = ImageChops.lighter(ImageChops.lighter(r, g), b)
    return maximo.point(lambda v: 1 if v <= tolerancia else 0).tobytes()


def _preencher_dos_cantos(mascara: bytes, w: int, h: int) -> bytearray:
    """Marca 2 em todo pixel de fundo ligado a um canto (quatro vizinhos). Devolve a máscara com borda."""
    pw = w + 2
    m = bytearray(pw * (h + 2))  # borda de zeros: a busca para sozinha na beira da imagem
    for y in range(h):
        m[(y + 1) * pw + 1:(y + 1) * pw + 1 + w] = mascara[y * w:(y + 1) * w]
    pilha = []
    for x, y in ((1, 1), (w, 1), (1, h), (w, h)):
        i = y * pw + x
        if m[i] == 1:
            m[i] = 2
            pilha.append(i)
    while pilha:
        i = pilha.pop()
        for j in (i - 1, i + 1, i - pw, i + pw):
            if m[j] == 1:
                m[j] = 2
                pilha.append(j)
    return m


def tirar_fundo(img, tolerancia: int, miolos: bool, suavizar: bool, recortar: bool, modulos):
    Image, ImageChops, _, _, _ = modulos
    w, h = img.size
    cantos = cantos_de(img)
    n_transp = sum(1 for c in cantos if c[3] < 128)
    if n_transp not in (0, 4):
        raise Recusa("os cantos misturam transparência e cor; mande uma versão com o fundo todo liso ou todo transparente.")
    if n_transp == 4:
        saida, rel = img.copy(), {"acao": "ja-transparente"}
    else:
        ref = cor_do_fundo(cantos)
        desvio = max(dif_max(c, ref) for c in cantos)
        if desvio > tolerancia:
            raise Recusa(f"o fundo não é uma cor só (os 4 cantos diferem em até {desvio} de 255 num canal; a tolerância "
                         f"é {tolerancia}). Degradê, foto ou sombra: este tratamento estragaria o desenho. Peça ao dono "
                         "uma versão com fundo liso ou o arquivo original de quem desenhou o logo.")
        m = _preencher_dos_cantos(_mascara_do_fundo(img, ref, tolerancia, modulos), w, h)
        pw = w + 2
        plano = bytearray()
        for y in range(h):
            plano += m[(y + 1) * pw + 1:(y + 1) * pw + 1 + w]
        # valor da máscara -> alfa: 0 (desenho) fica; 1 (fundo fechado) só sai com --miolos; 2 (fundo ligado ao canto) sai
        tabela = bytes([255, 0 if miolos else 255, 0] + [255] * 253)
        mantido = Image.frombytes("L", (w, h), bytes(plano).translate(tabela))
        saida = img.copy()
        saida.putalpha(ImageChops.darker(img.getchannel("A"), mantido))
        aneis = _suavizar_borda(img, saida, ref, mantido, modulos) if suavizar else 0
        rel = {"acao": "fundo-removido", "tolerancia": tolerancia, "fundo": hex_de(ref),
               "fundo_removido_pct": round(100 * (plano.count(2) + (plano.count(1) if miolos else 0)) / (w * h), 1),
               "borda_suavizada_pixels": aneis,
               "miolos_que_ficaram_pct": round(100 * (0 if miolos else plano.count(1)) / (w * h), 2)}
    caixa = caixa_do_conteudo(saida)
    if caixa is None:
        raise Recusa("a tolerância apagou o logo inteiro (o desenho tem cor parecida com a do fundo). "
                     "Use --tolerancia menor ou peça uma versão com fundo de outra cor.")
    rel["tamanho_antes"] = [w, h]
    if recortar:
        folga = round(max(caixa[2] - caixa[0], caixa[3] - caixa[1]) * 0.03)
        saida = saida.crop((max(0, caixa[0] - folga), max(0, caixa[1] - folga),
                            min(w, caixa[2] + folga), min(h, caixa[3] + folga)))
    rel["tamanho_depois"] = list(saida.size)
    hist = saida.getchannel("A").histogram()
    rel["transparente_pct"] = round(100 * sum(hist[:128]) / (saida.size[0] * saida.size[1]), 1)
    return saida, rel


def _suavizar_borda(origem, saida, ref, mantido, modulos) -> int:
    """Nos 2 pixels em volta do fundo tirado, estima quanto de logo e quanto de fundo há em cada pixel
    (projeção da cor entre a cor do fundo e a cor sólida mais próxima) e grava a cor sólida com alfa parcial.
    Sem isso, o contorno claro do fundo branco vira um halo quando o logo vai sobre fundo escuro."""
    Image, ImageChops, ImageFilter, _, _ = modulos
    w, h = origem.size
    tirado = mantido.point(lambda v: 255 if v == 0 else 0)
    anel = ImageChops.darker(tirado.filter(ImageFilter.MaxFilter(5)), mantido).tobytes()  # desenho a até 2 px do fundo
    rgb = origem.convert("RGB").tobytes()
    plano = mantido.tobytes()
    px = saida.load()
    tocados = 0
    for i, dentro in enumerate(anel):
        if not dentro:
            continue
        x, y = i % w, i // w
        solida, dist = None, -1
        for ny in range(max(0, y - 2), min(h, y + 3)):
            for nx in range(max(0, x - 2), min(w, x + 3)):
                j = ny * w + nx
                if plano[j] == 0:  # fundo tirado não serve de referência
                    continue
                cor = (rgb[3 * j], rgb[3 * j + 1], rgb[3 * j + 2])
                d = dif_max(cor, ref)
                if d > dist:
                    solida, dist = cor, d
        if solida is None:
            continue
        p = (rgb[3 * i], rgb[3 * i + 1], rgb[3 * i + 2])
        eixo = [solida[c] - ref[c] for c in range(3)]
        den = sum(t * t for t in eixo)
        if den == 0:
            continue
        t = sum((p[c] - ref[c]) * eixo[c] for c in range(3)) / den
        t = 0.0 if t < 0 else 1.0 if t > 1 else t
        if t >= 0.97:
            continue  # já é praticamente sólido: não mexe
        px[x, y] = (solida[0], solida[1], solida[2], min(px[x, y][3], round(255 * t)))
        tocados += 1
    return tocados


# ---------------------------------------------------------------- ícone, variante e svg

def caixa_do_conteudo(img):
    return img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()


def fazer_icone(img, lado: int, margem_pct: float, recorte: str | None, modulos):
    Image = modulos[0]
    w, h = img.size
    if recorte:
        try:
            x0, y0, x1, y1 = (int(v) for v in recorte.split(","))
        except ValueError:
            raise Uso("--recorte precisa ser X0,Y0,X1,Y1 em pixels (números inteiros)") from None
        if not (0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h):
            raise Uso(f"--recorte fora da imagem (ela tem {w}x{h} pixels)")
        caixa = (x0, y0, x1, y1)
    else:
        caixa = caixa_do_conteudo(img)
        if caixa is None:
            raise Recusa("a imagem não tem nada visível (tudo transparente).")
    miolo = img.crop(caixa)
    cw, ch = miolo.size
    folga = round(max(cw, ch) * margem_pct / 100)
    tela = max(cw, ch) + 2 * folga
    quadro = Image.new("RGBA", (tela, tela), (0, 0, 0, 0))
    quadro.paste(miolo, ((tela - cw) // 2, (tela - ch) // 2))  # canvas transparente: cola o pixel como ele é
    return quadro.resize((lado, lado), Image.LANCZOS), {
        "acao": "icone", "lado": lado, "margem_pct": margem_pct, "recorte": list(caixa),
        "usou_logo_inteiro": recorte is None, "ampliado": lado > tela}


def fazer_variante(img, modo: str, modulos):
    Image, _, _, ImageOps, ImageStat = modulos
    alfa = img.getchannel("A")
    if alfa.getextrema()[0] == 255:
        raise Recusa("a imagem não tem transparência: tire o fundo antes (logo.py tirar-fundo).")
    rgb = img.convert("RGB")
    if modo == "inversao":
        novo = ImageOps.invert(rgb)
    elif modo == "branca":
        novo = Image.new("RGB", img.size, (255, 255, 255))
    else:
        novo = Image.new("RGB", img.size, (0, 0, 0))
    saida = novo.convert("RGBA")
    saida.putalpha(alfa)
    luz = ImageStat.Stat(saida.convert("L"), mask=alfa).mean[0]
    indicada = "fundo escuro" if luz >= 140 else "fundo claro" if luz <= 110 else "fundo médio (olhe antes de usar)"
    return saida, {"acao": "variante", "modo": modo, "luminosidade_0_a_255": round(luz), "indicada_para": indicada}


def svg_conteiner(png: bytes, largura: int, altura: int) -> str:
    b64 = base64.b64encode(png).decode("ascii")
    titulo = html.escape("Logo (PNG embutido, não é vetor)")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<!-- Contêiner SVG: o logo é uma imagem PNG embutida. NÃO é vetor: ampliar perde nitidez. "
        "Para um SVG vetorial de verdade, peça o arquivo original a quem desenhou o logo. -->\n"
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{largura}" height="{altura}" viewBox="0 0 {largura} {altura}">\n'
        f"  <title>{titulo}</title>\n"
        f'  <image width="{largura}" height="{altura}" xlink:href="data:image/png;base64,{b64}"/>\n'
        "</svg>\n"
    )


# ---------------------------------------------------------------- linha de comando

def _utf8() -> None:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def _mostrar(rel: dict, como_json: bool, titulo: str) -> None:
    if como_json:
        print(json.dumps(rel, ensure_ascii=False, indent=2))
        return
    print(titulo)
    for chave, valor in rel.items():
        print(f"  {chave}: {valor}")


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="logo.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for nome in ("analisar", "cores", "tirar-fundo", "icone", "variante", "svg"):
        p = sub.add_parser(nome)
        p.add_argument("arquivo")
        if nome in ("analisar", "cores"):
            p.add_argument("--json", action="store_true")
        else:
            p.add_argument("--saida", required=True)
            p.add_argument("--sobrescrever", action="store_true")
        if nome == "cores":
            p.add_argument("--n", type=int, default=6)
        if nome == "tirar-fundo":
            p.add_argument("--tolerancia", type=int, default=TOLERANCIA_PADRAO)
            p.add_argument("--miolos", action="store_true")
            p.add_argument("--sem-suavizar", action="store_true")
            p.add_argument("--sem-recortar", action="store_true")
        if nome == "icone":
            p.add_argument("--lado", type=int, default=512)
            p.add_argument("--margem", type=float, default=10.0)
            p.add_argument("--recorte")
        if nome == "variante":
            p.add_argument("--modo", choices=MODOS, default="inversao")
    return ap


def executar(a: argparse.Namespace, modulos) -> int:
    img, info = abrir(a.arquivo, modulos)
    if info["animada"]:
        print("AVISO: o arquivo é animado; uso só o primeiro quadro.", file=sys.stderr)
    if info["reduzida_de"]:
        print(f"AVISO: reduzi de {info['reduzida_de'][0]}x{info['reduzida_de'][1]} para {info['tamanho'][0]}x"
              f"{info['tamanho'][1]} pixels antes de tratar.", file=sys.stderr)
    if a.cmd == "analisar":
        _mostrar(analisar(img, info), a.json, f"ANÁLISE de {a.arquivo}")
        return 0
    if a.cmd == "cores":
        if not 1 <= a.n <= 12:
            raise Uso("--n precisa estar entre 1 e 12")
        cores = cores_dominantes(img, a.n, modulos)
        if a.json:
            print(json.dumps(cores, ensure_ascii=False, indent=2))
        else:
            print(f"CORES de {a.arquivo} (sem o fundo liso):")
            for c in cores:
                print(f"  {c['hex']}  {c['percentual']}%")
            if not cores:
                print("  nenhuma cor própria achada (a imagem é só fundo ou só transparente)")
        return 0
    if a.cmd == "svg":
        png = Path(a.arquivo).read_bytes()
        if not png.startswith(ASSINATURA_PNG):
            raise Uso("o svg-contêiner embute um PNG: passe um arquivo PNG de verdade")
        if len(png) > 4_000_000:
            raise Uso("o PNG passa de 4 MB; o SVG embutido ficaria pesado demais")
        destino = conferir_saida(a.saida, a.arquivo, a.sobrescrever, ".svg")
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(svg_conteiner(png, *(info["reduzida_de"] or info["tamanho"])), encoding="utf-8", newline="\n")
        print(f"FEITO: {a.saida} criado. ATENÇÃO: isto NÃO é vetorização, é o PNG dentro de um SVG; "
              "ampliar perde nitidez. Para vetor de verdade, peça o arquivo original a quem desenhou o logo.")
        return 0
    if a.cmd == "tirar-fundo":
        if not 0 <= a.tolerancia <= 255:
            raise Uso("--tolerancia precisa estar entre 0 e 255")
        destino = conferir_saida(a.saida, a.arquivo, a.sobrescrever, ".png")
        saida, rel = tirar_fundo(img, a.tolerancia, a.miolos, not a.sem_suavizar, not a.sem_recortar, modulos)
        salvar_png(saida, destino)
        _mostrar(rel, False, f"FEITO: {a.saida}")
        if rel.get("miolos_que_ficaram_pct", 0) >= 0.5:
            print("AVISO: ficaram áreas fechadas da cor do fundo dentro do desenho (miolo de letras, por exemplo). "
                  "Olhe o resultado; se estiver errado, repita com --miolos.")
        return 0
    if a.cmd == "icone":
        if not 16 <= a.lado <= 2048:
            raise Uso("--lado precisa estar entre 16 e 2048")
        if not 0 <= a.margem <= 40:
            raise Uso("--margem precisa estar entre 0 e 40 (em %)")
        destino = conferir_saida(a.saida, a.arquivo, a.sobrescrever, ".png")
        saida, rel = fazer_icone(img, a.lado, a.margem, a.recorte, modulos)
        salvar_png(saida, destino)
        _mostrar(rel, False, f"FEITO: {a.saida}")
        if rel["usou_logo_inteiro"]:
            print("AVISO: o ícone é o logo inteiro. Se o logo tem um símbolo separado do nome, olhe a imagem e "
                  "repita com --recorte X0,Y0,X1,Y1 do símbolo.")
        if rel["ampliado"]:
            print("AVISO: o logo original é menor que o ícone pedido; ampliei e perdeu nitidez. Peça uma imagem maior.")
        return 0
    destino = conferir_saida(a.saida, a.arquivo, a.sobrescrever, ".png")
    saida, rel = fazer_variante(img, a.modo, modulos)
    salvar_png(saida, destino)
    _mostrar(rel, False, f"FEITO: {a.saida}")
    if a.modo == "inversao":
        print("AVISO: inversão troca as cores da marca. Mostre ao dono; se não ficar bom, use --modo branca ou preta.")
    return 0


def main(argv: list[str] | None = None) -> int:
    _utf8()
    try:
        a = parser().parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    modulos = pil()
    if modulos is None:
        print(mensagem_sem_pillow())
        return 2
    try:
        return executar(a, modulos)
    except Recusa as erro:
        print(f"RECUSEI: {erro} Nada foi escrito.", file=sys.stderr)
        return 1
    except Uso as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 2
    except OSError as erro:
        print(f"ERRO: falha ao ler ou gravar arquivo ({type(erro).__name__}).", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
