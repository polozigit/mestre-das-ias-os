#!/usr/bin/env python3
"""Confere se o site publicado esta no ar: pagina inicial responde e a pagina de login aparece.

Uso: checar_producao.py <url> [--login /login] [--marcador TEXTO] [--timeout 10] [--tentativas N] [--intervalo S]
Saida: 0 no ar, 1 com motivos (um por linha), 2 uso errado. Nunca imprime traceback por falha do site.
Pagina de login "apareceu" = tem <form e um <input type="password"> (o login do modelo tem os dois), ou, com
--marcador, tem esse texto. So a palavra "login" nao basta (uma pagina de erro tambem a tem).
Resposta 401 ou 403 vira linha que comeca com "Não verificado": o endereco pede autorizacao (por exemplo
link de preview protegido da Vercel). Isso nao prova que o site caiu e nunca e motivo para voltar a mudanca.
"""
import argparse
import http.client
import re
import socket
import sys
import time
import urllib.error
import urllib.request


NAO_VERIFICADO = "Não verificado"
_FORM = re.compile(r"<form\b", re.I)
_SENHA = re.compile(r"""<input\b[^>]*\btype\s*=\s*["']?password\b""", re.I)


def _tem_login(html: str, marcador: str | None) -> bool:
    if marcador:
        return marcador.lower() in html.lower()
    return bool(_FORM.search(html) and _SENHA.search(html))


class _Fora(Exception):
    """Site fora do ar ou lento demais: nao adianta testar mais nada."""


def _ler(url: str, timeout: float, nome: str) -> str:
    """Devolve o HTML. Em falha levanta _Fora (site fora) ou ValueError (problema da pagina, com a frase pronta)."""
    req = urllib.request.Request(url, headers={"User-Agent": "tecnologia-checar-producao/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(2_000_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        e.close()
        if e.code in (401, 403):
            raise ValueError(f"{NAO_VERIFICADO}: {nome} pediu autorização (erro {e.code}). O endereço parece "
                             "protegido (por exemplo, link de preview da Vercel); confira com o SITE_URL de produção.")
        raise ValueError(f"{nome} respondeu com erro {e.code} ({e.reason}).")
    except urllib.error.URLError as e:
        if isinstance(e.reason, (socket.timeout, TimeoutError)):
            raise _Fora(f"O site demorou mais de {timeout:g} segundos para responder.")
        if isinstance(e.reason, str) and "unknown url type" in e.reason:
            raise _Fora(f"O endereço {url} não parece um endereço de site.")
        raise _Fora(f"O site não respondeu ({e.reason}).")
    except (socket.timeout, TimeoutError):
        raise _Fora(f"O site demorou mais de {timeout:g} segundos para responder.")
    except ValueError:
        raise _Fora(f"O endereço {url} não parece um endereço de site.")
    except (OSError, http.client.HTTPException) as e:
        raise _Fora(f"O site não respondeu direito ({type(e).__name__}).")


def checar(url: str, caminho_login: str = "/login", timeout: float = 10.0, marcador: str | None = None) -> list[str]:
    """Lista de problemas em portugues simples; vazia = no ar."""
    base = url.rstrip("/")
    problemas: list[str] = []
    try:
        try:
            _ler(base + "/", timeout, "A página inicial")
        except ValueError as e:
            problemas.append(str(e))
        if not caminho_login.startswith("/"):
            caminho_login = "/" + caminho_login
        try:
            html = _ler(base + caminho_login, timeout, "A página de login")
        except ValueError as e:
            problemas.append(str(e))
        else:
            if not _tem_login(html, marcador):
                if marcador:
                    problemas.append(f"A página de login não apareceu (sem o marcador {marcador!r}).")
                else:
                    problemas.append("A página de login não apareceu (sem formulário com campo de senha).")
    except _Fora as e:
        problemas.append(str(e))
    return problemas


def checar_com_tentativas(url: str, caminho_login: str = "/login", timeout: float = 10.0,
                          tentativas: int = 1, intervalo: float = 5.0, marcador: str | None = None) -> list[str]:
    """Repete checar() ate dar certo, no maximo `tentativas` vezes. Devolve os problemas da ultima tentativa."""
    problemas: list[str] = []
    for i in range(max(1, tentativas)):
        problemas = checar(url, caminho_login, timeout, marcador)
        if not problemas:
            return []
        if i < tentativas - 1:
            time.sleep(intervalo)
    return problemas


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Confere se o site publicado esta no ar.")
    ap.add_argument("url")
    ap.add_argument("--login", default="/login")
    ap.add_argument("--marcador", default=None, help="texto que prova a pagina de login (no lugar do formulario)")
    ap.add_argument("--timeout", type=float, default=10.0)
    ap.add_argument("--tentativas", type=int, default=1, help="repete ate dar certo (padrao: 1 tentativa)")
    ap.add_argument("--intervalo", type=float, default=5.0, help="segundos entre tentativas")
    a = ap.parse_args(argv)
    if a.tentativas < 1 or a.intervalo < 0:
        print("Uso: --tentativas precisa ser 1 ou mais e --intervalo não pode ser negativo.", file=sys.stderr)
        return 2
    if not a.url.startswith(("http://", "https://")):
        print("Uso: o endereço precisa começar com http:// ou https://", file=sys.stderr)
        return 2
    problemas = checar_com_tentativas(a.url, a.login, a.timeout, a.tentativas, a.intervalo, a.marcador)
    if problemas:
        for p in problemas:
            print(p)
        return 1
    print(f"No ar: {a.url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
