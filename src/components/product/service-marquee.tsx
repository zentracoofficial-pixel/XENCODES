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

/**
 * Below this many items, a row is narrower than most screens, so the
 * "shift by half the track's width" loop leaves a visible gap of empty
 * space once a lap: it looks like the marquee has run out and stalled
 * rather than looping. Repeating the list up to this floor keeps the track
 * wide regardless of how few branded services exist, so the loop always
 * has something to show and never visibly pauses.
 */
const MIN_ROW_ITEMS = 14;

function padToMinimum(items: MarqueeService[]): MarqueeService[] {
  if (items.length === 0 || items.length >= MIN_ROW_ITEMS) return items;
  const copies = Math.ceil(MIN_ROW_ITEMS / items.length);
  return Array.from({ length: copies }, () => items).flat();
}

function Row({
  services,
  /** How many leading items are the real, distinct set; anything from here
   *  on in the array is a repeat added only to keep the track wide enough
   *  to loop cleanly, and stays out of the tab order and screen reader
   *  output the same way the second pass already does. */
  realCount,
  reverse = false,
  durationSeconds,
}: {
  services: MarqueeService[];
  realCount: number;
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
            {services.map((service, index) => {
              const isRepeat = pass === 1 || index >= realCount;
              return (
                <li key={`${service.slug}-${index}`}>
                  <Link
                    href={`/buy?service=${service.slug}`}
                    aria-hidden={isRepeat ? true : undefined}
                    tabIndex={isRepeat ? -1 : undefined}
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
              );
            })}
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
  const topReal = services.slice(0, half);
  const bottomReal = services.slice(half);
  const top = padToMinimum(topReal);
  const bottom = padToMinimum(bottomReal);

  // Longer rows take proportionally longer, so both drift at the same speed.
  const secondsPerItem = 3.2;

  return (
    <div className="space-y-2.5">
      <Row
        services={top}
        realCount={topReal.length}
        durationSeconds={top.length * secondsPerItem}
      />
      <Row
        services={bottom}
        realCount={bottomReal.length}
        reverse
        durationSeconds={bottom.length * secondsPerItem}
      />
    </div>
  );
}
