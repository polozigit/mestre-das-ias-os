#!/usr/bin/env python3
"""Confere uma ficha.json (ficha neutra do desenho) contra as regras do Native AI.

Uso: python3 check_ficha.py <ficha.json>
Saida: 1 linha "FALHA campo: motivo" por falha e exit 1; "OK" e exit 0 se passar.
O campo caminhos_permitidos (allowlist do construtor, C3) e conferido com a mesma
funcao que o trava_lote.py usa no check (validar_allowlist): a lista aprovada no gate 1
e a lista que a trava aplica.
So stdlib, sem rede, nao escreve nada.
"""
import datetime
import json
import re
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
# cache de bytecode numa pasta vazia: o __pycache__/ ao lado nunca e lido (C3)
_PYC_VAZIO = tempfile.TemporaryDirectory(prefix="native-ai-pyc-")
sys.pycache_prefix = _PYC_VAZIO.name
sys.path.insert(0, str(Path(__file__).resolve().parent))
from trava_lote import validar_allowlist  # noqa: E402
from w15 import TETO_AVALIADOR_MAXIMO, TETO_CONSTRUCAO_MAXIMO  # noqa: E402

FORMAS = ("prompt", "workflow", "agente", "multiagente")
MECANISMOS = ("skill", "subagente", "hook", "instrucao", "script")
RISCOS = ("baixo", "medio", "alto")

# Caminhos sempre humanos (espelha referencias/nunca.md). O construtor so escreve
# proposta em trechos/; trechos/AGENTS.md nao casa porque o caminho exige borda limpa.
_BORDA = r"(?<![\w/.\-])"
CAMINHOS_HUMANOS = [
    re.compile(_BORDA + r"AGENTS\.md"),
    re.compile(_BORDA + r"CLAUDE\.md"),
    re.compile(_BORDA + r"\.claude/settings[\w.\-]*\.json"),
    re.compile(_BORDA + r"\.codex/config\.toml"),
    re.compile(r"(?<!\w)hooks?(?!\w)", re.I),
    re.compile(_BORDA + r"\.github/workflows(/|\b)"),
    re.compile(_BORDA + r"supabase/migrations(/|\b)"),
]
HUMANOS = re.compile(r"dono|humano|caio|polozi|empres[aá]ri|s[oó]cio|respons[aá]vel|gestor|diretor", re.I)
# agente citado como quem decide ("o native-ai-avaliador decide sem o dono")
AGENTE_DECIDE = re.compile(r"(native-ai-[\w-]+|\b(sub)?agentes?)\s+((?!nunca|n[aã]o|jamais)\w+\s+){0,2}?"
                           r"(decide|aprova|assina|aceita|escolhe|autoriza|libera)", re.I)
NEGACAO = re.compile(r"\b(nunca|n[aã]o|proibid\w*|sem|jamais|somente leitura|s[oó] prop[oõ]e|s[oó] escreve proposta)\b", re.I)

OBRIG_TEXTO = ["processo", "resultado", "criterio_padrao", "forma", "padrao_orquestracao",
               "casos", "criterio_sucesso", "reabrir_quando", "data"]
CAMPOS_UNIDADE_TEXTO = ["nome", "papel", "objetivo", "formato_saida", "fronteira", "retorno"]


def texto_ok(v):
    return isinstance(v, str) and v.strip() != ""


def inteiro_positivo(v):
    return isinstance(v, int) and not isinstance(v, bool) and v > 0


def toca_caminho_humano(texto):
    return isinstance(texto, str) and any(p.search(texto) for p in CAMINHOS_HUMANOS)


