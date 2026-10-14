import { Coins } from "lucide-react";
import { USDT_FUNDING } from "@/lib/usdt";


/**
 * USDT funding, announced but not built: this sentence and the disabled
 * card in the funding grid are all there is. No deposit address, network
 * choice, payment request, blockchain monitoring or wallet crediting exists
 * anywhere for it (see src/lib/usdt.ts).
 */

export function UsdtComingSoonNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3">
      <Coins className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <p className="text-sm text-warning">{USDT_FUNDING.comingSoonMessage}</p>
    </div>
  );
}
