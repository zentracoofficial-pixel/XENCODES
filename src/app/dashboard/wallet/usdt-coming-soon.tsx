import { Coins } from "lucide-react";

/**
 * USDT funding, announced but not built.
 *
 * This is deliberately only a card and a sentence: no deposit address, no
 * network choice, no payment request, no blockchain monitoring and no wallet
 * crediting exists anywhere for it. It is kept as its own component, driven
 * by one options object, so that when USDT is actually built the card can be
 * switched on in one place without touching the fiat flow.
 */

export const USDT_OPTION = {
  code: "USDT",
  name: "Tether",
  /** Flip to true only together with a real, tested USDT deposit flow. */
  enabled: false,
  comingSoonMessage:
    "USDT funding is coming soon. We're working to make Xencodes accessible to more countries.",
} as const;

export function UsdtCard() {
  return (
    <div
      aria-disabled="true"
      className="flex w-44 shrink-0 cursor-not-allowed flex-col rounded-xl border border-dashed border-border bg-background/60 p-3.5 opacity-80 sm:w-auto sm:min-w-44 sm:flex-1"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <Coins className="h-4 w-4" />
          {USDT_OPTION.code}
        </span>
        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
          Coming soon
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{USDT_OPTION.name}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">Crypto deposit</p>
    </div>
  );
}

export function UsdtComingSoonNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3">
      <Coins className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <p className="text-sm text-warning">{USDT_OPTION.comingSoonMessage}</p>
    </div>
  );
}
