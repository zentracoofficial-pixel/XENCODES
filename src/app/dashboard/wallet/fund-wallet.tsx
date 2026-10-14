"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Globe } from "lucide-react";
import {
  currencySupportsCountry,
  fundingCurrencyForCountry,
  pickerCountries,
  type FundingCurrencyCode,
} from "@/lib/funding-currencies";
import { AddFunds } from "./add-funds";
import { LocalFunding } from "./local-funding";
import { UsdtCard, UsdtComingSoonNotice } from "./usdt-coming-soon";
import { saveCountryAction } from "./local-actions";

/**
 * The wallet's funding area: one place to choose how to add money.
 *
 * Naira funding is the original flow and is always first and unchanged. The
 * local currencies only appear when an admin has switched them on (the
 * server decides, see getFundingOptions()), and only for the customer's own
 * country. USDT is shown as a disabled "coming soon" card and nothing more.
 */

export interface LocalOption {
  code: FundingCurrencyCode;
  name: string;
  symbol: string;
  methods: string[];
  minMinor: number;
  maxMinor: number;
}

const OTHER = "OTHER";

export function FundWallet({
  naira,
  walletCurrency,
  options,
  savedCountry,
}: {
  naira: ComponentProps<typeof AddFunds>;
  walletCurrency: string;
  /** Local currencies currently switched on, for the customer's saved
   *  country when there is one, otherwise every enabled one. */
  options: LocalOption[];
  savedCountry: string | null;
}) {
  const searchParams = useSearchParams();
  const [country, setCountry] = useState<string | null>(savedCountry);
  const [other, setOther] = useState(false);
  const [countryError, setCountryError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);

  // Coming back from KoraPay (either kind of payment): only the status card.
  // Also the plain case for a wallet that is not in Naira.
  if (searchParams.get("reference") || walletCurrency !== "NGN") {
    return <AddFunds {...naira} />;
  }

  const countryKnown = country !== null;
  const visible = options.filter((option) =>
    countryKnown ? currencySupportsCountry(option.code, country) : false,
  );
  const recommended = fundingCurrencyForCountry(country);
  const sorted = [...visible].sort((a, b) => Number(b.code === recommended) - Number(a.code === recommended));

  const defaultTab = sorted[0]?.code ?? "NGN";
  const active = selected && (selected === "NGN" || sorted.some((o) => o.code === selected)) ? selected : defaultTab;
  const activeOption = sorted.find((o) => o.code === active);

  const needsCountry = !countryKnown && !other;
  const showUsdtNotice = (other || (countryKnown && country !== "NG")) && sorted.length === 0;

  function chooseCountry(value: string) {
    setCountryError(null);
    if (!value) return;
    if (value === OTHER) {
      setOther(true);
      return;
    }
    setOther(false);
    setCountry(value);
    startSaving(async () => {
      const result = await saveCountryAction(value);
      if (result.error) {
        setCountry(null);
        setCountryError(result.error);
      } else if (result.country) {
        setCountry(result.country);
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Add funds</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your wallet is in Naira. Pay with the option that suits you and it is credited once the payment is confirmed.
      </p>

      {needsCountry ? (
        <div className="mt-4 max-w-xs">
          <label htmlFor="funding-country" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Globe className="h-3.5 w-3.5" />
            Where are you paying from?
          </label>
          <select
            id="funding-country"
            defaultValue=""
            disabled={saving}
            onChange={(e) => chooseCountry(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
          >
            <option value="" disabled>
              Select your country
            </option>
            {pickerCountries().map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {c.name}
              </option>
            ))}
            <option value={OTHER}>Another country</option>
          </select>
          {countryError ? <p className="mt-2 text-sm text-danger">{countryError}</p> : null}
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Funding currency"
        className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
        <CurrencyTab
          id="NGN"
          symbol="₦"
          name="Nigerian Naira"
          methods="Card, bank transfer"
          selected={active === "NGN"}
          recommended={recommended === null && country === "NG"}
          onSelect={() => setSelected("NGN")}
        />
        {sorted.map((option) => (
          <CurrencyTab
            key={option.code}
            id={option.code}
            symbol={option.symbol}
            name={option.name}
            methods={option.methods.join(", ")}
            selected={active === option.code}
            recommended={option.code === recommended}
            onSelect={() => setSelected(option.code)}
          />
        ))}
        <UsdtCard />
      </div>

      <div role="tabpanel" className="mt-5">
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
        ) : (
          <AddFundsPanel {...naira} />
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

/** The existing Naira form, shown without its own outer card since it now
 *  lives inside the funding area's card. */
function AddFundsPanel(props: ComponentProps<typeof AddFunds>) {
  return (
    <div className="[&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0">
      <AddFunds {...props} />
    </div>
  );
}

function CurrencyTab({
  id,
  symbol,
  name,
  methods,
  selected,
  recommended,
  onSelect,
}: {
  id: string;
  symbol: string;
  name: string;
  methods: string;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={
        selected
          ? "flex w-44 shrink-0 flex-col rounded-xl border border-mint bg-mint-soft p-3.5 text-left sm:w-auto sm:min-w-44 sm:flex-1"
          : "flex w-44 shrink-0 flex-col rounded-xl border border-border bg-background p-3.5 text-left transition-colors hover:border-mint sm:w-auto sm:min-w-44 sm:flex-1"
      }
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {id} <span className="font-normal text-muted-foreground">{symbol}</span>
        </span>
        {selected ? <Check className="h-4 w-4 text-forest" /> : null}
      </span>
      <span className="mt-1 text-xs text-muted-foreground">{name}</span>
      <span className="mt-0.5 text-[11px] text-muted-foreground">{methods}</span>
      {recommended ? (
        <span className="mt-2 w-fit rounded-full bg-forest px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Recommended
        </span>
      ) : null}
    </button>
  );
}
