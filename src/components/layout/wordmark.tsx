import { cn } from "@/lib/utils";

/**
 * The Xencodes mark: two crossing strokes forming an X, one forest and one
 * mint. Drawn rather than borrowed from an icon set, so the brand does not
 * look like every other product using the same library.
 */
export function XenMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("h-6 w-6", className)}
    >
      <path
        d="M5.5 5.5 L18.5 18.5"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M18.5 5.5 L5.5 18.5"
        stroke="var(--mint)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  tone = "dark",
}: {
  className?: string;
  /** "light" for use on a forest background. */
  tone?: "dark" | "light";
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-11 items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]",
        tone === "light" ? "text-white" : "text-forest",
        className,
      )}
    >
      <XenMark className="h-[22px] w-[22px]" />
      Xencodes
    </span>
  );
}
