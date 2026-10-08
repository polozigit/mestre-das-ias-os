"""Guardas ESTATICAS de arquitetura do banco (planta do banco, peca 5 §3).

As guardas que leem o CATALOGO do PostgreSQL (GA-01..GA-05, GA-07..GA-12,
GA-14..GA-18) estao em supabase/tests/000_arquitetura.sql e rodam no job
`banco` do CI. Aqui ficam as que leem TEXTO:

  GA-13  lista de excecoes so diminui: item novo sem ADR (ou com ADR que nao
         existe em supabase/arquitetura/adrs.yml) reprova; o espelho SQL da
         lista (_exc em 000_arquitetura.sql) bate com excecoes.yml.
  GA-15  nenhuma organizacao no codigo SQL (G2 da spec v2): org_id, org_atual,
         organizacoes, usuarios_org, tem_papel, papel_atual, membro_da_org = 0.
  GA-06  toda tabela criada em migration tem teste pgTAP como usuario COM
         permissao (positivo) e SEM permissao (negacao), marcado nos testes
         por `-- GA-06 positivo: ...` e `-- GA-06 negacao: ...`.
  G15    seed_exemplo.sql e so DML.

Sem dependencia externa (PyYAML nao existe na imagem do aluno): usa unittest e
um leitor minimo das 2 listas YAML do kit. Roda com
`python3 -m unittest discover -s tests -p 'test_arquitetura.py'` ou pytest.
"""

from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SUPABASE = RAIZ / "supabase"
MIGRATIONS = sorted((SUPABASE / "migrations").glob("*.sql"))
TESTES_SQL = sorted((SUPABASE / "tests").glob("*.sql"))
SEED = SUPABASE / "seed_exemplo.sql"
EXCECOES = SUPABASE / "arquitetura" / "excecoes.yml"
ADRS = SUPABASE / "arquitetura" / "adrs.yml"
GUARDA_SQL = SUPABASE / "tests" / "000_arquitetura.sql"

PALAVRAS_ORGANIZACAO = re.compile(
    r"\b(org_id|org_atual|organizacoes|usuarios_org|tem_papel|papel_atual|membro_da_org)\b",
    re.IGNORECASE,
)


def _sem_comentarios_sql(texto: str) -> str:
    """Remove comentarios `-- ...` (inclusive no fim da linha, fora de string)."""
    saida = []
    for linha in texto.splitlines():
        resultado = []
        em_string = False
        i = 0
        while i < len(linha):
            c = linha[i]
            if c == "'":
                em_string = not em_string
            if not em_string and linha[i : i + 2] == "--":
                break
            resultado.append(c)
            i += 1
        saida.append("".join(resultado))
    return "\n".join(saida)


def _ler_lista_yaml(path: Path, chave_raiz: str) -> list[dict[str, str]]:
    """Leitor minimo: `chave_raiz:` seguida de itens `- k: v` com `k: v` indentados."""
    itens: list[dict[str, str]] = []
    dentro = False
    atual: dict[str, str] | None = None
    for bruta in path.read_text(encoding="utf-8").splitlines():
        linha = bruta.rstrip()
        if not linha.strip() or linha.lstrip().startswith("#"):
            continue
        if re.match(rf"^{re.escape(chave_raiz)}:\s*(\[\])?\s*$", linha):
            dentro = True
            continue
        if not dentro:
            continue
        m_item = re.match(r"^\s*-\s+([A-Za-z0-9_]+):\s*(.*)$", linha)
        m_chave = re.match(r"^\s+([A-Za-z0-9_]+):\s*(.*)$", linha)
        if m_item:
            atual = {m_item.group(1): m_item.group(2).strip()}
            itens.append(atual)
        elif m_chave and atual is not None:
            atual[m_chave.group(1)] = m_chave.group(2).strip()
    return itens


