import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/marketing/breadcrumbs";

/**
 * The opening band of every public page: the homepage hero's light
 * background, faint green grid and mint glow, at a page-header scale. One component so
 * every page opens the same way and the site reads as one product.
 *
 * `overlap` leaves extra room at the bottom for a card that the page pulls up
 * over the band (the buy page's panel), so the tool sits right under its
 * heading instead of a screen further down.
 */
export function PageHero({
  crumbs,
  eyebrow,
  title,
  description,
  children,
  overlap = false,
  className,
}: {
  crumbs: BreadcrumbItem[];
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  overlap?: boolean;
  className?: string;
}) {
  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-background text-foreground">
      <div aria-hidden className="hero-grid-light pointer-events-none absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-36 -z-10 h-80 w-[32rem] rounded-full bg-mint/25 blur-[110px]"
      />
      <Container className={cn("pt-7 sm:pt-9", overlap ? "pb-24 sm:pb-28" : "pb-12 sm:pb-16", className)}>
        <Breadcrumbs items={crumbs} />
        <div className="mt-6 max-w-2xl sm:mt-8">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest">{eyebrow}</p>
          ) : null}
          <h1 className="mt-3 text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-balance sm:text-5xl">
            {title}
          </h1>
          {description ? (
            <div className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted-foreground text-pretty">{description}</div>
          ) : null}
          {children ? <div className="mt-7">{children}</div> : null}
        </div>
      </Container>
    </section>
  );
}
