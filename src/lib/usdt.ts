/**
 * USDT funding: announced, not built, and deliberately impossible to switch
 * on by accident.
 *
 * `enabled` is a constant in code, not an admin setting, an environment
 * variable or a database flag, so nothing a customer, a request or a stray
 * configuration change can do turns it on. The day USDT funding is authorized
 * it is built as its own module and this line changes with it, in review.
 *
 * Until then there is nothing behind the card: no deposit address is ever
 * generated, no network can be chosen, no payment request is created, no
 * blockchain is watched and no wallet is credited from a USDT transaction.
 * "USDT" is also not a funding currency anywhere (see
 * src/lib/funding-currencies.ts), so a request naming it is refused by the
 * same checks that refuse any unsupported currency. USD, which Xencodes may
 * show prices in, is a different thing from USDT, and neither is a way to pay
 * today.
 */
export const USDT_FUNDING = {
  code: "USDT",
  name: "Tether",
  enabled: false as boolean,
  comingSoonMessage: "USDT funding is coming soon. Xencodes is expanding to serve users worldwide.",
} as const;

export function isUsdtFundingEnabled(): boolean {
  return USDT_FUNDING.enabled === true;
}
