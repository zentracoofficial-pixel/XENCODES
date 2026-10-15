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
import { UsdtFunding } from "./usdt-funding";

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
  usdt,
}: {
  naira: Omit<ComponentProps<typeof AddFunds>, "walletCurrency" | "embedded">;
  /** USDT through Cryptomus: on only when the server has it configured. */
  usdt: { enabled: boolean; minCents: number; maxCents: number };
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
  if (searchParams.get("reference")) {
    return <AddFunds {...naira} walletCurrency={walletCurrency} />;
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
        // Not yet approved on the KoraPay account: shown, but coming soon.
        status: enabled.has(code) ? "available" : "coming_soon",
      }),
    ),
    {
      id: USDT_FUNDING.code,
      chip: "₮",
      code: USDT_FUNDING.code,
      name: USDT_FUNDING.name,
      methods: "USDT",
      status: usdt.enabled ? "available" : "coming_soon",
    },
  ];
  // A US dollar account pays with USDT.
  const displayPay = display === "USD" && usdt.enabled ? USDT_FUNDING.code : display;
  // The customer's own currency first and USDT second (first for a US dollar
  // account, which pays with USDT), then the rest.
  const rank = (id: string) => (id === displayPay ? 0 : id === USDT_FUNDING.code ? 1 : 2);
  const ordered = [...cards].sort((a, b) => rank(a.id) - rank(b.id));
  const isAvailable = (id: string | null | undefined) =>
    Boolean(id && cards.some((c) => c.id === id && c.status === "available"));

  // Default: the currency the customer chose to see prices in, when they can
  // pay in it; otherwise their country's currency; otherwise Naira.
  const fromCountry = fundingCurrencyForCountry(country);
  const preferred = isAvailable(displayPay) ? displayPay : isAvailable(fromCountry) ? fromCountry : isAvailable("NGN") ? "NGN" : null;
  const active = picked && picked.forDisplay === display && isAvailable(picked.id) ? picked.id : preferred;
  const activeCard = cards.find((c) => c.id === active) ?? null;
  const activeOption =
    active && active !== "NGN" && active !== USDT_FUNDING.code ? enabled.get(active as FundingCurrencyCode) : undefined;

  const displayNote =
    display !== "NGN" && !isAvailable(displayPay)
      ? `${display} payments are coming soon. ${
          activeCard?.id === USDT_FUNDING.code
            ? "You can pay with USDT, which puts your account in US dollars."
            : activeCard
              ? `For now you can pay in ${activeCard.code}, and the amount is added to your balance in ${display}.`
              : "Please check back soon."
        }`
      : null;
  const notice = tapNotice && tapNotice.forDisplay === display ? tapNotice.text : null;
  const noLocal = !cards.some((c) => c.id !== "NGN" && c.status === "available");
  const showUsdtNotice = !usdt.enabled && (display === "USD" || (noLocal && display !== "NGN" && country !== "NG"));

  function reasonFor(card: CardModel): string | null {
    switch (card.status) {
      case "coming_soon":
        return card.id === USDT_FUNDING.code
          ? USDT_FUNDING.comingSoonMessage
          : `${card.code} payments are coming soon. Please choose another currency for now.`;
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
      <div role="radiogroup" aria-label="Payment currency" className="mt-3 grid grid-cols-2 gap-3 max-[340px]:grid-cols-1 sm:grid-cols-4">
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
                "flex min-h-[4.25rem] min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-3 text-left transition-colors sm:gap-3 sm:px-3",
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
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold sm:h-9 sm:w-9 sm:text-[11px]",
                  isActive ? "bg-forest text-white" : "bg-mint-soft text-forest",
                )}
              >
                {card.chip}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", isActive ? "text-forest" : "text-foreground")}>
                  {card.code}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground sm:text-xs">
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
      {activeCard && activeCard.id !== USDT_FUNDING.code ? (
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
        ) : active === USDT_FUNDING.code ? (
          <UsdtFunding minCents={usdt.minCents} maxCents={usdt.maxCents} />
        ) : active === "NGN" ? (
          <AddFunds {...naira} walletCurrency={walletCurrency} embedded />
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
