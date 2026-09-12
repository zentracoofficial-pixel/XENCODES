import { cn } from "@/lib/utils";

export function Section({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("py-16 sm:py-24 first:pt-24 sm:first:pt-32", className)}
      {...props}
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base sm:text-lg text-muted-foreground text-balance">
          {description}
        </p>
      ) : null}
    </div>
  );
}
