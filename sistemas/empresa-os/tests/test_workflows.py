"""Testes de DOCUMENTO dos workflows do .github/ do kit (não executam nada
na nuvem, só leem o texto do disco). Guardas G1-G10 da spec
e1-workflows-github.spec.json, + G11 (TEMPLATE_DEV nunca no kit).

DESVIO registrado (ver relatório do construtor): a spec pedia
`yaml.safe_load`. PyYAML não está instalado neste ambiente e instalar via
pip exigiria `--break-system-packages` (efeito colateral na máquina,
fora do escopo desta spec). Os 4 workflows + dependabot.yml são simples o
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

CI = WORKFLOWS_DIR / "ci.yml"
DEPLOY_DB = WORKFLOWS_DIR / "deploy-db.yml"
GITLEAKS = WORKFLOWS_DIR / "gitleaks.yml"
KEEP_ALIVE = WORKFLOWS_DIR / "keep-alive.yml"
DEPLOY_DB_HOMOLOG = WORKFLOWS_DIR / "deploy-db-homologacao.yml"
BACKUP_DB = WORKFLOWS_DIR / "backup-db.yml"

TODOS_WORKFLOWS = [CI, DEPLOY_DB, GITLEAKS, KEEP_ALIVE, DEPLOY_DB_HOMOLOG, BACKUP_DB]

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


def test_ci_tem_os_quatro_comandos_e_o_diff_de_tipos():
    texto = _texto(CI)
    for comando in ("npm ci", "npm run lint", "npx tsc --noEmit", "npm test"):
        assert comando in texto, f"ci.yml não roda '{comando}'"
    assert "git diff --exit-code src/types/supabase.gen.ts" in texto, (
        "ci.yml não fecha o contrato de tipos (git diff --exit-code do supabase.gen.ts)"
    )


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


def test_gitleaks_sem_push_e_com_historico_completo():
    texto = _texto(GITLEAKS)
    assert re.search(r"(?m)^\s*push:\s*$", texto) is None, "gitleaks.yml nunca pode ter gatilho push"
    assert "fetch-depth: 0" in texto, "gitleaks.yml precisa de fetch-depth: 0 (varredura é de commits)"


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
        texto = _texto(wf)
        if wf == GITLEAKS:
            # Varre o repositório inteiro com o .gitleaks.toml da raiz da Casa (#1445): não tem
            # working-directory. Este teste não rodava no CI e ficou vermelho desde então.
            assert not re.findall(r"working-directory:", _texto_sem_comentarios(wf)), (
                "gitleaks.yml varre a raiz da Casa: não declare working-directory nele"
            )
            continue
        if wf == CI:
            # O job `vereditos` é a única exceção: o veredito mora na raiz da Casa (G19).
            texto = _sem_job(texto, "vereditos")
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


def test_keep_alive_tem_schedule_e_nao_faz_parsing_de_api_keys():
    texto = _texto(KEEP_ALIVE)
    assert re.search(r"(?m)^\s*schedule:\s*$", texto), "keep-alive.yml precisa do gatilho schedule"
    assert _secrets_usados(texto) == SECRETS_DEPLOY | SECRETS_HOMOLOG, (
        f"keep-alive.yml deveria usar exatamente {SECRETS_DEPLOY | SECRETS_HOMOLOG}, achei {_secrets_usados(texto)}"
    )
    assert re.search(r"(?m)^  homologacao:\s*$", texto), "keep-alive.yml precisa do 2o job `homologacao` (cada projeto Free pausa sozinho)"
    texto_codigo = _texto_sem_comentarios(KEEP_ALIVE)
    for proibido in ("projects api-keys", "jq ", "curl "):
        assert proibido not in texto_codigo, (
            f"keep-alive.yml voltou a usar '{proibido}' fora de comentário (desenho morto por n52)"
        )


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
# G17 — CI do banco na ordem certa e nunca contra projeto ligado (E3-14).
# ---------------------------------------------------------------------------


def _job_banco(texto: str) -> str:
    # Para no próximo job (G19 acrescentou `vereditos` depois dele), não só no fim do arquivo.
    m = re.search(r"(?ms)^  banco:\s*\n(.*?)(?=^  \S|^\S|\Z)", texto)
    assert m, "ci.yml sem o job `banco` (Deployment Checks amarra pelo nome)"
    return m.group(1)


def test_ci_banco_seed_antes_da_rodada_2_e_pgtap_local():
    banco = _job_banco(_texto_sem_comentarios(CI))
    i_start = banco.index("supabase db start")
    i_seed = banco.index("supabase/seed_exemplo.sql")
    i_loop = banco.index("for f in supabase/migrations/*.sql")
    i_test = banco.index("supabase test db")
    assert i_start < i_seed < i_loop < i_test, (
        "ordem do job banco: supabase db start -> seed_exemplo.sql -> rodada 2 das migrations -> supabase test db"
    )
    assert "supabase test db --local supabase/tests" in banco, "pgTAP: caminho EXPLICITO e --local"
    assert "--linked" not in banco, "o job banco nunca pode rodar contra projeto ligado (--linked)"


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
# G19 — toda migration da PR tem veredito (job `vereditos` do ci.yml).
# O hook de commit da Casa dá pra contornar; este job fecha a lacuna na PR.
# ---------------------------------------------------------------------------


def test_ci_vereditos_confere_toda_migration_nova_ou_alterada_da_pr():
    job = _job(_texto_sem_comentarios(CI), "vereditos")
    assert "fetch-depth: 0" in job, "sem histórico completo o diff contra a base não existe"
    assert ".agents/skills/tecnologia-mudar-banco/scripts/veredito.py" in job
    assert 'python3 "$VER" conferir "$f"' in job, "o job tem de rodar veredito.py conferir em cada migration"
    assert "--no-renames" in job, "sem isso migration renomeada sairia como R e escaparia do filtro"
    assert "--diff-filter=ACM" in job
    assert "'sistemas/*/supabase/migrations/*.sql'" in job
    assert "|| falhou=1" in job and 'if [ "$falhou" != "0" ]' in job, "veredito inválido tem de derrubar o job"


def test_ci_vereditos_sem_o_script_do_time_falha_antes_de_decidir_que_nao_ha_pr():
    job = _job(_texto_sem_comentarios(CI), "vereditos")
    i_falta = job.index('if [ ! -f "$VER" ]')
    i_sem_pr = job.index('if [ -z "$BASE_REF" ]')
    i_fetch = job.index("fetch --no-tags origin")
    assert i_falta < i_sem_pr < i_fetch
    assert "exit 1" in job[i_falta:i_sem_pr], "sem o veredito.py o job precisa falhar, não passar calado"
    assert "exit 0" in job[i_sem_pr:i_fetch], "execução manual (sem PR) não tem o que conferir"


def test_ci_vereditos_nome_da_branch_vai_por_env_e_nunca_dentro_do_script():
    job = _job(_texto_sem_comentarios(CI), "vereditos")
    assert "BASE_REF: ${{ github.base_ref }}" in job
    corpos = _run_bodies(job)
    assert corpos, "o job vereditos não tem passo run"
    for corpo in corpos:
        assert "${{" not in corpo, f"expressão do GitHub dentro do script (injeção pelo nome da branch):\n{corpo}"


def test_ci_vereditos_e_o_unico_job_que_roda_fora_de_sistemas_empresa_os():
    texto = _texto_sem_comentarios(CI)
    assert re.findall(r"working-directory:\s*(\S+)", _job(texto, "vereditos")) == ["."]
    assert set(re.findall(r"working-directory:\s*(\S+)", _sem_job(texto, "vereditos"))) == {"sistemas/empresa-os"}


# ---------------------------------------------------------------------------
# G20 — backup do banco de produção por Action (backup-db.yml).
# ---------------------------------------------------------------------------


def test_backup_so_segue_com_repositorio_privado_antes_de_qualquer_outro_passo():
    codigo = _texto_sem_comentarios(BACKUP_DB)
    i_privado = codigo.index("--jq .private")
    assert i_privado < codigo.index("actions/checkout") < codigo.index("supabase link") < codigo.index("supabase db dump"), (
        "a checagem de repositório privado tem de vir antes do checkout, do link e do dump"
    )
    trecho = codigo[i_privado: codigo.index("actions/checkout")]
    assert '[ "$privado" != "true" ]' in trecho and "exit 1" in trecho, "repositório público tem de falhar o job"


def test_backup_usa_exatamente_os_tres_secrets_e_o_environment_producao():
    texto = _texto(BACKUP_DB)
    assert _secrets_usados(texto) == SECRETS_DEPLOY
    assert re.search(r"(?m)^    environment: producao\s*$", texto), "backup-db.yml precisa do environment: producao"


def test_backup_nao_roda_em_pull_request_e_tem_os_tres_gatilhos_certos():
    codigo = _texto_sem_comentarios(BACKUP_DB)
    for gatilho in ("workflow_dispatch:", "schedule:", "workflow_call:"):
        assert gatilho in codigo, f"backup-db.yml sem {gatilho}"
    for proibido in ("pull_request", "pull_request_target", "push:"):
        assert proibido not in codigo, f"backup-db.yml não pode rodar em {proibido} (a PR enxergaria os secrets)"


def test_backup_nunca_imprime_nem_passa_a_senha_do_banco():
    codigo = _texto_sem_comentarios(BACKUP_DB)
    for proibido in ("--dry-run", "--password", "set -x", "echo \"$SUPABASE_DB_PASSWORD\"", "echo $SUPABASE_DB_PASSWORD"):
        assert proibido not in codigo, f"backup-db.yml usa {proibido!r}: a senha do banco vazaria no log"
    for linha in codigo.splitlines():
        if "supabase db dump" in linha:
            assert " -p " not in linha, "senha pela linha de comando aparece na lista de processos"
            assert "--linked" in linha, "o dump é do projeto de produção ligado"


def test_backup_confere_a_copia_antes_de_guardar_e_so_guarda_como_artefato_curto():
    codigo = _texto_sem_comentarios(BACKUP_DB)
    assert codigo.count("testar_restauracao.py") == 2, "estrutura e dados são conferidos separadamente"
    assert "--so-dados" in codigo
    assert codigo.index("testar_restauracao.py") < codigo.index("actions/upload-artifact")
    assert "retention-days: 14" in codigo
    assert "if-no-files-found: error" in codigo, "sem arquivo o upload tem de falhar, não passar calado"
    for proibido in ("git push", "git commit", "gh release", "gh gist", "gh api -X"):
        assert proibido not in codigo, f"backup-db.yml não pode mandar a cópia para {proibido}"


def test_backup_nunca_e_cancelado_no_meio_do_dump():
    codigo = _texto_sem_comentarios(BACKUP_DB)
    assert re.search(r"(?ms)^concurrency:\s*\n\s+group: backup-db\s*\n\s+cancel-in-progress: false", codigo)
