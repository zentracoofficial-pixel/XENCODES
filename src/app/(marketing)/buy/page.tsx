import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { getCatalog, getServiceForBuy } from "@/lib/catalog";
import { BuyFlow } from "./buy-flow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get a Number",
  description:
    "Choose the service you need, pick a country, and get a virtual number that receives your verification code in seconds.",
  alternates: { canonical: "/buy" },
};

export default async function BuyPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; country?: string; activation?: string }>;
}) {
  const { service: serviceSlug, activation: activationId } = await searchParams;
  const [{ services, isLive }, session] = await Promise.all([getCatalog(), auth()]);

  if (services.length === 0) notFound();

  // Linking straight to a service outside the eagerly priced set (SMSPool's
  // full catalog is far bigger than what getCatalog() precomputes): price it
  // live, on demand, and fold it in so BuyFlow's existing selection logic
  // just works without knowing the difference.
  let allServices = services;
  if (serviceSlug && !services.some((s) => s.slug === serviceSlug)) {
    const onDemand = await getServiceForBuy(serviceSlug);
    if (onDemand && onDemand.offers.length > 0) {
      allServices = [...services, onDemand];
    }
  }

  // Resuming an activation the customer already paid for.
  let resumed = null;
  if (activationId && session?.user?.id) {
    const row = await prisma.activation.findFirst({
      where: { id: activationId, userId: session.user.id },
    });
    if (row) {
      const service = services.find((s) => s.slug === row.serviceSlug);
      const offer = service?.offers.find((o) => o.countrySlug === row.countrySlug);
      resumed = {
        id: row.id,
        serviceSlug: row.serviceSlug,
        serviceName: row.serviceName,
        serviceColor: service?.color ?? "#063B2D",
        countryName: row.countryName,
        flag: offer?.flag ?? "",
        phoneNumber: row.phoneNumber,
        priceKobo: row.priceKobo,
        status: row.status as "WAITING" | "RECEIVED" | "EXPIRED" | "CANCELLED",
        code: row.code,
        expiresAt: row.expiresAt.toISOString(),
      };
    }
  }

  const walletBalanceKobo = session?.user?.id
    ? ((
        await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { walletBalanceKobo: true },
        })
      )?.walletBalanceKobo ?? 0)
    : 0;

  return (
    <Container className="py-10 sm:py-14">
      <BuyFlow
        services={allServices}
        initialServiceSlug={serviceSlug}
        resumed={resumed}
        signedIn={Boolean(session?.user?.id)}
        walletBalanceKobo={walletBalanceKobo}
        isLive={isLive}
      />
    </Container>
  );
}
