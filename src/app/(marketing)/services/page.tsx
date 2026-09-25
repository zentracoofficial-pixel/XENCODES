import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { searchServices, getInventoryStatus } from "@/lib/inventory";
import { UnavailableNotice } from "@/components/product/unavailable-notice";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { ServicesList } from "./services-list";

export const dynamic = "force-dynamic";

/** The whole directory, not a page of it. Capped well above any real
 *  catalog so nothing is silently cut off. */
const DIRECTORY_LIMIT = 5000;

export const metadata: Metadata = {
  title: "Supported Services",
  description:
    "Every service you can verify with a Xencodes virtual number. Instagram, Facebook, WhatsApp, Telegram, TikTok, Google, Fiverr and more, priced in your own currency.",
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
    <Container className="py-10 sm:py-14">
      <Breadcrumbs items={[{ label: "Services" }]} />
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Find your service
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {services.length > 0
          ? `${services.length.toLocaleString("en-US")} services available right now. Pick one to choose a country and see its price.`
          : "Services appear here as soon as numbers are back on sale."}
      </p>

      {status.connected ? null : (
        <UnavailableNotice message={status.message} className="mt-4 max-w-xl" />
      )}

      {services.length > 0 ? (
        <div className="mt-6">
          <ServicesList services={services} categories={categories} />
        </div>
      ) : null}

      <p className="mt-10 text-sm text-muted-foreground">
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
  );
}
