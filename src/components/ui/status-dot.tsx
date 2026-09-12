import { cn } from "@/lib/utils";

const dotColors = {
  live: "bg-mint",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-muted-foreground",
} as const;

const textColors = {
  live: "text-forest",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted-foreground",
} as const;

export function StatusDot({
  tone,
  label,
  pulse = false,
  className,
}: {
  tone: keyof typeof dotColors;
  label?: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          dotColors[tone],
          pulse && "animate-live",
        )}
      />
      {label ? (
        <span className={cn("text-sm font-medium", textColors[tone])}>{label}</span>
      ) : null}
    </span>
  );
}
