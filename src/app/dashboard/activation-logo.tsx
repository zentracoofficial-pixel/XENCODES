import { ServiceLogo } from "@/components/marketing/service-logo";
import { getServiceBySlug } from "@/data/services";

/**
 * Activations store their own service slug/name, so a service later removed
 * from the catalog still renders — it just falls back to a neutral lettermark.
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
  const service = getServiceBySlug(serviceSlug);
  return (
    <ServiceLogo
      size={size}
      service={
        service ?? { slug: serviceSlug, name: serviceName, color: "#6B6480" }
      }
    />
  );
}
