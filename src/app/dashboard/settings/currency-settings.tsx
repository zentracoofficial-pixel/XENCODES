"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CurrencySelector } from "@/components/currency/currency-selector";
import { CountryPicker } from "@/components/currency/country-picker";
import { useDisplayMoney } from "@/components/currency/currency-provider";
import { CURRENCY_META } from "@/lib/currency-meta";
import { countryName } from "@/lib/countries";
import { setDisplayCurrencyAction } from "@/app/currency-actions";

/**
 * Country and display currency, together but kept apart: the country is
 * what Xencodes uses to decide which payment option you may use (saved
 * once); the display currency is only how prices are shown (changeable any
 * time, and the same control as the one in the header).
 */
export function CurrencySettings() {
  const money = useDisplayMoney();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!money) return null;
  const { context } = money;

  const countryLabel = countryName(context.country);
  const usingPreference = context.source === "preference";
  const defaultCurrency = CURRENCY_META[context.countryDefault];

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="font-semibold">Country and currency</h2>

      <div className="mt-4 space-y-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Your country</p>
          {context.countrySaved && countryLabel ? (
            <>
              <p className="mt-1 text-sm font-medium">{countryLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This decides which payment options you can use. Contact support if it is wrong.
              </p>
            </>
          ) : (
            <div className="mt-2 space-y-2">
              {countryLabel ? (
                <p className="text-sm text-muted-foreground">
                  We think you are in {countryLabel}, but that is only a guess from your connection. Confirm your
                  country to unlock the payment options for it.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Tell us your country to see the payment options available to you.
                </p>
              )}
              <CountryPicker id="settings-country" suggested={context.country} />
            </div>
          )}
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
            This only changes how prices are shown. Your wallet is always held and charged in Naira (₦), and it does
            not change which payment options you can use.
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
