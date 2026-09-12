import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shown wherever catalog data is on screen while no live provider is
 * connected, so development inventory is never mistaken for real numbers.
 * It disappears on its own once an admin enables a provider in Settings.
 */
export function DevelopmentDataNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-warning",
        className,
      )}
    >
      <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Development data. Services, prices and delivery times are placeholders
        until the number provider is connected.
      </span>
    </p>
  );
}
