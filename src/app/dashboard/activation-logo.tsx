import { ServiceLogo } from "@/components/marketing/service-logo";
import { brandIcons } from "@/data/brand-icons";

/** Neutral tint for a service with no brand colour of its own. */
const FALLBACK_COLOR = "#63756F";

/**
 * The logo for an order.
 *
 * Orders store their own service slug and name, so one for a service that
 * is no longer sold, or that came from a previous supplier, still renders.
 * The brand colour comes from the shared icon set when there is one and
 * falls back to a neutral tile otherwise, which is what keeps this working
 * with no live provider connected at all.
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
  return (
    <ServiceLogo
      slug={serviceSlug}
      name={serviceName}
      color={brandIcons[serviceSlug]?.hex ?? FALLBACK_COLOR}
      size={size}
    />
  );
}
