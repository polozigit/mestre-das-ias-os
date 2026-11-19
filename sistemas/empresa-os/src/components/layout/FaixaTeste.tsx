import { faixaDeTeste } from "../../lib/ambiente-teste";

/* Aviso fixo no topo de TODA página do preview da Vercel: quem abre o link de teste
   precisa saber que não é o sistema de verdade. Fica no fluxo (não sticky/fixed) para
   empurrar o conteúdo e não mexer nos offsets sticky da TopBar. Inverte fg/bg do tema:
   contraste máximo em claro e escuro, sem cor literal. Em produção não renderiza nada. */
export function FaixaTeste() {
  const { mostrar, enderecoProducao } = faixaDeTeste(process.env);
  if (!mostrar) return null;
  return (
    <>
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b-4 border-alerta bg-fg-1 px-4 py-2.5 text-center text-sm font-semibold leading-snug text-bg"
    >
      <span>Ambiente de teste. Nada do que você fizer aqui vale.</span>
      {enderecoProducao && (
        <a
          href={enderecoProducao}
          className="underline underline-offset-4 outline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-bg"
        >
          Abrir meu sistema de verdade
        </a>
      )}
    </div>
    {/* Selo fixo no canto de baixo: continua visível após rolar ou com a sidebar aberta.
        pointer-events-none: nunca bloqueia clique. z acima da sidebar/Sheet (z-50). */}
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-[60] rounded-full border-2 border-alerta bg-fg-1 px-3 py-1 text-xs font-semibold text-bg shadow-[var(--sombra-md)]"
    >
      Ambiente de teste
    </div>
    </>
  );
}
