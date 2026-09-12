import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { getCatalog } from "@/lib/catalog";
import { DevelopmentDataNotice } from "@/components/product/development-notice";
import { ServicesList } from "./services-list";

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
  const { services, categories, isLive } = await getCatalog();

  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Find your service
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {services.length} services available right now. Pick one to choose a
        country and get a number.
      </p>

      {!isLive ? <DevelopmentDataNotice className="mt-4 max-w-xl" /> : null}

      <div className="mt-6">
        <ServicesList services={services} categories={categories} />
      </div>
    </Container>
  );
}
