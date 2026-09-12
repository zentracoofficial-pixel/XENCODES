import { cn } from "@/lib/utils";

export function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 2 : 2,
  }).format(value);
}

export function PriceTag({
  from,
  amount,
  suffix,
  size = "md",
  className,
}: {
  from?: boolean;
  amount: number;
  suffix?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
  } as const;

  return (
    <div className={cn("flex items-baseline gap-1.5", className)}>
      {from ? (
        <span className="text-sm text-muted-foreground">from</span>
      ) : null}
      <span className={cn("font-semibold tracking-tight", sizes[size])}>
        {formatUsd(amount)}
      </span>
      {suffix ? (
        <span className="text-sm text-muted-foreground">{suffix}</span>
      ) : null}
    </div>
  );
}
