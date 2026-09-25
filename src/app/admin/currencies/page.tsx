import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin";
import { readCurrencyConfig } from "@/lib/currency-config";
import { minorUnitDivisor } from "@/lib/currency";
import { CurrencyForm, CurrencyEnabledToggle } from "./currency-form";

export const metadata: Metadata = { title: "Admin: Currencies" };

export const dynamic = "force-dynamic";

/**
 * Which currencies Xencodes actually sells in.
 *
 * NGN ships enabled by default and can never be disabled or removed here:
 * it is the platform's original, confirmed-working currency, and every
 * pre-existing account and order is genuinely denominated in it. Enabling
 * anything else is a deliberate claim an admin is making — that KoraPay can
 * actually charge and settle that currency for this merchant account, and
 * that the exchange rate entered is real and current — since neither fact
 * can be verified from inside this codebase. Get both confirmed with
 * KoraPay before switching a new currency on for customers.
 */
export default async function AdminCurrenciesPage() {
  await requireAdmin();

  const config = await readCurrencyConfig();
  const sorted = [...config].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Currencies</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every currency customers can register, be priced, and pay in.
          Registration, pricing, the wallet and KoraPay checkout all use an
          account&apos;s own currency here, never a hardcoded one. A new
          currency should only be enabled once KoraPay has confirmed it can
          actually charge and settle it for this account.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Add a currency</h2>
        <div className="mt-3">
          <CurrencyForm existing={null} />
        </div>
      </Card>

      <div className="space-y-4">
        {sorted.map((entry) => (
          <Card key={entry.code} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                {entry.code}
                {entry.countryLabel ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {entry.countryLabel}
                  </span>
                ) : null}
              </h2>
              <CurrencyEnabledToggle code={entry.code} enabled={entry.enabled} />
            </div>
            <div className="mt-3">
              <CurrencyForm
                existing={{
                  code: entry.code,
                  enabled: entry.enabled,
                  usdRate: entry.usdRate,
                  minTopUp: entry.minTopUpMinor / minorUnitDivisor(entry.code),
                  maxTopUp: entry.maxTopUpMinor / minorUnitDivisor(entry.code),
                  feeCap: entry.feeCapMinor / minorUnitDivisor(entry.code),
                  priority: entry.priority,
                  countryLabel: entry.countryLabel ?? "",
                }}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