def _excecoes_na_base() -> list[dict[str, str]] | None:
    """excecoes.yml como esta na main (None se nao ha git ou ref da main)."""
    try:
        prefixo = subprocess.run(
            ["git", "rev-parse", "--show-prefix"], cwd=RAIZ, capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    relativo = f"{prefixo}supabase/arquitetura/excecoes.yml"
    for ref in ("origin/main", "main"):
        r = subprocess.run(["git", "show", f"{ref}:{relativo}"], cwd=RAIZ, capture_output=True, text=True)
        if r.returncode == 0:
            tmp = RAIZ / ".excecoes_base.tmp"
            tmp.write_text(r.stdout, encoding="utf-8")
            try:
                return _ler_lista_yaml(tmp, "excecoes")
            finally:
                tmp.unlink(missing_ok=True)
    return None


class TestListaDeExcecoes(unittest.TestCase):
    """GA-13: a lista antiga so diminui."""

    def test_todo_item_tem_campos_e_adr_que_existe(self):
        adrs = {a["id"] for a in _ler_lista_yaml(ADRS, "adrs")}
        self.assertTrue(adrs, "adrs.yml vazio")
        for item in _ler_lista_yaml(EXCECOES, "excecoes"):
            for campo in ("guarda", "objeto", "dono", "adr"):
                self.assertTrue(item.get(campo), f"excecao sem {campo}: {item}")
            self.assertIn(item["adr"], adrs, f"excecao {item['objeto']} cita ADR que nao esta em adrs.yml")

    def test_item_novo_contra_a_main_precisa_de_adr(self):
        base = _excecoes_na_base()
        atuais = _ler_lista_yaml(EXCECOES, "excecoes")
        adrs = {a["id"] for a in _ler_lista_yaml(ADRS, "adrs")}
        if base is None:
            return  # sem git/main (kit solto): a checagem de campos acima segue valendo
        conhecidos = {(b["guarda"], b["objeto"]) for b in base}
        for item in atuais:
            if (item["guarda"], item["objeto"]) not in conhecidos:
                self.assertIn(item.get("adr", ""), adrs, f"item NOVO sem ADR valido: {item}")

    def test_espelho_sql_bate_com_o_yaml(self):
        yml = {(e["guarda"], e["objeto"]) for e in _ler_lista_yaml(EXCECOES, "excecoes")}
        texto = _sem_comentarios_sql(GUARDA_SQL.read_text(encoding="utf-8"))
        bloco = re.search(r"insert into _exc \(guarda, objeto\) values(.*?);", texto, re.S | re.I)
        espelho = set(re.findall(r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)", bloco.group(1))) if bloco else set()
        self.assertEqual(espelho, yml, "excecoes.yml e o espelho _exc de 000_arquitetura.sql divergem")


class TestSemOrganizacao(unittest.TestCase):
    """GA-15 / G2: 1 empresa por banco, nada de organizacao no codigo SQL."""

    def test_nenhuma_palavra_de_organizacao_no_sql(self):
        arquivos = MIGRATIONS + TESTES_SQL + [SEED]
        for arq in arquivos:
            if arq == GUARDA_SQL:
                continue  # a propria guarda nomeia o que proibe
            achados = PALAVRAS_ORGANIZACAO.findall(_sem_comentarios_sql(arq.read_text(encoding="utf-8")))
            self.assertEqual(achados, [], f"{arq.name} ainda fala de organizacao: {achados}")


class TestSeedSoDml(unittest.TestCase):
    """G15: o seed de exemplo e so DML."""

    def test_seed_sem_ddl(self):
        texto = _sem_comentarios_sql(SEED.read_text(encoding="utf-8"))
        proibidos = re.findall(r"(?im)^\s*(CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE)\b", texto)
        self.assertEqual(proibidos, [], f"seed_exemplo.sql tem DDL: {proibidos}")

    def test_seed_nunca_cria_dono(self):
        texto = _sem_comentarios_sql(SEED.read_text(encoding="utf-8"))
        self.assertNotRegex(texto, r"(?i)e_dono\s*[,)]?[^;]*\btrue\b", "o seed nao pode criar dono")

    def test_emails_do_seed_sao_invalid(self):
        texto = SEED.read_text(encoding="utf-8")
        for email in re.findall(r"'([^'\s]+@[^'\s]+)'", texto):
            self.assertTrue(email.endswith("@exemplo.invalid"), f"e-mail fora de @exemplo.invalid no seed: {email}")


class TestTesteDeCadaTabela(unittest.TestCase):
    """GA-06: toda tabela criada em migration tem teste como usuario COM e SEM permissao."""

    def test_toda_tabela_tem_positivo_e_negacao(self):
        tabelas = set()
        for mig in MIGRATIONS:
            texto = _sem_comentarios_sql(mig.read_text(encoding="utf-8"))
            for m in re.finditer(r"(?i)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:public|[a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s*\(", texto):
                if m.group(2).startswith("_"):
                    continue  # tabela de sonda dos smokes (nasce e morre dentro da migration)
                esquema = (m.group(1) or "public.").rstrip(".")
                tabelas.add(f"{esquema}.{m.group(2)}" if esquema != "public" else m.group(2))
        self.assertTrue(tabelas, "nenhuma tabela achada nas migrations")
        positivos: set[str] = set()
        negacoes: set[str] = set()
        for t in TESTES_SQL:
            for tipo, lista in re.findall(r"--\s*GA-06\s+(positivo|negacao):\s*(.+)", t.read_text(encoding="utf-8")):
                alvo = positivos if tipo == "positivo" else negacoes
                alvo.update(x.strip() for x in lista.split(","))
        sem_positivo = sorted(tabelas - positivos)
        sem_negacao = sorted(tabelas - negacoes)
        self.assertEqual(sem_positivo, [], f"tabelas sem teste COM permissao: {sem_positivo}")
        self.assertEqual(sem_negacao, [], f"tabelas sem teste SEM permissao: {sem_negacao}")


if __name__ == "__main__":
    unittest.main()
