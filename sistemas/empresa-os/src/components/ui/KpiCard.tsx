import { cn } from "@/lib/utils";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

// trend: direção da seta. tone (opcional): cor semântica desacoplada da seta —
// em métrica de FALHA, queda é boa (verde) e 0 estável é neutro, não vermelho.
// Sem tone, deriva do trend (up=success, down=danger, flat=neutro).
type Delta = {
  value: string;
  trend: "up" | "down" | "flat";
  tone?: "success" | "warning" | "danger" | "neutral";
};

export function KpiCard({
  label,
  value,
  delta,
  progress,
  variant = "default",
  className,
}: {
  label: string;
  value: string | number;
  delta?: Delta;
  progress?: number; // 0..100
  variant?: "default" | "feature";
  className?: string;
}) {
  const isFeature = variant === "feature";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-md border p-4",
        // "feature" = card de destaque na cor de acento da marca (o CRM usava
        // um card escuro "ink"; aqui o equivalente tokenizado é o acento).
        isFeature
          ? "border-acento bg-acento text-fg-sobre-acento"
          : "border-borda bg-bg-elevada",
        className,
      )}
    >
      <p
        className={cn(
          "text-xs font-bold uppercase tracking-wider",
          isFeature ? "text-fg-sobre-acento/80" : "text-acento-texto",
        )}
      >
        {label}
      </p>

      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className={cn(
            // Intl.NumberFormat currency usa espaço não-quebrável entre "R$" e o
            // número — a string inteira é 1 token indivisível. Em grid estreito
            // (4 colunas) ela transbordava por trás do card vizinho. break-all +
            // tamanho responsivo garante que sempre cabe, com quebra só como
            // último recurso.
            "font-display break-all text-[22px] sm:text-[26px] lg:text-[32px] font-extrabold leading-tight tabular-nums",
            isFeature ? "text-fg-sobre-acento" : "text-fg-1",
          )}
        >
          {value}
        </span>
        {delta && (() => {
          const tone =
            delta.tone ??
            (delta.trend === "up" ? "success" : delta.trend === "down" ? "danger" : "neutral");
          return (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                tone === "success"
                  ? "text-ok"
                  : tone === "warning"
                    ? "text-alerta"
                    : tone === "danger"
                      ? "text-erro"
                      : "text-fg-3",
              )}
            >
              {delta.trend === "up" ? (
                <TrendingUp size={12} />
              ) : delta.trend === "down" ? (
                <TrendingDown size={12} />
              ) : (
                <Minus size={12} />
              )}
              {delta.value}
            </span>
          );
        })()}
      </div>

      {typeof progress === "number" && (
        <div
          className={cn(
            "h-1 w-full overflow-hidden rounded-full",
            isFeature ? "bg-fg-sobre-acento/20" : "bg-bg-sutil",
          )}
        >
          <div
            className={cn(
              "h-full rounded-full",
              isFeature ? "bg-fg-sobre-acento" : "bg-acento",
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