def verificar(f):
    erros = []

    def falha(campo, motivo):
        erros.append((campo, motivo))

    if not isinstance(f, dict):
        return [("ficha", "a raiz precisa ser um objeto JSON")]

    for k in OBRIG_TEXTO:
        if k not in f:
            falha(k, "campo obrigatorio ausente")
        elif not texto_ok(f[k]):
            falha(k, "precisa ser texto nao vazio")

    forma = f.get("forma")
    if texto_ok(forma) and forma not in FORMAS:
        falha("forma", "precisa ser uma de " + "|".join(FORMAS))
    data = f.get("data")
    if texto_ok(data):
        try:
            datetime.date.fromisoformat(data)
        except ValueError:
            falha("data", "use AAAA-MM-DD")

    if "orcamento_tokens" not in f:
        falha("orcamento_tokens", "campo obrigatorio ausente")
    elif not inteiro_positivo(f["orcamento_tokens"]):
        falha("orcamento_tokens", "precisa ser inteiro maior que 0")

    # teto_construcao (C11): opcional; ausente, o w15 usa o padrao de 250k
    if "teto_construcao" in f:
        if not inteiro_positivo(f["teto_construcao"]):
            falha("teto_construcao", "precisa ser inteiro maior que 0 (ou fique fora da ficha)")
        elif f["teto_construcao"] > TETO_CONSTRUCAO_MAXIMO:
            falha("teto_construcao", f"maximo {TETO_CONSTRUCAO_MAXIMO} por tarefa de construcao; "
                  "acima disso, quebre a tarefa em duas")

    # teto_avaliador (C11 v1.2): opcional; fase ausente, o w15 usa o padrao (80k, 100k, 40k)
    if "teto_avaliador" in f:
        ta = f["teto_avaliador"]
        if not isinstance(ta, dict) or not ta:
            falha("teto_avaliador", "precisa ser objeto com criterio, casos e/ou parecer "
                  "(ou fique fora da ficha)")
        else:
            for fase in sorted(set(ta) - set(TETO_AVALIADOR_MAXIMO)):
                falha("teto_avaliador", f"fase desconhecida {fase!r}; use criterio, casos ou parecer")
            for fase, maximo in TETO_AVALIADOR_MAXIMO.items():
                if fase not in ta:
                    continue
                if not inteiro_positivo(ta[fase]):
                    falha("teto_avaliador", f"{fase} precisa ser inteiro maior que 0")
                elif ta[fase] > maximo:
                    falha("teto_avaliador", f"{fase}: maximo {maximo} por tarefa; "
                          "acima disso, quebre a tarefa em duas")

    # respostas_5: exatamente 5, cada uma com resposta e motivo
    r5 = f.get("respostas_5")
    if not isinstance(r5, list) or len(r5) != 5:
        falha("respostas_5", "precisa ter exatamente 5 respostas")
    if isinstance(r5, list):
        perguntas = []
        for i, r in enumerate(r5):
            if not isinstance(r, dict):
                falha(f"respostas_5[{i}]", "precisa ser objeto")
                continue
            p = r.get("pergunta")
            perguntas.append(p if inteiro_positivo(p) else None)
            for k in ("resposta", "motivo"):
                if not texto_ok(r.get(k)):
                    falha(f"respostas_5[{i}].{k}", "obrigatorio e nao vazio")
        if len(r5) == 5 and sorted(p if p is not None else -1 for p in perguntas) != [1, 2, 3, 4, 5]:
            falha("respostas_5", "perguntas precisam ser 1 a 5, uma vez cada")

    # prova_subida
    ps = f.get("prova_subida")
    if forma in ("agente", "multiagente"):
        if not isinstance(ps, dict):
            falha("prova_subida", f"forma {forma} exige prova de subida (objeto)")
    if isinstance(ps, dict):
        if not isinstance(ps.get("feita"), bool):
            falha("prova_subida.feita", "precisa ser true ou false")
        elif forma == "multiagente" and ps["feita"] is not True:
            falha("prova_subida.feita", "forma multiagente exige prova de subida feita")
        for k in ("degrau_baixo", "resultado", "julgado_por"):
            if k not in ps:
                falha(f"prova_subida.{k}", "campo obrigatorio ausente")
            elif not isinstance(ps[k], str):
                falha(f"prova_subida.{k}", "precisa ser texto")
            elif ps.get("feita") is True and not texto_ok(ps[k]):
                falha(f"prova_subida.{k}", "prova feita exige este campo preenchido")

    # unidades
    un = f.get("unidades")
    if not isinstance(un, list) or not un:
        falha("unidades", "precisa ser lista com ao menos 1 unidade")
    else:
        if forma == "multiagente" and len(un) < 2:
            falha("unidades", "forma multiagente exige 2 ou mais unidades")
        vistos = set()
        for i, u in enumerate(un):
            p = f"unidades[{i}]"
            if not isinstance(u, dict):
                falha(p, "precisa ser objeto")
                continue
            for k in CAMPOS_UNIDADE_TEXTO:
                if k not in u:
                    falha(f"{p}.{k}", "campo obrigatorio ausente")
                elif not texto_ok(u[k]):
                    falha(f"{p}.{k}", "precisa ser texto nao vazio" if k != "fronteira"
                          else "unidade sem fronteira")
            if texto_ok(u.get("nome")):
                if u["nome"] in vistos:
                    falha(f"{p}.nome", "nome repetido")
                vistos.add(u["nome"])
            if "forma" not in u:
                falha(f"{p}.forma", "campo obrigatorio ausente")
            elif u["forma"] not in FORMAS:
                falha(f"{p}.forma", "precisa ser uma de " + "|".join(FORMAS))
            if "reusavel" not in u:
                falha(f"{p}.reusavel", "campo obrigatorio ausente")
            elif not isinstance(u["reusavel"], bool):
                falha(f"{p}.reusavel", "precisa ser true ou false")
            if "mecanismo" not in u:
                falha(f"{p}.mecanismo", "campo obrigatorio ausente")
            elif u["mecanismo"] not in MECANISMOS:
                falha(f"{p}.mecanismo", "precisa ser um de " + "|".join(MECANISMOS))
            if "ferramentas" not in u:
                falha(f"{p}.ferramentas", "campo obrigatorio ausente")
            elif not isinstance(u["ferramentas"], list) or not all(texto_ok(x) for x in u["ferramentas"]):
                falha(f"{p}.ferramentas", "precisa ser lista de textos")
            fr = u.get("fronteira")
            if texto_ok(fr) and toca_caminho_humano(fr) and not NEGACAO.search(fr):
                falha(f"{p}.fronteira", "fronteira toca caminho sempre humano; so proposta em trechos/")

    # laco
    laco = f.get("laco")
    if "laco" not in f:
        falha("laco", "campo obrigatorio ausente (use null se nao houver laco)")
    elif laco is not None:
        if not isinstance(laco, dict):
            falha("laco", "precisa ser objeto ou null")
        else:
            c = laco.get("criterio")
            if not isinstance(c, list) or not c or not all(texto_ok(x) for x in c):
                falha("laco.criterio", "precisa ser lista nao vazia de itens binarios")
            for k in ("tipo", "revisor", "parada_padrao", "escalonamento"):
                if not texto_ok(laco.get(k)):
                    falha(f"laco.{k}", "obrigatorio e nao vazio")
            for k in ("teto_iteracoes", "teto_tokens"):
                if not inteiro_positivo(laco.get(k)):
                    falha(f"laco.{k}", "laco exige inteiro maior que 0")

    # acoes
    ac = f.get("acoes")
    if not isinstance(ac, list) or not ac:
        falha("acoes", "precisa ser lista nao vazia")
    else:
        for i, a in enumerate(ac):
            p = f"acoes[{i}]"
            if not isinstance(a, dict):
                falha(p, "precisa ser objeto")
                continue
            if not texto_ok(a.get("acao")):
                falha(f"{p}.acao", "obrigatorio e nao vazio")
            risco = a.get("risco")
            if risco not in RISCOS:
                falha(f"{p}.risco", "precisa ser " + "|".join(RISCOS))
            mec = a.get("mecanismo")
            if mec not in MECANISMOS:
                falha(f"{p}.mecanismo", "precisa ser um de " + "|".join(MECANISMOS))
            quem = a.get("quem_aprova")
            if not isinstance(quem, str):
                falha(f"{p}.quem_aprova", "campo obrigatorio ausente")
            humano = isinstance(quem, str) and bool(HUMANOS.search(quem))
            humano_na_ficha = toca_caminho_humano(a.get("acao"))
            if risco == "alto" or humano_na_ficha:
                if not humano:
                    falha(f"{p}.quem_aprova", "risco alto ou caminho sempre humano exige aprovador humano")
                if mec == "instrucao":
                    falha(f"{p}.mecanismo", "risco alto ou caminho sempre humano nao pode ser so instrucao")
            if humano_na_ficha and risco != "alto":
                falha(f"{p}.risco", "acao em caminho sempre humano precisa ser risco alto")

    # caminhos_permitidos (C3): allowlist do construtor, a mesma que a trava aplica
    cp = f.get("caminhos_permitidos")
    if "caminhos_permitidos" not in f:
        falha("caminhos_permitidos", "campo obrigatorio ausente (allowlist do construtor)")
    elif not isinstance(cp, list) or not all(isinstance(x, str) for x in cp):
        falha("caminhos_permitidos", "precisa ser lista de caminhos (texto)")
    else:
        for problema in validar_allowlist(cp):
            falha("caminhos_permitidos", problema)

    # nunca
    nv = f.get("nunca")
    if not isinstance(nv, list) or not nv:
        falha("nunca", "precisa ser lista nao vazia")
    else:
        for i, n in enumerate(nv):
            if not isinstance(n, dict):
                falha(f"nunca[{i}]", "precisa ser objeto")
                continue
            for k in ("item", "onde_humano_decide"):
                if not texto_ok(n.get(k)):
                    falha(f"nunca[{i}].{k}", "obrigatorio e nao vazio")
            onde = n.get("onde_humano_decide")
            if texto_ok(onde) and (not HUMANOS.search(onde) or AGENTE_DECIDE.search(onde)):
                falha(f"nunca[{i}].onde_humano_decide", "precisa nomear o humano que decide "
                      "(dono, CAIO, responsavel...); agente nunca decide item do NUNCA")

    # modelos
    md = f.get("modelos")
    if not isinstance(md, list) or not md:
        falha("modelos", "precisa ser lista nao vazia")
    else:
        for i, m in enumerate(md):
            if not isinstance(m, dict):
                falha(f"modelos[{i}]", "precisa ser objeto")
                continue
            for k in ("unidade", "modelo", "esforco"):
                if not texto_ok(m.get(k)):
                    falha(f"modelos[{i}].{k}", "obrigatorio e nao vazio")

    return erros


def main(argv):
    if len(argv) != 2:
        print("FALHA uso: python3 check_ficha.py <ficha.json>")
        return 1
    try:
        with open(argv[1], encoding="utf-8") as fh:
            ficha = json.load(fh)
    except OSError as e:
        print(f"FALHA arquivo: nao consegui ler ({e.strerror})")
        return 1
    except json.JSONDecodeError as e:
        print(f"FALHA json: invalido ({e.msg} na linha {e.lineno})")
        return 1
    erros = verificar(ficha)
    if not erros:
        print("OK")
        return 0
    for campo, motivo in erros:
        print(f"FALHA {campo}: {motivo}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
