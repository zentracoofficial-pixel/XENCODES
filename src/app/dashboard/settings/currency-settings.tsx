"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CurrencySelector } from "@/components/currency/currency-selector";
import { CountryPicker } from "@/components/currency/country-picker";
import { useDisplayMoney } from "@/components/currency/currency-provider";
import { CURRENCY_META } from "@/lib/currency-meta";
import { countryName } from "@/lib/countries";
import { setDisplayCurrencyAction } from "@/app/currency-actions";

/**
 * Country and currency, both the customer's to change at any time. The
 * country sets the defaults; the currency is what prices are shown in and
 * the currency the wallet's funding card starts on. The same currency control
 * as the one in the header.
 */
export function CurrencySettings() {
  const money = useDisplayMoney();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingCountry, setEditingCountry] = useState(false);
  // Shown straight away after a save, before the refreshed page arrives.
  const [justSaved, setJustSaved] = useState<string | null>(null);
  if (!money) return null;
  const { context } = money;

  const countryLabel = countryName(justSaved ?? context.country);
  const usingPreference = context.source === "preference";
  const defaultCurrency = CURRENCY_META[context.countryDefault];

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="font-semibold">Country and currency</h2>

      <div className="mt-4 space-y-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Your country</p>
          {(context.countrySaved || justSaved) && countryLabel && !editingCountry ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium">{countryLabel}</p>
              <button
                type="button"
                onClick={() => setEditingCountry(true)}
                className="text-xs font-medium text-forest underline-offset-4 hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {!context.countrySaved ? (
                <p className="text-sm text-muted-foreground">
                  {countryLabel
                    ? `We think you are in ${countryLabel}, but that is only a guess from your connection. Confirm or change it.`
                    : "Tell us your country so we can show prices in your currency."}
                </p>
              ) : null}
              <CountryPicker
                id="settings-country"
                initial={context.country}
                onSaved={(saved) => {
                  setJustSaved(saved);
                  setEditingCountry(false);
                }}
                onCancel={context.countrySaved ? () => setEditingCountry(false) : undefined}
              />
            </div>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            Your country sets your default currency. You can change it at any time.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">Display currency</p>
          <div className="mt-2 max-w-xs">
            <CurrencySelector variant="field" align="left" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {usingPreference
              ? `Your choice. The default for your country is ${defaultCurrency.code}.`
              : `Automatic: the default for ${countryLabel ?? "your location"} is ${defaultCurrency.code}.`}{" "}
            Prices are shown in this currency, and the wallet&apos;s funding card starts on it so you can pay in it
            (when payments in it are available). Your balance is held in Naira (₦) and credited after conversion.
          </p>
          {usingPreference ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setDisplayCurrencyAction(null);
                  router.refresh();
                })
              }
              className="mt-2 text-xs font-medium text-forest underline-offset-4 hover:underline disabled:opacity-50"
            >
              Restore my country&apos;s default ({defaultCurrency.code})
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
