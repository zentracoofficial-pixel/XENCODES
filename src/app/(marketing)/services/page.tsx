import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { searchServices, getInventoryStatus } from "@/lib/inventory";
import { UnavailableNotice } from "@/components/product/unavailable-notice";
import { PageHero } from "@/components/marketing/page-hero";
import { ArrowRight } from "lucide-react";
import { ServicesList } from "./services-list";
import { SERVICE_PAGES } from "@/data/service-pages";

export const dynamic = "force-dynamic";

/** The whole directory, not a page of it. Capped well above any real
 *  catalog so nothing is silently cut off. */
const DIRECTORY_LIMIT = 5000;

export const metadata: Metadata = {
  title: "Supported Services",
  description:
    "Every service you can verify with a Xencodes virtual number. Instagram, Facebook, WhatsApp, Telegram, TikTok, Google, Fiverr and more, with live availability by country.",
  keywords: [
    "WhatsApp verification number",
    "Telegram virtual number",
    "Instagram SMS verification",
    "Fiverr phone verification",
  ],
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const [status, services] = await Promise.all([
    getInventoryStatus(),
    searchServices("", DIRECTORY_LIMIT).catch(() => []),
  ]);

  const categories = Array.from(
    new Set(services.map((service) => service.category)),
  ).sort();

  return (
    <>
      <PageHero
        crumbs={[{ label: "Services" }]}
        eyebrow="Services"
        title="Find your service"
        description={
          services.length > 0
            ? `${services.length.toLocaleString("en-US")} services available right now. Pick one to choose a country and see its price.`
            : "Services appear here as soon as numbers are back on sale."
        }
        overlap
      />

      <Container className="relative -mt-16 pb-14 sm:-mt-20 sm:pb-20">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-panel)] sm:p-6">
          {status.connected ? null : (
            <UnavailableNotice message={status.message} className="max-w-xl" />
          )}

          {services.length > 0 ? (
            <ServicesList services={services} categories={categories} />
          ) : null}
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {SERVICE_PAGES.map((page) => (
            <Link
              key={page.slug}
              href={`/services/${page.slug}`}
              className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-mint/50 hover:bg-mint-soft/40"
            >
              <span>
                <span className="block text-sm font-semibold">{page.name} verification guide</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">How it works, pricing and limits</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-forest" aria-hidden />
            </Link>
          ))}
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Prices depend on the service and country you pick. See{" "}
          <Link href="/pricing" className="text-forest underline-offset-4 hover:underline">
            how pricing works
          </Link>
          , or check{" "}
          <Link href="/faq" className="text-forest underline-offset-4 hover:underline">
            common questions
          </Link>{" "}
          before you buy.
        </p>
      </Container>
    </>
  );
}
