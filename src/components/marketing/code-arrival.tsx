import { Check, MessageSquareText } from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";

/**
 * Static representation of the activation screen, used as a bento tile so the
 * homepage shows the actual product surface rather than a stock illustration.
 */
export function CodeArrival() {
  return (
    <div className="flex h-full flex-col justify-between gap-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">+234 812 445 0917</p>
          <p className="text-xs text-muted-foreground">WhatsApp · Nigeria</p>
        </div>
        <StatusDot tone="success" label="Delivered" pulse />
      </div>

      <div className="rounded-xl border border-border bg-background/70 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#25D366] text-white">
            <MessageSquareText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">WhatsApp</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Your code is 482-019. Don&apos;t share it with anyone.
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="font-mono text-4xl font-semibold tracking-[0.2em] text-primary sm:text-5xl">
          482019
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-success" />
          Pulled out of the SMS for you, ready to copy
        </p>
      </div>
    </div>
  );
}
