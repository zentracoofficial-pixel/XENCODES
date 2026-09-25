import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { brandIcons } from "@/data/brand-icons";
import { searchServices, getServiceMeta, getInventoryStatus } from "@/lib/inventory";
import { BuyPanel } from "@/components/product/buy-panel";
import { ActivationView } from "@/components/product/activation-view";
import { getCurrencyConfig, getDefaultCurrency } from "@/lib/currency-config";

/**
 * Buy a number, inside the dashboard.
 *
 * This is the route the dashboard's own Buy Number link points at, so a
 * signed-in customer never leaves the application to purchase: the
 * dashboard layout wraps this, keeping the sidebar, the top bar and their
 * account context in place. The public /buy route still exists for
 * visitors who have not signed in, and sends anyone who has here instead.
 */

export const metadata: Metadata = { title: "Buy a Number" };

export const dynamic = "force-dynamic";

const FALLBACK_COLOR = "#063B2D";

export default async function DashboardBuyPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; activation?: string }>;
}) {
  const { service: serviceSlug, activation: activationId } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/dashboard/buy");
  const userId = session.user.id;

  // A live activation takes over the page: the number and the code the
  // customer is waiting on matter more than the form that produced them.
  // Scoped to this customer's own orders by the query itself.
  if (activationId) {
    const row = await prisma.activation.findFirst({
      where: { id: activationId, userId },
    });

    if (row) {
      return (
        <ActivationView
          backHref="/dashboard/buy"
          activation={{
            id: row.id,
            serviceSlug: row.serviceSlug,
            serviceName: row.serviceName,
            serviceColor: brandIcons[row.serviceSlug]?.hex ?? FALLBACK_COLOR,
            countryName: row.countryName,
            phoneNumber: row.phoneNumber,
            priceKobo: row.priceKobo,
            currency: row.currency,
            status: row.status,
            code: row.code,
            expiresAt: row.expiresAt.toISOString(),
          }}
        />
      );
    }
  }

  const [status, initialServices, user, defaultCurrency] = await Promise.all([
    getInventoryStatus(),
    searchServices("").catch(() => []),
    prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalanceKobo: true, currency: true },
    }),
    getDefaultCurrency(),
  ]);
  // Falls back to the platform default only if the account somehow carries
  // a currency no longer enabled; never assumed to be Naira otherwise.
  const currency = user ? ((await getCurrencyConfig(user.currency))?.code ?? defaultCurrency.code) : defaultCurrency.code;

  // A deep link to a service outside the first page still needs to arrive
  // selected, so fetch that one on its own.
  let services = initialServices;
  if (serviceSlug && !services.some((s) => s.slug === serviceSlug)) {
    const meta = await getServiceMeta(serviceSlug);
    if (meta) services = [meta, ...services];
  }

  return (
    <BuyPanel
      initialServices={services}
      initialServiceSlug={serviceSlug}
      signedIn
      walletBalanceKobo={user?.walletBalanceKobo ?? 0}
      currency={currency}
      unavailableMessage={status.connected ? undefined : status.message}
      basePath="/dashboard/buy"
      walletHref="/dashboard/wallet"
    />
  );
}
