#!/usr/bin/env python3
"""clientes_para_persona.py: transforma a planilha de clientes do dono num resumo agregado, sem dado pessoal.

Contar e agrupar é script, não modelo. Duas funções, sem rede:

  modelo    imprime a linha de cabeçalho padrão da planilha (21 colunas). Com --saida, grava o modelo
            vazio num arquivo (em UTF-8 com BOM, para o Excel abrir com acento); nunca sobrescreve.
  resumir   lê a planilha CSV e devolve JSON com a contagem por coluna: valores mais comuns, datas
            (inclusive quantas nos últimos 180 dias), frases mais repetidas das colunas de texto livre,
            ganhos e perdidos. Não escreve nada.

Regras de privacidade (a skill depende delas):
  - coluna com nome de dado pessoal (nome, e-mail, telefone, celular, whatsapp, cpf, cnpj, endereço, rg)
    é recusada: não é lida e vai para `colunas_recusadas`;
  - e-mail, telefone, CPF e CNPJ que apareçam DENTRO de um valor viram [removido];
  - o valor de `id_cliente` nunca sai (só quantos clientes distintos há);
  - o caminho da planilha nunca sai (só o nome do arquivo). Planilha dentro da pasta atual gera aviso:
    ela subiria para o GitHub no próximo salvar.

Uso:
  clientes_para_persona.py modelo [--saida ~/Downloads/planilha-clientes-modelo.csv]
  clientes_para_persona.py resumir --arquivo planilha.csv [--hoje AAAA-MM-DD]

Planilha: CSV em UTF-8 (ou Windows-1252, o "CSV" do Excel no Windows), separador `,` ou `;`, cabeçalho na
1ª linha, até 5 MB. Só `id_cliente` é obrigatória; coluna fora do padrão é ignorada com aviso.

Saída: 0 ok; 1 arquivo ausente, ilegível ou grande demais (ou --saida que já existe); 2 uso errado,
planilha sem a coluna id_cliente ou sem nenhuma linha com id. Só stdlib (Python 3.10+).
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

COLUNAS = (
    "id_cliente", "tipo_cliente", "setor", "porte_faixa_funcionarios", "regiao", "papel_decisor",
    "papel_iniciador", "produto_ou_oferta", "data_primeiro_contato", "data_compra", "data_perda", "origem",
    "status", "motivo_compra", "alternativa_anterior", "objecao_principal", "motivo_perda_ou_cancelamento",
    "valor_faixa", "satisfacao", "reclamacoes_tema", "aceita_conversa",
)
CATEGORICAS = ("tipo_cliente", "setor", "porte_faixa_funcionarios", "regiao", "papel_decisor", "papel_iniciador",
               "produto_ou_oferta", "origem", "valor_faixa", "satisfacao")
DATAS = ("data_primeiro_contato", "data_compra", "data_perda")
TEXTOS = ("motivo_compra", "alternativa_anterior", "objecao_principal", "motivo_perda_ou_cancelamento",
          "reclamacoes_tema")
PII = {"nome", "email", "telefone", "celular", "whatsapp", "cpf", "cnpj", "endereco", "rg"}

TETO_BYTES = 5_000_000
RECENTES_DIAS = 180
TOPO_CATEGORICA = 8
TOPO_FRASES = 5
TETO_VALOR = 80
TETO_FRASE = 200
REMOVIDO = "[removido]"
GANHOS = {"ativo", "recomprou"}
PERDIDOS = {"perdido", "cancelou"}
SEM_DECISAO = {"sem_decisao"}
SIM = {"sim", "s"}

RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
RE_NUMERO_LONGO = re.compile(r"\+?\(?\d(?:[\s().\-/]*\d){7,}")
RE_DATA_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
RE_DATA_BR = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})")


class Erro(Exception):
    def __init__(self, codigo: int, mensagem: str):
        super().__init__(mensagem)
        self.codigo = codigo
        self.mensagem = mensagem


# ---------------------------------------------------------------- apoio

def sem_acento(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")


def normalizar(texto: str) -> str:
    """Minúsculas, sem acento, sem pontuação, espaço único (mesma regra do dossie_para_persona.py)."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", sem_acento(texto).lower()).split())


def nome_de_coluna(bruto: str) -> str:
    """'E-mail' -> 'e_mail'; ' Data Compra ' -> 'data_compra'."""
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9_]+", "_", sem_acento(bruto.strip()).lower())).strip("_")


def coluna_e_pessoal(nome: str) -> bool:
    return nome.replace("_", "") in PII or any(pedaco in PII for pedaco in nome.split("_"))


def mascarar(valor: str) -> tuple[str, int]:
    """Troca e-mail e número longo (telefone, CPF, CNPJ) por [removido]. Devolve (texto, quantas trocas)."""
    valor, n1 = RE_EMAIL.subn(REMOVIDO, valor)
    valor, n2 = RE_NUMERO_LONGO.subn(REMOVIDO, valor)
    return valor, n1 + n2


