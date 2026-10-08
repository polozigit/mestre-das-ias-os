#!/usr/bin/env python3
"""Registra uma transcrição codificada como fonte estruturada da Empresa IA."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


EXTENSOES_ACEITAS = {".txt", ".md", ".docx", ".pdf"}
FORMATO_DATA = "%Y-%m-%d_%H%M%S"
PALAVRAS_NUMERO = {
    "zero": 0,
    "um": 1,
    "uma": 1,
    "dois": 2,
    "duas": 2,
    "tres": 3,
    "quatro": 4,
    "cinco": 5,
    "seis": 6,
    "sete": 7,
    "oito": 8,
    "nove": 9,
    "dez": 10,
    "onze": 11,
    "doze": 12,
    "treze": 13,
    "catorze": 14,
    "quatorze": 14,
    "quinze": 15,
    "dezesseis": 16,
}
NAMESPACE_WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class ErroRegistro(Exception):
    """Erro esperado, apresentado sem traceback ao usuário."""


@dataclass(frozen=True)
class Marcador:
    codigo: str | None
    inicio: int
    fim: int
    linha: int
    bruto: str


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Organiza uma transcrição por códigos do dossiê Empresa IA."
    )
    parser.add_argument("--destino", help="Pasta Empresa IA já aberta.")
    parser.add_argument("--arquivo", help="Transcrição .txt, .md, .docx ou .pdf.")
    parser.add_argument(
        "--respostas",
        help=(
            "JSON {codigo: trecho literal da transcrição} montado consultando o questionário. "
            "Usado quando a transcrição não traz Pergunta X.Y em cada resposta."
        ),
    )
    parser.add_argument(
        "--listar-perguntas",
        action="store_true",
        help="Mostra os 71 códigos e o texto de cada pergunta e sai.",
    )
    parser.add_argument(
        "--registro-em",
        help="Data-hora estável da execução no formato AAAA-MM-DD_HHMMSS.",
    )
    parser.add_argument(
        "--rotulo-origem",
        help="Rótulo da origem, útil quando o texto foi colado no chat.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Mostra a prévia sem escrever.")
    parser.add_argument(
        "--aplicar", action="store_true", help="Autoriza a escrita após confirmação humana."
    )
    parser.add_argument(
        "--confirmar-atualizacao",
        action="store_true",
        help="Autoriza arquivar e substituir o dossiê canônico existente.",
    )
    return parser.parse_args()


def remover_acentos(valor: str) -> str:
    return "".join(
        caractere
        for caractere in unicodedata.normalize("NFD", valor)
        if unicodedata.category(caractere) != "Mn"
    )


def normalizar(valor: str) -> str:
    return re.sub(r"\s+", " ", remover_acentos(valor).lower()).strip()


def validar_registro_em(valor: str | None) -> str:
    if not valor:
        return datetime.now().strftime(FORMATO_DATA)
    try:
        datetime.strptime(valor, FORMATO_DATA)
    except ValueError as erro:
        raise ErroRegistro(
            "--registro-em deve usar o formato AAAA-MM-DD_HHMMSS."
        ) from erro
    return valor


def carregar_questionario() -> dict[str, Any]:
    caminho = Path(__file__).resolve().parent.parent / "assets" / "questionario-dossie-v1.json"
    try:
        conteudo = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as erro:
        raise ErroRegistro(f"Questionário canônico inválido: {caminho}") from erro
    codigos = [
        pergunta["codigo"]
        for secao in conteudo.get("secoes", [])
        for pergunta in secao.get("perguntas", [])
    ]
    if len(codigos) != 71 or len(codigos) != len(set(codigos)):
        raise ErroRegistro("O questionário canônico deve conter exatamente 71 códigos únicos.")
    return conteudo


def validar_empresa(destino: Path) -> None:
    exigidos = [
        destino / "EMPRESA-IA.md",
        destino / "MAPA-DA-EMPRESA-IA.md",
        destino / "contexto",
        destino / "operacao",
    ]
    ausentes = [str(caminho.name) for caminho in exigidos if not caminho.exists()]
    if ausentes:
        raise ErroRegistro(
            "Esta pasta não está pronta como Empresa IA. Use primeiro Polozi Criar Empresa IA. "
            f"Ausentes: {', '.join(ausentes)}."
        )


def nome_empresa(destino: Path) -> str:
    status = destino / "operacao" / "STATUS-ATUAL.md"
    if status.exists():
        encontrado = re.search(
            r"(?mi)^\s*-\s*Empresa:\s*(.+?)\s*$", status.read_text(encoding="utf-8")
        )
        if encontrado:
            return encontrado.group(1).strip()
    protocolo = (destino / "EMPRESA-IA.md").read_text(encoding="utf-8")
    encontrado = re.search(r"(?m)^#\s+(.+?)\s+-\s+protocolo Empresa IA\s*$", protocolo)
    if encontrado:
        return encontrado.group(1).strip()
    return "Empresa IA"


def ler_docx(caminho: Path) -> str:
    try:
        with zipfile.ZipFile(caminho) as arquivo:
            xml = arquivo.read("word/document.xml")
    except (OSError, KeyError, zipfile.BadZipFile) as erro:
        raise ErroRegistro(f"DOCX inválido ou sem texto principal: {caminho.name}") from erro
    try:
        raiz = ElementTree.fromstring(xml)
    except ElementTree.ParseError as erro:
        raise ErroRegistro(f"DOCX inválido ou sem XML legível: {caminho.name}") from erro
    paragrafos = []
    for paragrafo in raiz.iter(f"{NAMESPACE_WORD}p"):
        partes = [texto.text or "" for texto in paragrafo.iter(f"{NAMESPACE_WORD}t")]
        linha = "".join(partes).strip()
        if linha:
            paragrafos.append(linha)
    return "\n".join(paragrafos)


def ler_pdf(caminho: Path) -> str:
    if not shutil.which("pdftotext"):
        raise ErroRegistro("pdftotext não está disponível para ler este PDF.")
    resultado = subprocess.run(
        ["pdftotext", "-layout", str(caminho), "-"],
        text=True,
        capture_output=True,
        check=False,
    )
    if resultado.returncode != 0:
        raise ErroRegistro(f"Não foi possível extrair o texto do PDF: {caminho.name}")
    texto = resultado.stdout.strip()
    if len(re.sub(r"\s+", "", texto)) < 20:
        raise ErroRegistro(
            "Este PDF não tem texto de transcrição extraível. Envie .txt, .md ou .docx."
        )
    return texto


def ler_transcricao(caminho: Path) -> tuple[str, str]:
    if not caminho.exists() or not caminho.is_file():
        raise ErroRegistro(f"Arquivo de transcrição não encontrado: {caminho}")
    extensao = caminho.suffix.lower()
    if extensao not in EXTENSOES_ACEITAS:
        raise ErroRegistro("Formato não aceito. Use .txt, .md, .docx ou .pdf pesquisável.")
    try:
        if extensao in {".txt", ".md"}:
            texto = caminho.read_text(encoding="utf-8-sig")
        elif extensao == ".docx":
            texto = ler_docx(caminho)
        else:
            texto = ler_pdf(caminho)
    except UnicodeDecodeError as erro:
        raise ErroRegistro("A transcrição de texto deve usar UTF-8.") from erro
    if not texto.strip():
        raise ErroRegistro("A transcrição está vazia.")
    return texto.replace("\r\n", "\n").replace("\r", "\n"), extensao


def valor_numero(valor: str) -> int | None:
    valor = normalizar(valor)
    if valor.isdigit():
        return int(valor)
    return PALAVRAS_NUMERO.get(valor)


def codigo_de_restante(restante: str) -> tuple[str | None, int]:
    numerico = re.match(
        r"\s*(?P<secao>\d{1,2})\s*(?:[.,]|\b(?:ponto|virgula)\b)\s*(?P<item>\d{1,2})(?:\s*[.:-])?",
        restante,
        flags=re.IGNORECASE,
    )
    if numerico:
        return f"{numerico.group('secao')}.{numerico.group('item')}", numerico.end()
    por_extenso = re.match(
        r"\s*(?P<secao>[A-Za-zÀ-ÿ]+)\s+(?:ponto|virgula)\s+(?P<item>[A-Za-zÀ-ÿ]+)(?:\s*[.:-])?",
        restante,
        flags=re.IGNORECASE,
    )
    if por_extenso:
        secao = valor_numero(por_extenso.group("secao"))
        item = valor_numero(por_extenso.group("item"))
        if secao is not None and item is not None:
            return f"{secao}.{item}", por_extenso.end()
    return None, 0


def linha_do_offset(texto: str, offset: int) -> int:
    return texto.count("\n", 0, offset) + 1


def localizar_marcadores(texto: str) -> list[Marcador]:
    marcadores: list[Marcador] = []
    for encontrado in re.finditer(r"(?im)^\s*pergunta\b(?P<restante>[^\n]*)", texto):
        restante = encontrado.group("restante")
        codigo, tamanho = codigo_de_restante(restante)
        inicio_restante = encontrado.start("restante")
        fim = inicio_restante + tamanho if tamanho else encontrado.end()
        marcadores.append(
            Marcador(
                codigo=codigo,
                inicio=encontrado.start(),
                fim=fim,
                linha=linha_do_offset(texto, encontrado.start()),
                bruto=encontrado.group(0).strip(),
            )
        )
    return marcadores


def padrao_trecho(trecho: str) -> re.Pattern[str]:
    # Literal, palavra por palavra; só o espaço entre palavras pode variar
    # (quebra de linha, espaço duplo). Paráfrase ou resumo não casa.
    return re.compile(r"\s+".join(re.escape(palavra) for palavra in trecho.split()))


def carregar_respostas(caminho: Path, esperados: set[str]) -> dict[str, list[str]]:
    try:
        bruto = json.loads(caminho.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as erro:
        raise ErroRegistro(f"Arquivo de respostas inválido: {caminho.name}") from erro
    if isinstance(bruto, dict) and isinstance(bruto.get("respostas"), dict):
        bruto = bruto["respostas"]
    if not isinstance(bruto, dict):
        raise ErroRegistro('O arquivo de respostas deve ser um objeto {"1.1": "trecho", ...}.')
    desconhecidos = sorted(codigo for codigo in bruto if codigo not in esperados)
    if desconhecidos:
        raise ErroRegistro(
            "Código fora do questionário no arquivo de respostas: "
            f"{', '.join(desconhecidos)}. Use só os códigos de --listar-perguntas."
        )
    respostas: dict[str, list[str]] = {}
    for codigo, valor in bruto.items():
        trechos = valor if isinstance(valor, list) else [valor]
        if not all(isinstance(trecho, str) for trecho in trechos):
            raise ErroRegistro(f"Resposta de {codigo} deve ser texto ou lista de textos.")
        trechos = [trecho.strip() for trecho in trechos if trecho and trecho.strip()]
        if trechos:
            respostas[codigo] = trechos
    return respostas


def analisar_respostas(
    texto: str, questionario: dict[str, Any], respostas: dict[str, list[str]]
) -> dict[str, Any]:
    fora_do_texto = []
    itens: dict[str, dict[str, Any]] = {}
    cobertos: list[tuple[int, int]] = []
    for secao in questionario["secoes"]:
        for pergunta in secao["perguntas"]:
            codigo = pergunta["codigo"]
            trechos = respostas.get(codigo, [])
            if not trechos:
                itens[codigo] = {"estado": "ausente", "ocorrencias": []}
                continue
            partes = []
            linhas = []
            for trecho in trechos:
                encontrado = padrao_trecho(trecho).search(texto)
                if not encontrado:
                    fora_do_texto.append(codigo)
                    break
                partes.append(encontrado.group(0))
                cobertos.append((encontrado.start(), encontrado.end()))
                linhas.extend(
                    [linha_do_offset(texto, encontrado.start()), linha_do_offset(texto, encontrado.end())]
                )
            resposta = "\n\n".join(partes)
            estado = "não sei" if normalizar(resposta).startswith("nao sei") else "respondida"
            itens[codigo] = {
                "estado": estado,
                "ocorrencias": [
                    {
                        "resposta": resposta,
                        "linhas": [min(linhas or [0]), max(linhas or [0])],
                        "origem": "associada pela IA",
                    }
                ],
            }
    if fora_do_texto:
        raise ErroRegistro(
            "Trecho que não está na transcrição, palavra por palavra, em: "
            f"{', '.join(sorted(set(fora_do_texto), key=chave_codigo))}. "
            "Copie o trecho exato da fala; nunca resuma nem complete."
        )
    caracteres = len(re.sub(r"\s+", "", texto)) or 1
    marcados = [False] * len(texto)
    for inicio, fim in cobertos:
        for indice in range(inicio, fim):
            marcados[indice] = True
    cobertos_sem_espaco = sum(
        1 for indice, caractere in enumerate(texto) if marcados[indice] and not caractere.isspace()
    )
    return {
        "itens": itens,
        "invalidos": [],
        "ambiguos": [],
        "nao_classificados": [],
        "marcadores_validos": sum(1 for item in itens.values() if item["ocorrencias"]),
        "modo": "respostas",
        "cobertura": round(100 * cobertos_sem_espaco / caracteres),
    }


def limpar_resposta(valor: str) -> str:
    valor = valor.strip(" \t\n:-")
    valor = re.sub(r"(?im)^\s*(?:resposta\s*:?\s*)", "", valor)
    return valor.strip()


def analisar(texto: str, questionario: dict[str, Any]) -> dict[str, Any]:
    esperados = {
        pergunta["codigo"]
        for secao in questionario["secoes"]
        for pergunta in secao["perguntas"]
    }
    marcadores = localizar_marcadores(texto)
    ocorrencias: dict[str, list[dict[str, Any]]] = {codigo: [] for codigo in esperados}
    invalidos: list[dict[str, Any]] = []
    ambiguos: list[dict[str, Any]] = []
    nao_classificados: list[dict[str, Any]] = []

    if marcadores and texto[: marcadores[0].inicio].strip():
        nao_classificados.append(
            {
                "linhas": [1, linha_do_offset(texto, marcadores[0].inicio)],
                "motivo": "trecho antes da primeira pergunta",
            }
        )

    for indice, marcador in enumerate(marcadores):
        proximo_inicio = (
            marcadores[indice + 1].inicio if indice + 1 < len(marcadores) else len(texto)
        )
        resposta = limpar_resposta(texto[marcador.fim : proximo_inicio])
        fim_linha = linha_do_offset(texto, proximo_inicio)
        if indice + 1 < len(marcadores):
            fim_linha -= 1
        if marcador.codigo is None:
            ambiguos.append({"linha": marcador.linha, "marcador": marcador.bruto})
            if resposta:
                nao_classificados.append(
                    {
                        "linhas": [marcador.linha, fim_linha],
                        "motivo": "marcador de pergunta ambíguo",
                    }
                )
            continue
        if marcador.codigo not in esperados:
            invalidos.append(
                {"codigo": marcador.codigo, "linha": marcador.linha, "marcador": marcador.bruto}
            )
            if resposta:
                nao_classificados.append(
                    {
                        "linhas": [marcador.linha, fim_linha],
                        "motivo": f"código inválido {marcador.codigo}",
                    }
                )
            continue
        ocorrencias[marcador.codigo].append(
            {
                "resposta": resposta,
                "linhas": [marcador.linha, fim_linha],
            }
        )

    itens: dict[str, dict[str, Any]] = {}
    for codigo, lista in ocorrencias.items():
        if not lista:
            estado = "ausente"
        elif len(lista) > 1:
            estado = "duplicada"
        elif not lista[0]["resposta"]:
            estado = "ausente"
        elif normalizar(lista[0]["resposta"]).startswith("nao sei"):
            estado = "não sei"
        else:
            estado = "respondida"
        itens[codigo] = {"estado": estado, "ocorrencias": lista}

    return {
        "itens": itens,
        "invalidos": invalidos,
        "ambiguos": ambiguos,
        "nao_classificados": nao_classificados,
        "marcadores_validos": sum(len(lista) for lista in ocorrencias.values()),
    }


def nome_seguro(valor: str) -> str:
    convertido = remover_acentos(valor).lower()
    convertido = re.sub(r"[^a-z0-9]+", "-", convertido).strip("-")
    return convertido[:60] or "transcricao"


def caminho_unico(caminho: Path) -> Path:
    if not caminho.exists():
        return caminho
    for numero in range(2, 1000):
        candidato = caminho.with_name(f"{caminho.stem}-{numero:02d}{caminho.suffix}")
        if not candidato.exists():
            return candidato
    raise ErroRegistro(f"Não foi possível definir um nome seguro para {caminho.name}.")


def caminhos_destino(
    destino: Path, arquivo: Path, registro_em: str, extensao: str, rotulo_origem: str | None
) -> dict[str, Path]:
    raiz = destino / "contexto" / "dossie"
    base = f"{registro_em}-{nome_seguro(rotulo_origem or arquivo.stem)}"
    resultado = {
        "leia_me": raiz / "LEIA-ME.md",
        "fonte": caminho_unico(raiz / "fontes" / f"{base}-transcricao-original{extensao}"),
        "relatorio": caminho_unico(raiz / "relatorios" / f"{base}-relatorio-de-extracao.md"),
        "dossie": raiz / "dossie-completo.md",
        "arquivo_antigo": caminho_unico(raiz / "historico" / f"{registro_em}-dossie-completo.md"),
    }
    if extensao in {".docx", ".pdf"}:
        resultado["texto_extraido"] = caminho_unico(
            raiz / "fontes" / f"{base}-transcricao-extraida.md"
        )
    return resultado


def sha256(caminho: Path) -> str:
    digest = hashlib.sha256()
    with caminho.open("rb") as arquivo:
        for bloco in iter(lambda: arquivo.read(65536), b""):
            digest.update(bloco)
    return digest.hexdigest()


def contagem_estados(analise: dict[str, Any]) -> dict[str, int]:
    resultado = {estado: 0 for estado in ("respondida", "não sei", "ausente", "duplicada")}
    for item in analise["itens"].values():
        resultado[item["estado"]] += 1
    resultado["ambígua"] = len(analise["ambiguos"])
    return resultado


def mostrar_previa(
    destino: Path,
    empresa: str,
    arquivo: Path,
    extensao: str,
    analise: dict[str, Any],
    caminhos: dict[str, Path],
) -> None:
    contagem = contagem_estados(analise)
    print("PRÉVIA DOSSIE EMPRESA IA")
    print(f"Empresa: {empresa}")
    print(f"Destino: {destino}")
    print(f"Fonte: {arquivo.name} ({extensao})")
    if analise.get("modo") == "respostas":
        print("Encaixe: associado pela IA (arquivo de respostas), revisar")
        print(f"Transcrição coberta pelos trechos: {analise['cobertura']}%")
    print(f"Marcadores válidos: {analise['marcadores_validos']}")
    print(f"Respondidas: {contagem['respondida']}")
    print(f"Não sei: {contagem['não sei']}")
    print(f"Ausentes: {contagem['ausente']}")
    print(f"Duplicadas: {contagem['duplicada']}")
    print(f"Ambíguas: {contagem['ambígua']}")
    print(f"Códigos inválidos: {len(analise['invalidos'])}")
    print(f"Trechos não classificados: {len(analise['nao_classificados'])}")
    print("Arquivos previstos:")
    for chave in ("leia_me", "fonte", "texto_extraido", "relatorio", "dossie"):
        if chave in caminhos:
            print(f"  + {caminhos[chave]}")
    ausentes = [codigo for codigo, item in analise["itens"].items() if item["estado"] == "ausente"]
    print("Sem resposta: " + (", ".join(sorted(ausentes, key=chave_codigo)) or "nenhuma"))
    if caminhos["dossie"].exists():
        print(f"Arquivo a arquivar antes da atualização: {caminhos['arquivo_antigo']}")


def bloco_citacao(texto: str) -> list[str]:
    if not texto:
        return ["> Nenhuma resposta identificada."]
    return ["> " + linha if linha else ">" for linha in texto.splitlines()]


def renderizar_dossie(
    empresa: str,
    arquivo: Path,
    registro_em: str,
    questionario: dict[str, Any],
    analise: dict[str, Any],
) -> str:
    linhas = [
        f"# Dossiê da Empresa - {empresa}",
        "",
        "- Estado global: fonte",
        f"- Questionário: versão {questionario['versao']}",
        f"- Registro: {registro_em}",
        f"- Fonte original: {arquivo.name}",
        "- Regra: este documento preserva transcrições; não representa fatos aprovados.",
        "",
    ]
    for secao in questionario["secoes"]:
        linhas.extend([f"## {secao['codigo']}. {secao['titulo']}", ""])
        for pergunta in secao["perguntas"]:
            item = analise["itens"][pergunta["codigo"]]
            linhas.extend(
                [
                    f"### {pergunta['codigo']} - {pergunta['texto']}",
                    "",
                    f"- Estado de extração: {item['estado']}",
                ]
            )
            if item["ocorrencias"]:
                for indice, ocorrencia in enumerate(item["ocorrencias"], start=1):
                    if len(item["ocorrencias"]) > 1:
                        linhas.extend([f"#### Ocorrência {indice}", ""])
                    inicio, fim = ocorrencia["linhas"]
                    linhas.append(f"- Fonte: linhas {inicio}-{fim}")
                    if ocorrencia.get("origem"):
                        linhas.append(f"- Encaixe: {ocorrencia['origem']} (revisar)")
                    linhas.extend(["", "Resposta transcrita:"])
                    linhas.extend(bloco_citacao(ocorrencia["resposta"]))
                    linhas.append("")
            else:
                linhas.extend(["- Fonte: não identificada", "", "Resposta transcrita:", "> Nenhuma resposta identificada.", ""])
    return "\n".join(linhas).rstrip() + "\n"


def renderizar_relatorio(
    empresa: str,
    arquivo: Path,
    registro_em: str,
    analise: dict[str, Any],
) -> str:
    contagem = contagem_estados(analise)
    linhas = [
        f"# Relatório de extração do dossiê - {empresa}",
        "",
        f"- Registro: {registro_em}",
        f"- Fonte: {arquivo.name}",
        *(
            [
                "- Encaixe: associado pela IA (arquivo de respostas), revisar",
                f"- Transcrição coberta pelos trechos: {analise['cobertura']}%",
            ]
            if analise.get("modo") == "respostas"
            else []
        ),
        f"- Marcadores válidos: {analise['marcadores_validos']}",
        f"- Respondidas: {contagem['respondida']}",
        f"- Não sei: {contagem['não sei']}",
        f"- Ausentes: {contagem['ausente']}",
        f"- Duplicadas: {contagem['duplicada']}",
        f"- Ambíguas: {contagem['ambígua']}",
        "",
        "## Revisão necessária",
        "",
    ]
    ausentes = [codigo for codigo, item in analise["itens"].items() if item["estado"] == "ausente"]
    linhas.append("- Perguntas sem resposta (ausentes): " + (", ".join(sorted(ausentes, key=chave_codigo)) or "nenhum"))
    duplicadas = [codigo for codigo, item in analise["itens"].items() if item["estado"] == "duplicada"]
    linhas.append("- Códigos duplicados: " + (", ".join(sorted(duplicadas, key=chave_codigo)) or "nenhum"))
    if analise["invalidos"]:
        linhas.extend(["", "### Códigos inválidos", ""])
        linhas.extend(
            f"- Linha {item['linha']}: {item['codigo']} ({item['marcador']})"
            for item in analise["invalidos"]
        )
    if analise["ambiguos"]:
        linhas.extend(["", "### Marcadores ambíguos", ""])
        linhas.extend(
            f"- Linha {item['linha']}: {item['marcador']}" for item in analise["ambiguos"]
        )
    if analise["nao_classificados"]:
        linhas.extend(["", "### Trechos não classificados", ""])
        linhas.extend(
            f"- Linhas {item['linhas'][0]}-{item['linhas'][1]}: {item['motivo']}"
            for item in analise["nao_classificados"]
        )
    return "\n".join(linhas).rstrip() + "\n"


def chave_codigo(codigo: str) -> tuple[int, int]:
    secao, item = codigo.split(".")
    return int(secao), int(item)


def atualizar_mapa(destino: Path) -> None:
    atualizar_mapa_markdown(destino)
    atualizar_mapa_json(destino)


def atualizar_mapa_markdown(destino: Path) -> None:
    caminho = destino / "MAPA-DA-EMPRESA-IA.md"
    texto = caminho.read_text(encoding="utf-8")
    # Linha: | contexto.dossie | `caminho` | o que tem | ESTADO | quem cria |
    padrao = re.compile(
        r"(?m)^(\|\s*contexto\.dossie\s*\|\s*`[^`]+`\s*\|\s*[^|]+\|\s*)([^|]+)(\|.*)$"
    )
    atualizado, quantidade = padrao.subn(r"\1fonte \3", texto, count=1)
    if quantidade != 1:
        raise ErroRegistro("Não foi possível atualizar o papel contexto.dossie no Mapa.")
    caminho.write_text(atualizado, encoding="utf-8", newline="\n")


def atualizar_mapa_json(destino: Path) -> None:
    # operacao/mapa.json é a fonte de onde a tabela do Mapa é gerada; mantê-lo
    # em dia evita que os dois driftem. Arquivo é opcional (empresas antigas
    # podem não tê-lo ainda), então não falha se estiver ausente.
    caminho = destino / "operacao" / "mapa.json"
    if not caminho.exists():
        return
    texto = caminho.read_text(encoding="utf-8")
    padrao = re.compile(r'("papel":\s*"contexto\.dossie".*?"estado":\s*")[^"]*(")')
    atualizado, quantidade = padrao.subn(r"\1fonte\2", texto, count=1)
    if quantidade != 1:
        raise ErroRegistro(
            "Não foi possível atualizar contexto.dossie em operacao/mapa.json."
        )
    caminho.write_text(atualizado, encoding="utf-8", newline="\n")


def substituir_bullet(texto: str, rotulo: str, valor: str) -> str:
    padrao = re.compile(rf"(?m)^-\s*{re.escape(rotulo)}\s*.*$")
    novo = f"- {rotulo} {valor}"
    if padrao.search(texto):
        return padrao.sub(novo, texto, count=1)
    return texto.rstrip() + "\n" + novo + "\n"


def proximo_id_pendencia(texto: str) -> str:
    ids = [int(encontrado.group(1)) for encontrado in re.finditer(r"(?m)^\|\s*(\d+)\s*\|", texto)]
    return str(max(ids, default=0) + 1)


def atualizar_pendencias(caminho: Path, registro_em: str) -> None:
    # PENDENCIAS.md é uma tabela: | id | pendência | origem | prioridade | estado | registrada em |
    texto = caminho.read_text(encoding="utf-8")
    descricao = "Revisar o dossiê, corrigir lacunas e validar documentos derivados."
    if descricao in texto:
        return
    linha = (
        f"| {proximo_id_pendencia(texto)} | {descricao} | sobra-de-task | media | "
        f"aberta | {registro_em[:10]} |"
    )
    caminho.write_text(texto.rstrip("\n") + "\n" + linha + "\n", encoding="utf-8", newline="\n")


def atualizar_operacao(destino: Path, registro_em: str) -> None:
    operacao = destino / "operacao"
    status = operacao / "STATUS-ATUAL.md"
    texto_status = status.read_text(encoding="utf-8")
    texto_status = substituir_bullet(texto_status, "Estado:", "dossiê registrado como fonte")
    texto_status = substituir_bullet(texto_status, "Atualizado em:", registro_em[:10])
    texto_status = substituir_bullet(texto_status, "Último trabalho:", "registro do dossiê empresarial")
    texto_status = substituir_bullet(
        texto_status, "Próximo marco:", "revisar lacunas e validar documentos derivados"
    )
    status.write_text(texto_status, encoding="utf-8", newline="\n")

    changelog = operacao / "CHANGELOG.md"
    texto_changelog = changelog.read_text(encoding="utf-8").rstrip()
    evento = f"- {registro_em[:10]}: dossiê empresarial registrado como fonte."
    if evento not in texto_changelog:
        texto_changelog += "\n\n" + evento
    changelog.write_text(texto_changelog + "\n", encoding="utf-8", newline="\n")

    atualizar_pendencias(operacao / "PENDENCIAS.md", registro_em)

    proxima = operacao / "PROXIMA-SESSAO.md"
    texto_proxima = proxima.read_text(encoding="utf-8")
    antigo = "Retomar a instalação a partir de `operacao/INSTALACAO.md` — a próxima etapa pendente aponta o que fazer."
    novo = "Revisar códigos ausentes, duplicados ou ambíguos do dossiê e validar quais documentos empresariais podem ser derivados."
    texto_proxima = texto_proxima.replace(antigo, novo).replace(
        "Instalar e chamar a futura Skill `polozi-registrar-dossie-empresa`.",
        "Revisar o dossiê registrado e usar uma futura Skill específica somente após validação humana.",
    ).replace(
        "Chamar a Skill `Polozi Registrar Dossiê da Empresa` com a transcrição pronta.",
        "Revisar o dossiê registrado e usar uma futura Skill específica somente após validação humana.",
    ).replace(
        "Transcrição fornecida pelo usuário, preservando perguntas e respostas.",
        "Dossiê registrado, relatório de extração e pendências de revisão.",
    ).replace(
        "Dossiê salvo como fonte, índice criado, Mapa atualizado e nenhum documento empresarial derivado sem validação.",
        "Lacunas resolvidas, fonte revisada e nenhum documento empresarial derivado sem validação.",
    )
    proxima.write_text(texto_proxima, encoding="utf-8", newline="\n")


def aplicar(
    destino: Path,
    arquivo: Path,
    texto: str,
    extensao: str,
    empresa: str,
    registro_em: str,
    questionario: dict[str, Any],
    analise: dict[str, Any],
    caminhos: dict[str, Path],
) -> None:
    raiz = destino / "contexto" / "dossie"
    for pasta in (raiz / "fontes", raiz / "relatorios", raiz / "historico"):
        pasta.mkdir(parents=True, exist_ok=True)
    if not caminhos["leia_me"].exists():
        modelo = Path(__file__).resolve().parent.parent / "assets" / "modelo-dossie-leia-me.md"
        caminhos["leia_me"].write_text(modelo.read_text(encoding="utf-8"), encoding="utf-8", newline="\n")

    if caminhos["dossie"].exists():
        shutil.copy2(caminhos["dossie"], caminhos["arquivo_antigo"])

    shutil.copy2(arquivo, caminhos["fonte"])
    if "texto_extraido" in caminhos:
        caminhos["texto_extraido"].write_text(texto, encoding="utf-8", newline="\n")
    caminhos["dossie"].write_text(
        renderizar_dossie(empresa, arquivo, registro_em, questionario, analise),
        encoding="utf-8",
        newline="\n",
    )
    caminhos["relatorio"].write_text(
        renderizar_relatorio(empresa, arquivo, registro_em, analise),
        encoding="utf-8",
        newline="\n",
    )
    atualizar_mapa(destino)
    atualizar_operacao(destino, registro_em)


def listar_perguntas(questionario: dict[str, Any]) -> None:
    for secao in questionario["secoes"]:
        print(f"## {secao['codigo']}. {secao['titulo']}")
        for pergunta in secao["perguntas"]:
            print(f"{pergunta['codigo']} | {pergunta['texto']}")


def main() -> int:
    args = argumentos()
    try:
        if args.listar_perguntas:
            listar_perguntas(carregar_questionario())
            return 0
        if not args.destino or not args.arquivo:
            raise ErroRegistro("Informe --destino e --arquivo.")
        if args.dry_run == args.aplicar:
            raise ErroRegistro("Use exatamente uma opção: --dry-run ou --aplicar.")
        destino = Path(args.destino).expanduser().resolve()
        arquivo = Path(args.arquivo).expanduser().resolve()
        if not destino.is_dir():
            raise ErroRegistro(f"O destino não é uma pasta: {destino}")
        validar_empresa(destino)
        texto, extensao = ler_transcricao(arquivo)
        questionario = carregar_questionario()
        if args.respostas:
            esperados = {
                pergunta["codigo"]
                for secao in questionario["secoes"]
                for pergunta in secao["perguntas"]
            }
            respostas = carregar_respostas(Path(args.respostas).expanduser().resolve(), esperados)
            analise = analisar_respostas(texto, questionario, respostas)
        else:
            analise = analisar(texto, questionario)
        if analise["marcadores_validos"] == 0:
            raise ErroRegistro(
                "Nenhuma resposta encaixada. Monte o arquivo de respostas consultando "
                "--listar-perguntas e rode de novo com --respostas."
            )
        registro_em = validar_registro_em(args.registro_em)
        empresa = nome_empresa(destino)
        caminhos = caminhos_destino(
            destino, arquivo, registro_em, extensao, args.rotulo_origem
        )
        mostrar_previa(destino, empresa, arquivo, extensao, analise, caminhos)
        if args.dry_run:
            print("DRY-RUN: nenhuma alteração realizada.")
            return 0
        if caminhos["dossie"].exists() and not args.confirmar_atualizacao:
            raise ErroRegistro(
                "Já existe um dossiê canônico. Revise a prévia e use --confirmar-atualizacao para arquivar antes de substituir."
            )
        aplicar(destino, arquivo, texto, extensao, empresa, registro_em, questionario, analise, caminhos)
        print(
            f"REGISTRADO: fonte em {caminhos['fonte']}; dossiê em {caminhos['dossie']}; "
            f"sha256={sha256(arquivo)}"
        )
        return 0
    except ErroRegistro as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 2
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: falha de arquivo: {erro}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
