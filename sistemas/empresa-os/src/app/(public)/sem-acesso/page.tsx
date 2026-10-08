import Link from "next/link";
import { sair } from "@/app/(public)/login/actions";
import { NAV_GRUPOS } from "@/lib/nav";

/** Rótulo do módulo como aparece no menu (fonte única: NAV_GRUPOS). */
function rotuloDoModulo(slug: string): string | null {
  return NAV_GRUPOS.flatMap((g) => g.itens).find((i) => i.modulo === slug)?.label ?? null;
}

/**
 * Página 403. Fica FORA do grupo (app) e na lista de rotas públicas do
 * middleware — senão quem não tem acesso entra em loop de redirect.
 */
export default async function SemAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ modulo?: string }>;
}) {
  const { modulo } = await searchParams;
  const nomeModulo = modulo ? (rotuloDoModulo(modulo) ?? modulo) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-lg border border-borda bg-bg-elevada p-8 text-center shadow-[var(--sombra-md)]">
        <h1 className="mb-2 text-lg font-semibold text-fg-1">Sem acesso</h1>
        <p className="mb-6 text-sm text-fg-3">
          {nomeModulo
            ? `Sua conta não tem permissão para o módulo ${nomeModulo}.`
            : "Sua conta não tem vínculo ativo com a empresa."}{" "}
          Se você acha que deveria ter, fale com o dono da empresa.
        </p>
        <Link
          href="/inicio"
          className="inline-block rounded-md bg-acento px-4 py-2.5 text-sm font-semibold text-fg-sobre-acento hover:bg-acento-hover"
        >
          Voltar ao início
        </Link>
        {/* Saída SEMPRE disponível: pra conta sem vínculo ativo, toda rota cai
            aqui de volta — sem este botão a pessoa ficava presa num pingue-
            pongue sem alcançar o Sair do shell. */}
        <form action={sair} className="mt-3">
          <button
            type="submit"
            className="text-sm font-medium text-fg-3 hover:text-fg-1 hover:underline"
          >
            Sair desta conta
          </button>
        </form>
      </div>
    </main>
  );
}