def unico(valor: str) -> str:
    return " ".join(valor.split())


def celula(linha: list[str], i: int) -> str:
    return linha[i].strip() if i < len(linha) else ""


def ler_data(texto: str) -> date | None:
    m = RE_DATA_ISO.match(texto)
    try:
        if m:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        m = RE_DATA_BR.match(texto)
        if m:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None
    return None


# ---------------------------------------------------------------- leitura

def ler_texto(caminho: Path) -> tuple[str, str, list[str]]:
    """(texto, codificação, avisos). Tenta UTF-8 (com ou sem BOM), depois Windows-1252."""
    try:
        eh_arquivo = caminho.is_file()
        tamanho = caminho.stat().st_size if eh_arquivo else 0
    except OSError:
        eh_arquivo, tamanho = False, 0
    if not eh_arquivo:
        raise Erro(1, f"não achei a planilha {caminho.name}")
    if tamanho > TETO_BYTES:
        raise Erro(1, "a planilha passa de 5 MB; exporte só as colunas do modelo")
    try:
        dados = caminho.read_bytes()
    except OSError:
        raise Erro(1, f"não consegui abrir a planilha {caminho.name}") from None
    try:
        return dados.decode("utf-8-sig"), "utf-8", []
    except UnicodeDecodeError:
        pass
    try:
        return dados.decode("cp1252"), "cp1252", ["arquivo não estava em UTF-8; li como Windows-1252"]
    except UnicodeDecodeError:
        raise Erro(1, "não consegui ler a planilha: salve como CSV UTF-8") from None


def escolher_separador(texto: str) -> str:
    primeira = next((l for l in texto.splitlines() if l.strip()), "")
    return ";" if primeira.count(";") > primeira.count(",") else ","


def resumir(caminho: Path, hoje: date) -> dict:
    texto, codificacao, avisos = ler_texto(caminho)
    sep = escolher_separador(texto)
    try:
        linhas_csv = list(csv.reader(io.StringIO(texto), delimiter=sep))
    except csv.Error:
        raise Erro(1, "a planilha não é um CSV legível") from None
    pos = next((i for i, l in enumerate(linhas_csv) if any(c.strip() for c in l)), None)
    if pos is None:
        raise Erro(2, "a planilha está vazia")

    indice: dict[str, int] = {}
    ignoradas: list[str] = []
    recusadas: list[str] = []
    for i, bruto in enumerate(linhas_csv[pos]):
        nome = nome_de_coluna(bruto)
        if not nome:
            continue
        if coluna_e_pessoal(nome):
            recusadas.append(nome)
            avisos.append(f"coluna recusada por ser dado pessoal, não lida: {nome[:40]}")
        elif nome in COLUNAS:
            if nome in indice:
                avisos.append(f"coluna repetida ignorada: {nome}")
            else:
                indice[nome] = i
        else:
            ignoradas.append(nome[:40])
            avisos.append(f"coluna desconhecida ignorada: {nome[:40]}")
    if "id_cliente" not in indice:
        raise Erro(2, "a planilha precisa da coluna id_cliente: um código por cliente, sem nome")

    linhas: list[dict[str, str]] = []
    ids: set[str] = set()
    sem_id = 0
    for bruta in linhas_csv[pos + 1:]:
        if not any(celula(bruta, i) for i in indice.values()):
            continue  # linha vazia (só coluna recusada ou nada)
        codigo = celula(bruta, indice["id_cliente"])
        if not codigo:
            sem_id += 1
            continue
        ids.add(codigo)
        linhas.append({col: celula(bruta, i) for col, i in indice.items()})
    if not linhas:
        raise Erro(2, "a planilha não tem nenhuma linha com id_cliente preenchido")

    try:
        if caminho.resolve().is_relative_to(Path.cwd().resolve()):
            avisos.append("a planilha está dentro do projeto e vai para o GitHub no próximo salvar; mova para fora")
    except (OSError, ValueError):
        pass

    categoricas = {col: _categorica(linhas, col) for col in CATEGORICAS if col in indice}
    datas = {col: _datas(linhas, col, hoje) for col in DATAS if col in indice}
    textos = {col: _texto(linhas, col) for col in TEXTOS if col in indice}
    return {
        "arquivo": caminho.name,
        "hoje": hoje.isoformat(),
        "separador": sep,
        "codificacao": codificacao,
        "linhas": len(linhas),
        "linhas_sem_id": sem_id,
        "clientes_distintos": len(ids),
        "colunas_reconhecidas": list(indice),
        "colunas_ignoradas": ignoradas,
        "colunas_recusadas": recusadas,
        "avisos": avisos,
        "categoricas": categoricas,
        "datas": datas,
        "compradores_recentes": datas.get("data_compra", {}).get("ultimos_180_dias", 0),
        "textos": textos,
        "status": _status(linhas) if "status" in indice else None,
        "aceita_conversa": ({"sim": sum(1 for l in linhas if normalizar(l["aceita_conversa"]) in SIM)}
                            if "aceita_conversa" in indice else None),
    }


