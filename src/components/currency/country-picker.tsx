"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { allCountries } from "@/lib/countries";
import { saveCountryAction } from "@/app/dashboard/wallet/local-actions";

/**
 * Saves or changes the country on the customer's account. Nothing is saved
 * until they press Save, so a mis-tap in the list changes nothing.
 */
export function CountryPicker({
  initial,
  onSaved,
  onCancel,
  id = "account-country",
}: {
  /** Preselected: the saved country, or a guess from the connection. */
  initial?: string | null;
  onSaved?: (country: string) => void;
  onCancel?: () => void;
  id?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveCountryAction(value);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.country) onSaved?.(result.country);
      router.refresh();
    });
  }

  return (
    <div className="max-w-sm">
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Globe className="h-3.5 w-3.5" />
        Country
      </label>
      <div className="mt-1.5 flex gap-2">
        <select
          id={id}
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
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
          onClick={save}
          className="h-11 shrink-0 rounded-xl bg-forest px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving" : "Save"}
        </button>
        {onCancel ? (
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="h-11 shrink-0 rounded-xl border border-border px-3 text-sm font-medium"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
