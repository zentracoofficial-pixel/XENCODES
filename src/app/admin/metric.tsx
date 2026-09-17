import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * One number in a dense grid.
 *
 * Deliberately not a card each. An operator reading this panel wants to
 * take in eight or ten figures in one glance, and eight large tiles with
 * icons is a page you have to scroll rather than a panel you can scan. The
 * grid below draws them as cells of one bordered block instead.
 */
export function Metric({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** Makes the cell a link straight to the records behind it. */
  href?: string;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-danger"
        : tone === "warning"
          ? "text-warning"
          : "text-foreground";

  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1.5 text-xl font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </>
  );

  const className = "block px-4 py-3.5";

  return (
    <div className="border-b border-r border-border last:border-r-0">
      {href ? (
        <Link href={href} className={cn(className, "transition-colors hover:bg-mint-soft")}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </div>
  );
}

export function MetricGrid({
  children,
  columns = 4,
}: {
  children: React.ReactNode;
  columns?: 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-xl border border-border bg-surface [&>*:last-child]:border-b-0",
        "grid-cols-2 sm:grid-cols-3",
        columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}