def _categorica(linhas: list[dict[str, str]], col: str) -> dict:
    contagem: Counter[str] = Counter()
    vazias = 0
    for l in linhas:
        valor, _ = mascarar(unico(l[col]))
        if not valor:
            vazias += 1
        else:
            contagem[valor[:TETO_VALOR]] += 1
    ordem = sorted(contagem.items(), key=lambda kv: (-kv[1], kv[0]))
    return {
        "preenchidas": len(linhas) - vazias,
        "vazias": vazias,
        "valores": [{"valor": v, "clientes": n} for v, n in ordem[:TOPO_CATEGORICA]],
        "outros": sum(n for _, n in ordem[TOPO_CATEGORICA:]),
    }


def _datas(linhas: list[dict[str, str]], col: str, hoje: date) -> dict:
    validas: list[date] = []
    preenchidas = invalidas = 0
    for l in linhas:
        bruto = l[col]
        if not bruto:
            continue
        preenchidas += 1
        d = ler_data(bruto)
        if d is None:
            invalidas += 1
        else:
            validas.append(d)
    inicio = hoje - timedelta(days=RECENTES_DIAS)
    return {
        "preenchidas": preenchidas,
        "invalidas": invalidas,
        "primeira": min(validas).isoformat() if validas else None,
        "ultima": max(validas).isoformat() if validas else None,
        "ultimos_180_dias": sum(1 for d in validas if inicio <= d <= hoje),
    }


def _texto(linhas: list[dict[str, str]], col: str) -> dict:
    contagem: Counter[str] = Counter()
    primeira: dict[str, str] = {}
    preenchidas = removidos = 0
    for l in linhas:
        valor, trocas = mascarar(unico(l[col]))
        if not valor:
            continue
        preenchidas += 1
        removidos += trocas
        chave = normalizar(valor)
        if not chave:
            continue
        contagem[chave] += 1
        primeira.setdefault(chave, valor[:TETO_FRASE])
    ordem = sorted(contagem.items(), key=lambda kv: (-kv[1], kv[0]))
    return {
        "preenchidas": preenchidas,
        "removidos": removidos,
        "frases": [{"frase": primeira[c], "clientes": n} for c, n in ordem[:TOPO_FRASES]],
    }


def _status(linhas: list[dict[str, str]]) -> dict:
    saida = {"ganhos": 0, "perdidos": 0, "sem_decisao": 0, "outros": 0, "vazios": 0}
    for l in linhas:
        valor = "_".join(normalizar(l["status"]).split())
        if not valor:
            saida["vazios"] += 1
        elif valor in GANHOS:
            saida["ganhos"] += 1
        elif valor in PERDIDOS:
            saida["perdidos"] += 1
        elif valor in SEM_DECISAO:
            saida["sem_decisao"] += 1
        else:
            saida["outros"] += 1
    return saida


# ---------------------------------------------------------------- linha de comando

def _utf8() -> None:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def _data_iso(texto: str) -> date:
    m = RE_DATA_ISO.fullmatch(texto)
    try:
        if m:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        pass
    raise argparse.ArgumentTypeError(f"data inválida: {texto} (use AAAA-MM-DD)")


def _gravar_modelo(destino: str) -> int:
    alvo = Path(destino).expanduser()
    conteudo = b"\xef\xbb\xbf" + ",".join(COLUNAS).encode("utf-8") + b"\n"
    try:
        if alvo.exists():
            print(f"ERRO: já existe: escolha outro nome ({alvo.name})", file=sys.stderr)
            return 1
        with open(alvo, "xb") as f:
            f.write(conteudo)
    except OSError as erro:
        print(f"ERRO: não consegui gravar o modelo ({type(erro).__name__}); confira se a pasta existe", file=sys.stderr)
        return 1
    print(f"FEITO: modelo gravado em {alvo}")
    return 0


def main(argv: list[str] | None = None) -> int:
    _utf8()
    argv = list(sys.argv[1:] if argv is None else argv)
    ap = argparse.ArgumentParser(prog="clientes_para_persona.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("modelo", help="imprime (ou grava) o cabeçalho padrão da planilha de clientes")
    m.add_argument("--saida", help="grava o modelo vazio neste arquivo (recusa sobrescrever); sem isso, imprime")
    r = sub.add_parser("resumir", help="resume a planilha de clientes em JSON, sem dado pessoal")
    r.add_argument("--arquivo", required=True, help="planilha CSV (guarde fora da pasta do projeto)")
    r.add_argument("--hoje", type=_data_iso, help="data de hoje AAAA-MM-DD (padrão: a do computador)")
    try:
        a = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    if a.cmd == "modelo":
        if a.saida:
            return _gravar_modelo(a.saida)
        print(",".join(COLUNAS))
        return 0
    try:
        resultado = resumir(Path(a.arquivo).expanduser(), a.hoje or date.today())
    except Erro as erro:
        print(f"ERRO: {erro.mensagem}", file=sys.stderr)
        return erro.codigo
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
