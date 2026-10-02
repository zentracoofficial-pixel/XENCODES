"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { GENERIC_SERVICE_COLOR, canon, resolveBrandIcon } from "@/lib/brand-match";

const sizes = {
  sm: { box: "h-8 w-8 rounded-lg", glyph: 15, text: "text-[10px]" },
  md: { box: "h-10 w-10 rounded-lg", glyph: 19, text: "text-xs" },
  lg: { box: "h-12 w-12 rounded-xl", glyph: 23, text: "text-sm" },
} as const;

/**
 * Up to two leading characters ("1688" as "16", not "1"), so adjacent rows
 * in a long directory stay distinguishable at a glance.
 */
function lettermark(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, "");
  return (cleaned.slice(0, 2) || name.trim().slice(0, 1)).toUpperCase();
}

// Deep enough to read as text on a 10% wash of themselves.
const LETTERMARK_TINTS = [
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#DC2626",
  "#EA580C",
  "#B45309",
  "#15803D",
  "#0F766E",
  "#0E7490",
  "#4F46E5",
  "#9333EA",
  "#4D7C0F",
];

/** The same name always gets the same tint, so a service looks the same on
 *  every page, but neighbours in a list don't all share one grey. */
function tintFor(name: string) {
  let hash = 5381;
  for (const char of canon(name)) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return LETTERMARK_TINTS[hash % LETTERMARK_TINTS.length];
}

/**
 * Three layers, cheapest first:
 *  1. The small curated set (src/data/brand-icons.ts), drawn inline.
 *  2. The full Simple Icons catalogue, served one cached SVG per service by
 *     /api/service-logo/[slug] so it never ships to the browser in bulk.
 *  3. A tinted lettermark.
 *
 * Layer 3 renders immediately and layer 2 replaces it only once its image
 * has actually loaded: a service with no known logo (a 404 from the route)
 * simply keeps its lettermark, with no broken-image icon or empty box ever
 * showing in between.
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
  const icon = resolveBrandIcon(slug, name);
  const { box, glyph, text } = sizes[size];

  const remoteSrc = icon
    ? null
    : `/api/service-logo/${encodeURIComponent(slug)}?name=${encodeURIComponent(name.trim())}`;
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const showRemote = remoteSrc !== null && loadedSrc === remoteSrc;

  // An image already in the browser cache can finish loading before React
  // hydrates and attaches onLoad, which would then never fire.
  useEffect(() => {
    const img = imgRef.current;
    if (remoteSrc && img?.complete && img.naturalWidth > 0) setLoadedSrc(remoteSrc);
  }, [remoteSrc]);

  const tint = color.toLowerCase() === GENERIC_SERVICE_COLOR.toLowerCase() ? tintFor(name) : color;
  const neutral = Boolean(icon) || showRemote;

  return (
    <span
      aria-hidden
      style={{ "--brand": tint } as CSSProperties}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden border text-[var(--brand)]",
        neutral
          ? "border-border bg-background"
          : // A wash of the service's own colour, so a page of lettermarks
            // reads as a deliberate set rather than a set of failures.
            "border-[color-mix(in_srgb,var(--brand)_22%,transparent)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]",
        box,
        className,
      )}
    >
      {icon ? (
        <svg width={glyph} height={glyph} viewBox={icon.viewBox ?? "0 0 24 24"} fill="currentColor">
          <path d={icon.path} />
        </svg>
      ) : (
        <>
          {showRemote ? null : (
            <span className={cn("font-bold uppercase tracking-tight", text)}>{lettermark(name)}</span>
          )}
          {remoteSrc ? (
            // A plain <img>: this is a tiny same-origin SVG with its own
            // long cache headers, which next/image would add nothing to.
            // Kept in the layout (just transparent) until it loads, since a
            // display:none lazy image is never fetched at all.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={remoteSrc}
              alt=""
              width={glyph}
              height={glyph}
              loading="lazy"
              decoding="async"
              onLoad={() => setLoadedSrc(remoteSrc)}
              className={cn(
                "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                showRemote ? "opacity-100" : "opacity-0",
              )}
            />
          ) : null}
        </>
      )}
    </span>
  );
}
