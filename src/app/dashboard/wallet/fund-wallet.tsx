"use client";

import { useState, type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FUNDING_CURRENCIES,
  FUNDING_CURRENCY_CODES,
  fundingCurrencyForCountry,
  type FundingCurrencyCode,
} from "@/lib/funding-currencies";
import { USDT_FUNDING } from "@/lib/usdt";
import { useDisplayMoney } from "@/components/currency/currency-provider";
import { AddFunds } from "./add-funds";
import { LocalFunding } from "./local-funding";
import { UsdtComingSoonNotice } from "./usdt-coming-soon";
import { UsdtFunding } from "./usdt-funding";

/**
 * The wallet's funding area, kept light: a standing note on what happens to
 * a short payment, the payment options that work today as a row of pills
 * (none when there is only one), the amount form, and the currencies not yet
 * available on one line.
 *
 * The currency the customer picked in the currency selector is the one
 * selected here, so choosing GHS up top means paying in GHS. Naira funding is
 * the original flow. A local currency is selectable when an admin has
 * switched it on (server decided, see getFundingOptions()); the server checks
 * it again on every quote. USDT is listed once Cryptomus is configured.
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

  // Coming back from KoraPay (either kind of payment): only the status card.
  if (searchParams.get("reference")) {
    return <AddFunds {...naira} walletCurrency={walletCurrency} />;
  }

  const enabled = new Map(options.map((option) => [option.code, option]));

  const cards: CardModel[] = [
    {
      id: "NGN",
      code: "NGN",
      name: "Naira",
      methods: "Card, bank transfer",
      status: naira.fundingProvider ? "available" : "unavailable",
    },
    ...FUNDING_CURRENCY_CODES.map(
      (code): CardModel => ({
        id: code,
        code,
        name: FUNDING_CURRENCIES[code].name,
        methods: FUNDING_CURRENCIES[code].methods.join(", "),
        // Not yet approved on the KoraPay account: shown, but coming soon.
        status: enabled.has(code) ? "available" : "coming_soon",
      }),
    ),
    {
      id: USDT_FUNDING.code,
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
  const noLocal = !cards.some((c) => c.id !== "NGN" && c.status === "available");
  const showUsdtNotice = !usdt.enabled && (display === "USD" || (noLocal && display !== "NGN" && country !== "NG"));

  const available = ordered.filter((card) => card.status === "available");
  const comingSoon = ordered.filter((card) => card.status !== "available").map((card) => card.code);
  const payingUsdt = active === USDT_FUNDING.code;

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Add funds</h2>

      {/* Always visible, whatever the method: what happens to a short payment. */}
      <div role="note" className="mt-3 flex items-start gap-2.5 rounded-lg border border-mint/40 bg-mint-soft px-3.5 py-2.5">
        <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
        <p className="text-sm text-forest">
          {payingUsdt ? (
            <>
              <span className="font-semibold">Pay the exact amount.</span> If you send less USDT, you can send the rest
              before the payment page expires. If you don&apos;t, contact support and it is returned to you.
            </>
          ) : (
            <>
              <span className="font-semibold">Pay the exact amount.</span> If you send less, the payment is cancelled and
              your money is refunded to you automatically. Your wallet is only credited for a full payment.
            </>
          )}
        </p>
      </div>

      {available.length > 1 ? (
        <div role="radiogroup" aria-label="Pay with" className="mt-4 flex flex-wrap gap-2">
          {available.map((card) => {
            const isActive = card.id === active;
            return (
              <button
                key={card.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setPicked({ id: card.id, forDisplay: display })}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors",
                  isActive ? "border-forest bg-forest text-white" : "border-border bg-background hover:border-mint",
                )}
              >
                <span className="font-semibold">{card.code}</span>
                <span className={cn("text-xs", isActive ? "text-white/70" : "text-muted-foreground")}>{card.methods}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {activeCard ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {available.length > 1 ? "" : `Paying in ${activeCard.code}. `}
          {payingUsdt
            ? "Pay in USDT on the network you choose. Your balance goes up once the payment is confirmed."
            : `Pay by ${activeCard.methods.toLowerCase().replace(/, (?=[^,]*$)/, " or ")}. Your balance goes up as soon as the payment is confirmed.`}
        </p>
      ) : null}

      {displayNote ? (
        <p className="mt-3 rounded-lg bg-warning-soft px-3.5 py-2.5 text-sm text-warning">{displayNote}</p>
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
        ) : payingUsdt ? (
          <UsdtFunding minCents={usdt.minCents} maxCents={usdt.maxCents} />
        ) : active === "NGN" ? (
          <AddFunds {...naira} walletCurrency={walletCurrency} embedded />
        ) : (
          <p className="text-sm text-muted-foreground">No payment option is available right now.</p>
        )}
      </div>

      {comingSoon.length > 0 ? (
        <p className="mt-5 text-xs text-muted-foreground">Coming soon: {comingSoon.join(", ")}.</p>
      ) : null}

      {showUsdtNotice ? (
        <div className="mt-4">
          <UsdtComingSoonNotice />
        </div>
      ) : null}
    </section>
  );
}
