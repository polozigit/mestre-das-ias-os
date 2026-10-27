"""Testes de DOCUMENTO dos workflows do .github/ do kit (não executam nada
na nuvem, só leem o texto do disco). Guardas G1-G10 da spec
e1-workflows-github.spec.json, + G11 (TEMPLATE_DEV nunca no kit).

DESVIO registrado (ver relatório do construtor): a spec pedia
`yaml.safe_load`. PyYAML não está instalado neste ambiente e instalar via
pip exigiria `--break-system-packages` (efeito colateral na máquina,
fora do escopo desta spec). Os 2 workflows + dependabot.yml são simples o
bastante para checar por texto/regex de forma determinística — cada guarda
abaixo replica exatamente o que a spec descreve, sem depender de parser YAML.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
WORKFLOWS_DIR = RAIZ / ".github" / "workflows"
DEPENDABOT = RAIZ / ".github" / "dependabot.yml"

DEPLOY_DB = WORKFLOWS_DIR / "deploy-db.yml"
DEPLOY_DB_HOMOLOG = WORKFLOWS_DIR / "deploy-db-homologacao.yml"

# Decisão 26/10/2026: só os dois workflows que aplicam migration ficam no
# GitHub Actions; lint, tsc, testes, banco local e segredo rodam no computador
# do dono (tecnologia-publicar, checar_local.py).
TODOS_WORKFLOWS = [DEPLOY_DB, DEPLOY_DB_HOMOLOG]

SECRETS_DEPLOY = {"SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_ID"}
SECRETS_HOMOLOG = {"SUPABASE_PROJECT_ID_HOMOLOG", "SUPABASE_DB_PASSWORD_HOMOLOG"}


def _texto(path: Path) -> str:
    assert path.exists(), f"arquivo esperado não existe: {path}"
    return path.read_text(encoding="utf-8")


def _texto_sem_comentarios(path: Path) -> str:
    """Mesmo texto, mas sem linhas de comentário (`# ...`) — os comentários em
    português deste kit EXPLICAM guardas ("nunca defina TEMPLATE_DEV aqui",
    "o desenho morto usava projects api-keys") e citam literalmente o que é
    proibido; checar o texto bruto faria a própria explicação falhar a
    guarda que ela documenta."""
    linhas = [l for l in _texto(path).splitlines() if not l.strip().startswith("#")]
    return "\n".join(linhas)


def _run_bodies(texto: str) -> list[str]:
    """Extrai o corpo de todo passo `run:` (linha única ou bloco `|`/`>`)."""
    linhas = texto.splitlines()
    corpos: list[str] = []
    i = 0
    while i < len(linhas):
        linha = linhas[i]
        # aceita tanto "  run: ..." (chave de passo multi-linha) quanto
        # "- run: ..." (passo de uma linha só, o caso mais comum no kit)
        m = re.match(r"^(\s*)(?:-\s*)?run:\s*(.*)$", linha)
        if m:
            indent = len(m.group(1))
            resto = m.group(2).strip()
            if resto and resto not in ("|", ">", "|-", ">-"):
                corpos.append(resto)
                i += 1
                continue
            i += 1
            bloco = []
            while i < len(linhas) and (
                linhas[i].strip() == "" or (len(linhas[i]) - len(linhas[i].lstrip())) > indent
            ):
                bloco.append(linhas[i])
                i += 1
            corpos.append("\n".join(bloco))
            continue
        i += 1
    return corpos


def _job(texto: str, nome: str) -> str:
    """Corpo do job `nome` (do `  nome:` ao próximo job de mesmo nível ou ao fim)."""
    m = re.search(rf"(?ms)^  {re.escape(nome)}:\s*\n(.*?)(?=^  \S|^\S|\Z)", texto)
    assert m, f"sem o job `{nome}`"
    return m.group(1)


def _sem_job(texto: str, nome: str) -> str:
    """Texto sem o corpo do job `nome` (a linha `  nome:` e o que é mais indentado ou vazio)."""
    return re.sub(rf"(?m)^  {re.escape(nome)}:\n(?:(?: {{4,}}.*)?\n)*", "", texto)


def _secrets_usados(texto: str) -> set[str]:
    return set(re.findall(r"secrets\.([A-Z0-9_]+)", texto))


def _uses_lines(texto: str) -> list[tuple[str, str]]:
    return re.findall(r"uses:\s*([\w./-]+)@([\w.\-]+)", texto)


# ---------------------------------------------------------------------------
# G1
# ---------------------------------------------------------------------------


def test_nenhum_push_sem_filtro_de_branch_e_paths():
    for wf in TODOS_WORKFLOWS:
        texto = _texto(wf)
        tem_push = re.search(r"(?m)^\s*push:\s*$", texto) is not None
        if wf != DEPLOY_DB:
            assert not tem_push, f"{wf.name} tem gatilho push (só deploy-db.yml pode ter)"
            continue
        assert tem_push, "deploy-db.yml precisa do gatilho push"
        # bloco do push: da linha "push:" até a próxima chave do mesmo nível (2 espaços)
        m = re.search(r"(?ms)^\s{2}push:\s*\n((?:^\s{4,}.*\n?)*)", texto)
        assert m, "não achei o corpo do bloco push: em deploy-db.yml"
        corpo = m.group(1)
        assert "branches:" in corpo and "[main]" in corpo, (
            "push de deploy-db.yml precisa filtrar branches: [main]"
        )
        assert "'**'" not in corpo and '"**"' not in corpo and "[main]" == re.search(
            r"branches:\s*(\[[^\]]*\])", corpo
        ).group(1), "branches do push não pode virar coringa"
        assert "paths:" in corpo, "push de deploy-db.yml precisa filtrar paths"


# ---------------------------------------------------------------------------
# G2
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# G3
# ---------------------------------------------------------------------------


def test_deploy_db_usa_exatamente_os_tres_secrets():
    texto = _texto(DEPLOY_DB)
    assert _secrets_usados(texto) == SECRETS_DEPLOY, (
        f"deploy-db.yml deveria usar exatamente {SECRETS_DEPLOY}, achei {_secrets_usados(texto)}"
    )


# ---------------------------------------------------------------------------
# G4
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# G5
# ---------------------------------------------------------------------------


def test_nenhum_run_interpola_secrets():
    for wf in TODOS_WORKFLOWS:
        texto = _texto(wf)
        for corpo in _run_bodies(texto):
            assert "secrets." not in corpo, (
                f"{wf.name} interpola secrets. dentro de um passo run: (segredo só entra via env:)\n{corpo}"
            )


# ---------------------------------------------------------------------------
# G6
# ---------------------------------------------------------------------------


def test_working_directory_e_sempre_sistemas_empresa_os():
    for wf in TODOS_WORKFLOWS:
        # O job `vereditos` é a única exceção: o veredito mora na raiz da Casa (G19).
        texto = _sem_job(_texto(wf), "vereditos")
        valores = re.findall(r"working-directory:\s*(\S+)", texto)
        assert valores, f"{wf.name} não declara defaults.run.working-directory"
        for v in valores:
            assert v == "sistemas/empresa-os", (
                f"{wf.name} tem working-directory diferente de sistemas/empresa-os: {v}"
            )


# ---------------------------------------------------------------------------
# G7
# ---------------------------------------------------------------------------


def test_actionlint_sem_erro():
    binario = shutil.which("actionlint")
    if binario is None:
        pytest.skip("actionlint ausente nesta máquina")
    arquivos = [str(p) for p in TODOS_WORKFLOWS]
    resultado = subprocess.run(
        [binario, "-no-color", *arquivos],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    assert resultado.returncode == 0, (
        f"actionlint encontrou erro:\nstdout:\n{resultado.stdout}\nstderr:\n{resultado.stderr}"
    )


# ---------------------------------------------------------------------------
# G8
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# G9
# ---------------------------------------------------------------------------


def test_permissions_contents_read_em_todos():
    for wf in TODOS_WORKFLOWS:
        texto = _texto(wf)
        assert re.search(r"(?m)^permissions:\s*\n\s*contents:\s*read\s*$", texto), (
            f"{wf.name} não declara permissions: contents: read no topo"
        )


# ---------------------------------------------------------------------------
# G10
# ---------------------------------------------------------------------------


def test_actions_pinadas_por_major():
    for wf in TODOS_WORKFLOWS:
        texto = _texto(wf)
        for nome, versao in _uses_lines(texto):
            assert re.match(r"^v\d", versao), (
                f"{wf.name}: {nome}@{versao} não está pinado por major (nada de @main/@master/@latest/SHA solto)"
            )


# ---------------------------------------------------------------------------
# G12 — CLI do Supabase em versão EXATA e IGUAL em todos os workflows.
# "latest" quebrou o CI do aluno em 08/10/2026 (imagem nova do Postgres local
# e formato novo do `gen types`) sem ele ter mudado nada.
# ---------------------------------------------------------------------------


def test_cli_supabase_pinada_na_mesma_versao_exata():
    versoes: dict[str, str] = {}
    for wf in TODOS_WORKFLOWS:
        texto = _texto_sem_comentarios(wf)
        for m in re.finditer(r"uses:\s*supabase/setup-cli@\S+\s*\n\s*with:\s*\n\s*version:\s*(\S+)", texto):
            versao = m.group(1).strip("\"'")
            assert re.fullmatch(r"\d+\.\d+\.\d+", versao), (
                f"{wf.name}: setup-cli com version: {versao} (precisa versão exata X.Y.Z, nunca latest)"
            )
            versoes[f"{wf.name}:{m.start()}"] = versao
        n_setup = len(re.findall(r"uses:\s*supabase/setup-cli@", texto))
        n_com_versao = sum(1 for k in versoes if k.startswith(f"{wf.name}:"))
        assert n_setup == n_com_versao, f"{wf.name}: setup-cli sem version: logo abaixo"
    assert versoes, "nenhum workflow usa supabase/setup-cli"
    assert len(set(versoes.values())) == 1, f"versões da CLI divergem entre workflows: {sorted(set(versoes.values()))}"


# ---------------------------------------------------------------------------
# G11 — TEMPLATE_DEV nunca pode entrar no kit que viaja pro aluno.
# ---------------------------------------------------------------------------


def test_nenhum_workflow_define_template_dev():
    for wf in TODOS_WORKFLOWS:
        texto_codigo = _texto_sem_comentarios(wf)
        assert "TEMPLATE_DEV" not in texto_codigo, (
            f"{wf.name} define TEMPLATE_DEV fora de comentário — isso mata a guarda de "
            "'identidade preenchida' no repo do aluno (LEIA-ME passo 3). TEMPLATE_DEV só "
            "existe no CI interno da Polozi."
        )


# ---------------------------------------------------------------------------
# dependabot.yml
# ---------------------------------------------------------------------------


def test_dependabot_existe_e_aponta_pro_sistema():
    texto = _texto(DEPENDABOT)
    assert 'directory: "/sistemas/empresa-os"' in texto
    assert "package-ecosystem: \"npm\"" in texto
    assert "package-ecosystem: \"github-actions\"" in texto


# ---------------------------------------------------------------------------
# G18 — homologacao nunca escreve em producao; producao nunca recebe seed (E3-12).
# ---------------------------------------------------------------------------


def test_homologacao_nunca_escreve_em_producao():
    texto = _texto(DEPLOY_DB_HOMOLOG)
    assert _secrets_usados(texto) == {
        "SUPABASE_ACCESS_TOKEN",
        "SUPABASE_DB_PASSWORD_HOMOLOG",
        "SUPABASE_PROJECT_ID_HOMOLOG",
        "SUPABASE_PROJECT_ID",
    }, f"deploy-db-homologacao.yml usa secrets fora do combinado: {_secrets_usados(texto)}"
    codigo = _texto_sem_comentarios(DEPLOY_DB_HOMOLOG)
    assert '[ -z "$SUPABASE_PROJECT_ID_HOMOLOG" ]' in codigo, "falta o passo que falha se a homologacao estiver vazia"
    assert '[ "$SUPABASE_PROJECT_ID_HOMOLOG" = "$SUPABASE_PROJECT_ID" ]' in codigo, (
        "falta o passo que falha se a homologacao for igual a producao"
    )
    i_confere = codigo.index('[ "$SUPABASE_PROJECT_ID_HOMOLOG" = "$SUPABASE_PROJECT_ID" ]')
    i_link = codigo.index("supabase link")
    assert i_confere < i_link, "a conferencia de ref tem que vir ANTES do supabase link"
    assert 'supabase link --project-ref "$SUPABASE_PROJECT_ID_HOMOLOG"' in codigo
    assert 'link --project-ref "$SUPABASE_PROJECT_ID"' not in codigo.replace(
        'link --project-ref "$SUPABASE_PROJECT_ID_HOMOLOG"', ""
    ), "a homologacao nunca faz link com o projeto de producao"


def test_producao_nunca_recebe_seed():
    codigo = _texto_sem_comentarios(DEPLOY_DB)
    assert "--include-seed" not in codigo, "deploy-db.yml (producao) nunca usa --include-seed"


# ---------------------------------------------------------------------------
# G19 — toda migration nova ou alterada tem veredito antes de chegar no banco.
# O hook de commit da Casa dá pra contornar; o job `vereditos` fecha a lacuna
# na homologação (PR) e na produção (push na main), e o job que aplica espera
# por ele (needs).
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("wf", TODOS_WORKFLOWS, ids=lambda p: p.name)
def test_vereditos_confere_toda_migration_nova_ou_alterada(wf):
    job = _job(_texto_sem_comentarios(wf), "vereditos")
    assert "fetch-depth: 0" in job, "sem histórico completo o diff não existe"
    assert ".agents/skills/tecnologia-mudar-banco/scripts/veredito.py" in job
    assert 'python3 "$VER" conferir "$f"' in job, "o job tem de rodar veredito.py conferir em cada migration"
    assert "--no-renames" in job, "sem isso migration renomeada sairia como R e escaparia do filtro"
    assert "--diff-filter=ACM" in job
    assert "'sistemas/*/supabase/migrations/*.sql'" in job
    assert "|| falhou=1" in job and 'if [ "$falhou" != "0" ]' in job, "veredito inválido tem de derrubar o job"
    i_falta = job.index('if [ ! -f "$VER" ]')
    assert "exit 1" in job[i_falta:job.index("fi", i_falta)], "sem o veredito.py o job precisa falhar, não passar calado"


@pytest.mark.parametrize("wf", TODOS_WORKFLOWS, ids=lambda p: p.name)
def test_vereditos_sem_expressao_do_github_dentro_do_script(wf):
    job = _job(_texto_sem_comentarios(wf), "vereditos")
    corpos = _run_bodies(job)
    assert corpos, "o job vereditos não tem passo run"
    for corpo in corpos:
        assert "${{" not in corpo, f"expressão do GitHub dentro do script (injeção pelo nome da branch):\n{corpo}"
    assert re.findall(r"working-directory:\s*(\S+)", job) == ["."], "vereditos roda da raiz da Casa"


@pytest.mark.parametrize("wf,aplica", [(DEPLOY_DB, "migrar"), (DEPLOY_DB_HOMOLOG, "homologar")], ids=["producao", "homologacao"])
def test_job_que_aplica_espera_os_vereditos(wf, aplica):
    job = _job(_texto_sem_comentarios(wf), aplica)
    assert re.search(r"(?m)^    needs:\s*vereditos\s*$", job), f"{wf.name}: `{aplica}` precisa de needs: vereditos"


def test_homologacao_compara_com_a_base_da_pr_e_producao_com_o_envio_anterior():
    homolog = _job(_texto_sem_comentarios(DEPLOY_DB_HOMOLOG), "vereditos")
    assert "BASE_REF: ${{ github.base_ref }}" in homolog
    assert '"origin/$BASE_REF...HEAD"' in homolog
    producao = _job(_texto_sem_comentarios(DEPLOY_DB), "vereditos")
    assert "ANTES: ${{ github.event.before }}" in producao
    assert '"$ANTES" HEAD' in producao


# ---------------------------------------------------------------------------
# G22 — cota grátis: nenhum workflow novo entra no kit sem decisão (26/10/2026).
# ---------------------------------------------------------------------------


def test_so_os_dois_workflows_de_migration_existem():
    achados = sorted(p.name for p in WORKFLOWS_DIR.glob("*.y*ml"))
    assert achados == ["deploy-db-homologacao.yml", "deploy-db.yml"], (
        f"workflow fora do combinado no kit: {achados}. A checagem roda local (checar_local.py); "
        "workflow novo gasta a cota grátis do GitHub Actions do aluno."
    )
