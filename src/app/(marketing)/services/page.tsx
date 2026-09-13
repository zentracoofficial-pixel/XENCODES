import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { getCatalog, getAllServices } from "@/lib/catalog";
import { DevelopmentDataNotice } from "@/components/product/development-notice";
import { ServicesList, type DirectoryEntry } from "./services-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Supported Services",
  description:
    "Every service you can verify with a Xencodes virtual number, with live availability and Naira prices. Instagram, Facebook, WhatsApp, Telegram, TikTok, Google, Fiverr, Upwork and more.",
  keywords: [
    "WhatsApp verification number Nigeria",
    "Telegram virtual number",
    "Instagram SMS verification",
    "Fiverr phone verification Nigeria",
  ],
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const [{ services: priced, categories, isLive }, allServices] = await Promise.all([
    getCatalog(),
    getAllServices(),
  ]);

  const pricedBySlug = new Map(priced.map((service) => [service.slug, service]));

  // Priced services (fast, precomputed) keep their real "from ₦X" and
  // country count. Everything else the provider lists still shows up, just
  // without a price until a customer actually selects it on /buy: pricing
  // all of the provider's full catalog up front is not viable (see
  // SmsPoolProvider's KNOWN_SERVICE_NAMES), but that no longer means most of
  // it is invisible.
  const directory: DirectoryEntry[] = allServices.map((service) => {
    const withPrice = pricedBySlug.get(service.slug);
    return withPrice
      ? {
          slug: withPrice.slug,
          name: withPrice.name,
          color: withPrice.color,
          category: withPrice.category,
          priceFromNaira: withPrice.priceFromNaira,
          offerCount: withPrice.offers.length,
        }
      : {
          slug: service.slug,
          name: service.name,
          color: service.color,
          category: service.category,
        };
  });

  const allCategories = Array.from(
    new Set([...categories, ...directory.map((d) => d.category)]),
  ).sort();

  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Find your service
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {directory.length} services available right now. Pick one to choose a
        country and get a number.
      </p>

      {!isLive ? <DevelopmentDataNotice className="mt-4 max-w-xl" /> : null}

      <div className="mt-6">
        <ServicesList services={directory} categories={allCategories} />
      </div>
    </Container>
  );
}
