import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { ServicesDirectory } from "@/components/marketing/services-directory";
import { getCatalog } from "@/lib/catalog";
import { catalogFloorNaira } from "@/data/services";
import { formatNairaFromNaira } from "@/lib/currency";
import type { ServiceCategory } from "@/data/types";

// Availability and pricing come from the admin-controlled catalog, so this
// page always renders fresh rather than relying on tag-based ISR to catch up.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Supported Services — WhatsApp, Telegram, Instagram & More",
  description: `Every service you can verify with a Xencodes virtual number, with live availability and Naira prices from ${formatNairaFromNaira(catalogFloorNaira)}. WhatsApp, Telegram, Instagram, Facebook, TikTok, Fiverr, Upwork and more.`,
  keywords: [
    "WhatsApp verification number Nigeria",
    "Telegram virtual number",
    "Instagram SMS verification",
    "Fiverr phone verification Nigeria",
  ],
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const { services } = await getCatalog();
  const categories = Array.from(
    new Set(services.map((s) => s.category)),
  ) as ServiceCategory[];

  return (
    <Section>
      <Container>
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Services
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {services.length} services you can verify today
          </h1>
          <p className="mt-4 text-lg text-muted-foreground text-balance">
            Search for what you&apos;re verifying, then go straight to buying a
            number for it. Prices are live and shown in Naira.
          </p>
        </div>

        <div className="mt-10">
          <ServicesDirectory services={services} categories={categories} />
        </div>
      </Container>
    </Section>
  );
}
