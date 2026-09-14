import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { searchServices, getServiceMeta } from "@/lib/inventory";
import { BuyPanel } from "./buy-panel";
import { ActivationView } from "./activation-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buy a Number",
  description:
    "Search any service, pick a country, and get a virtual number that receives your verification code in seconds.",
  alternates: { canonical: "/buy" },
};

export default async function BuyPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; country?: string; activation?: string }>;
}) {
  const { service: serviceSlug, activation: activationId } = await searchParams;
  const session = await auth();

  // An activation in progress takes over the page: the customer's number
  // and code matter more than the form that produced them.
  if (activationId && session?.user?.id) {
    const row = await prisma.activation.findFirst({
      where: { id: activationId, userId: session.user.id },
    });

    if (row) {
      const meta = await getServiceMeta(row.serviceSlug);
      return (
        <Container className="py-10 sm:py-14">
          <ActivationView
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
        </Container>
      );
    }
  }

  // The first page of services, so the picker is useful before a single
  // keystroke. Everything past this comes from the search endpoint.
  const [initialServices, walletBalanceKobo] = await Promise.all([
    searchServices("").catch(() => []),
    session?.user?.id
      ? prisma.user
          .findUnique({
            where: { id: session.user.id },
            select: { walletBalanceKobo: true },
          })
          .then((row) => row?.walletBalanceKobo ?? 0)
      : Promise.resolve(0),
  ]);

  // A deep link to a service that is not on the first page still needs to
  // arrive selected, so fetch that one on its own.
  let services = initialServices;
  if (serviceSlug && !services.some((s) => s.slug === serviceSlug)) {
    const meta = await getServiceMeta(serviceSlug);
    if (meta) services = [meta, ...services];
  }

  return (
    <Container className="py-10 sm:py-14">
      <BuyPanel
        initialServices={services}
        initialServiceSlug={serviceSlug}
        signedIn={Boolean(session?.user?.id)}
        walletBalanceKobo={walletBalanceKobo}
      />
    </Container>
  );
}
