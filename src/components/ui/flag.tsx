import { flagIso2 } from "@/lib/flag";

/**
 * A country's flag as a picture. Flag emoji are not drawn at all by Windows
 * browsers (they show as the letters "US", "GB"), so the flag is an SVG
 * served from /flags, the same on every device. Anything that is not a flag
 * (the globe used for a country that could not be placed) stays an emoji.
 */
export function Flag({ flag, className = "" }: { flag: string | null | undefined; className?: string }) {
  const iso2 = flagIso2(flag);
  if (!iso2) {
    return (
      <span aria-hidden className={`inline-block text-lg leading-none ${className}`}>
        {flag || "🌍"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/flags/${iso2}.svg`}
      alt=""
      aria-hidden
      width={24}
      height={16}
      loading="lazy"
      decoding="async"
      className={`inline-block h-4 w-6 shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.12)] ${className}`}
    />
  );
}
