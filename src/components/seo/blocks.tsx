import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import type { FaqItem } from "@/data/faq";

/** A row of headline figures under a page heading. */
export function StatRow({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-surface px-4 py-3.5 shadow-[var(--shadow-subtle)]">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-lg font-semibold tracking-tight">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Three-step "how it works" list, numbered. */
export function Steps({ title, steps }: { title: string; steps: Array<{ title: string; body: string }> }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-subtle)] sm:p-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <ol className="mt-5 space-y-4">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint-soft text-sm font-semibold text-forest">
              {index + 1}
            </span>
            <div>
              <p className="text-[15px] font-medium">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export interface LinkItem {
  href: string;
  label: string;
  hint?: string;
  leading?: React.ReactNode;
}

/** A grid of links to related pages, the site's internal navigation. */
export function LinkGrid({ title, intro, items, moreHref, moreLabel }: { title: string; intro?: string; items: LinkItem[]; moreHref?: string; moreLabel?: string }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {intro ? <p className="mt-1.5 text-sm text-muted-foreground">{intro}</p> : null}
        </div>
        {moreHref ? (
          <Link href={moreHref} className="text-sm font-medium text-forest underline-offset-4 hover:underline">
            {moreLabel ?? "See all"}
          </Link>
        ) : null}
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.href} className="min-w-0">
            <Link
              href={item.href}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-[var(--shadow-subtle)] transition-colors hover:border-mint/50 hover:bg-mint-soft/40"
            >
              {item.leading}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.label}</span>
                {item.hint ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.hint}</span> : null}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-forest" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Questions and answers, with matching FAQPage structured data. */
export function FaqSection({ title = "Frequently asked questions", items }: { title?: string; items: FaqItem[] }) {
  return (
    <section className="mt-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }}
      />
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-5">
        <FaqAccordion items={items} />
      </div>
    </section>
  );
}
