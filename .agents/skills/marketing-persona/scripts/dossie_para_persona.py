#!/usr/bin/env python3
"""dossie_para_persona.py: lê o dossiê gravado da empresa e entrega, por bloco, o que a persona e a marca podem usar.

Duas funções, sem rede e sem escrever nada:

  blocos    (padrão) devolve JSON com as respostas das perguntas relevantes de cada bloco: empresa,
            publico, dor, oferta, concorrencia e tom. Pergunta sem resposta NÃO vira texto: sai em
            `lacunas`, para a skill perguntar ao dono (nunca inventar). O dossiê é a transcrição do que
            o dono disse (estado `fonte`), não fato aprovado.
  conferir  confere um documento (persona, identidade, tom) contra o dossiê, sem opinar: toda marca
            "(dossiê X.Y)" aponta para uma pergunta que existe e foi respondida; toda frase entre aspas
            com 4 palavras ou mais está no dossiê ou no anexo do próprio documento; toda marca
            "(relato do dono, AAAA-MM-DD)" tem a data no anexo. Com --estrito (persona), toda linha das
            seções de fato tem marca de origem e o cabeçalho declara estado e origem da persona.

Uso (da raiz do projeto):
  dossie_para_persona.py [blocos] [--casa .] [--bloco publico ...] [--saida arquivo.json]
  dossie_para_persona.py conferir --arquivo empresa/publico/persona.md [--estrito] [--casa .]

Saída: 0 ok; 1 dossiê ausente ou ilegível (blocos) ou problema achado (conferir); 2 uso errado.
Só stdlib (Python 3.10+). O formato lido é o que polozi-registrar-dossie grava em
contexto/dossie/dossie-completo.md.
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

RE_CABECALHO = re.compile(r"^# Dossiê da Empresa - (.+)$", re.MULTILINE)
RE_PERGUNTA = re.compile(r"^### (\d{1,2}\.\d{1,2}) - (.+)$", re.MULTILINE)
RE_ESTADO = re.compile(r"^- Estado de extração: (.+?)\s*$", re.MULTILINE)
SEM_RESPOSTA = "Nenhuma resposta identificada."

SECOES_LIVRES = ("anexo", "o que ainda nao sabemos", "como validar")  # texto de método, não afirma fato
RE_MARCA = re.compile(r"\((dossie|relato do dono|hipotese|nao consta|material do dono|proposta do time)\b([^)]*)\)")
RE_CODIGO = re.compile(r"\b(\d{1,2}\.\d{1,2})\b")
RE_DATA = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
RE_ASPAS = re.compile(r'"([^"\n]{8,})"|“([^”\n]{8,})”')
RE_MODELO = re.compile(r"<(?!https?://)(?![^<>\n]*@)[A-Za-zÀ-ÿ#][^<>\n]{2,120}>")  # igual à do publicar_documento.py
RE_APROVACAO = re.compile(r"^Aprovado pelo dono em\b")  # a frase do dono é dele e pode ter qualquer sinal
RE_SEPARADOR = re.compile(r"\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?")  # linha |---|---| de tabela


def sem_acento(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")


def normalizar(texto: str) -> str:
    """Minúsculas, sem acento, sem pontuação, espaço único: para comparar frase com fonte."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", sem_acento(texto).lower()).split())


# ---------------------------------------------------------------- leitura do dossiê

def ler_dossie(texto: str) -> dict:
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


def montar_blocos(dossie: dict, so: list[str] | None = None) -> dict:
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


def resumo_dossie(dossie: dict, caminho: str, dados: bytes) -> dict:
    estados = [p["estado"] for p in dossie["perguntas"].values()]
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


def _linhas_de_fato(texto: str) -> list[tuple[int, str]]:
    """Linhas das seções de fato: sem título, sem linha em branco, sem separador nem cabeçalho de tabela."""
    achadas: list[tuple[int, str]] = []
    for titulo, _, linhas in secoes(texto):
        if titulo.startswith(SECOES_LIVRES):
            continue
        for i, (n, linha) in enumerate(linhas):
            s = linha.strip()
            if not s or s.startswith("#") or RE_SEPARADOR.fullmatch(s):
                continue
            if s.startswith("|") and i + 1 < len(linhas) and RE_SEPARADOR.fullmatch(linhas[i + 1][1].strip()):
                continue  # cabeçalho da tabela: a linha logo antes do separador |---|
            achadas.append((n, s))
    return achadas


