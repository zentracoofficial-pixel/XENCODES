/**
 * USDT funding's fixed wording, safe to use in the browser.
 *
 * Whether USDT funding is actually on is decided only on the server, from
 * whether Cryptomus is configured (see isCryptomusConfigured() in
 * src/lib/cryptomus.ts), and every payment is started and confirmed there.
 * A customer who pays with USDT has their account switched to US dollars:
 * their balance, prices and purchases are then all in USD.
 */
export const USDT_FUNDING = {
  code: "USDT",
  name: "Tether",
  comingSoonMessage: "USDT funding is coming soon. Xencodes is expanding to serve users worldwide.",
} as const;
