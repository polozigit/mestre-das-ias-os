#!/usr/bin/env python3
"""Aplica no AGENTS.md uma decisão já `aprovada` na tabela de DECISOES.md.

Uso:
  <interpretador> aplicar_regra.py --casa <PASTA> --id D-N [--dry-run]

Quem decide se a regra entra é este script, nunca o agente: qualquer guarda
reprovando é RECUSA, sem exceção manual (a SKILL.md proíbe editar o
AGENTS.md a mão pra "ajudar").

Passos: (1) acha a linha `id` na tabela entre `<!-- REGRAS:INICIO -->` /
`<!-- REGRAS:FIM -->` de `operacao/DECISOES.md`; (2) `status` diferente de
`aprovada` recusa (cobre `proposta` e `aplicada`); (3) monta o texto
candidato do AGENTS.md, inserindo `- <id>: <regra>` no fim do miolo entre os
MESMOS marcadores no AGENTS.md; (4) roda as guardas sobre o texto
CANDIDATO — teto de arquivo, teto da seção, seções obrigatórias, hash do
bloco `<!-- AGENTES:INICIO -->`/`<!-- AGENTES:FIM -->` inalterado; (5) só
então escreve o AGENTS.md e marca a linha da decisão como `aplicada`.

SEM `subprocess` — quem commita é sempre a skill `tecnologia-publicar`. Stdlib puro.

Códigos de saída: 0 ok; 2 recusa por status; 3 falha de arquivo; 4 erro de
entrada (id inexistente, marcadores ausentes); 5 recusa por guarda.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

TETO_ARQUIVO_BYTES = 12288
TETO_SECAO_REGRAS_BYTES = 1536

MARCADOR_INICIO = "<!-- REGRAS:INICIO -->"
MARCADOR_FIM = "<!-- REGRAS:FIM -->"
MARCADOR_AGENTES_INICIO = "<!-- AGENTES:INICIO -->"
MARCADOR_AGENTES_FIM = "<!-- AGENTES:FIM -->"

TITULO_SECAO_REGRAS = "## Regras aprovadas pelo dono"

# As 14 seções obrigatórias do AGENTS.md do modelo — MESMA lista do teste do
# modelo (tests/test_modelo_v3.py importa esta constante em vez de
# redigitá-la; guarda cruzada de drift entre as duas skills).
SECOES_OBRIGATORIAS = [
    "## Início de sessão (a IA verifica, o dono não pede)",
    "## Comandos da casa (o que o dono pode falar)",
    "## Seu time (quem chamar)",
    "## Quando delegar (e quando não)",
    "## Protocolo de qualquer tarefa",
    "## Ciclo de trabalho (ritmo, checkpoint, fechamento)",
    "## GitHub (você mantém; o dono nunca digita git)",
    "## Onde salvar o que você produziu",
    "## Conexões (MCP, API, serviço externo)",
    "## Limites",
    "## Território novo",
    "## Sistema (o Empresa OS e qualquer automação)",
    "## Modelos e esforço",
    "## Regras aprovadas pelo dono",
]


def _celulas_da_linha(linha: str) -> list[str]:
    """Divide uma linha de tabela Markdown em células, ignorando `|`
    escapado (`\\|`) — mesma convenção usada por `polozi-retrospectiva`."""
    interna = linha.strip()
    if interna.startswith("|"):
        interna = interna[1:]
    if interna.endswith("|"):
        interna = interna[:-1]
    return [c.strip() for c in re.split(r"(?<!\\)\|", interna)]


def _desescapar_pipe(texto: str) -> str:
    return texto.replace("\\|", "|")


def _extrair_bloco(texto: str, inicio_marcador: str, fim_marcador: str) -> tuple[str, str, str] | None:
    """(antes, miolo, depois) do bloco entre os marcadores, ou None se
    algum dos dois faltar."""
    if inicio_marcador not in texto or fim_marcador not in texto:
        return None
    antes, resto = texto.split(inicio_marcador, 1)
    miolo, depois = resto.split(fim_marcador, 1)
    return antes, miolo.strip("\n"), depois


def achar_linha_decisao(texto_decisoes: str, id_alvo: str) -> tuple[int, list[str]] | None:
    """Procura `id_alvo` na tabela entre os marcadores REGRAS de
    DECISOES.md. Retorna (índice da linha no arquivo INTEIRO, células) ou
    None se não achou."""
    bloco = _extrair_bloco(texto_decisoes, MARCADOR_INICIO, MARCADOR_FIM)
    if bloco is None:
        return None
    linhas_arquivo = texto_decisoes.splitlines()
    for indice, linha in enumerate(linhas_arquivo):
        if not linha.strip().startswith("|"):
            continue
        celulas = _celulas_da_linha(linha)
        if not celulas or celulas[0].lower() in ("id", "---") or celulas[0].startswith("---"):
            continue
        if celulas[0] == id_alvo:
            return indice, celulas
    return None


def hash_agentes(texto: str) -> str | None:
    inicio = texto.find(MARCADOR_AGENTES_INICIO)
    fim = texto.find(MARCADOR_AGENTES_FIM)
    if inicio == -1 or fim == -1:
        return None
    miolo = texto[inicio:fim]
    return hashlib.sha256(miolo.encode("utf-8")).hexdigest()


def montar_agents_md_novo(antes: str, miolo: str, depois: str) -> str:
    return f"{antes}{MARCADOR_INICIO}\n{miolo}\n{MARCADOR_FIM}{depois}"


def guardas_da_insercao(texto_atual: str, texto_novo: str) -> str | None:
    """Roda as 4 guardas sobre o texto CANDIDATO, nesta ordem, e devolve a
    mensagem de recusa (str) ou None se tudo passou. Extraída à parte pra
    ser testável direto (sem precisar montar uma Casa inteira) — cada
    guarda isolada da vizinha, nunca uma escondendo a outra."""
    if len(texto_novo.encode("utf-8")) > TETO_ARQUIVO_BYTES:
        return f"arquivo passaria de {TETO_ARQUIVO_BYTES} B"

    if tamanho_secao(texto_novo, TITULO_SECAO_REGRAS) > TETO_SECAO_REGRAS_BYTES:
        return f"seção '{TITULO_SECAO_REGRAS}' passaria de {TETO_SECAO_REGRAS_BYTES} B"

    faltando = secoes_faltando(texto_novo)
    if faltando:
        return f"seção obrigatória ausente: {faltando}"

    if hash_agentes(texto_novo) != hash_agentes(texto_atual):
        return "bloco de agentes (tabela gerada) mudou"

    return None


def tamanho_secao(texto: str, titulo: str) -> int:
    """Bytes do bloco do título até a próxima `## ` (ou fim do arquivo) —
    mesma lógica usada por `test_modelo_v3.py` pra medir `## Conexões`."""
    inicio = texto.find(titulo)
    if inicio == -1:
        return 0
    resto = texto[inicio:]
    proximo_titulo = re.search(r"\n## ", resto[1:])
    bloco = resto[: proximo_titulo.start() + 1] if proximo_titulo else resto
    return len(bloco.encode("utf-8"))


def secoes_faltando(texto: str) -> list[str]:
    titulos_presentes = set(re.findall(r"^## .+$", texto, re.MULTILINE))
    return [t for t in SECOES_OBRIGATORIAS if t not in titulos_presentes]


def escrever_atomico(destino: Path, texto: str) -> None:
    tmp = destino.with_name(destino.name + ".tmp")
    tmp.write_text(texto, encoding="utf-8", newline="\n")
    tmp.replace(destino)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--casa", required=True, help="pasta da Empresa IA (Casa)")
    ap.add_argument("--id", required=True, dest="id_alvo", help="id da decisão, ex.: D-1")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    casa = Path(args.casa).expanduser()
    decisoes_path = casa / "operacao" / "DECISOES.md"
    agents_path = casa / "AGENTS.md"

    if not decisoes_path.is_file():
        print(f"ERRO: {decisoes_path} não encontrado.", file=sys.stderr)
        return 4
    if not agents_path.is_file():
        print(f"ERRO: {agents_path} não encontrado.", file=sys.stderr)
        return 4

    try:
        texto_decisoes = decisoes_path.read_text(encoding="utf-8")
        texto_atual = agents_path.read_text(encoding="utf-8")
    except OSError as erro:
        print(f"ERRO: falha de arquivo: {erro}", file=sys.stderr)
        return 3

    achado = achar_linha_decisao(texto_decisoes, args.id_alvo)
    if achado is None:
        print(f"ERRO: decisão {args.id_alvo} não encontrada em operacao/DECISOES.md.", file=sys.stderr)
        return 4
    indice_linha, celulas = achado
    if len(celulas) < 6:
        print(f"ERRO: linha de {args.id_alvo} não tem as 6 colunas esperadas.", file=sys.stderr)
        return 4
    _id, _decisao, _origem, status, regra, _registrada = celulas[:6]

    if status != "aprovada":
        print(
            f"RECUSADO: a decisão {args.id_alvo} está como '{status}'; o dono precisa aprovar antes.",
            file=sys.stderr,
        )
        return 2

    bloco_agents = _extrair_bloco(texto_atual, MARCADOR_INICIO, MARCADOR_FIM)
    if bloco_agents is None:
        print("ERRO: marcadores REGRAS ausentes no AGENTS.md.", file=sys.stderr)
        return 4
    antes, miolo_atual, depois = bloco_agents

    regra_limpa = _desescapar_pipe(regra)
    nova_linha = f"- {args.id_alvo}: {regra_limpa}"
    if miolo_atual:
        novo_miolo = miolo_atual + "\n" + nova_linha
    else:
        novo_miolo = nova_linha

    texto_novo = montar_agents_md_novo(antes, novo_miolo, depois)

    motivo_recusa = guardas_da_insercao(texto_atual, texto_novo)
    if motivo_recusa:
        print(f"RECUSADO POR GUARDA: {motivo_recusa}.", file=sys.stderr)
        return 5

    if args.dry_run:
        print("DRY-RUN — nada escrito. Prévia da seção de regras:")
        print(novo_miolo)
        return 0

    try:
        escrever_atomico(agents_path, texto_novo)
    except OSError as erro:
        print(f"ERRO: falha de arquivo: {erro}", file=sys.stderr)
        return 3

    linhas_decisoes = texto_decisoes.splitlines(keepends=True)
    linha_original = linhas_decisoes[indice_linha]
    quebra = "\n"
    if linha_original.endswith("\r\n"):
        quebra = "\r\n"
    sem_quebra = linha_original.rstrip("\r\n")
    celulas_novas = list(celulas)
    celulas_novas[3] = "aplicada"
    linha_nova = "| " + " | ".join(celulas_novas) + " |"
    linhas_decisoes[indice_linha] = linha_nova + quebra

    try:
        escrever_atomico(decisoes_path, "".join(linhas_decisoes))
    except OSError as erro:
        print(f"ERRO: falha de arquivo: {erro}", file=sys.stderr)
        return 3

    print(f"Regra {args.id_alvo} aplicada em {agents_path}. Use a skill tecnologia-publicar pra salvar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
