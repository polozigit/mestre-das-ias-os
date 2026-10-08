import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-acento text-fg-sobre-acento hover:bg-acento-hover shadow-[var(--sombra-sm)]",
  secondary:
    "bg-bg-elevada text-fg-1 border border-borda hover:bg-bg-sutil",
  ghost:
    "bg-transparent text-fg-2 hover:bg-bg-sutil",
  danger:
    "bg-erro text-white hover:opacity-90",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      {...rest}
      className={cn(
        // Press: scale sutil transform-only, atrás de motion-safe (reduced-motion
        // não deve nem pular o estado — some por completo).
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-[background-color,border-color,color,box-shadow,scale] duration-150 ease-out motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
