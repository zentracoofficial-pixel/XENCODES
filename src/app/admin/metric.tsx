import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "danger" | "warning";

const TONE_TEXT: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
};

const TONE_BAR: Record<Tone, string> = {
  default: "bg-transparent",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
};

/**
 * One figure on its own card: what it is, the number, and a line of context.
 * A coloured edge marks the figures that need a look (pending, failed) or are
 * good news (completed, profit). A figure with records behind it links
 * straight to them.
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
  /** Makes the card a link straight to the records behind it. */
  href?: string;
  tone?: Tone;
}) {
  const body = (
    <>
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", TONE_BAR[tone])} />
      <span className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {href ? (
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-forest" />
        ) : null}
      </span>
      <span className={cn("mt-2 block break-words text-xl font-semibold tracking-tight tabular-nums sm:text-2xl", TONE_TEXT[tone])}>
        {value}
      </span>
      {hint ? <span className="mt-1 block text-xs leading-snug text-muted-foreground">{hint}</span> : null}
    </>
  );

  const className =
    "group relative block h-full overflow-hidden rounded-xl border border-border bg-surface px-4 pb-4 pt-4";

  return href ? (
    <Link href={href} className={cn(className, "transition-[border-color,box-shadow] hover:border-mint/70 hover:shadow-[var(--shadow-raised)]")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
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
        "grid grid-cols-2 gap-3 sm:grid-cols-3",
        columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}
