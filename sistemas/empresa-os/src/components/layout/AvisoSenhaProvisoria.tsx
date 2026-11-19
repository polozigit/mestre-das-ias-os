import Link from "next/link";

/* Faixa no topo da área logada enquanto o usuário usa a senha provisória. Não bloqueia
   nada: fica no fluxo (não fixa) e quebra linha no celular. Quem decide se aparece é
   `deveAvisarSenhaProvisoria` (some no preview da Vercel); aqui só desenha. */
export function AvisoSenhaProvisoria() {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-alerta bg-alerta-suave px-4 py-2.5 text-center text-sm leading-snug text-fg-1"
    >
      <span className="font-semibold">Você está usando a senha provisória.</span>
      <Link
        href="/conta/senha"
        className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 hover:no-underline sm:min-h-0"
      >
        Troque agora
      </Link>
    </div>
  );
}
