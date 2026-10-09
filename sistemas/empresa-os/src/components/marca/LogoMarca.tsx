import Image from "next/image";
import { marca } from "../../../config/marca";
import { cn } from "@/lib/utils";

type Props = {
  /** Texto alternativo, definido por quem chama. Vazio quando o nome já está ao lado do logo. */
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
};

/**
 * Logo da empresa lido de config/marca.ts. Com versões diferentes para fundo claro e
 * escuro, mostra uma por tema (o SCRIPT_TEMA sempre grava data-theme no <html>).
 */
export function LogoMarca({ alt, width, height, className, priority }: Props) {
  const { fundoClaro, fundoEscuro } = marca.logo;
  if (fundoClaro === fundoEscuro) {
    return (
      <Image src={fundoClaro} alt={alt} width={width} height={height} priority={priority} unoptimized className={className} />
    );
  }
  return (
    <>
      <Image src={fundoClaro} alt={alt} width={width} height={height} priority={priority} unoptimized className={cn("dark:hidden", className)} />
      <Image src={fundoEscuro} alt={alt} width={width} height={height} priority={priority} unoptimized className={cn("hidden dark:block", className)} />
    </>
  );
}
