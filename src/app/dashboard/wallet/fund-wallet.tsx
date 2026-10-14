"use client";

import { useState, type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FUNDING_CURRENCIES,
  FUNDING_CURRENCY_CODES,
  currencySupportsCountry,
  fundingCurrencyForCountry,
  type FundingCurrencyCode,
} from "@/lib/funding-currencies";
import { CURRENCY_COUNTRIES } from "@/lib/currency-meta";
import { countryName } from "@/lib/countries";
import { USDT_FUNDING } from "@/lib/usdt";
import { CountryPicker } from "@/components/currency/country-picker";
import { AddFunds } from "./add-funds";
import { LocalFunding } from "./local-funding";
import { UsdtComingSoonNotice } from "./usdt-coming-soon";

/**
 * The wallet's funding area: every payment currency as a card in one grid,
 * the available ones selectable, the rest shown greyed out with the reason
 * when tapped.
 *
 * Naira funding is the original flow and always available. A local currency
 * is selectable only when an admin has switched it on (server decided, see
 * getFundingOptions()) and it is for the customer's own country; the server
 * checks both again on every quote, so this grid is only a convenience. USDT
 * is a "coming soon" card and nothing more.
 */

export interface LocalOption {
  code: FundingCurrencyCode;
  name: string;
  symbol: string;
  methods: string[];
  minMinor: number;
  maxMinor: number;
}

type CardStatus = "available" | "needs_country" | "other_country" | "unavailable" | "coming_soon";

interface CardModel {
  id: string;
  chip: string;
  code: string;
  name: string;
  methods: string;
  status: CardStatus;
}

export function FundWallet({
  naira,
  walletCurrency,
  options,
  savedCountry,
  detectedCountry,
}: {
  naira: ComponentProps<typeof AddFunds>;
  walletCurrency: string;
  /** Every local currency currently switched on by an admin, whatever the
   *  customer's country; the country check happens here and on the server. */
  options: LocalOption[];
  savedCountry: string | null;
  /** Country detected from the request, only ever a preselected suggestion. */
  detectedCountry: string | null;
}) {
  const searchParams = useSearchParams();
  const [country, setCountry] = useState<string | null>(savedCountry);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Coming back from KoraPay (either kind of payment): only the status card.
  // Also the plain case for a wallet that is not in Naira.
  if (searchParams.get("reference") || walletCurrency !== "NGN") {
    return <AddFunds {...naira} />;
  }

  const enabled = new Map(options.map((option) => [option.code, option]));
  const recommended = fundingCurrencyForCountry(country);

  const cards: CardModel[] = [
    {
      id: "NGN",
      chip: "NG",
      code: "NGN",
      name: "Naira",
      methods: "Card, bank transfer",
      status: naira.fundingProvider ? "available" : "unavailable",
    },
    ...FUNDING_CURRENCY_CODES.map((code): CardModel => {
      const meta = FUNDING_CURRENCIES[code];
      const status: CardStatus = !enabled.has(code)
        ? "unavailable"
        : country === null
          ? "needs_country"
          : currencySupportsCountry(code, country)
            ? "available"
            : "other_country";
      return {
        id: code,
        chip: CURRENCY_COUNTRIES[code][0],
        code,
        name: meta.name,
        methods: meta.methods.join(", "),
        status,
      };
    }),
    {
      id: USDT_FUNDING.code,
      chip: "₮",
      code: USDT_FUNDING.code,
      name: USDT_FUNDING.name,
      methods: "Crypto deposit",
      status: "coming_soon",
    },
  ];

  const availableLocal = cards.filter((c) => c.id !== "NGN" && c.status === "available");
  const fallback =
    (recommended && availableLocal.find((c) => c.id === recommended)?.id) ?? (cards[0].status === "available" ? "NGN" : null);
  const active =
    selected && cards.some((c) => c.id === selected && c.status === "available") ? selected : fallback;
  const activeCard = cards.find((c) => c.id === active) ?? null;
  const activeOption = active && active !== "NGN" ? enabled.get(active as FundingCurrencyCode) : undefined;

  const needsCountry = country === null;
  const showUsdtNotice = country !== null && country !== "NG" && availableLocal.length === 0;

  function reasonFor(card: CardModel): string | null {
    const where = FUNDING_CURRENCIES[card.code as FundingCurrencyCode]?.countries.map((c) => c.name).join(", ");
    switch (card.status) {
      case "coming_soon":
        return USDT_FUNDING.comingSoonMessage;
      case "needs_country":
        return `Tell us your country above to pay in ${card.code}.`;
      case "other_country":
        return `${card.code} payments are for customers in ${where}. Your account country is ${countryName(country) ?? country}. Contact support if that is wrong.`;
      case "unavailable":
        return card.id === "NGN"
          ? "Naira payments are not connected right now. Please check back soon."
          : `${card.code} payments are not available yet.`;
      default:
        return null;
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Fund wallet</h2>

      {needsCountry ? (
        <div className="mt-4">
          <CountryPicker id="funding-country" suggested={detectedCountry} onSaved={setCountry} />
        </div>
      ) : null}

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Select payment currency
      </p>
      <div role="radiogroup" aria-label="Payment currency" className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {cards.map((card) => {
          const isActive = card.id === active;
          const usable = card.status === "available";
          return (
            <button
              key={card.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-disabled={!usable}
              title={usable ? card.methods : (reasonFor(card) ?? undefined)}
              onClick={() => {
                if (usable) {
                  setSelected(card.id);
                  setNotice(null);
                } else {
                  setNotice(reasonFor(card));
                }
              }}
              className={cn(
                "flex min-h-[3.75rem] items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                isActive
                  ? "border-mint bg-mint-soft"
                  : usable
                    ? "border-border bg-background hover:border-mint"
                    : "border-border bg-background opacity-50",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "w-6 shrink-0 text-xs font-semibold",
                  isActive ? "text-forest" : "text-muted-foreground",
                )}
              >
                {card.chip}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", isActive ? "text-forest" : "text-foreground")}>
                  {card.code}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {card.status === "coming_soon" ? "Coming soon" : card.name}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {notice ? (
        <p role="status" className="mt-3 rounded-lg bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          {notice}
        </p>
      ) : activeCard ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Pay with {activeCard.methods}.
          {activeCard.id === recommended || (activeCard.id === "NGN" && country === "NG")
            ? ` Recommended for ${countryName(country)}.`
            : ""}{" "}
          Your wallet is credited in Naira once the payment is confirmed.
        </p>
      ) : null}

      <div className="mt-5 border-t border-border pt-5">
        {activeOption ? (
          <LocalFunding
            key={activeOption.code}
            code={activeOption.code}
            symbol={activeOption.symbol}
            name={activeOption.name}
            minMinor={activeOption.minMinor}
            maxMinor={activeOption.maxMinor}
            country={country}
          />
        ) : active === "NGN" ? (
          <AddFunds {...naira} embedded />
        ) : (
          <p className="text-sm text-muted-foreground">No payment option is available right now.</p>
        )}
      </div>

      {showUsdtNotice ? (
        <div className="mt-5">
          <UsdtComingSoonNotice />
        </div>
      ) : null}
    </section>
  );
}
