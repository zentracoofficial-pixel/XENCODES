import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ServiceLogo } from "@/components/marketing/service-logo";

/**
 * One or more rows of brand logos, drifting past, each row alternating
 * direction from the one before it.
 *
 * Pure CSS: each row's track holds its content twice and slides by half its
 * width, so it loops seamlessly with no JavaScript and no layout thrash.
 * Hovering or tabbing into a row pauses it, and reduced-motion turns every
 * row into a plain scrollable list (see the .animate-marquee rules in
 * globals.css).
 *
 * Deliberately generic: a row is just slug/name/color, so this same
 * component drives both a curated, static brand showcase (the homepage) and
 * a live-inventory row elsewhere, with `interactive` deciding whether a logo
 * links anywhere. Rows are passed in explicitly rather than assembled from
 * one flat list, so callers with distinct, hand-picked row content (like the
 * homepage's two named rows) do not have to fake that by concatenating and
 * re-splitting an array.
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
 * wide regardless of how few items a row was given, so the loop always has
 * something to show and never visibly pauses.
 */
const MIN_ROW_ITEMS = 14;

function padToMinimum(items: MarqueeService[]): MarqueeService[] {
  if (items.length === 0 || items.length >= MIN_ROW_ITEMS) return items;
  const copies = Math.ceil(MIN_ROW_ITEMS / items.length);
  return Array.from({ length: copies }, () => items).flat();
}

const cardClassName =
  "flex items-center gap-2 rounded-xl border border-border bg-surface py-2 pl-2 pr-3.5 transition-colors sm:gap-2.5 sm:py-2.5 sm:pl-2.5 sm:pr-4";

function Card({ service }: { service: MarqueeService }) {
  return (
    <>
      <ServiceLogo slug={service.slug} name={service.name} color={service.color} size="sm" />
      <span className="whitespace-nowrap text-sm font-medium">{service.name}</span>
    </>
  );
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
  interactive,
}: {
  services: MarqueeService[];
  realCount: number;
  reverse?: boolean;
  durationSeconds: number;
  interactive: boolean;
}) {
  if (services.length === 0) return null;

  return (
    <div className="marquee-row marquee-mask overflow-hidden">
      <div
        className={cn(
          "flex w-max gap-2 sm:gap-2.5",
          reverse ? "animate-marquee-reverse" : "animate-marquee",
        )}
        style={{ "--marquee-duration": `${durationSeconds}s` } as CSSProperties}
      >
        {/* Two passes: the second is a visual copy, hidden from screen readers
            and keyboard order so nothing is announced or tabbed to twice. */}
        {[0, 1].map((pass) => (
          <ul key={pass} aria-hidden={pass === 1} className="flex shrink-0 gap-2 sm:gap-2.5">
            {services.map((service, index) => {
              const isRepeat = pass === 1 || index >= realCount;
              const key = `${service.slug}-${index}`;
              return (
                <li key={key}>
                  {interactive ? (
                    <Link
                      href={`/buy?service=${service.slug}`}
                      aria-hidden={isRepeat ? true : undefined}
                      tabIndex={isRepeat ? -1 : undefined}
                      className={cn(cardClassName, "hover:border-mint hover:bg-mint-soft")}
                    >
                      <Card service={service} />
                    </Link>
                  ) : (
                    // Decorative only: nothing here claims the service can be
                    // bought, so nothing here is a link. See
                    // homepage-showcase.ts for why.
                    <div aria-hidden={isRepeat ? true : undefined} className={cardClassName}>
                      <Card service={service} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
      </div>
    </div>
  );
}

export function ServiceMarquee({
  rows,
  /** Whether a logo links to /buy with that service preselected. Off by
   *  default: a caller opts in only when it knows the row reflects services
   *  that actually exist in the live inventory right now, since a service
   *  shown here is never checked against that inventory before rendering. */
  interactive = false,
}: {
  /** Each row scrolls independently, alternating direction: the first row
   *  drifts one way, the second the other, and so on. */
  rows: MarqueeService[][];
  interactive?: boolean;
}) {
  const nonEmptyRows = rows.filter((row) => row.length > 0);
  if (nonEmptyRows.length === 0) return null;

  // Longer rows take proportionally longer, so every row drifts at the same
  // per-item speed regardless of how many items it holds.
  const secondsPerItem = 3.2;

  const content = (
    <div className="space-y-2 sm:space-y-2.5">
      {nonEmptyRows.map((row, index) => {
        const padded = padToMinimum(row);
        return (
          <Row
            key={index}
            services={padded}
            realCount={row.length}
            reverse={index % 2 === 1}
            durationSeconds={padded.length * secondsPerItem}
            interactive={interactive}
          />
        );
      })}
    </div>
  );

  // A purely decorative showcase carries no information a screen reader
  // user cannot already get from the real search box and /services, so the
  // whole thing is hidden from assistive tech rather than read out row by
  // row. An interactive row is left alone: it is real navigation.
  return interactive ? content : wrapDecorative(content);
}

function wrapDecorative(content: ReactNode) {
  return <div aria-hidden="true">{content}</div>;
}
