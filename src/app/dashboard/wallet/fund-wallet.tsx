"use client";

import { useState, type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FUNDING_CURRENCIES,
  FUNDING_CURRENCY_CODES,
  fundingCurrencyForCountry,
  type FundingCurrencyCode,
} from "@/lib/funding-currencies";
import { CURRENCY_COUNTRIES } from "@/lib/currency-meta";
import { USDT_FUNDING } from "@/lib/usdt";
import { useDisplayMoney } from "@/components/currency/currency-provider";
import { AddFunds } from "./add-funds";
import { LocalFunding } from "./local-funding";
import { UsdtComingSoonNotice } from "./usdt-coming-soon";

/**
 * The wallet's funding area: every payment currency as a card in one grid,
 * the available ones selectable, the rest shown greyed out with the reason
 * when tapped.
 *
 * The currency the customer picked in the currency selector is the one
 * selected here, so choosing GHS up top means paying in GHS. Naira funding is
 * the original flow. A local currency is selectable when an admin has
 * switched it on (server decided, see getFundingOptions()); the server checks
 * it again on every quote. USDT is a "coming soon" card and nothing more.
 */

export interface LocalOption {
  code: FundingCurrencyCode;
  name: string;
  symbol: string;
  methods: string[];
  minMinor: number;
  maxMinor: number;
}

type CardStatus = "available" | "unavailable" | "coming_soon";

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
  country,
}: {
  naira: ComponentProps<typeof AddFunds>;
  walletCurrency: string;
  /** Every local currency currently switched on by an admin. */
  options: LocalOption[];
  /** Saved account country, or the detected one: only used to suggest a
   *  currency when the display currency is not one you can pay in. */
  country: string | null;
}) {
  const searchParams = useSearchParams();
  const money = useDisplayMoney();
  const display = money?.display ?? "NGN";
  // A manual pick is remembered only for the display currency it was made
  // under: choosing a new currency in the selector moves funding to it.
  const [picked, setPicked] = useState<{ id: string; forDisplay: string } | null>(null);
  // Same for the "why is this greyed out" message.
  const [tapNotice, setTapNotice] = useState<{ text: string | null; forDisplay: string } | null>(null);

  // Coming back from KoraPay (either kind of payment): only the status card.
  // Also the plain case for a wallet that is not in Naira.
  if (searchParams.get("reference") || walletCurrency !== "NGN") {
    return <AddFunds {...naira} />;
  }

  const enabled = new Map(options.map((option) => [option.code, option]));

  const cards: CardModel[] = [
    {
      id: "NGN",
      chip: "NG",
      code: "NGN",
      name: "Naira",
      methods: "Card, bank transfer",
      status: naira.fundingProvider ? "available" : "unavailable",
    },
    ...FUNDING_CURRENCY_CODES.map(
      (code): CardModel => ({
        id: code,
        chip: CURRENCY_COUNTRIES[code][0],
        code,
        name: FUNDING_CURRENCIES[code].name,
        methods: FUNDING_CURRENCIES[code].methods.join(", "),
        status: enabled.has(code) ? "available" : "unavailable",
      }),
    ),
    {
      id: USDT_FUNDING.code,
      chip: "₮",
      code: USDT_FUNDING.code,
      name: USDT_FUNDING.name,
      methods: "Crypto deposit",
      status: "coming_soon",
    },
  ];
  // The customer's own currency first, then the rest, USDT last.
  const rank = (id: string) => (id === display ? 0 : id === USDT_FUNDING.code ? 2 : 1);
  const ordered = [...cards].sort((a, b) => rank(a.id) - rank(b.id));
  const isAvailable = (id: string | null | undefined) =>
    Boolean(id && cards.some((c) => c.id === id && c.status === "available"));

  // Default: the currency the customer chose to see prices in, when they can
  // pay in it; otherwise their country's currency; otherwise Naira.
  const fromCountry = fundingCurrencyForCountry(country);
  const preferred = isAvailable(display) ? display : isAvailable(fromCountry) ? fromCountry : isAvailable("NGN") ? "NGN" : null;
  const active = picked && picked.forDisplay === display && isAvailable(picked.id) ? picked.id : preferred;
  const activeCard = cards.find((c) => c.id === active) ?? null;
  const activeOption = active && active !== "NGN" ? enabled.get(active as FundingCurrencyCode) : undefined;

  const displayNote =
    display === "USD"
      ? "Prices are shown in US dollars, but dollars are not a payment option. Pay in Naira or a local currency below; USDT is coming soon."
      : display !== "NGN" && !isAvailable(display)
        ? `${display} payments are not available yet, so ${activeCard ? `you can pay in ${activeCard.code}` : "please check back soon"}. Your prices still show in ${display}.`
        : null;
  const notice = tapNotice && tapNotice.forDisplay === display ? tapNotice.text : null;
  const noLocal = !cards.some((c) => c.id !== "NGN" && c.status === "available");
  const showUsdtNotice = display === "USD" || (noLocal && display !== "NGN" && country !== "NG");

  function reasonFor(card: CardModel): string | null {
    switch (card.status) {
      case "coming_soon":
        return USDT_FUNDING.comingSoonMessage;
      case "unavailable":
        return card.id === "NGN"
          ? "Naira payments are not connected right now. Please check back soon."
          : `${card.code} payments are not available yet. Please choose another currency.`;
      default:
        return null;
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Fund wallet</h2>

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Select payment currency
      </p>
      <div role="radiogroup" aria-label="Payment currency" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ordered.map((card) => {
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
                  setPicked({ id: card.id, forDisplay: display });
                  setTapNotice(null);
                } else {
                  setTapNotice({ text: reasonFor(card), forDisplay: display });
                }
              }}
              className={cn(
                "flex min-h-[4.25rem] min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
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
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  isActive ? "bg-forest text-white" : "bg-mint-soft text-forest",
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
      ) : displayNote ? (
        <p className="mt-3 rounded-lg bg-warning-soft px-3.5 py-2.5 text-sm text-warning">{displayNote}</p>
      ) : null}
      {activeCard ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Pay with {activeCard.methods}. Your balance goes up as soon as the payment is confirmed.
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
