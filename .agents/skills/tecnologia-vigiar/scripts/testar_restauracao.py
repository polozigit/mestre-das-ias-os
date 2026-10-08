#!/usr/bin/env python3
"""testar_restauracao.py: confere um backup do banco (dump .sql) e, se pedido, restaura num banco de TESTE.

Uso:
  testar_restauracao.py <dump.sql> --minimo-tabelas N [--so-dados]
  testar_restauracao.py <dump.sql> --minimo-tabelas N --restaurar-em <DATABASE_URL do banco de teste> [--permitir-remoto]

Confere: arquivo existe e nao esta vazio; tem CREATE TABLE em numero >= N (dump de schema); nao carrega segredo.
Com --so-dados (dump feito com --data-only) so confere vazio e segredo.
--restaurar-em roda `psql -X -v ON_ERROR_STOP=1 -f <dump>`. A URL vai ao psql pelo AMBIENTE (PGHOST, PGPORT,
PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE), nunca pela linha de comando, que aparece na lista de processos.
Recusa (saida 2) a URL que contenha o SUPABASE_PROJECT_ID de producao lido do ambiente e, sem
--permitir-remoto, qualquer endereco que nao seja a propria maquina. Sem SUPABASE_PROJECT_ID no ambiente, a
unica trava contra producao e o endereco ser desta maquina: o script avisa isso na saida e recusa banco
remoto mesmo com --permitir-remoto. Nunca imprime a URL (pode ter senha). Nao usa rede alem do que o psql fizer.
Segredo achado no backup e AVISO, nao reprova: dado do cliente que parece chave continua sendo dado do
cliente (o arquivo fica so neste computador, nunca e enviado). Os outros problemas reprovam.
Saida: 0 backup bom (e restaurado, se pedido), 1 problema achado ou psql ausente/falhou, 2 uso errado
(inclui URL de producao ou fora desta maquina).
So stdlib.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

HOSTS_LOCAIS = {"localhost", "127.0.0.1", "::1", "host.docker.internal"}
VARIAVEIS_PG = ("PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSSLMODE")
AVISO_SEM_PROJETO = ("Aviso: SUPABASE_PROJECT_ID não está definido; a única trava contra o banco de produção foi "
                     "conferir que o banco de teste é deste computador.")

AVISO_SEGREDO = "Tem segredo no backup"
_CREATE_TABLE = re.compile(r"^\s*CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\b", re.I | re.M)
_JWT = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
_CHAVE_SERVICE_ROLE = re.compile(r"service_role[A-Za-z_]*[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._-]{20,}", re.I)


def conferir_dump(arquivo: Path, minimo_tabelas: int, so_dados: bool = False) -> list[str]:
    """Problemas do backup em portugues simples; lista vazia = backup bom."""
    arquivo = Path(arquivo)
    if not arquivo.is_file():
        return [f"Não encontrei o arquivo de backup {arquivo}."]
    texto = arquivo.read_text(encoding="utf-8", errors="replace")
    if not texto.strip():
        return ["O backup está vazio."]
    problemas: list[str] = []
    if not so_dados:
        n = len(_CREATE_TABLE.findall(texto))
        if n == 0:
            problemas.append("O backup não tem nenhum CREATE TABLE: não guarda a estrutura do banco.")
        elif n < minimo_tabelas:
            problemas.append(f"O backup tem só {n} de {minimo_tabelas} tabelas esperadas.")
    if "sb_secret_" in texto or _JWT.search(texto) or _CHAVE_SERVICE_ROLE.search(texto):
        problemas.append(AVISO_SEGREDO + ": achei algo que parece chave do Supabase dentro do arquivo. "
                         "Guarde o arquivo só neste computador; nunca o envie nem o suba para o GitHub.")
    return problemas


def _recusa_url(url: str, permitir_remoto: bool) -> str | None:
    """Motivo (em portugues) para recusar a URL de restauracao, ou None se pode."""
    prod = os.environ.get("SUPABASE_PROJECT_ID", "").strip()
    if prod and prod.lower() in url.lower():
        return "Recusei: esse endereço é o do banco de produção. A restauração só pode ir para um banco de teste."
    try:
        partes = urlsplit(url)
        host = (partes.hostname or "").lower()
        partes.port  # porta invalida levanta ValueError
    except ValueError:
        return "Recusei: o endereço do banco de teste não parece um endereço de banco."
    if not host:
        return "Recusei: o endereço do banco de teste não parece um endereço de banco."
    if host not in HOSTS_LOCAIS and not permitir_remoto:
        return (f"Recusei: o banco de teste está em {host}, que não é este computador. "
                "Para restaurar num banco de teste remoto, repita com --permitir-remoto (nunca em produção).")
    if host not in HOSTS_LOCAIS and not prod:
        return ("Recusei: sem SUPABASE_PROJECT_ID no ambiente não tenho como saber se o banco remoto "
                f"em {host} é o de produção. Restaure num banco deste computador.")
    return None


def _ambiente_psql(url: str) -> dict:
    """Ambiente do psql com a conexao em variaveis PG* (a URL nunca vai para a linha de comando)."""
    p = urlsplit(url)
    env = {k: v for k, v in os.environ.items() if k not in VARIAVEIS_PG}
    if p.hostname:
        env["PGHOST"] = p.hostname
    if p.port:
        env["PGPORT"] = str(p.port)
    if p.username:
        env["PGUSER"] = unquote(p.username)
    if p.password is not None:
        env["PGPASSWORD"] = unquote(p.password)
    banco = unquote(p.path.lstrip("/"))
    if banco:
        env["PGDATABASE"] = banco
    sslmode = parse_qs(p.query).get("sslmode")
    if sslmode:
        env["PGSSLMODE"] = sslmode[-1]
    return env


def _restaurar(dump: Path, url: str) -> tuple[int, str]:
    host = urlsplit(url).hostname
    try:
        r = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-f", str(dump)],
                           capture_output=True, text=True, timeout=1800, env=_ambiente_psql(url))
    except FileNotFoundError:
        return 1, "Não achei o programa psql neste computador, então não consegui restaurar o backup."
    except subprocess.TimeoutExpired:
        return 1, f"A restauração em {host} passou de 30 minutos e eu parei. O backup não foi provado."
    if r.returncode != 0:
        fim = (r.stderr or "").strip().splitlines()[-5:]
        return 1, f"A restauração em {host} falhou:\n" + "\n".join(fim)
    return 0, f"Restaurei o backup no banco de teste em {host} sem erro."


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Confere um backup do banco e, se pedido, restaura num banco de teste.")
    ap.add_argument("dump", help="arquivo .sql feito por `supabase db dump`")
    ap.add_argument("--minimo-tabelas", type=int, required=True, help="menos tabelas que isso = backup incompleto")
    ap.add_argument("--so-dados", action="store_true", help="dump feito com --data-only: nao exige CREATE TABLE")
    ap.add_argument("--restaurar-em", metavar="DATABASE_URL", help="URL de um banco de TESTE onde restaurar")
    ap.add_argument("--permitir-remoto", action="store_true", help="aceita banco de teste fora deste computador")
    try:
        a = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    if a.minimo_tabelas < 0:
        print("--minimo-tabelas não pode ser negativo.", file=sys.stderr)
        return 2
    if a.restaurar_em:
        motivo = _recusa_url(a.restaurar_em, a.permitir_remoto)
        if motivo:
            print(motivo, file=sys.stderr)
            return 2
    problemas = conferir_dump(Path(a.dump), a.minimo_tabelas, a.so_dados)
    avisos = [x for x in problemas if x.startswith(AVISO_SEGREDO)]
    graves = [x for x in problemas if x not in avisos]
    if avisos:
        print("Aviso: " + "\n".join(avisos))
    if graves:
        print("\n".join(graves))
        return 1
    print(f"Backup conferido: {a.dump} está inteiro.")
    if a.restaurar_em:
        if not os.environ.get("SUPABASE_PROJECT_ID", "").strip():
            print(AVISO_SEM_PROJETO)
        codigo, msg = _restaurar(Path(a.dump), a.restaurar_em)
        print(msg, file=sys.stderr if codigo else sys.stdout)
        return codigo
    return 0


if __name__ == "__main__":
    sys.exit(main())
