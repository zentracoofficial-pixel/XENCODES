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
  {
    slug: "instagram",
    name: "Instagram",
    useCase:
      "Instagram asks for a phone number or email when you sign up, and may text a confirmation code to the number when a login looks unusual. A Xencodes virtual number receives that one code, so you can set up an account for a brand, a project or testing without handing out your personal number.",
    howItWorks:
      "Choose Instagram, pick a country with numbers in stock, and buy a number. Enter it on Instagram's sign-up screen, request the code, and read it on your Xencodes activation page.",
    limitations: [
      "The number receives the verification code for this one step; it is not kept for the account afterwards.",
      "Instagram decides when to ask for phone verification and may refuse a number it has seen too often. That is Instagram's own check, not something Xencodes controls.",
    ],
  },
  {
    slug: "google",
    name: "Google",
    useCase:
      "Google can require a phone number when you create an account or recover one, texting a six-digit code to confirm it. A virtual number from Xencodes receives that code so the verification step can be completed.",
    howItWorks:
      "Choose Google, pick an available country and buy a number. Enter it when Google asks for a phone number, then read the code on your Xencodes activation page.",
    limitations: [
      "Google limits how many accounts can be verified with the same number and may reject numbers it has seen before.",
      "The number only receives the code for this verification; you will not be able to use it for later recovery.",
    ],
  },
  {
    slug: "tiktok",
    name: "TikTok",
    useCase:
      "TikTok sends an SMS code to confirm a phone number when you sign up or log in on a new device. A Xencodes virtual number receives that code, which is handy for creator, business or testing accounts kept separate from your personal number.",
    howItWorks:
      "Choose TikTok, pick a country that is in stock, and buy a number. Enter it in the app, request the code, and it appears on your Xencodes activation page.",
    limitations: [
      "TikTok may block numbers it considers high risk or already used; availability of a working number varies by country and time.",
      "The number is valid for receiving this one code only.",
    ],
  },
  {
    slug: "x",
    name: "X (Twitter)",
    useCase:
      "X (formerly Twitter) can ask for a phone number to verify a new account or confirm a login. A Xencodes virtual number receives the confirmation code so you can finish that step without using your own number.",
    howItWorks:
      "Choose X, pick an available country and buy a number. Enter it when X asks for a phone number and read the code on your Xencodes activation page.",
    limitations: [
      "X applies its own anti-abuse checks and may ask for extra verification regardless of the number used.",
      "The number receives this one verification code and is not retained for the account.",
    ],
  },
  {
    slug: "discord",
    name: "Discord",
    useCase:
      "Discord asks for phone verification on some servers and when an account looks suspicious, texting a code to the number. A Xencodes virtual number receives it so you can complete that step.",
    howItWorks:
      "Choose Discord, pick a country in stock and buy a number. Enter it in Discord's phone verification prompt and read the code on your Xencodes activation page.",
    limitations: [
      "Discord may refuse numbers it has flagged; try another country if a number is rejected.",
      "Each number receives one verification code and is not reusable for the account later.",
    ],
  },
  {
    slug: "signal",
    name: "Signal",
    useCase:
      "Signal registers accounts with a phone number and sends a code by SMS to confirm it. A Xencodes virtual number lets you register a Signal account without tying it to your personal SIM.",
    howItWorks:
      "Choose Signal, pick an available country and buy a number. Enter it in Signal's registration screen and read the code on your Xencodes activation page.",
    limitations: [
      "Signal links the account to the number; if you lose access to it you cannot re-register with the same number later.",
      "The number is for receiving the registration code only.",
    ],
  },
  {
    slug: "snapchat",
    name: "Snapchat",
    useCase:
      "Snapchat verifies new accounts and some logins with a code sent by SMS. A Xencodes virtual number receives that code so the step can be completed without using your personal number.",
    howItWorks:
      "Choose Snapchat, pick a country with numbers in stock and buy a number. Enter it during sign-up, request the code and read it on your Xencodes activation page.",
    limitations: [
      "Snapchat may decline numbers it has seen many times; availability of a working number varies.",
      "The number receives one code for this verification only.",
    ],
  },
  {
    slug: "microsoft",
    name: "Microsoft",
    useCase:
      "Microsoft asks for phone verification when creating or securing an account and sends a code by SMS. A Xencodes virtual number receives that code so you can complete the verification.",
    howItWorks:
      "Choose Microsoft, pick an available country and buy a number. Enter it when prompted, request the code and read it on your Xencodes activation page.",
    limitations: [
      "Microsoft may not accept every number for every account type.",
      "The number is valid for this verification code only and not for later account recovery.",
    ],
  },
  {
    slug: "amazon",
    name: "Amazon",
    useCase:
      "Amazon can ask for a phone number to verify a new account or a sign-in, texting a one-time code. A Xencodes virtual number receives that code.",
    howItWorks:
      "Choose Amazon, pick a country in stock and buy a number. Enter it when Amazon asks, request the code and read it on your Xencodes activation page.",
    limitations: [
      "Amazon's own fraud checks decide whether a number is accepted.",
      "The number receives this one code and is not retained for the account.",
    ],
  },
  {
    slug: "paypal",
    name: "PayPal",
    useCase:
      "PayPal confirms new accounts and sensitive changes with an SMS code. A Xencodes virtual number can receive the verification code.",
    howItWorks:
      "Choose PayPal, pick an available country and buy a number. Enter it when PayPal asks, request the code and read it on your Xencodes activation page.",
    limitations: [
      "Financial services often reject virtual numbers or ask for additional identity checks; that is PayPal's decision.",
      "Use numbers only for accounts you own, in line with PayPal's terms and our acceptable-use rules.",
    ],
  },
  {
    slug: "fiverr",
    name: "Fiverr",
    useCase:
      "Fiverr verifies sellers and buyers with a phone number and an SMS code. A Xencodes virtual number receives that code so you can complete verification.",
    howItWorks:
      "Choose Fiverr, pick a country in stock and buy a number. Enter it in Fiverr's verification step, request the code and read it on your Xencodes activation page.",
    limitations: [
      "Fiverr allows one account per verified phone number and may reject numbers already in use.",
      "The number receives one code and is not kept for the account.",
    ],
  },
  {
    slug: "uber",
    name: "Uber",
    useCase:
      "Uber verifies accounts with a code sent by SMS. A Xencodes virtual number receives that code, for example when you set up an account while travelling.",
    howItWorks:
      "Choose Uber, pick an available country and buy a number. Enter it in the app, request the code and read it on your Xencodes activation page.",
    limitations: [
      "You will not be able to receive ride-related calls or texts on the number afterwards.",
      "Uber may ask for a number from the country where you use the service.",
    ],
  },
  {
    slug: "airbnb",
    name: "Airbnb",
    useCase:
      "Airbnb confirms accounts with an SMS code when you sign up or log in from a new device. A Xencodes virtual number receives that code.",
    howItWorks:
      "Choose Airbnb, pick a country in stock and buy a number. Enter it when Airbnb asks, request the code and read it on your Xencodes activation page.",
    limitations: [
      "Hosts and guests may later be asked for a reachable number; a virtual number used for verification will not stay reachable.",
      "The number receives one code only.",
    ],
  },
];

export function getServicePageContent(slug: string): ServicePageContent | null {
  return SERVICE_PAGES.find((page) => page.slug === slug) ?? null;
}
