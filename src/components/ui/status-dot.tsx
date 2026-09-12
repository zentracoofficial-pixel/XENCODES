import { cn } from "@/lib/utils";

const dotColors = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-muted-foreground",
} as const;

const textColors = {
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
      <span className="relative flex h-2 w-2">
        {pulse ? (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
              dotColors[tone],
            )}
          />
        ) : null}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            dotColors[tone],
          )}
        />
      </span>
      {label ? (
        <span className={cn("text-sm font-medium", textColors[tone])}>
          {label}
        </span>
      ) : null}
    </span>
  );
}
