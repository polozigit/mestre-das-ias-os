import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        // bg-sutil já flipa no dark via theme.css — sem variante dark: aqui.
        "animate-pulse rounded-md bg-bg-sutil",
        className,
      )}
    />
  );
}
