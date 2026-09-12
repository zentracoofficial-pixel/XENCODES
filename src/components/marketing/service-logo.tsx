import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { brandIcons } from "@/data/brand-icons";

const sizes = {
  sm: { box: "h-8 w-8 rounded-lg", glyph: 15, text: "text-[11px]" },
  md: { box: "h-10 w-10 rounded-lg", glyph: 19, text: "text-sm" },
  lg: { box: "h-12 w-12 rounded-xl", glyph: 23, text: "text-base" },
} as const;

/**
 * A service's brand mark on a neutral tile. Brands whose icons are not in the
 * open icon set fall back to a lettermark in the brand colour, which reads as
 * deliberate rather than broken.
 */
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
        "flex shrink-0 items-center justify-center border border-border bg-background text-[var(--brand)]",
        box,
        className,
      )}
    >
      {icon ? (
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="currentColor">
          <path d={icon.path} />
        </svg>
      ) : (
        <span className={cn("font-bold", text)}>{name.slice(0, 1)}</span>
      )}
    </span>
  );
}
