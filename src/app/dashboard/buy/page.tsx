import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { searchServices, getServiceMeta } from "@/lib/inventory";
import { BuyPanel } from "@/components/product/buy-panel";
import { ActivationView } from "@/components/product/activation-view";

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
  if (activationId) {
    const row = await prisma.activation.findFirst({
      where: { id: activationId, userId },
    });

    if (row) {
      const meta = await getServiceMeta(row.serviceSlug);
      return (
        <ActivationView
          backHref="/dashboard/buy"
          activation={{
            id: row.id,
            serviceSlug: row.serviceSlug,
            serviceName: row.serviceName,
            serviceColor: meta?.color ?? "#063B2D",
            countryName: row.countryName,
            flag: "",
            phoneNumber: row.phoneNumber,
            priceKobo: row.priceKobo,
            status: row.status,
            code: row.code,
            expiresAt: row.expiresAt.toISOString(),
          }}
        />
      );
    }
  }

  const [initialServices, user] = await Promise.all([
    searchServices("").catch(() => []),
    prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalanceKobo: true },
    }),
  ]);

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
      basePath="/dashboard/buy"
      walletHref="/dashboard/wallet"
    />
  );
}
