import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { GUIDES } from "@/data/guides";

// Built once and served from the cache: nothing here depends on who is looking.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Guides: SMS Verification and Virtual Numbers",
  description:
    "Plain-English guides to virtual phone numbers, receiving SMS verification codes, fixing codes that do not arrive, and keeping your personal number private.",
  alternates: { canonical: "/guides" },
};

export default function GuidesPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: "Guides" }]}
        eyebrow="Guides"
        title="Virtual numbers and SMS verification, explained"
        description="Practical answers to the questions people ask before, during and after verifying an account with a virtual number."
      />
      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <ul className="grid gap-4">
            {GUIDES.map((guide) => (
              <li key={guide.slug}>
                <Link
                  href={`/guides/${guide.slug}`}
                  className="group flex items-start justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-subtle)] transition-colors hover:border-mint/50 hover:bg-mint-soft/40"
                >
                  <span className="min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-forest">{guide.category}</span>
                    <span className="mt-1 block text-lg font-semibold tracking-tight">{guide.title}</span>
                    <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">{guide.description}</span>
                    <span className="mt-2 block text-xs text-muted-foreground">{guide.readingMinutes} min read</span>
                  </span>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-forest" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <CtaBand title="Ready to try it?" body="Pick a service and a country and see the live price." />
        </div>
      </Container>
    </>
  );
}
