import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin";
import { readCurrencyConfig } from "@/lib/currency-config";
import { minorUnitDivisor } from "@/lib/currency";
import { CurrencyForm } from "./currency-form";

export const metadata: Metadata = { title: "Admin: Currencies" };

export const dynamic = "force-dynamic";

/**
 * The two currencies Xencodes sells in, and nothing else.
 *
 * NGN for accounts in Nigeria, USD for everywhere else — never a currency
 * per country, and never an add/remove list: these two rows are the whole
 * set, permanently. What is actually editable is each one's rate and
 * top-up bounds; whether a currency can accept a real payment right now is
 * shown here but not editable, because it is computed live from whether a
 * real payment provider is connected (KoraPay for NGN today), never an
 * admin-settable claim that could say "available" when nothing behind it
 * can actually process a payment.
 */
export default async function AdminCurrenciesPage() {
  await requireAdmin();

  const config = await readCurrencyConfig();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Currencies</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Registration, pricing, the wallet and checkout all use exactly one
          of these two, based on whether an account is in Nigeria. Ghana, the
          UK, the US and every other supported country all use USD; none of
          them get their own local currency here.
        </p>
      </div>

      <div className="space-y-4">
        {config.map((entry) => (
          <Card key={entry.code} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                {entry.code}
                <span className="text-xs font-normal text-muted-foreground">
                  {entry.code === "NGN" ? "Nigeria" : "Outside Nigeria"}
                </span>
              </h2>
              <Badge variant={entry.fundingAvailable ? "success" : "warning"}>
                {entry.fundingAvailable
                  ? `Funding live via ${entry.fundingProvider}`
                  : "Funding not connected"}
              </Badge>
            </div>
            {!entry.fundingAvailable ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No payment provider is wired up for {entry.code} yet, so an
                account in this currency can browse and be quoted prices but
                cannot add funds. Nothing here can turn this on by itself:
                it flips automatically the day a real {entry.code}-capable
                provider is connected in code, the same way NGN did for
                KoraPay.
              </p>
            ) : null}
            <div className="mt-3">
              <CurrencyForm
                code={entry.code}
                editableRate={entry.code === "NGN"}
                values={{
                  usdRate: entry.usdRate,
                  minTopUp: entry.minTopUpMinor / minorUnitDivisor(entry.code),
                  maxTopUp: entry.maxTopUpMinor / minorUnitDivisor(entry.code),
                  feeCap: entry.feeCapMinor / minorUnitDivisor(entry.code),
                }}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
