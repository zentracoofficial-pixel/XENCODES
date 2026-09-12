/** Client-safe money helpers. Amounts are stored as kobo (1 Naira = 100 kobo). */

export function nairaToKobo(naira: number) {
  return Math.round(naira * 100);
}

/** Formats kobo as Naira, hiding decimals on whole amounts. */
export function formatNaira(kobo: number) {
  const hasKobo = kobo % 100 !== 0;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: hasKobo ? 2 : 0,
    maximumFractionDigits: hasKobo ? 2 : 0,
  }).format(kobo / 100);
}

/** Convenience for catalog prices, which are authored in whole Naira. */
export function formatNairaFromNaira(naira: number) {
  return formatNaira(nairaToKobo(naira));
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
