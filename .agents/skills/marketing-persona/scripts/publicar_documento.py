#!/usr/bin/env python3
"""publicar_documento.py: publica um documento APROVADO da persona, da marca ou o dossiê no banco da empresa.

É o único publicador do time Marketing (as skills marketing-persona, marketing-identidade e
marketing-logo chamam este arquivo; o polozi-registrar-dossie chama para o dossiê). Faz as duas
operações fixas do contrato de escrita da IA:
documento-publicar (upsert em public.documentos_publicados por caminho_origem, migration 0010 do
sistema) e documento-conferir (o hash do arquivo contra o hash que está no banco). Nunca roda SQL
livre, nunca apaga nada, nunca lê o Vault.

Uso (da raiz do projeto):
  publicar_documento.py --tipo persona --arquivo empresa/publico/persona.md --titulo "Persona" [--resumo "..."] [--dry-run]
  publicar_documento.py --tipo marca --arquivo empresa/marca/logo/logo.md --titulo "Logo" --imagem empresa/marca/logo/logo-principal.png
  publicar_documento.py --tipo marca --arquivo empresa/marca/tom-de-voz.md --conferir
  publicar_documento.py --tipo dossie --arquivo contexto/dossie/dossie-completo.md --titulo "Dossiê da empresa"

O que ele garante antes de mandar qualquer coisa:
  - o tipo é persona (arquivo em empresa/publico/), marca (arquivo em empresa/marca/) ou dossie (só o
    contexto/dossie/dossie-completo.md que o polozi-registrar-dossie grava), .md, dentro do projeto;
  - o texto não tem padrão de chave ou segredo (a regra é a de .githooks/regras-segredo.sh do projeto);
  - o texto não tem `<...>` de modelo que ficou sem preencher (saída 2, com o número da linha);
  - o dono deu o sim e o texto não mudou depois dele (aprovacao.py conferir);
  - imagem só para marca, dentro de empresa/marca/, png, jpg, webp ou svg (svg sem script) e com o
    cabeçalho do formato certo (arquivo qualquer com nome de imagem não passa).
Com --dry-run roda tudo isso, imprime o que seria enviado (sem segredo) e não usa rede nem credencial.

Credencial: <raiz do projeto>/credenciais/.env, NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) e
SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY). A chave nunca é impressa, nem em mensagem de
erro. Chave nova (sb_secret_) vai só no cabeçalho apikey; chave antiga (JWT) vai também em
Authorization. A imagem vai para o bucket PRIVADO "publicados" (criado se faltar).

Saída: 0 ok; 1 --conferir achou o banco atrasado ou sem o documento; 2 sem credencial ou uso errado
(a mensagem diz qual); 3 segredo no texto; 4 erro de banco ou de rede; 5 sem o sim do dono.
Só stdlib (Python 3.10+).
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aprovacao  # noqa: E402

# Regra de segredo: UMA fonte, o PADRAO_SEGREDO de <casa>/.githooks/regras-segredo.sh. Esta é a cópia
# embutida, usada quando o projeto não tem o arquivo; um teste confere que é idêntica à do modelo do projeto.
PADRAO_SEGREDO = r"((^|[^A-Za-z0-9])sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9]|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY|sk_live_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk-(proj|ant|svcacct|admin)-[A-Za-z0-9_-]{20,})"
RE_SEGREDO = re.compile(PADRAO_SEGREDO)
_REGRA_DA_CASA = re.compile(r"^PADRAO_SEGREDO='([^']*)'[ \t\r]*$", re.M)
# texto de modelo que ficou sem preencher (<quem é o cliente>, <AAAA-MM-DD>); link <https://...> e e-mail <a@b> não contam.
# Mesma regra do dossie_para_persona.py (um teste confere que as duas são iguais).
RE_MODELO = re.compile(r"<(?!https?://)(?![^<>\n]*@)[A-Za-zÀ-ÿ#][^<>\n]{2,120}>")

TABELA = "documentos_publicados"
BUCKET = "publicados"
TIPOS = {"persona": "empresa/publico/", "marca": "empresa/marca/", "dossie": "contexto/dossie/dossie-completo.md"}
ABA = {"persona": "Persona", "marca": "Identidade e voz", "dossie": "Dossiê"}  # rótulos da tela Marca (src/lib/marca.ts)
IMAGENS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
           ".svg": "image/svg+xml"}
TETO_TEXTO = 1_000_000
TETO_IMAGEM = 5_000_000
TETO_TITULO = 120
TETO_RESUMO = 300
TIMEOUT = 60
USER_AGENT = "mestre-das-ias-publicador/1.0"  # o urllib sozinho se apresenta como Python-urllib, que filtro de borda costuma recusar


class Erro(Exception):
    def __init__(self, mensagem: str, codigo: int) -> None:
        super().__init__(mensagem)
        self.codigo = codigo


class ErroHTTP(Exception):
    def __init__(self, status: int, corpo: str) -> None:
        super().__init__(f"HTTP {status}")
        self.status = status
        self.corpo = corpo


# ---------------------------------------------------------------- regra de segredo e credencial

def carregar_regra_segredo(casa: Path) -> re.Pattern:
    """Regra do projeto (PADRAO_SEGREDO de .githooks/regras-segredo.sh); sem o arquivo, a cópia embutida;
    arquivo ilegível ou padrão inválido, a cópia embutida com AVISO (nunca o trecho)."""
    arquivo = casa / ".githooks" / "regras-segredo.sh"
    if not arquivo.is_file():
        return RE_SEGREDO
    try:
        achado = _REGRA_DA_CASA.search(arquivo.read_text(encoding="utf-8-sig"))
        if achado is None:
            raise ValueError("sem PADRAO_SEGREDO")
        return re.compile(achado.group(1))
    except (OSError, UnicodeError, ValueError, re.error) as erro:
        print(f"AVISO: .githooks/regras-segredo.sh do projeto ilegível ({type(erro).__name__}); "
              "usando a regra de segredo embutida.", file=sys.stderr)
        return RE_SEGREDO


def credencial(casa: Path) -> tuple[str, str] | None:
    """(url, chave) de <casa>/credenciais/.env, ou None se faltar um dos dois."""
    caminho = casa / "credenciais" / ".env"
    if not caminho.is_file():
        return None
    valores: dict[str, str] = {}
    # utf-8-sig: o Bloco de Notas antigo grava BOM, que colaria na 1ª chave
    for linha in caminho.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        linha = linha.strip()
        if linha.startswith("export "):
            linha = linha[len("export "):].lstrip()
        chave, sep, valor = linha.partition("=")
        if sep and not chave.startswith("#"):
            valores[chave.strip()] = valor.strip().strip('"').strip("'")
    url = (valores.get("NEXT_PUBLIC_SUPABASE_URL") or valores.get("SUPABASE_URL") or "").rstrip("/")
    chave = valores.get("SUPABASE_SERVICE_ROLE_KEY") or valores.get("SUPABASE_SECRET_KEY") or ""
    return (url, chave) if url and chave else None


def e_jwt(chave: str) -> bool:
    """Chave antiga (anon ou service_role) é JWT; a chave nova sb_secret_ não é."""
    return chave.startswith("eyJ") and chave.count(".") == 2


def exigir_https(url: str) -> None:
    """A chave de serviço só viaja por https (exceto banco local: localhost e 127.0.0.1)."""
    try:
        partes = urllib.parse.urlsplit(url)
        host = partes.hostname
    except ValueError:
        return  # endereço torto: o erro claro vem da chamada
    if partes.scheme in ("", "https") or (partes.scheme == "http" and host in ("localhost", "127.0.0.1")):
        return
    raise Erro(f"NEXT_PUBLIC_SUPABASE_URL começa com {partes.scheme}://; a chave do banco só é enviada por "
               "https:// (exceto localhost e 127.0.0.1). Corrija em credenciais/.env. Nada foi enviado.", 4)


def mascarar(texto: str, chave: str) -> str:
    return texto.replace(chave, "***") if chave else texto


# ---------------------------------------------------------------- leitura do documento e da imagem

def _resolver(casa: Path, arquivo: str, rotulo: str) -> tuple[Path, str]:
    raiz = casa.resolve()
    bruto = Path(arquivo)
    alvo = bruto if bruto.is_absolute() else raiz / bruto
    try:
        alvo = alvo.resolve(strict=True)
    except (OSError, RuntimeError):
        raise Erro(f"{rotulo} não existe: {arquivo}", 2) from None
    try:
        rel = alvo.relative_to(raiz).as_posix()
    except ValueError:
        raise Erro(f"{rotulo} está fora do projeto: {arquivo}", 2) from None
    if not alvo.is_file():
        raise Erro(f"{rotulo} não é um arquivo: {arquivo}", 2)
    return alvo, rel


def no_lugar_do_tipo(tipo: str, rel: str) -> bool:
    """Persona e marca: qualquer .md dentro da pasta do tipo. Dossiê: só o arquivo consolidado que o
    polozi-registrar-dossie grava; as cópias de fontes/, relatorios/ e historico/ não são o dossiê."""
    lugar = TIPOS[tipo]
    return rel == lugar if lugar.endswith(".md") else rel.startswith(lugar)


def ler_documento(casa: Path, tipo: str, arquivo: str) -> dict:
    """Valida o caminho e devolve {rel, dados, texto, hash}. Erros de uso saem com código 2."""
    if tipo not in TIPOS:
        raise Erro(f"tipo {tipo!r} não existe: este publicador só leva persona, marca ou dossie", 2)
    alvo, rel = _resolver(casa, arquivo, "o documento")
    if not no_lugar_do_tipo(tipo, rel):
        raise Erro(f"documento do tipo {tipo} precisa estar em {TIPOS[tipo]} (veio {rel})", 2)
    if alvo.suffix.lower() != ".md":
        raise Erro(f"só publico arquivo .md (veio {rel})", 2)
    if alvo.stat().st_size > TETO_TEXTO:
        raise Erro(f"{rel} passa de {TETO_TEXTO // 1000} KB; documento da marca é curto", 2)
    dados = alvo.read_bytes()
    try:
        texto = dados.decode("utf-8")
    except UnicodeDecodeError:
        raise Erro(f"{rel} não está em UTF-8", 2) from None
    return {"rel": rel, "dados": dados, "texto": texto, "hash": hashlib.sha256(dados).hexdigest()}


def caminho_no_bucket(rel: str) -> str:
    """Nome do objeto no Storage: só ASCII seguro, mesmo desenho de pastas do repositório."""
    ascii_ = unicodedata.normalize("NFKD", rel).encode("ascii", "ignore").decode("ascii")
    seguro = re.sub(r"-{2,}", "-", re.sub(r"[^A-Za-z0-9._/-]", "-", ascii_))
    return "/".join(p for p in seguro.split("/") if p not in ("", ".", ".."))


def _assinatura_ok(ext: str, dados: bytes) -> bool:
    if ext == ".png":
        return dados.startswith(b"\x89PNG\r\n\x1a\n")
    if ext in (".jpg", ".jpeg"):
        return dados.startswith(b"\xff\xd8\xff")
    if ext == ".webp":
        return dados[:4] == b"RIFF" and dados[8:12] == b"WEBP"
    if ext == ".svg":
        return b"<svg" in dados[:4096].lower()
    return False


def ler_imagem(casa: Path, tipo: str, imagem: str, regra: re.Pattern) -> dict:
    if tipo != "marca":
        raise Erro("imagem só vai com documento do tipo marca", 2)
    alvo, rel = _resolver(casa, imagem, "a imagem")
    if not rel.startswith(TIPOS["marca"]):
        raise Erro(f"a imagem precisa estar em {TIPOS['marca']} (veio {rel})", 2)
    ext = alvo.suffix.lower()
    if ext not in IMAGENS:
        raise Erro(f"imagem {ext or 'sem extensão'} não é aceita; use png, jpg, webp ou svg", 2)
    if alvo.stat().st_size > TETO_IMAGEM:
        raise Erro(f"{rel} passa de {TETO_IMAGEM // 1_000_000} MB; reduza a imagem", 2)
    dados = alvo.read_bytes()
    if not _assinatura_ok(ext, dados):
        raise Erro(f"{rel} não parece ser uma imagem {ext[1:]} de verdade (cabeçalho do arquivo não bate)", 2)
    if ext == ".svg":
        texto = dados.decode("utf-8", errors="replace")
        if regra.search(texto):
            raise Erro(f"possível segredo em {rel}. Nada foi enviado; tire o segredo e rode de novo.", 3)
        if re.search(r"<script|javascript:|\son[a-z]+\s*=", texto, re.IGNORECASE):
            raise Erro(f"{rel} tem script dentro do SVG; não envio", 2)
    return {"rel": rel, "dados": dados, "mime": IMAGENS[ext], "caminho_bucket": caminho_no_bucket(rel)}


def agora_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def montar_payload(doc: dict, tipo: str, titulo: str, resumo: str | None, imagem: dict | None) -> dict:
    titulo = " ".join((titulo or "").split())
    if not titulo or len(titulo) > TETO_TITULO:
        raise Erro(f"o título precisa ter de 1 a {TETO_TITULO} caracteres", 2)
    resumo = " ".join((resumo or "").split()) or None
    if resumo and len(resumo) > TETO_RESUMO:
        raise Erro(f"o resumo passa de {TETO_RESUMO} caracteres", 2)
    return {
        "tipo": tipo,
        "titulo": titulo,
        "texto": doc["texto"],
        "resumo": resumo,
        "caminho_origem": doc["rel"],
        "hash": doc["hash"],
        "imagem_caminho": imagem["caminho_bucket"] if imagem else None,
        "publicado_em": agora_iso(),
    }


# ---------------------------------------------------------------- rede

def _chamar(metodo: str, url: str, chave: str, corpo: bytes | None = None,
            extras: dict[str, str] | None = None) -> tuple[int, str]:
    cab = {"apikey": chave, "User-Agent": USER_AGENT}
    if e_jwt(chave):
        cab["Authorization"] = f"Bearer {chave}"
    cab.update(extras or {})
    try:
        req = urllib.request.Request(url, data=corpo, method=metodo, headers=cab)  # URL torta levanta ValueError aqui
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return int(resp.status), resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as erro:
        raise ErroHTTP(erro.code, mascarar(erro.read().decode("utf-8", errors="replace"), chave)[:500]) from None
    except urllib.error.URLError as erro:
        raise Erro(f"sem conexão com o banco: {mascarar(str(erro.reason), chave)}", 4) from None
    except ValueError:
        raise Erro("endereço do banco inválido em NEXT_PUBLIC_SUPABASE_URL; confira que começa com https://", 4) from None
    except (OSError, http.client.HTTPException) as erro:  # timeout, conexão cortada, resposta pela metade
        raise Erro(f"falha de rede ({type(erro).__name__})", 4) from None


def _json_do_corpo(corpo: str) -> dict:
    try:
        achado = json.loads(corpo)
    except ValueError:
        return {}
    return achado if isinstance(achado, dict) else {}


def _erro_do_banco(erro: ErroHTTP, o_que: str) -> Erro:
    info = _json_do_corpo(erro.corpo)
    codigo = str(info.get("code", ""))
    if erro.status in (401, 403):
        return Erro(f"o banco recusou a chave ao {o_que} (HTTP {erro.status}). Confira SUPABASE_SERVICE_ROLE_KEY "
                    "(ou SUPABASE_SECRET_KEY) em credenciais/.env: precisa ser a chave de serviço do projeto.", 4)
    if erro.status == 404 or codigo in ("PGRST205", "42P01"):
        return Erro(f"o banco não tem a tabela {TABELA} (HTTP {erro.status}): aplique as migrations do sistema "
                    "(time Tecnologia, tecnologia-mudar-banco) e rode de novo.", 4)
    if codigo in ("PGRST204", "42703"):
        return Erro(f"o banco não tem uma coluna que a publicação usa ({erro.corpo[:200]}): a migration 0010 "
                    "do sistema está desatualizada.", 4)
    return Erro(f"o banco recusou ao {o_que} (HTTP {erro.status}): {erro.corpo[:300]}", 4)


def garantir_bucket(url: str, chave: str) -> None:
    """Cria o bucket privado `publicados`; se já existe, segue."""
    corpo = json.dumps({"id": BUCKET, "name": BUCKET, "public": False}).encode("utf-8")
    try:
        _chamar("POST", f"{url}/storage/v1/bucket", chave, corpo, {"Content-Type": "application/json"})
    except ErroHTTP as erro:
        info = _json_do_corpo(erro.corpo)
        ja_existe = (erro.status == 409 or str(info.get("statusCode")) == "409" or info.get("error") == "Duplicate"
                     or "already exists" in str(info.get("message", "")).lower())
        if not ja_existe:
            raise _erro_do_banco(erro, f"criar o bucket {BUCKET}") from None


def enviar_imagem(url: str, chave: str, imagem: dict) -> None:
    destino = f"{url}/storage/v1/object/{BUCKET}/{urllib.parse.quote(imagem['caminho_bucket'], safe='/')}"
    try:
        _chamar("POST", destino, chave, imagem["dados"],
                {"Content-Type": imagem["mime"], "x-upsert": "true", "cache-control": "max-age=3600"})
    except ErroHTTP as erro:
        raise _erro_do_banco(erro, "enviar a imagem") from None


def gravar_linha(url: str, chave: str, payload: dict) -> None:
    """Upsert por caminho_origem; confere que o banco devolveu a linha com o hash enviado."""
    destino = f"{url}/rest/v1/{TABELA}?on_conflict=caminho_origem"
    cab = {"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=representation"}
    try:
        _, resposta = _chamar("POST", destino, chave, json.dumps(payload, ensure_ascii=False).encode("utf-8"), cab)
    except ErroHTTP as erro:
        raise _erro_do_banco(erro, "gravar o documento") from None
    try:
        linhas = json.loads(resposta or "[]")
    except ValueError:
        linhas = None
    if not isinstance(linhas, list) or not any(
            isinstance(l, dict) and l.get("caminho_origem") == payload["caminho_origem"]
            and l.get("hash") == payload["hash"] for l in linhas):
        raise Erro("o banco respondeu, mas não devolveu a linha com o hash que enviei; confira a tabela "
                   f"{TABELA} antes de dizer que publicou.", 4)


def buscar_linha(url: str, chave: str, rel: str) -> dict | None:
    destino = (f"{url}/rest/v1/{TABELA}?caminho_origem=eq.{urllib.parse.quote(rel, safe='')}"
               "&select=caminho_origem,hash,publicado_em")
    try:
        _, resposta = _chamar("GET", destino, chave)
    except ErroHTTP as erro:
        raise _erro_do_banco(erro, "conferir o documento") from None
    try:
        linhas = json.loads(resposta or "[]")
    except ValueError:
        raise Erro("o banco respondeu algo que não é JSON ao conferir o documento", 4) from None
    if not isinstance(linhas, list):
        raise Erro("o banco respondeu fora do formato ao conferir o documento", 4)
    return next((l for l in linhas if isinstance(l, dict) and l.get("caminho_origem") == rel), None)


# ---------------------------------------------------------------- comandos

def conferir(casa: Path, tipo: str, arquivo: str) -> int:
    doc = ler_documento(casa, tipo, arquivo)
    cred = credencial(casa)
    if cred is None:
        print("FALTA: credenciais/.env sem NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY; "
              "não dá para conferir o banco. Conecte o banco (time Tecnologia) e rode de novo.")
        return 2
    url, chave = cred
    exigir_https(url)
    linha = buscar_linha(url, chave, doc["rel"])
    if linha is None:
        print(f"AUSENTE: {doc['rel']} ainda não está no banco.")
        return 1
    if linha.get("hash") != doc["hash"]:
        print(f"ATRASADA: {doc['rel']} mudou depois da última publicação (banco: {str(linha.get('hash'))[:12]}, "
              f"arquivo: {doc['hash'][:12]}). Publique de novo.")
        return 1
    print(f"EM DIA: {doc['rel']} (hash {doc['hash'][:12]}, publicado em {linha.get('publicado_em')}).")
    return 0


def modelo_sem_preencher(texto: str) -> tuple[int, str] | None:
    """(linha, trecho) do primeiro <...> de modelo que sobrou. A frase do dono na linha de aprovação não conta:
    ela é dele e pode ter qualquer sinal."""
    for numero, linha in enumerate(texto.split("\n"), 1):
        if aprovacao.RE_QUALQUER.match(linha):
            continue
        achado = RE_MODELO.search(linha)
        if achado:
            return numero, achado.group(0)
    return None


def publicar(casa: Path, tipo: str, arquivo: str, titulo: str | None, resumo: str | None,
             imagem_arg: str | None, dry_run: bool) -> int:
    regra = carregar_regra_segredo(casa)
    doc = ler_documento(casa, tipo, arquivo)
    if regra.search(doc["texto"]):
        raise Erro(f"possível segredo em {doc['rel']}. Nada foi enviado; tire o segredo e rode de novo.", 3)
    sobra = modelo_sem_preencher(doc["texto"])
    if sobra:
        raise Erro(f"{doc['rel']}:{sobra[0]} ainda tem texto de modelo sem preencher ({sobra[1][:40]}). Nada foi enviado.", 2)
    ok, motivo = aprovacao.conferir(doc["texto"])
    if not ok:
        raise Erro(f"{doc['rel']}: {motivo}. Nada foi enviado.", 5)
    if regra.search(f"{titulo or ''} {resumo or ''}"):
        raise Erro("possível segredo no título ou no resumo. Nada foi enviado; tire o segredo e rode de novo.", 3)
    imagem = ler_imagem(casa, tipo, imagem_arg, regra) if imagem_arg else None
    payload = montar_payload(doc, tipo, titulo or "", resumo, imagem)
    if dry_run:
        resumo_texto = dict(payload, texto=f"<{len(doc['texto'])} caracteres, {motivo}>")
        print("DRY-RUN: nada foi enviado e nenhuma credencial foi lida.")
        print(json.dumps(resumo_texto, ensure_ascii=False, indent=2))
        if imagem:
            print(f"imagem: {imagem['rel']} -> bucket {BUCKET}/{imagem['caminho_bucket']} ({imagem['mime']}, {len(imagem['dados'])} bytes)")
        print(f"operações previstas: {'criar o bucket se faltar, enviar a imagem, ' if imagem else ''}"
              f"upsert em {TABELA} por caminho_origem")
        return 0
    cred = credencial(casa)
    if cred is None:
        print("FALTA: credenciais/.env sem NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY; "
              "o documento não foi pro banco. Os arquivos ficam salvos no projeto. Conecte o banco "
              "(time Tecnologia) e rode de novo.")
        return 2
    url, chave = cred
    exigir_https(url)
    if imagem:
        garantir_bucket(url, chave)
        enviar_imagem(url, chave, imagem)
    gravar_linha(url, chave, payload)
    print(f'FEITO: {tipo} "{payload["titulo"]}" publicado ({doc["rel"]}, hash {doc["hash"][:12]}'
          f'{", com imagem" if imagem else ""}). Confira em Marca, aba {ABA[tipo]}, no sistema.')
    return 0


def _utf8() -> None:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main(argv: list[str] | None = None) -> int:
    _utf8()
    ap = argparse.ArgumentParser(prog="publicar_documento.py", description=__doc__.split("\n")[0])
    ap.add_argument("--casa", default=".", help="raiz do projeto (padrão: pasta atual)")
    ap.add_argument("--tipo", required=True, help="persona, marca ou dossie")
    ap.add_argument("--arquivo", required=True, help="documento .md aprovado")
    ap.add_argument("--titulo", help="título de exibição (obrigatório para publicar)")
    ap.add_argument("--resumo", help="resumo curto (opcional)")
    ap.add_argument("--imagem", help="imagem da marca (opcional, só tipo marca)")
    ap.add_argument("--dry-run", action="store_true", help="valida e mostra o que enviaria; não usa rede")
    ap.add_argument("--conferir", action="store_true", help="compara o arquivo com o hash que está no banco")
    try:
        a = ap.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    casa = Path(a.casa)
    if not casa.is_dir():
        print(f"ERRO: {a.casa} não é uma pasta", file=sys.stderr)
        return 2
    try:
        if a.conferir:
            return conferir(casa, a.tipo, a.arquivo)
        if not a.titulo:
            raise Erro("falta --titulo", 2)
        return publicar(casa, a.tipo, a.arquivo, a.titulo, a.resumo, a.imagem, a.dry_run)
    except Erro as erro:
        print(f"PAREI: {erro}", file=sys.stderr)
        return erro.codigo
    except (OSError, UnicodeError) as erro:
        print(f"PAREI: falha ao ler arquivo ({type(erro).__name__}). Nada foi enviado.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
