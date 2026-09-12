import { Check, Copy, MessageSquareText, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";

export function InboxPreview() {
  return (
    <Card className="w-full max-w-md overflow-hidden shadow-xl shadow-black/5">
      <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">+1 (415) 555-0182</span>
        </div>
        <StatusDot tone="success" label="Active" pulse />
      </div>

      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Instagram &middot; USA
          </p>
          <Badge variant="success">Delivered</Badge>
        </div>

        <div className="rounded-lg border border-border bg-secondary/40 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#E1306C] text-white">
              <MessageSquareText className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Instagram</p>
                <p className="text-xs text-muted-foreground">just now</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Your Instagram code is <span className="font-semibold text-foreground">482 019</span>. Don&apos;t share this code.
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
          Verified in 11 seconds
        </div>
      </div>
    </Card>
  );
}
