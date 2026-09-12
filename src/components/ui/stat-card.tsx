import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </Card>
  );
}
