import { cn } from "@/lib/utils";

/* Tons genéricos por token do tema (o CRM usava tipos do domínio da régua —
   msg/click/reply/webhook; aqui o nó carrega só a semântica visual). */
export type TimelineNodeType = "destaque" | "ok" | "info" | "neutro";

const NODE_COLORS: Record<TimelineNodeType, string> = {
  destaque: "bg-acento",
  ok:       "bg-ok",
  info:     "bg-info",
  neutro:   "bg-fg-4",
};

const NODE_RING: Record<TimelineNodeType, string> = {
  destaque: "ring-acento-suave",
  ok:       "ring-ok-suave",
  info:     "ring-info-suave",
  neutro:   "ring-borda-suave",
};

type TimelineItemProps = {
  type: TimelineNodeType;
  label?: string;
  children: React.ReactNode;
  isLast?: boolean;
};

export function TimelineItem({ type, label, children, isLast }: TimelineItemProps) {
  return (
    <div className="relative flex gap-4">
      {/* Linha vertical */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 bottom-0 w-px bg-borda-suave" />
      )}

      {/* Nó */}
      <div className="relative z-10 mt-1 shrink-0">
        <div
          className={cn(
            "size-6 rounded-full ring-4",
            NODE_COLORS[type],
            NODE_RING[type],
          )}
        />
      </div>

      {/* Conteúdo — min-w-0 deixa token comprido quebrar em vez de estourar o flex */}
      <div className="min-w-0 flex-1 pb-6">
        {label && (
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-4">
            {label}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

type TimelineGroupProps = {
  label: string;
  children: React.ReactNode;
};

export function TimelineGroup({ label, children }: TimelineGroupProps) {
  return (
    <div className="flex flex-col">
      {/* top-14 = altura do Header (sticky top-0 z-40 h-14): o rótulo gruda
          logo ABAIXO dele, nunca coberto */}
      <div className="sticky top-14 z-20 -mx-1 mb-3 bg-bg/90 px-1 py-1.5 backdrop-blur-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-fg-4">{label}</p>
      </div>
      {children}
    </div>
  );
}

type TimelineProps = {
  children: React.ReactNode;
  className?: string;
};

export function Timeline({ children, className }: TimelineProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      {children}
    </div>
  );
}
