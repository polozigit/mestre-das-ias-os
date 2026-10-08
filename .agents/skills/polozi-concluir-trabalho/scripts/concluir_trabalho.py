#!/usr/bin/env python3
"""Atualiza a memória operacional da Empresa IA a partir de um plano validado.

--dry-run/--aplicar preparam a memória operacional (nunca fecham TASK). Só
--provar [--tarefa N] decide se o trabalho terminou: roda `git status
--porcelain` e `git log origin/main..HEAD` na Casa, recusa (exit 2) se algo
não estiver vazio, e só depois disso carimba a TASK — a frase de fecho só
sai na rodada SEM --tarefa (com --tarefa a última linha é sempre "FALTA A
PROVA FINAL"). Códigos de saída: 0 sucesso; 2 RECUSADO: (prova por git);
3 ERRO: falha de arquivo (disco/permissão); 4 ERRO: estado ou uso errado da
Casa (inclui argumento inválido e git ausente do PATH).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any


# Rótulos do TASK.md — única fonte de verdade dos bullets que
# `polozi-gerente-de-trabalho` escreve e `operacao/tasks/TEMPLATE-TASK.md`
# publica (guarda cruzada em tests/test_contrato_task.py). Divergiu um dos
# três, a suite cai.
ROTULO_STATUS = "Status:"
ROTULO_CONCLUIDA = "Concluída em:"
ROTULO_COMMIT = "Commit:"
VALOR_CONCLUIDA = "concluída"
TEMPLATE_TASK_REL = "operacao/tasks/TEMPLATE-TASK.md"

# Espaço HORIZONTAL entre o rótulo e o valor/fim de linha — nunca `\s*`, que
# inclui `\n` e atravessa quebra de linha. Com bullet VAZIO (ex.: "- Concluída
# em:" seguido de "- Commit:" no TEMPLATE-TASK.md, sem linha em branco entre
# eles) o `\s*` engolia a linha seguinte inteira: "- Commit:" sumia do
# cabeçalho e reaparecia no fim do arquivo pelo ramo "não achei" de
# `definir_bullet`. Achado do codex.auditor, rodada 2 de 06/09/2026 (FALHA 4).
# Única fonte pra TODOS os regexes de bullet — mutar aqui muta a classe
# inteira, não uma instância.
ESPACO_NA_LINHA = r"[^\S\n]*"

FORMATO_DATA = "%Y-%m-%d_%H%M%S"
ESTADOS_MAPA = {
    "ausente",
    "coletando",
    "fonte",
    "rascunho",
    "em-revisao",
    "aprovado",
    "externo",
    "desatualizado",
    "substituido",
}
ORIGENS_PENDENCIA = {"dono", "descoberta-ia", "sobra-de-task"}
PRIORIDADES_PENDENCIA = {"alta", "media", "baixa"}
CHAVES_PLANO = {
    "trabalho",
    "estado",
    "proximo_marco",
    "changelog",
    "decisoes",
    "pendencias_adicionar",
    "pendencias_resolver",
    "proxima_sessao",
    "mapa_atualizacoes",
    "plugins_instalados",
    "tarefa",
}
CHAVES_PROXIMA = {
    "objetivo",
    "capacidade_sugerida",
    "entrada_necessaria",
    "decisoes_pendentes",
    "criterio_conclusao",
}
CHAVES_PENDENCIA_ADICIONAR = {"pendencia", "origem", "prioridade"}
CHAVES_TAREFA = {"numero"}


class ErroConclusao(Exception):
    """Erro esperado, apresentado sem traceback ao usuário."""


class RecusaProva(Exception):
    """--provar recusou por causa do estado do git na Casa. Sem traceback."""


class ArgumentosDaSkill(argparse.ArgumentParser):
    """Erro de USO (argumento desconhecido/typo) tem que sair 4 (`ERRO:`),
    nunca 2 (`RECUSADO:`, reservado à prova por git) — argparse por padrão
    chama `self.exit(2)`, o que fazia um `--tarfea` digitado errado parecer
    recusa de git pra SKILL.md."""

    def error(self, message: str) -> None:  # type: ignore[override]
        print(f"ERRO: {message}", file=sys.stderr)
        raise SystemExit(4)


def argumentos() -> argparse.Namespace:
    parser = ArgumentosDaSkill(
        description="Atualiza os registros operacionais de uma Empresa IA."
    )
    parser.add_argument("--destino", required=True, help="Pasta Empresa IA já inicializada.")
    parser.add_argument("--plano", help="JSON temporário do encerramento (--dry-run/--aplicar).")
    parser.add_argument(
        "--registro-em", help="Data-hora estável no formato AAAA-MM-DD_HHMMSS."
    )
    parser.add_argument("--dry-run", action="store_true", help="Mostra a prévia sem escrever.")
    parser.add_argument("--aplicar", action="store_true", help="Aplica o plano confirmado.")
    parser.add_argument(
        "--provar",
        action="store_true",
        help="Prova por git que o trabalho está sincronizado; só então imprime o fecho.",
    )
    parser.add_argument(
        "--tarefa",
        help="Número da TASK a carimbar como concluída, só depois da prova (--provar).",
    )
    return parser.parse_args()


def texto(valor: Any, campo: str, obrigatorio: bool = True) -> str:
    if not isinstance(valor, str):
        raise ErroConclusao(f"{campo} deve ser texto.")
    resultado = valor.strip()
    if obrigatorio and not resultado:
        raise ErroConclusao(f"{campo} não pode ficar vazio.")
    if "\x00" in resultado:
        raise ErroConclusao(f"{campo} contém caractere inválido.")
    return resultado


def lista_textos(valor: Any, campo: str) -> list[str]:
    if not isinstance(valor, list):
        raise ErroConclusao(f"{campo} deve ser uma lista.")
    resultado = [texto(item, campo) for item in valor]
    if len(resultado) != len(set(resultado)):
        raise ErroConclusao(f"{campo} não pode conter itens repetidos.")
    return resultado


def validar_registro_em(valor: str | None) -> str:
    if not valor:
        return datetime.now().strftime(FORMATO_DATA)
    try:
        datetime.strptime(valor, FORMATO_DATA)
    except ValueError as erro:
        raise ErroConclusao("--registro-em deve usar o formato AAAA-MM-DD_HHMMSS.") from erro
    return valor


def carregar_plano(caminho: Path) -> dict[str, Any]:
    try:
        conteudo = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as erro:
        raise ErroConclusao(f"Plano de encerramento inválido: {caminho}") from erro
    if not isinstance(conteudo, dict):
        raise ErroConclusao("O plano de encerramento deve ser um objeto JSON.")
    desconhecidas = set(conteudo) - CHAVES_PLANO
    if desconhecidas:
        raise ErroConclusao(
            "O plano contém campos não permitidos: " + ", ".join(sorted(desconhecidas))
        )
    return conteudo


def normalizar_plano(plano: dict[str, Any]) -> dict[str, Any]:
    def opcional(campo: str) -> str:
        return texto(plano.get(campo, ""), campo, obrigatorio=False)

    proxima_bruta = plano.get("proxima_sessao", {})
    if not isinstance(proxima_bruta, dict):
        raise ErroConclusao("proxima_sessao deve ser um objeto.")
    desconhecidas = set(proxima_bruta) - CHAVES_PROXIMA
    if desconhecidas:
        raise ErroConclusao(
            "proxima_sessao contém campos não permitidos: "
            + ", ".join(sorted(desconhecidas))
        )
    proxima = {
        campo: texto(proxima_bruta.get(campo, ""), f"proxima_sessao.{campo}", obrigatorio=False)
        for campo in CHAVES_PROXIMA - {"decisoes_pendentes"}
    }
    proxima["decisoes_pendentes"] = lista_textos(
        proxima_bruta.get("decisoes_pendentes", []), "proxima_sessao.decisoes_pendentes"
    )

    decisoes_brutas = plano.get("decisoes", [])
    if not isinstance(decisoes_brutas, list):
        raise ErroConclusao("decisoes deve ser uma lista.")
    decisoes = []
    for indice, decisao in enumerate(decisoes_brutas, start=1):
        if not isinstance(decisao, dict) or set(decisao) != {
            "titulo",
            "decisao",
            "motivo",
            "responsavel",
        }:
            raise ErroConclusao(f"decisoes[{indice}] deve conter titulo, decisao, motivo e responsavel.")
        decisoes.append(
            {campo: texto(decisao[campo], f"decisoes[{indice}].{campo}") for campo in decisao}
        )

    mapa_bruto = plano.get("mapa_atualizacoes", [])
    if not isinstance(mapa_bruto, list):
        raise ErroConclusao("mapa_atualizacoes deve ser uma lista.")
    mapa = []
    for indice, atualizacao in enumerate(mapa_bruto, start=1):
        if not isinstance(atualizacao, dict) or set(atualizacao) != {"papel", "estado"}:
            raise ErroConclusao(f"mapa_atualizacoes[{indice}] deve conter papel e estado.")
        papel = texto(atualizacao["papel"], f"mapa_atualizacoes[{indice}].papel")
        estado = texto(atualizacao["estado"], f"mapa_atualizacoes[{indice}].estado")
        if estado not in ESTADOS_MAPA:
            raise ErroConclusao(f"Estado inválido no Mapa: {estado}.")
        mapa.append({"papel": papel, "estado": estado})
    if len({item["papel"] for item in mapa}) != len(mapa):
        raise ErroConclusao("mapa_atualizacoes não pode repetir um papel.")

    pendencias_brutas = plano.get("pendencias_adicionar", [])
    if not isinstance(pendencias_brutas, list):
        raise ErroConclusao("pendencias_adicionar deve ser uma lista.")
    pendencias_adicionar = []
    for indice, pendencia in enumerate(pendencias_brutas, start=1):
        if not isinstance(pendencia, dict) or set(pendencia) != CHAVES_PENDENCIA_ADICIONAR:
            raise ErroConclusao(
                f"pendencias_adicionar[{indice}] deve conter pendencia, origem e prioridade."
            )
        origem = texto(pendencia["origem"], f"pendencias_adicionar[{indice}].origem")
        if origem not in ORIGENS_PENDENCIA:
            raise ErroConclusao(
                f"pendencias_adicionar[{indice}].origem inválida: {origem} "
                f"(use {', '.join(sorted(ORIGENS_PENDENCIA))})."
            )
        prioridade = texto(pendencia["prioridade"], f"pendencias_adicionar[{indice}].prioridade")
        if prioridade not in PRIORIDADES_PENDENCIA:
            raise ErroConclusao(
                f"pendencias_adicionar[{indice}].prioridade inválida: {prioridade} "
                f"(use {', '.join(sorted(PRIORIDADES_PENDENCIA))})."
            )
        pendencias_adicionar.append(
            {
                "pendencia": texto(pendencia["pendencia"], f"pendencias_adicionar[{indice}].pendencia"),
                "origem": origem,
                "prioridade": prioridade,
            }
        )
    if len({item["pendencia"] for item in pendencias_adicionar}) != len(pendencias_adicionar):
        raise ErroConclusao("pendencias_adicionar não pode repetir o mesmo texto de pendência.")

    plugins_brutos = plano.get("plugins_instalados", [])
    if not isinstance(plugins_brutos, list):
        raise ErroConclusao("plugins_instalados deve ser uma lista.")
    plugins = []
    for indice, plugin in enumerate(plugins_brutos, start=1):
        if not isinstance(plugin, dict) or set(plugin) != {"nome", "finalidade"}:
            raise ErroConclusao(f"plugins_instalados[{indice}] deve conter nome e finalidade.")
        plugins.append(
            {
                "nome": texto(plugin["nome"], f"plugins_instalados[{indice}].nome"),
                "finalidade": texto(
                    plugin["finalidade"], f"plugins_instalados[{indice}].finalidade"
                ),
            }
        )

    tarefa_bruta = plano.get("tarefa", {})
    if not isinstance(tarefa_bruta, dict):
        raise ErroConclusao("tarefa deve ser um objeto.")
    tarefa: dict[str, str] = {}
    if tarefa_bruta:
        if set(tarefa_bruta) != CHAVES_TAREFA:
            raise ErroConclusao("tarefa deve conter apenas numero.")
        numero = texto(tarefa_bruta["numero"], "tarefa.numero")
        if not numero.isdigit():
            raise ErroConclusao("tarefa.numero deve ser um número sequencial (só dígitos).")
        tarefa = {"numero": numero}

    return {
        "trabalho": opcional("trabalho"),
        "estado": opcional("estado"),
        "proximo_marco": opcional("proximo_marco"),
        "changelog": lista_textos(plano.get("changelog", []), "changelog"),
        "decisoes": decisoes,
        "pendencias_adicionar": pendencias_adicionar,
        "pendencias_resolver": lista_textos(
            plano.get("pendencias_resolver", []), "pendencias_resolver"
        ),
        "proxima_sessao": proxima,
        "mapa_atualizacoes": mapa,
        "plugins_instalados": plugins,
        "tarefa": tarefa,
    }


def validar_empresa(destino: Path) -> None:
    exigidos = [
        destino / "EMPRESA-IA.md",
        destino / "MAPA-DA-EMPRESA-IA.md",
        destino / "operacao" / "STATUS-ATUAL.md",
        destino / "operacao" / "CHANGELOG.md",
        destino / "operacao" / "DECISOES.md",
        destino / "operacao" / "PENDENCIAS.md",
        destino / "operacao" / "PROXIMA-SESSAO.md",
        destino / "capacidades" / "PLUGINS.md",
        destino / "credenciais" / "CONEXOES.md",
    ]
    ausentes = [str(caminho.relative_to(destino)) for caminho in exigidos if not caminho.is_file()]
    if ausentes:
        raise ErroConclusao(
            "Esta pasta não está pronta como Empresa IA. Use primeiro Polozi Criar Empresa IA. "
            f"Ausentes: {', '.join(ausentes)}."
        )


def substituir_bullet(texto_atual: str, rotulo: str, valor: str) -> str:
    padrao = re.compile(rf"(?m)^-\s*{re.escape(rotulo)}{ESPACO_NA_LINHA}.*$")
    novo = f"- {rotulo} {valor}"
    if not padrao.search(texto_atual):
        raise ErroConclusao(f"O arquivo não contém o campo {rotulo}")
    return padrao.sub(novo, texto_atual, count=1)


def definir_bullet(texto_atual: str, rotulo: str, valor: str) -> str:
    """Substitui o bullet se existir; senão acrescenta uma linha nova ao final."""
    padrao = re.compile(rf"(?m)^-\s*{re.escape(rotulo)}{ESPACO_NA_LINHA}.*$")
    linha_nova = f"- {rotulo} {valor}"
    if padrao.search(texto_atual):
        return padrao.sub(linha_nova, texto_atual, count=1)
    return texto_atual.rstrip("\n") + "\n" + linha_nova + "\n"


def atualizar_mapa(texto_atual: str, destino: Path, atualizacoes: list[dict[str, str]]) -> str:
    resultado = texto_atual
    for atualizacao in atualizacoes:
        papel = atualizacao["papel"]
        # Tabela de papéis empresariais: | papel | `caminho` | o que tem | estado | quem cria |
        # [^|\n] (nunca [^|]) para o casamento não vazar para a linha seguinte da tabela.
        padrao = re.compile(
            rf"(?m)^(\|\s*{re.escape(papel)}\s*\|\s*`(?P<caminho>[^`\n]+)`\s*\|[^|\n]*\|\s*)(?P<estado>[^|\n]+)(\|.*)$"
        )
        encontrado = padrao.search(resultado)
        if not encontrado:
            raise ErroConclusao(f"O papel {papel} não existe no Mapa. Registre uma pendência, não crie-o.")
        caminho_relativo = Path(encontrado.group("caminho"))
        if caminho_relativo.is_absolute() or not (destino / caminho_relativo).is_file():
            raise ErroConclusao(
                f"O papel {papel} não pode mudar de estado porque falta o arquivo {caminho_relativo}."
            )
        resultado = padrao.sub(
            lambda item: item.group(1) + atualizacao["estado"] + " " + item.group(4),
            resultado,
            count=1,
        )
    return resultado


def linhas_de_tabela(texto_atual: str) -> list[int]:
    return [indice for indice, linha in enumerate(texto_atual.splitlines()) if linha.startswith("|")]


def analisar_celulas(linha: str) -> list[str]:
    interior = linha.strip()
    if interior.startswith("|"):
        interior = interior[1:]
    if interior.endswith("|"):
        interior = interior[:-1]
    return [celula.strip() for celula in interior.split("|")]


def montar_linha_tabela(celulas: list[str]) -> str:
    return "| " + " | ".join(celulas) + " |"


def atualizar_pendencias(
    texto_atual: str, adicionar: list[dict[str, str]], resolver: list[str], data: str
) -> str:
    """Tabela: | id | pendência | origem | prioridade | estado | registrada em |.
    Resolver muda o estado da linha para 'resolvida' — nunca apaga (preserva histórico)."""
    linhas = texto_atual.splitlines()
    indices = linhas_de_tabela(texto_atual)
    if not indices:
        raise ErroConclusao("PENDENCIAS.md não contém uma tabela válida.")

    proximo_id = 1
    for indice in indices:
        celulas = analisar_celulas(linhas[indice])
        if celulas and celulas[0].isdigit():
            proximo_id = max(proximo_id, int(celulas[0]) + 1)

    for item in resolver:
        encontrada = False
        for indice in indices:
            celulas = analisar_celulas(linhas[indice])
            if len(celulas) >= 5 and celulas[1] == item and celulas[4] != "resolvida":
                celulas[4] = "resolvida"
                linhas[indice] = montar_linha_tabela(celulas)
                encontrada = True
                break
        if not encontrada:
            raise ErroConclusao(
                f"A pendência resolvida não existe (aberta) com o texto exato: {item}"
            )

    inserir_em = indices[-1] + 1
    for item in adicionar:
        nova = [
            str(proximo_id),
            item["pendencia"],
            item["origem"],
            item["prioridade"],
            "aberta",
            data,
        ]
        linhas.insert(inserir_em, montar_linha_tabela(nova))
        inserir_em += 1
        proximo_id += 1
    return "\n".join(linhas).rstrip() + "\n"


def renderizar_proxima(proxima: dict[str, Any]) -> str:
    campos = [
        ("Objetivo", proxima["objetivo"]),
        ("Capacidade sugerida", proxima["capacidade_sugerida"]),
        ("Entrada necessária", proxima["entrada_necessaria"]),
    ]
    linhas = ["# Próxima sessão", ""]
    for titulo, valor in campos:
        linhas.extend([f"## {titulo}", "", valor or "Não definido.", ""])
    linhas.extend(["## Decisões pendentes", ""])
    if proxima["decisoes_pendentes"]:
        linhas.extend(f"- {item}" for item in proxima["decisoes_pendentes"])
    else:
        linhas.append("- Nenhuma.")
    linhas.extend(["", "## Critério de conclusão", "", proxima["criterio_conclusao"] or "Não definido.", ""])
    return "\n".join(linhas)


def atualizar_plugins(texto_atual: str, plugins: list[dict[str, str]], data: str) -> str:
    linhas = texto_atual.splitlines()
    indices_tabela = [indice for indice, linha in enumerate(linhas) if linha.startswith("|")]
    if not indices_tabela:
        raise ErroConclusao("capacidades/PLUGINS.md não contém uma tabela válida.")
    inserir_em = indices_tabela[-1] + 1
    for plugin in plugins:
        if any(f"| {plugin['nome']} |" in linha for linha in linhas):
            continue
        linhas.insert(
            inserir_em,
            f"| {plugin['nome']} | {plugin['finalidade']} | ativo | {data} |",
        )
        inserir_em += 1
    return "\n".join(linhas).rstrip() + "\n"


def _normalizar_celula(valor: str) -> str:
    """Minúsculas, sem acento/cedilha, sem espaço nas bordas — pra casar
    'Serviço' com 'servico' e 'Supabase' com 'supabase' sem depender de
    grafia exata."""
    sem_acento = "".join(
        caractere
        for caractere in unicodedata.normalize("NFD", valor)
        if not unicodedata.combining(caractere)
    )
    return sem_acento.strip().casefold()


def _e_linha_separadora(celulas: list[str]) -> bool:
    preenchidas = [celula for celula in celulas if celula.strip()]
    if not preenchidas:
        return False
    return all(set(celula) <= {"-", ":"} for celula in preenchidas)


def banco_conectado(texto_conexoes: str) -> bool:
    """O banco (Supabase) vira a fonte oficial de tasks quando REGISTRADO NA
    COLUNA "Serviço" da tabela de CONEXOES.md — coluna achada pelo NOME do
    cabeçalho (nunca por posição fixa: outras skills podem inserir colunas
    no meio). Linha de tabela que só MENCIONA Supabase noutra coluna, ou
    prosa fora da tabela, não conta — falha pro lado seguro (carimba o
    TASK.md local, visível e versionado)."""
    linhas = texto_conexoes.splitlines()
    indices = linhas_de_tabela(texto_conexoes)
    indice_cabecalho = None
    indice_servico = None
    for indice in indices:
        celulas_normalizadas = [
            _normalizar_celula(celula) for celula in analisar_celulas(linhas[indice])
        ]
        if "servico" in celulas_normalizadas:
            indice_cabecalho = indice
            indice_servico = celulas_normalizadas.index("servico")
            break
    if indice_cabecalho is None:
        return False
    for indice in indices:
        if indice <= indice_cabecalho:
            continue
        celulas = analisar_celulas(linhas[indice])
        if _e_linha_separadora(celulas):
            continue
        if indice_servico < len(celulas) and _normalizar_celula(celulas[indice_servico]) == "supabase":
            return True
    return False


def exigir_formato_da_task(conteudo: str, caminho: Path) -> str:
    """`--provar --tarefa N` nunca inventa o bullet: recusa com ERRO
    acionável (decisão D-E). Diz o que falta, onde está a forma certa e o
    que fazer — nunca migra TASK antiga sozinho."""
    padrao = re.compile(rf"(?m)^-\s*{re.escape(ROTULO_STATUS)}")
    if padrao.search(conteudo):
        return conteudo
    raise ErroConclusao(
        f"falta a linha '- {ROTULO_STATUS} aberta' em {caminho}. "
        f"A forma certa está em {TEMPLATE_TASK_REL}. "
        "Copie os bullets do topo do template pro TASK.md, sem apagar objetivo "
        "e critério de pronto, e rode de novo. Não marque concluída a mão."
    )


def ja_carimbada(conteudo: str) -> bool:
    """Carimbo idempotente (decisão D-I): `Status:` já começa com 'conclu'
    E `Commit:` já está preenchido — nesse caso `--provar --tarefa N` não
    reescreve nada (o hash gravado, mesmo que "velho", não é trocado)."""
    status = re.search(rf"(?m)^-\s*{re.escape(ROTULO_STATUS)}{ESPACO_NA_LINHA}(.*)$", conteudo)
    commit = re.search(rf"(?m)^-\s*{re.escape(ROTULO_COMMIT)}{ESPACO_NA_LINHA}(.*)$", conteudo)
    if not status or not commit:
        return False
    valor_status = status.group(1).strip().lower()
    valor_commit = commit.group(1).strip()
    return valor_status.startswith("conclu") and bool(valor_commit)


def fechar_tarefa(destino: Path, numero: str, data: str, hash_curto: str) -> tuple[Path, str]:
    caminho = destino / "operacao" / "tasks" / f"TASK-{numero}" / "TASK.md"
    if not caminho.is_file():
        raise ErroConclusao(
            f"TASK-{numero} não existe em operacao/tasks/. Abra a task antes de concluir."
        )
    conteudo = caminho.read_text(encoding="utf-8")
    conteudo = exigir_formato_da_task(conteudo, caminho)
    conteudo = substituir_bullet(conteudo, ROTULO_STATUS, VALOR_CONCLUIDA)
    conteudo = definir_bullet(conteudo, ROTULO_CONCLUIDA, data)
    conteudo = definir_bullet(conteudo, ROTULO_COMMIT, hash_curto)
    return caminho, conteudo


def rodar_git(destino: Path, *args: str) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            ["git", *args], cwd=destino, capture_output=True, text=True, check=False
        )
    except FileNotFoundError as erro:
        raise ErroConclusao(
            "não encontrei o comando git neste computador; instale o Git "
            "(ETAPA 0 da instalação) e rode de novo."
        ) from erro


def estado_git(destino: Path) -> dict[str, Any]:
    """Lê o estado real do git na Casa — nunca confia no que o agente diz."""
    raiz = rodar_git(destino, "rev-parse", "--show-toplevel")
    if raiz.returncode != 0:
        raise ErroConclusao(f"{destino} não é um repositório git.")

    status = rodar_git(destino, "status", "--porcelain")
    if status.returncode != 0:
        raise ErroConclusao("não consegui ler o estado do git (git status --porcelain).")
    sujeira = [linha for linha in status.stdout.splitlines() if linha.strip()]

    remoto = rodar_git(destino, "remote", "get-url", "origin")
    tem_origin = remoto.returncode == 0

    origin_main_existe = False
    nao_enviados: list[str] = []
    if tem_origin:
        verificar = rodar_git(destino, "rev-parse", "--verify", "origin/main")
        origin_main_existe = verificar.returncode == 0
        if origin_main_existe:
            comparar = rodar_git(destino, "log", "--oneline", "origin/main..HEAD")
            if comparar.returncode != 0:
                raise ErroConclusao("não consegui comparar com origin/main (git log).")
            nao_enviados = [linha for linha in comparar.stdout.splitlines() if linha.strip()]

    hash_resultado = rodar_git(destino, "rev-parse", "--short", "HEAD")
    if hash_resultado.returncode != 0:
        raise ErroConclusao(
            "não consegui ler o commit atual (git rev-parse --short HEAD); "
            "faça o primeiro commit antes de provar."
        )

    return {
        "sujeira": sujeira,
        "tem_origin": tem_origin,
        "origin_main_existe": origin_main_existe,
        "nao_enviados": nao_enviados,
        "hash_curto": hash_resultado.stdout.strip(),
    }


def frase_de_fecho(tem_origin: bool, hash_curto: str) -> str:
    if tem_origin:
        return f"Sincronizado no GitHub, commit {hash_curto}."
    return f"salvo neste computador, commit {hash_curto}."


def modo_provar(destino: Path, tarefa: str | None, registro_em: str) -> int:
    estado = estado_git(destino)
    problemas: list[str] = []
    if estado["sujeira"]:
        problemas.append("Árvore de trabalho suja (git status --porcelain):")
        problemas.extend(f"  {linha}" for linha in estado["sujeira"])
    if estado["tem_origin"] and not estado["origin_main_existe"]:
        problemas.append(
            "origin existe mas origin/main não foi encontrado — ainda não fez o "
            "primeiro push. NÃO ENVIADO."
        )
    elif estado["nao_enviados"]:
        problemas.append("Commits locais não enviados (git log origin/main..HEAD):")
        problemas.extend(f"  {linha}" for linha in estado["nao_enviados"])
    if problemas:
        raise RecusaProva("\n".join(problemas))

    hash_curto = estado["hash_curto"]
    if tarefa:
        data = registro_em[:10]
        caminho_tarefa = destino / "operacao" / "tasks" / f"TASK-{tarefa}" / "TASK.md"
        if not caminho_tarefa.is_file():
            raise ErroConclusao(
                f"TASK-{tarefa} não existe em operacao/tasks/. Abra a task antes de concluir."
            )
        conteudo_atual = caminho_tarefa.read_text(encoding="utf-8")
        if ja_carimbada(conteudo_atual):
            commit_gravado = re.search(
                rf"(?m)^-\s*{re.escape(ROTULO_COMMIT)}{ESPACO_NA_LINHA}(.*)$", conteudo_atual
            )
            valor_commit = commit_gravado.group(1).strip() if commit_gravado else ""
            print(f"TASK-{tarefa} já estava carimbada (commit {valor_commit}). Nada reescrito.")
            # Caminho idempotente: nada novo foi escrito, então NUNCA mandar
            # "commitar e empurrar o carimbo" — não há carimbo novo pra
            # commitar. Aspereza apontada pelo codex.auditor 06/09 rodada 2.
            print("Já carimbada; rode --provar (sem --tarefa) pra prova final.")
        else:
            conexoes_caminho = destino / "credenciais" / "CONEXOES.md"
            conexoes_texto = (
                conexoes_caminho.read_text(encoding="utf-8") if conexoes_caminho.is_file() else ""
            )
            if banco_conectado(conexoes_texto):
                print(
                    f"Banco conectado (credenciais/CONEXOES.md): peça ao "
                    f"polozi-gerente-de-trabalho para fechar a TASK-{tarefa} (tabela tarefas) "
                    f"com o commit {hash_curto}. Arquivo local não foi alterado."
                )
            else:
                caminho_tarefa, conteudo_tarefa = fechar_tarefa(destino, tarefa, data, hash_curto)
                escrever_atomico(caminho_tarefa, conteudo_tarefa)
                print(
                    f"TASK-{tarefa} carimbada: {ROTULO_STATUS} {VALOR_CONCLUIDA}, "
                    f"{ROTULO_CONCLUIDA} {data}, {ROTULO_COMMIT} {hash_curto}."
                )
            print(
                "FALTA A PROVA FINAL: use a skill tecnologia-publicar pra commitar e empurrar o "
                "carimbo e rode --provar (sem --tarefa)."
            )
    else:
        print(frase_de_fecho(estado["tem_origin"], hash_curto))
    return 0


def tem_alteracao(plano: dict[str, Any]) -> bool:
    return any(
        [
            plano["trabalho"],
            plano["estado"],
            plano["proximo_marco"],
            plano["changelog"],
            plano["decisoes"],
            plano["pendencias_adicionar"],
            plano["pendencias_resolver"],
            plano["mapa_atualizacoes"],
            plano["plugins_instalados"],
            bool(plano["tarefa"]),
            any(plano["proxima_sessao"].values()),
        ]
    )


def preparar_alteracoes(
    destino: Path, plano: dict[str, Any], registro_em: str
) -> tuple[dict[Path, str], list[str]]:
    notas: list[str] = []
    if not tem_alteracao(plano):
        return {}, notas
    data = registro_em[:10]
    operacao = destino / "operacao"
    arquivos: dict[Path, str] = {}
    status = (operacao / "STATUS-ATUAL.md").read_text(encoding="utf-8")
    if plano["estado"]:
        status = substituir_bullet(status, "Estado:", plano["estado"])
    if plano["trabalho"]:
        status = substituir_bullet(status, "Último trabalho:", plano["trabalho"])
    status = substituir_bullet(status, "Atualizado em:", data)
    if plano["proximo_marco"]:
        status = substituir_bullet(status, "Próximo marco:", plano["proximo_marco"])
    arquivos[operacao / "STATUS-ATUAL.md"] = status.rstrip() + "\n"

    if plano["mapa_atualizacoes"]:
        mapa = (destino / "MAPA-DA-EMPRESA-IA.md").read_text(encoding="utf-8")
        arquivos[destino / "MAPA-DA-EMPRESA-IA.md"] = atualizar_mapa(
            mapa, destino, plano["mapa_atualizacoes"]
        )
    if plano["changelog"]:
        caminho = operacao / "CHANGELOG.md"
        changelog = caminho.read_text(encoding="utf-8").rstrip()
        for item in plano["changelog"]:
            entrada = f"- {data}: {item}"
            if entrada not in changelog:
                changelog += "\n\n" + entrada
        arquivos[caminho] = changelog + "\n"
    if plano["decisoes"]:
        caminho = operacao / "DECISOES.md"
        decisoes = caminho.read_text(encoding="utf-8").rstrip()
        for item in plano["decisoes"]:
            bloco = "\n".join(
                [
                    f"## {data} - {item['titulo']}",
                    "",
                    f"- Decisão: {item['decisao']}",
                    f"- Motivo: {item['motivo']}",
                    f"- Responsável pela aprovação: {item['responsavel']}",
                ]
            )
            if bloco not in decisoes:
                decisoes += "\n\n" + bloco
        arquivos[caminho] = decisoes + "\n"
    if plano["pendencias_adicionar"] or plano["pendencias_resolver"]:
        caminho = operacao / "PENDENCIAS.md"
        arquivos[caminho] = atualizar_pendencias(
            caminho.read_text(encoding="utf-8"),
            plano["pendencias_adicionar"],
            plano["pendencias_resolver"],
            data,
        )
    if any(plano["proxima_sessao"].values()):
        arquivos[operacao / "PROXIMA-SESSAO.md"] = renderizar_proxima(plano["proxima_sessao"])
    if plano["plugins_instalados"]:
        caminho = destino / "capacidades" / "PLUGINS.md"
        arquivos[caminho] = atualizar_plugins(
            caminho.read_text(encoding="utf-8"), plano["plugins_instalados"], data
        )
    if plano["tarefa"]:
        numero = plano["tarefa"]["numero"]
        notas.append(
            f"FALTA A PROVA: rode --provar --tarefa {numero} depois do commit e do push "
            "— --aplicar não fecha task."
        )
    return arquivos, notas


def escrever_atomico(caminho: Path, conteudo: str) -> None:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", newline="\n", dir=caminho.parent, delete=False
    ) as temporario:
        temporario.write(conteudo)
        nome_temporario = temporario.name
    try:
        os.replace(nome_temporario, caminho)
    except Exception:
        Path(nome_temporario).unlink(missing_ok=True)
        raise


def mostrar_previa(
    destino: Path, plano: dict[str, Any], arquivos: dict[Path, str], notas: list[str]
) -> None:
    print("PRÉVIA DE CONCLUSÃO DE TRABALHO")
    print(f"Destino: {destino}")
    print(f"Trabalho: {plano['trabalho'] or 'nenhuma alteração relevante'}")
    if plano["mapa_atualizacoes"]:
        print("Mapa:")
        for item in plano["mapa_atualizacoes"]:
            print(f"  - {item['papel']} -> {item['estado']}")
    if plano["pendencias_adicionar"]:
        print("Pendências a adicionar:")
        for item in plano["pendencias_adicionar"]:
            print(f"  - [{item['origem']}/{item['prioridade']}] {item['pendencia']}")
    if plano["pendencias_resolver"]:
        print("Pendências a resolver:")
        for item in plano["pendencias_resolver"]:
            print(f"  - {item}")
    if plano["tarefa"]:
        print(f"Tarefa: TASK-{plano['tarefa']['numero']}")
    for nota in notas:
        print(f"NOTA: {nota}")
    print("Arquivos que serão atualizados:")
    for caminho in arquivos:
        print(f"  + {caminho.relative_to(destino)}")


def main() -> int:
    args = argumentos()
    try:
        modos_escolhidos = [args.dry_run, args.aplicar, args.provar]
        if sum(1 for modo in modos_escolhidos if modo) != 1:
            raise ErroConclusao("Use exatamente uma opção: --dry-run, --aplicar ou --provar.")
        if args.tarefa and not args.provar:
            raise ErroConclusao("--tarefa só é válido junto com --provar.")
        if (args.dry_run or args.aplicar) and not args.plano:
            raise ErroConclusao("--plano é obrigatório com --dry-run ou --aplicar.")

        destino = Path(args.destino).expanduser().resolve()
        if not destino.is_dir():
            raise ErroConclusao(f"O destino não é uma pasta: {destino}")
        validar_empresa(destino)
        registro_em = validar_registro_em(args.registro_em)

        if args.provar:
            return modo_provar(destino, args.tarefa, registro_em)

        plano_caminho = Path(args.plano).expanduser().resolve()
        plano = normalizar_plano(carregar_plano(plano_caminho))
        arquivos, notas = preparar_alteracoes(destino, plano, registro_em)
        mostrar_previa(destino, plano, arquivos, notas)
        if not arquivos and not notas:
            print("NADA A ATUALIZAR: nenhuma alteração relevante foi informada.")
            return 0
        if args.dry_run:
            print("DRY-RUN: nenhuma alteração realizada.")
            return 0
        for caminho, conteudo in arquivos.items():
            escrever_atomico(caminho, conteudo)
        print(f"CONCLUÍDO: {len(arquivos)} arquivos operacionais atualizados.")
        return 0
    except RecusaProva as recusa:
        print(f"RECUSADO:\n{recusa}", file=sys.stderr)
        return 2
    except ErroConclusao as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 4
    except (OSError, UnicodeError) as erro:
        print(f"ERRO: falha de arquivo: {erro}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
