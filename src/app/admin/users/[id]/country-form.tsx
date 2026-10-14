"use client";

import { useActionState } from "react";
import { Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { allCountries, countryName } from "@/lib/countries";
import { CURRENCY_META, defaultCurrencyForCountry, isDisplayCurrencyCode } from "@/lib/currency-meta";
import { setUserCountryAction, type UserCountryState } from "../actions";

const initial: UserCountryState = {};

/** Lets an admin set or correct the country on a customer's account. */
export function CountryForm({
  userId,
  country,
  displayCurrency,
}: {
  userId: string;
  country: string | null;
  displayCurrency: string | null;
}) {
  const [state, formAction, pending] = useActionState(setUserCountryAction.bind(null, userId), initial);
  const current = countryName(country);
  const defaultCurrency = defaultCurrencyForCountry(country);

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Globe className="h-4 w-4" />
        Country and currency
      </h2>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Country on account</dt>
          <dd className="font-medium">{current ?? "Not set"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Default display currency</dt>
          <dd className="font-medium">{country ? `${defaultCurrency} (${CURRENCY_META[defaultCurrency].name})` : "Decided by their connection"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Their own display choice</dt>
          <dd className="font-medium">
            {isDisplayCurrencyCode(displayCurrency) ? `${displayCurrency} (chosen by them)` : "None (automatic)"}
          </dd>
        </div>
      </dl>

      <form action={formAction} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr]">
          <div className="space-y-1.5">
            <label htmlFor="admin-country" className="text-xs font-medium text-muted-foreground">
              Correct country
            </label>
            <select
              id="admin-country"
              name="country"
              defaultValue={country ?? ""}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
            >
              <option value="">Not set (customer chooses)</option>
              {allCountries().map((c) => (
                <option key={c.iso2} value={c.iso2}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="admin-country-reason" className="text-xs font-medium text-muted-foreground">
              Reason (kept in the audit log)
            </label>
            <input
              id="admin-country-reason"
              name="reason"
              maxLength={300}
              placeholder="For example: customer is in Kenya, picked Ghana by mistake"
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Customers can also change this themselves in Settings. It sets their default currency. Payments already requested keep the amounts
          they were quoted; the wallet balance does not change.
        </p>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving" : "Save country"}
          </Button>
          {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-success">Saved.</p> : null}
        </div>
      </form>
    </Card>
  );
}
