import { Check, Copy, MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";

function FloatingNumberCard({
  flag,
  country,
  dialCode,
  price,
  className,
}: {
  flag: string;
  country: string;
  dialCode: string;
  price: string;
  className?: string;
}) {
  return (
    <div
      className={`absolute hidden sm:flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg shadow-black/5 ${className}`}
    >
      <span className="text-xl leading-none">{flag}</span>
      <div>
        <p className="text-sm font-medium leading-tight">{country}</p>
        <p className="text-xs text-muted-foreground">
          {dialCode} &middot; from {price}
        </p>
      </div>
    </div>
  );
}

export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-sm py-8 sm:py-4">
      <FloatingNumberCard
        flag="🇳🇬"
        country="Nigeria"
        dialCode="+234"
        price="₦80"
        className="-left-6 -top-9 -rotate-3 sm:-left-14"
      />
      <FloatingNumberCard
        flag="🇺🇸"
        country="United States"
        dialCode="+1"
        price="₦110"
        className="-right-6 -bottom-4 rotate-2 sm:-right-12"
      />

      <Card className="w-full overflow-hidden shadow-xl shadow-black/5">
        <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-5 py-3.5">
          <span className="text-sm font-medium">Xencodes</span>
          <StatusDot tone="success" label="Live" pulse />
        </div>

        <div className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              WhatsApp verification
            </p>
            <Badge variant="success">Delivered</Badge>
          </div>

          <div className="rounded-lg border border-border bg-secondary/40 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#25D366] text-white">
                <MessageSquareText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">WhatsApp</p>
                  <p className="text-xs text-muted-foreground">just now</p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your code is <span className="font-semibold text-foreground">482-019</span>
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <span className="tracking-[0.3em] font-mono">482019</span>
            <span className="flex items-center gap-1.5 text-primary">
              <Copy className="h-3.5 w-3.5" />
              Copy code
            </span>
          </button>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-success" />
            Received in 12 seconds
          </div>
        </div>
      </Card>
    </div>
  );
}