def conferir_documento(texto: str, dossie: dict, estrito: bool = False) -> tuple[list[str], int]:
    """(problemas, quantas marcas de dossiê foram conferidas)."""
    texto = texto.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
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
    literal = fonte_literal + " " + normalizar(anexo)
    conferidas = 0
    corpo = next((n for n, l in enumerate(texto.split("\n"), 1) if l.startswith("## ")), 1)  # o cabeçalho só explica as marcas
    for n, linha in enumerate(texto.split("\n"), 1):
        if n < corpo:
            continue
        dobrada = sem_acento(linha).lower()
        for m in RE_MARCA.finditer(dobrada):
            tipo, resto = m.group(1), m.group(2)
            if tipo == "dossie":
                codigos = RE_CODIGO.findall(resto)
                if not codigos:
                    problemas.append(f"linha {n}: marca (dossiê) sem número de pergunta")
                for cod in codigos:
                    conferidas += 1
                    p = perguntas.get(cod)
                    if p is None:
                        problemas.append(f"linha {n}: cita a pergunta {cod}, que não existe no dossiê")
                    elif p["estado"] != "respondida":
                        problemas.append(f"linha {n}: cita a pergunta {cod}, mas o dossiê a deixou {p['estado']}")
            elif tipo == "relato do dono":
                data = RE_DATA.search(resto)
                if not data:
                    problemas.append(f"linha {n}: marca (relato do dono) sem data AAAA-MM-DD")
                elif data.group(1) not in datas_do_anexo:
                    problemas.append(f"linha {n}: relato do dono de {data.group(1)} sem registro no Anexo do documento")
    # citações literais: fora do anexo e das seções livres, toda frase entre aspas (4 palavras ou mais)
    # tem de estar no dossiê ou no anexo; sem isso, a "fala do cliente" pode ter sido inventada
    for titulo, _, linhas in secoes(texto):
        if titulo.startswith(SECOES_LIVRES):
            continue
        for n, linha in linhas:
            for m in RE_ASPAS.finditer(linha):
                frase = m.group(1) or m.group(2)
                if len(frase.split()) >= 4 and normalizar(frase) not in literal:
                    problemas.append(f'linha {n}: frase entre aspas que não está no dossiê nem no Anexo: "{frase[:70]}"')
    if estrito:
        if not re.search(r"^- Estado: (rascunho|em-revisao|em-revisão|aprovado)\s*$", texto, re.MULTILINE):
            problemas.append("cabeçalho sem a linha '- Estado: rascunho' (ou em-revisao, aprovado)")
        origem = re.search(r"^- Origem da persona:\s*(.*)$", texto, re.MULTILINE)
        if not origem or not re.match(r"(proto-persona|validada)\b", origem.group(1), re.IGNORECASE):
            problemas.append("cabeçalho sem '- Origem da persona:' começando por proto-persona ou validada")
        elif origem.group(1).lower().startswith("validada"):
            prova = re.match(r"validada com (\d+) conversas?\b.*\b\d{4}-\d{2}-\d{2}\b", origem.group(1), re.IGNORECASE)
            if not prova or int(prova.group(1)) < MIN_CONVERSAS:
                problemas.append(f"persona 'validada' precisa dizer 'validada com N conversas' de clientes reais "
                                 f"(N de {MIN_CONVERSAS} para cima) e a data da última; senão é proto-persona")
        for n, linha in _linhas_de_fato(texto):
            if not RE_MARCA.search(sem_acento(linha).lower()):
                problemas.append(f"linha {n}: sem marca de origem (dossiê X.Y, relato do dono, hipótese, "
                                 f"não consta ou proposta do time): {linha[:70]}")
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
    return ler_dossie(dados.decode("utf-8")), rel, dados


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
    b.add_argument("--saida", help="grava o JSON neste arquivo em vez de imprimir")
    c = sub.add_parser("conferir")
    c.add_argument("--casa", default=".")
    c.add_argument("--dossie", help=f"caminho do dossiê (padrão: {DOSSIE})")
    c.add_argument("--arquivo", required=True, help="documento .md a conferir")
    c.add_argument("--estrito", action="store_true", help="regras da persona: marca de origem em toda linha de fato")
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
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: não consegui ler o dossiê ({type(erro).__name__})", file=sys.stderr)
        return 1
    if not dossie["perguntas"]:
        print(f"ERRO: {rel} não tem nenhuma pergunta no formato do polozi-registrar-dossie "
              "(### N.N - pergunta). Registre o dossiê de novo.", file=sys.stderr)
        return 1
    if a.cmd == "blocos":
        saida = {"dossie": resumo_dossie(dossie, rel, dados), **montar_blocos(dossie, a.bloco), "aviso": AVISO_FONTE}
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
        problemas, conferidas = conferir_documento(alvo.read_bytes().decode("utf-8"), dossie, a.estrito)
    except UnicodeError:
        print(f"ERRO: {a.arquivo} não está em UTF-8", file=sys.stderr)
        return 2
    for p in problemas:
        print(f"PROBLEMA: {p}")
    if problemas:
        print(f"{len(problemas)} problema(s) em {a.arquivo}")
        return 1
    print(f"OK: {a.arquivo} confere com o dossiê ({conferidas} marca(s) de dossiê conferida(s)"
          f"{', origem em toda linha de fato' if a.estrito else ''}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
