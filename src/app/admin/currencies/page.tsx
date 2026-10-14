import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin";
import { readCurrencyConfig } from "@/lib/currency-config";
import { minorUnitDivisor } from "@/lib/currency";
import { CurrencyForm } from "./currency-form";
import { FundingCurrencyForm } from "./funding-currency-form";
import { FeePolicyForm } from "./fee-policy-form";
import { readFeePolicy } from "@/lib/fee-policy";
import { readFundingStates, isFundingStateUsable, isRateStale, effectiveUsdRate } from "@/lib/funding-config";
import { freshMarketRates } from "@/lib/market-rates";
import { readSettings } from "@/lib/settings";
import { FUNDING_CURRENCY_CODES, FUNDING_CURRENCIES, fundingRateDeviationPercent } from "@/lib/funding-currencies";
import { getDisplayRates } from "@/lib/exchange-rates";
import { isKorapayConfigured } from "@/lib/korapay";

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

  const [config, fundingStates] = await Promise.all([readCurrencyConfig(), readFundingStates()]);
  const ngnRate = config.find((c) => c.code === "NGN")?.usdRate ?? 0;
  const korapay = isKorapayConfigured();
  // Market rates (from the exchange-rate feed) to compare the funding rates
  // against; only used when the feed has actually supplied them.
  const market = await getDisplayRates();
  const marketForFunding = freshMarketRates(await readSettings());
  const feeCodes = ["NGN", ...FUNDING_CURRENCY_CODES] as const;
  const feePolicies = await Promise.all(feeCodes.map((code) => readFeePolicy("wallet_funding", code)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Currencies</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Registration, pricing, the wallet and checkout all use exactly one
          of these two, based on whether an account is in Nigeria. Ghana, the
          UK, the US and every other supported country all use USD; none of
          them get their own wallet currency. (Paying in a local currency is separate; see Local-currency funding below.)
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
                }}
              />
            </div>
          </Card>
        ))}
      </div>


      <div className="pt-2">
        <h2 className="text-lg font-semibold tracking-tight">Funding fees</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The only place a fee on a wallet top-up comes from. A fee is shown to customers and added to the payment
          only when it is approved and switched on here; the server checks this on every quote, so nothing in the
          browser can add or skip one. A currency with no approved decision is not offered at all. Number prices
          are not fees and are set under Services.
        </p>
      </div>

      <div className="space-y-4">
        {feeCodes.map((code, index) => {
          const policy = feePolicies[index];
          const divisor = minorUnitDivisor(code);
          const state = !policy ? "Not decided: funding unavailable" : !policy.approved ? "Draft: funding unavailable" : policy.enabled ? "Fee charged" : "Approved: no fee";
          return (
            <Card key={`fee-${code}`} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{code} funding fee</h3>
                <Badge variant={policy?.approved ? "success" : "warning"}>{state}</Badge>
              </div>
              <div className="mt-3">
                <FeePolicyForm
                  currency={code}
                  values={{
                    exists: Boolean(policy),
                    model: policy?.model ?? "percent",
                    percent: policy?.percent ?? 0,
                    fixed: (policy?.fixedMinor ?? 0) / divisor,
                    cap: policy?.capMinor != null ? policy.capMinor / divisor : null,
                    approved: policy?.approved ?? false,
                    enabled: policy?.enabled ?? false,
                    approvedBy: policy?.approvedBy ?? null,
                    approvedAt: policy?.approvedAt ?? null,
                  }}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="pt-2">
        <h2 className="text-lg font-semibold tracking-tight">Local-currency funding</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Customers in these countries can pay in their own currency through KoraPay; the wallet is still credited
          in Naira, at the rate saved here when they start the payment. Every currency is off until you confirm it
          is enabled on the Xencodes KoraPay account and save a rate. Only these six exist; there is no way to add
          others here.
        </p>
        {!korapay ? (
          <p className="mt-2 text-sm text-warning">
            KoraPay is not connected on this deployment, so no local currency is offered to customers.
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        {FUNDING_CURRENCY_CODES.map((code) => {
          const meta = FUNDING_CURRENCIES[code];
          const state = fundingStates[code];
          const divisor = minorUnitDivisor(code);
          const liveRate = effectiveUsdRate(code, state, marketForFunding);
          const feePolicy = feePolicies[feeCodes.indexOf(code)];
          const live = korapay && isFundingStateUsable(state) && liveRate !== null && Boolean(feePolicy?.approved);
          const stale = isRateStale(state);
          const deviation =
            market.asOf && state.usdRate && !state.followMarket
              ? fundingRateDeviationPercent(state.usdRate, market.perUsd[code])
              : null;
          return (
            <Card key={code} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  {code}
                  <span className="text-xs font-normal text-muted-foreground">
                    {meta.countries.map((c) => c.name).join(", ")} · {meta.methods.join(", ")}
                  </span>
                </h3>
                <Badge variant={live ? "success" : "warning"}>{live ? "Offered to customers" : "Off"}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {state.followMarket
                  ? liveRate && ngnRate
                    ? `Following the market: ${liveRate} ${code} per USD, so 1 ${code} = ₦${(ngnRate / liveRate).toFixed(4)} right now.`
                    : "Following the market, but no fresh market rate is available, so payments are paused."
                  : state.usdRate && ngnRate
                    ? `1 ${code} = ₦${(ngnRate / state.usdRate).toFixed(4)} at the saved rates.`
                    : "No rate saved yet."}
                {!state.followMarket && state.rateUpdatedAt
                  ? ` Rate set ${new Date(state.rateUpdatedAt).toLocaleDateString("en-GB")}.`
                  : ""}
                {!state.followMarket && stale ? " This rate is over a week old; check it against the market." : ""}
              </p>
              {deviation !== null && Math.abs(deviation) >= 3 ? (
                <p className={deviation > 0 ? "mt-1 text-xs font-medium text-danger" : "mt-1 text-xs text-warning"}>
                  {deviation > 0
                    ? `Customers get ${deviation.toFixed(1)}% more Naira per ${code} than the market rate (${market.perUsd[code]} per USD). Anyone can pay in ${code}, so check this rate.`
                    : `Customers get ${Math.abs(deviation).toFixed(1)}% less Naira per ${code} than the market rate (${market.perUsd[code]} per USD).`}
                </p>
              ) : null}
              <div className="mt-3">
                <FundingCurrencyForm
                  code={code}
                  values={{
                    enabled: state.enabled,
                    usdRate: state.usdRate,
                    followMarket: state.followMarket,
                    minAmount: state.minMinor / divisor,
                    maxAmount: state.maxMinor / divisor,
                  }}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
