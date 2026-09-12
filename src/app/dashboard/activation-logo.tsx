import { ServiceLogo } from "@/components/marketing/service-logo";
import { services } from "@/data/services";

/**
 * Activations store their own service slug and name, so one that is later
 * removed from the catalog still renders. It falls back to a neutral
 * lettermark rather than breaking.
 */
export function ActivationLogo({
  serviceSlug,
  serviceName,
  size = "md",
}: {
  serviceSlug: string;
  serviceName: string;
  size?: "sm" | "md" | "lg";
}) {
  const known = services.find((service) => service.slug === serviceSlug);

  return (
    <ServiceLogo
      slug={serviceSlug}
      name={serviceName}
      color={known?.color ?? "#63756F"}
      size={size}
    />
  );
}
