import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function Empty({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-5 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="grid size-12 place-items-center rounded-full bg-bg-sutil text-fg-3">
          <Icon size={20} />
        </div>
      )}
      <p className="text-sm font-semibold text-fg-2">{title}</p>
      {description && <p className="max-w-xs text-xs text-fg-3">{description}</p>}
      {action}
    </div>
  );
}
