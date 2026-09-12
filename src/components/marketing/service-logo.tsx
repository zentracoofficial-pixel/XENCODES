import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { brandIcons } from "@/data/brand-icons";
import type { Service } from "@/data/types";

const sizes = {
  sm: { box: "h-7 w-7 rounded-md", glyph: 14, text: "text-[11px]" },
  md: { box: "h-9 w-9 rounded-lg", glyph: 18, text: "text-sm" },
  lg: { box: "h-12 w-12 rounded-xl", glyph: 24, text: "text-base" },
} as const;

type LogoService = Pick<Service, "slug" | "name" | "color"> &
  Partial<Pick<Service, "colorDark">>;

/**
 * Renders a service's brand mark. Brands whose icons were withdrawn from the
 * open icon set fall back to a lettermark in the brand's colour, which reads
 * as deliberate rather than broken. Near-black brands get a dark-mode colour
 * so they don't disappear against a dark surface.
 */
export function ServiceLogo({
  service,
  size = "md",
  className,
}: {
  service: LogoService;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const icon = brandIcons[service.slug];
  const { box, glyph, text } = sizes[size];

  const brandVars = {
    "--brand": service.color,
    "--brand-dark": service.colorDark ?? service.color,
  } as CSSProperties;

  return (
    <span
      aria-hidden
      style={brandVars}
      className={cn(
        "flex shrink-0 items-center justify-center bg-secondary text-[var(--brand)] ring-1 ring-inset ring-border dark:text-[var(--brand-dark)]",
        box,
        className,
      )}
    >
      {icon ? (
        <svg
          width={glyph}
          height={glyph}
          viewBox="0 0 24 24"
          fill="currentColor"
          role="presentation"
        >
          <path d={icon.path} />
        </svg>
      ) : (
        <span className={cn("font-bold", text)}>{service.name.slice(0, 1)}</span>
      )}
    </span>
  );
}
