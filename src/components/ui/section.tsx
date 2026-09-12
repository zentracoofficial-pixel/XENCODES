import { cn } from "@/lib/utils";

export function Section({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("py-14 sm:py-20", className)} {...props} />;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-8 gap-y-4",
        className,
      )}
    >
      <div className="max-w-xl">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h2
          className={cn(
            "text-2xl font-semibold tracking-tight text-balance sm:text-[28px]",
            eyebrow && "mt-2.5",
          )}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
