import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { brandIcons } from "@/data/brand-icons";

const sizes = {
  sm: { box: "h-8 w-8 rounded-lg", glyph: 15, text: "text-[10px]" },
  md: { box: "h-10 w-10 rounded-lg", glyph: 19, text: "text-xs" },
  lg: { box: "h-12 w-12 rounded-xl", glyph: 23, text: "text-sm" },
} as const;

/**
 * The open icon set only covers a few dozen of the provider's ~1800
 * services, so the lettermark is the common case here, not the exception:
 * most of the /services directory is drawn by this branch. A single
 * character on a plain tile made that page read as a wall of broken images
 * ("1688" showing as "1", "2game" as "2"), so the fallback takes up to two
 * leading characters and sits on a tint of the service's own colour. That
 * is enough to tell adjacent rows apart at a glance and looks like a chosen
 * style rather than a missing asset.
 */
function lettermark(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, "");
  return (cleaned.slice(0, 2) || name.slice(0, 1)).toUpperCase();
}
export function ServiceLogo({
  slug,
  name,
  color,
  size = "md",
  className,
}: {
  slug: string;
  name: string;
  color: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const icon = brandIcons[slug];
  const { box, glyph, text } = sizes[size];

  return (
    <span
      aria-hidden
      style={{ "--brand": color } as CSSProperties}
      className={cn(
        "flex shrink-0 items-center justify-center border text-[var(--brand)]",
        icon
          ? "border-border bg-background"
          : // A wash of the service's own colour, so a page of lettermarks
            // reads as a deliberate set rather than a set of failures.
            "border-[color-mix(in_srgb,var(--brand)_22%,transparent)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]",
        box,
        className,
      )}
    >
      {icon ? (
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="currentColor">
          <path d={icon.path} />
        </svg>
      ) : (
        <span className={cn("font-bold uppercase tracking-tight", text)}>
          {lettermark(name)}
        </span>
      )}
    </span>
  );
}
