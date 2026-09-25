/**
 * Client-safe money helpers, generalized across whatever ISO 4217
 * currencies are enabled (see src/lib/currency-config.ts for the
 * admin-configured list; this file only knows how to format and convert,
 * never which currencies are actually turned on).
 *
 * "Kobo" in a field name (User.walletBalanceKobo, Activation.priceKobo,
 * WalletTransaction.amountKobo) is legacy naming from when Naira was the
 * only currency; every one of those fields is now "amount in the minor
 * unit of the relevant record's own currency" (User.currency,
 * Activation.currency, WalletTransaction.currency), not necessarily kobo.
 * The name was not changed on every column because renaming a money column
 * across a live financial schema is a large, high-risk change for a naming
 * improvement alone; what matters is that every reader pairs the amount
 * with its actual currency, which is what formatMoney() below is for.
 */

/** How many minor units make one major unit of a currency (100 for NGN,
 *  GHS, USD, EUR...; 0 for a handful of currencies with no subdivision
 *  such as JPY; 3 for a few such as KWD). Derived from the JS engine's own
 *  CLDR data via Intl, not a hand-maintained table, so any real ISO 4217
 *  code is handled correctly without needing an entry added here. */
export function minorUnitDivisor(currency: string): number {
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits;
    return 10 ** (digits ?? 2);
  } catch {
    return 100;
  }
}

/** Whether Intl recognises this as a real ISO 4217 currency code. The one
 *  gate an admin's typed currency code needs to pass before it can be
 *  enabled: everything else about formatting and rates derives from this
 *  being true. */
export function isValidCurrencyCode(code: string): boolean {
  if (!/^[A-Za-z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** "Nigerian Naira" for "NGN", read from the same CLDR data every browser
 *  and Node ships with, not a hand-typed list that would need an entry for
 *  every currency an admin might ever enable. */
export function currencyDisplayName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "₦" for "NGN", "GH₵" for "GHS". */
export function currencySymbol(code: string): string {
  try {
    const part = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? code;
  } catch {
    return code;
  }
}

/** Converts a major-unit amount (1,600.00) to that currency's minor unit
 *  (160000), rounding to the nearest whole minor unit. */
export function majorToMinor(major: number, currency: string): number {
  return Math.round(major * minorUnitDivisor(currency));
}

/** Formats a minor-unit amount in its own currency, hiding decimals on a
 *  whole amount the same way the original Naira-only formatter did. Falls
 *  back to a plain "CODE 1,234" rendering if Intl does not recognise the
 *  currency at all, which should not happen for anything the admin panel
 *  actually let someone enable (see isValidCurrencyCode()). */
export function formatMoney(amountMinor: number, currency: string): string {
  const divisor = minorUnitDivisor(currency);
  const major = amountMinor / divisor;
  const hasFraction = amountMinor % divisor !== 0;

  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: hasFraction ? undefined : 0,
      maximumFractionDigits: hasFraction ? undefined : 0,
    }).format(major);
  } catch {
    return `${currency} ${major.toLocaleString("en", { maximumFractionDigits: 2 })}`;
  }
}

/**
 * Sums a money aggregate grouped by currency into one display string, for
 * an admin page reporting a total across every account's own currency.
 *
 * Every underlying figure (WalletTransaction.amountKobo, Activation.priceKobo
 * and friends) is only ever meaningful paired with its own row's currency;
 * adding a Naira figure to a Cedi figure would silently produce a number in
 * neither currency. With only one currency active (today, and likely for a
 * while) this renders exactly as a single blended sum always has. The
 * moment a second currency carries real volume, this switches to listing
 * each currency's own total rather than quietly mislabeling a blend.
 */
export function formatMultiCurrencySum(
  rows: { currency: string; amount: number }[],
  fallbackCurrency: string,
): string {
  const nonZero = rows.filter((row) => row.amount !== 0);
  if (nonZero.length === 0) return formatMoney(0, fallbackCurrency);
  return nonZero.map((row) => formatMoney(row.amount, row.currency)).join(" + ");
}

/** Naira-specific convenience, kept for call sites that are genuinely
 *  always about NGN regardless of any particular user or transaction (a
 *  platform-wide illustrative example, not a real balance or charge).
 *  Anything showing a specific user's or transaction's money must use
 *  formatMoney() with that record's own currency instead. */
export function formatNaira(kobo: number) {
  return formatMoney(kobo, "NGN");
}

/** Convenience for catalog prices, which are authored in whole Naira. */
export function formatNairaFromNaira(naira: number) {
  return formatNaira(majorToMinor(naira, "NGN"));
}

/**
 * Groups a stored E.164 number so it can be read and dictated aloud, for
 * example "+234 336 542 5164". Anything unexpected is returned untouched.
 */
export function formatPhoneNumber(value: string) {
  const match = value.match(/^\+(\d{1,3})(\d+)$/);
  if (!match) return value;

  const [, dialCode, rest] = match;
  const groups: string[] = [];
  for (let i = 0; i < rest.length; i += 3) {
    groups.push(rest.slice(i, i + 3));
  }

  // Avoid a lonely trailing digit by folding it into the previous group.
  if (groups.length > 1 && groups[groups.length - 1].length === 1) {
    groups[groups.length - 2] += groups.pop();
  }

  return `+${dialCode} ${groups.join(" ")}`;
}
