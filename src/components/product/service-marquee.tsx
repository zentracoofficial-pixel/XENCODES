import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { ServiceLogo } from "@/components/marketing/service-logo";

/**
 * The whole catalog drifting past in two rows, one each way.
 *
 * Pure CSS: the track holds the row twice and slides by half its width, so it
 * loops seamlessly with no JavaScript and no layout thrash. Hovering or
 * tabbing into a row pauses it so anything can be clicked, and reduced-motion
 * turns it into a plain scrollable row.
 *
 * Only needs slug/name/color, never a price: the provider's whole real
 * catalog can drift past here even though most of it is priced on demand
 * (see /services and getServiceForBuy), not eagerly like the curated set.
 * Clicking through to /buy already handles both cases identically.
 */
export interface MarqueeService {
  slug: string;
  name: string;
  color: string;
}

function Row({
  services,
  reverse = false,
  durationSeconds,
}: {
  services: MarqueeService[];
  reverse?: boolean;
  durationSeconds: number;
}) {
  if (services.length === 0) return null;

  return (
    <div className="marquee-row marquee-mask overflow-hidden">
      <div
        className={cn(
          "flex w-max gap-2.5",
          reverse ? "animate-marquee-reverse" : "animate-marquee",
        )}
        style={{ "--marquee-duration": `${durationSeconds}s` } as CSSProperties}
      >
        {/* Two passes: the second is a visual copy, hidden from screen readers
            and keyboard order so nothing is announced or tabbed to twice. */}
        {[0, 1].map((pass) => (
          <ul
            key={pass}
            aria-hidden={pass === 1}
            className="flex shrink-0 gap-2.5"
          >
            {services.map((service) => (
              <li key={service.slug}>
                <Link
                  href={`/buy?service=${service.slug}`}
                  tabIndex={pass === 1 ? -1 : undefined}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-surface py-2.5 pl-2.5 pr-4 transition-colors hover:border-mint hover:bg-mint-soft"
                >
                  <ServiceLogo
                    slug={service.slug}
                    name={service.name}
                    color={service.color}
                    size="sm"
                  />
                  <span className="whitespace-nowrap text-sm font-medium">
                    {service.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

export function ServiceMarquee({ services }: { services: MarqueeService[] }) {
  if (services.length === 0) return null;

  // Split down the middle so the two rows carry different services rather
  // than the same ones passing twice.
  const half = Math.ceil(services.length / 2);
  const top = services.slice(0, half);
  const bottom = services.slice(half);

  // Longer rows take proportionally longer, so both drift at the same speed.
  const secondsPerItem = 3.2;

  return (
    <div className="space-y-2.5">
      <Row services={top} durationSeconds={top.length * secondsPerItem} />
      <Row
        services={bottom}
        reverse
        durationSeconds={bottom.length * secondsPerItem}
      />
    </div>
  );
}
