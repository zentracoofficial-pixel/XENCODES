import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/ui/container";
import { searchServices, getServiceMeta, getInventoryStatus } from "@/lib/inventory";
import { BuyPanel } from "@/components/product/buy-panel";
import { PageHero } from "@/components/marketing/page-hero";
import { getVisitorCurrency } from "@/lib/currency-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buy a Number",
  description:
    "Search any service, pick a country, see the exact price, and get a virtual number for your SMS verification code. No code, no charge.",
  alternates: { canonical: "/buy" },
};

export default async function BuyPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; country?: string; activation?: string }>;
}) {
  const { service: serviceSlug, activation: activationId } = await searchParams;
  const session = await auth();

  // A signed-in customer belongs in the dashboard, not on the marketing
  // site. This route stays for visitors who have not signed in yet, and
  // for the header's own Get a Number link, but anyone with an account is
  // sent to the dashboard version so buying never drops them back out
  // into the public site.
  if (session?.user?.id) {
    const params = new URLSearchParams();
    if (serviceSlug) params.set("service", serviceSlug);
    if (activationId) params.set("activation", activationId);
    const query = params.toString();
    redirect(query ? `/dashboard/buy?${query}` : "/dashboard/buy");
  }

  // The first page of services, so the picker is useful before a single
  // keystroke. Everything past this comes from the search endpoint.
  const [status, initialServices, visitorCurrency] = await Promise.all([
    getInventoryStatus(),
    searchServices("").catch(() => []),
    getVisitorCurrency(),
  ]);

  // A deep link to a service that is not on the first page still needs to
  // arrive selected, so fetch that one on its own.
  let services = initialServices;
  if (serviceSlug && !services.some((s) => s.slug === serviceSlug)) {
    const meta = await getServiceMeta(serviceSlug);
    if (meta) services = [meta, ...services];
  }

  return (
    <>
      <PageHero
        crumbs={[{ label: "Buy a Number" }]}
        eyebrow="Live prices"
        title="Buy a number"
        description="Search any service, pick a country, and see the exact price before you buy. If no code arrives, the number is cancelled and refunded automatically."
        overlap
      />
      <Container className="relative -mt-16 pb-14 sm:-mt-20 sm:pb-20">
        {/* Only reached when signed out, so there is no wallet to show and
            the panel's own prompts point at logging in. */}
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-panel)] sm:p-8 [&>div>*:first-child]:mt-0">
          <BuyPanel
            initialServices={services}
            initialServiceSlug={serviceSlug}
            signedIn={false}
            walletBalanceKobo={0}
            currency={visitorCurrency.code}
            unavailableMessage={status.connected ? undefined : status.message}
            showHeading={false}
          />
        </div>
      </Container>
    </>
  );
}
