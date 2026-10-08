/**
 * Curated, editorial content for a small, deliberately short list of
 * individual /services/[slug] pages — never generated in bulk from the
 * catalog. Each entry here must correspond to a slug that genuinely exists
 * in the live catalog (src/lib/inventory.ts's POPULAR_SERVICE_SLUGS) and
 * have enough real, service-specific information to be worth its own page,
 * per the standing instruction against thin, spammy service pages.
 *
 * Nothing here states a delivery percentage: that always comes from
 * src/lib/deliverability.ts at request time, or is omitted.
 */
export interface ServicePageContent {
  slug: string;
  /** Matches the catalog's own display name, so the page never invents a
   *  different name than what a customer sees on the buy flow itself. */
  name: string;
  useCase: string;
  howItWorks: string;
  limitations: string[];
}

export const SERVICE_PAGES: ServicePageContent[] = [
  {
    slug: "whatsapp",
    name: "WhatsApp",
    useCase:
      "WhatsApp requires a working phone number to create an account, and texts a one-time code to that number to verify it. A Xencodes virtual number lets you complete that step without registering with your personal number. It is useful for a second WhatsApp Business line, testing, or keeping a work account separate.",
    howItWorks:
      "Choose WhatsApp, pick an available country, and buy a number. Enter it in the WhatsApp app when it asks for a phone number, request the code, and it will appear on your Xencodes activation page.",
    limitations: [
      "The number is for receiving WhatsApp's verification code only, not for ongoing calls or messages.",
      "WhatsApp occasionally requires a follow-up voice call instead of an SMS for some numbers; this is decided by WhatsApp itself, not by Xencodes.",
      "Once verification succeeds, the activation is complete and not refundable, even if the WhatsApp account is later restricted by WhatsApp's own policies.",
    ],
  },
  {
    slug: "telegram",
    name: "Telegram",
    useCase:
      "Telegram accounts are tied to a phone number, which it texts (or calls) a login code to whenever you sign in on a new device. A Xencodes virtual number lets you create or sign into a Telegram account without using your personal number.",
    howItWorks:
      "Choose Telegram, pick an available country, and buy a number. Enter it in the Telegram app's phone number field, and the login code Telegram sends will appear on your Xencodes activation page.",
    limitations: [
      "The number only receives Telegram's own verification code for this one sign-in; it is not a number you keep for the account afterward.",
      "If you later get logged out and need a new code, that requires buying a new number, since the original session has ended.",
    ],
  },
  {
    slug: "facebook",
    name: "Facebook",
    useCase:
      "Facebook can require phone verification when creating an account or when it flags a login as unusual, sending a code by SMS to confirm it's really you. A Xencodes virtual number covers that verification step without exposing your own number.",
    howItWorks:
      "Choose Facebook, pick an available country, and buy a number. Enter it where Facebook asks for a phone number, and the verification code it sends will appear on your Xencodes activation page.",
    limitations: [
      "Facebook's own account-security systems decide when phone verification is required and can vary by account; Xencodes only provides the number the code arrives on.",
      "A number that successfully receives Facebook's code has completed its purpose and isn't refundable, independent of what Facebook's review of the account does afterward.",
    ],
  },
];

export function getServicePageContent(slug: string): ServicePageContent | null {
  return SERVICE_PAGES.find((page) => page.slug === slug) ?? null;
}
