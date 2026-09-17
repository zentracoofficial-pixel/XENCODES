import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shown wherever a page would otherwise list services or prices while no
 * number provider is connected.
 *
 * It says the shelf is empty rather than filling it. Xencodes previously
 * showed placeholder inventory in this situation, which a customer had no
 * way to tell apart from a real offer. Nothing replaces this notice until
 * there is a supplier behind the numbers.
 */
export function UnavailableNotice({
  message,
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg bg-warning-soft px-3.5 py-3 text-sm leading-relaxed text-warning",
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        Number availability is currently unavailable.{" "}
        {message ?? "No number provider is connected yet."} Nothing can be
        purchased until it is.
      </span>
    </p>
  );
}
