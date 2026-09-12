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
