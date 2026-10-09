import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { moduloDaRota, pode, sessaoDoRpc } from "@/lib/auth/permissoes";
import { configPublicaDoServidorOuNada } from "./env";
import { adminDoPreview, entrarComoDonoNoPreview } from "./preview-dono";
import { createServiceClient } from "./service";

/**
 * Coração do middleware: refresh de sessão + gate de login + gate de módulo
 * por permissão (slug). Padrão portado do Polozi OS (provado em produção).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, chavePublica } = configPublicaDoServidorOuNada();
  if (!url || !chavePublica) return supabaseResponse;

  const supabase = createServerClient<Database>(url, chavePublica, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Todo redirect PRECISA carregar os cookies que o client escreveu em
  // supabaseResponse (refresh de token rotaciona o refresh token; um redirect
  // "limpo" descartaria os cookies novos e o browser ficaria com o token
  // antigo — contrato documentado do @supabase/ssr).
  const redirecionar = (pathname: string, search = "") => {
    const destino = request.nextUrl.clone();
    destino.pathname = pathname;
    destino.search = search;
    const resposta = NextResponse.redirect(destino);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => resposta.cookies.set(cookie));
    return resposta;
  };

  // QA do preview entra como o DONO (link mágico gerado no servidor, sem
  // senha e sem usuário extra). SÓ em preview da Vercel: o gate de VERCEL_ENV
  // fica em tokenDePreviewValido e barra produção mesmo com token vazado.
  // Token por query (?preview_token=) ou pelo cookie desta sessão de QA.
  const previewToken = process.env.PREVIEW_TEST_TOKEN;
  const resultadoPreview = await entrarComoDonoNoPreview({
    env: process.env,
    tokenFornecido:
      request.nextUrl.searchParams.get("preview_token") ??
      request.cookies.get("preview_auth")?.value,
    // Adaptador fino: comparar o cliente inteiro com a interface estoura o tsc (TS2589).
    sessao: {
      auth: {
        getUser: () => supabase.auth.getUser(),
        verifyOtp: (params) => supabase.auth.verifyOtp(params),
      },
    },
    criarAdmin: () => adminDoPreview(createServiceClient()),
  });
  if (resultadoPreview === "falhou") {
    // Token certo mas login do dono falhou: NÃO pode virar redirect mudo pra
    // /login — sinaliza na URL qual das camadas falhou (token ok, login não).
    return redirecionar("/login", "?erro=qa-preview");
  }
  const entregarCookiePreview = resultadoPreview !== "fora";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // O cookie de preview entra DEPOIS de toda escrita de auth: o setAll acima
  // REATRIBUI supabaseResponse a cada cookie de sessão gravado — setar antes
  // perderia o preview_auth na primeira visita.
  if (entregarCookiePreview) {
    supabaseResponse.cookies.set("preview_auth", previewToken!, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  }

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/sem-acesso";

  if (!user && !isPublic) {
    return redirecionar("/login");
  }

  // Gate de módulo NO MIDDLEWARE — roda ANTES de qualquer render. Necessário
  // porque o App Router renderiza layout e page em paralelo: um redirect() no
  // layout não impede a page de começar a fluir no stream. Roda pra TODA
  // request autenticada, prefetch incluso: o header de prefetch é forjável
  // por qualquer cliente, então não serve de isenção de segurança — e na
  // escala de uma empresa pequena o custo da RPC extra é irrelevante.
  if (user && !isPublic) {
    const modulo = moduloDaRota(pathname);
    if (modulo) {
      // Erro na RPC = falha FECHADA (trata como sem permissão).
      const { data, error } = await supabase.rpc("sessao_atual");
      const sessao = error ? null : sessaoDoRpc(Array.isArray(data) ? data[0] : data);
      if (!pode(sessao, modulo)) {
        return redirecionar("/sem-acesso", `?modulo=${encodeURIComponent(modulo)}`);
      }
    }
  }

  return supabaseResponse;
}
