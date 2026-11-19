import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Link com cara de botão secundário (mesmas classes do Button variant
 * "secondary"). Pra navegação server-side — atalhos do Início e paginação
 * da Atividade — onde um <button> exigiria client component à toa.
 */
export function LinkBotao({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-borda bg-bg-elevada px-4 text-sm font-semibold text-fg-1 transition-[background-color,border-color,scale] duration-150 ease-saida hover:bg-bg-sutil motion-safe:active:scale-[0.97]",
        className,
      )}
    >
      {children}
    </Link>
  );
}
