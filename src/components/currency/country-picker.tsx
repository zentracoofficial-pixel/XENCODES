"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { allCountries } from "@/lib/countries";
import { saveCountryAction } from "@/app/dashboard/wallet/local-actions";

/**
 * Asks which country the customer is in and saves it on their account.
 * Saved once (it decides which payment option is eligible, so it is not a
 * toggle) and then shown read-only; support can correct a wrong one.
 */
export function CountryPicker({
  suggested,
  onSaved,
  id = "account-country",
}: {
  /** A country detected from the request, preselected but never saved
   *  until the customer confirms it. */
  suggested?: string | null;
  onSaved?: (country: string) => void;
  id?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(suggested ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(country: string) {
    setError(null);
    startTransition(async () => {
      const result = await saveCountryAction(country);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.country) onSaved?.(result.country);
      router.refresh();
    });
  }

  return (
    <div className="max-w-xs">
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Globe className="h-3.5 w-3.5" />
        Where are you paying from?
      </label>
      <div className="mt-1.5 flex gap-2">
        <select
          id={id}
          value={value}
          disabled={pending}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
        >
          <option value="" disabled>
            Select your country
          </option>
          {allCountries().map((c) => (
            <option key={c.iso2} value={c.iso2}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!value || pending}
          onClick={() => save(value)}
          className="h-11 shrink-0 rounded-xl bg-forest px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving" : "Confirm"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Saved once on your account. Contact support if you need to change it later.
      </p>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
