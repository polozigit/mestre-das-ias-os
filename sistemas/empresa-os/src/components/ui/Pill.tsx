import { cn } from "@/lib/utils";

export type PillTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "brand";

/* Tons semânticos mapeados nos tokens de status do tema (ok/alerta/erro/info).
   Os pares *-suave + cor cheia já cobrem light e dark via theme.css — sem
   precisar de variante dark: aqui. */
const toneStyles: Record<PillTone, { bg: string; text: string; dot: string }> = {
  neutral: { bg: "bg-bg-sutil", text: "text-fg-2", dot: "bg-fg-4" },
  success: { bg: "bg-ok-suave", text: "text-ok", dot: "bg-ok" },
  warning: { bg: "bg-alerta-suave", text: "text-alerta", dot: "bg-alerta" },
  danger:  { bg: "bg-erro-suave", text: "text-erro", dot: "bg-erro" },
  info:    { bg: "bg-info-suave", text: "text-info", dot: "bg-info" },
  brand:   { bg: "bg-acento-suave", text: "text-acento-texto", dot: "bg-acento" },
};

export function Pill({
  tone = "neutral",
  dot = false,
  pulsing = false,
  className,
  children,
}: {
  tone?: PillTone;
  dot?: boolean;
  pulsing?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const styles = toneStyles[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        styles.bg,
        styles.text,
        className,
      )}
    >
      {dot && (
        <span className={cn("size-1.5 rounded-full", styles.dot, pulsing && "animate-pulse")} />
      )}
      {children}
    </span>
  );
}
