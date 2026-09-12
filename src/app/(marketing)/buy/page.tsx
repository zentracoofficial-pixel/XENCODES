import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { getCatalog } from "@/lib/catalog";
import { BuyFlow } from "./buy-flow";
import { ActivationView } from "./activation-view";
import { getActivationStateAction } from "./actions";

export const metadata: Metadata = {
  title: "Get a Number",
  description: "Choose a service and country, purchase a number, and receive your SMS code.",
};

export default async function BuyPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; country?: string; activation?: string }>;
}) {
  const { service, country, activation: activationId } = await searchParams;
  const { services, countries } = await getCatalog();

  if (activationId) {
    const activation = await getActivationStateAction(activationId);
    if (activation) {
      return (
        <Section>
          <Container>
            <ActivationView initial={activation} />
          </Container>
        </Section>
      );
    }
  }

  return (
    <Section>
      <Container>
        <BuyFlow
          services={services}
          countries={countries}
          initialServiceSlug={service}
          initialCountrySlug={country}
        />
      </Container>
    </Section>
  );
}
