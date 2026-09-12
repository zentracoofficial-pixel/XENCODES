import type { CountryAvailability, Service, ServiceCategory } from "./types";

/**
 * Placeholder catalog.
 *
 * Each service is declared compactly and per-country availability is derived
 * below, so when the real number provider is wired up only `deriveAvailability`
 * needs to be swapped for a live inventory call. The shape consumers read
 * (`Service.availability`) stays identical.
 */
interface ServiceDef {
  slug: string;
  name: string;
  category: ServiceCategory;
  description: string;
  color: string;
  /** Override for dark mode where the brand colour is near-black. */
  colorDark?: string;
  /** Price in the cheapest market, whole Naira. */
  basePriceNaira: number;
  rentalSupported?: boolean;
  unavailableIn?: string[];
  limitedIn?: string[];
}

interface CountryProfile {
  slug: string;
  priceMultiplier: number;
  deliveryOffset: number;
  successOffset: number;
}

const countryProfiles: CountryProfile[] = [
  { slug: "nigeria", priceMultiplier: 1, deliveryOffset: 6, successOffset: -4 },
  { slug: "usa", priceMultiplier: 1.25, deliveryOffset: 0, successOffset: 0 },
  { slug: "uk", priceMultiplier: 1.32, deliveryOffset: 2, successOffset: -1 },
  { slug: "canada", priceMultiplier: 1.28, deliveryOffset: 2, successOffset: -1 },
  { slug: "germany", priceMultiplier: 1.38, deliveryOffset: 3, successOffset: -2 },
  { slug: "indonesia", priceMultiplier: 1.1, deliveryOffset: 4, successOffset: -5 },
  { slug: "poland", priceMultiplier: 1.2, deliveryOffset: 3, successOffset: -3 },
  { slug: "philippines", priceMultiplier: 1.14, deliveryOffset: 3, successOffset: -4 },
];

const BASE_DELIVERY_SECONDS = 11;
const BASE_SUCCESS_RATE = 97;

function roundToFive(value: number) {
  return Math.round(value / 5) * 5;
}

function deriveAvailability(def: ServiceDef): CountryAvailability[] {
  return countryProfiles.map((profile) => {
    if (def.unavailableIn?.includes(profile.slug)) {
      return {
        countrySlug: profile.slug,
        status: "unavailable" as const,
        priceNaira: 0,
        avgDeliverySeconds: 0,
        successRate: 0,
      };
    }

    const limited = def.limitedIn?.includes(profile.slug) ?? false;

    return {
      countrySlug: profile.slug,
      status: limited ? ("limited" as const) : ("available" as const),
      priceNaira: roundToFive(def.basePriceNaira * profile.priceMultiplier),
      avgDeliverySeconds:
        BASE_DELIVERY_SECONDS + profile.deliveryOffset + (limited ? 7 : 0),
      successRate: BASE_SUCCESS_RATE + profile.successOffset - (limited ? 9 : 0),
    };
  });
}

const definitions: ServiceDef[] = [
  // Social & Messaging
  {
    slug: "whatsapp",
    name: "WhatsApp",
    category: "Social & Messaging",
    description: "Receive a WhatsApp verification code on a number you don't have to own.",
    color: "#25D366",
    basePriceNaira: 550,
    rentalSupported: true,
    limitedIn: ["usa", "uk", "germany"],
    unavailableIn: ["poland"],
  },
  {
    slug: "telegram",
    name: "Telegram",
    category: "Social & Messaging",
    description: "Activate a Telegram account on a temporary number in under a minute.",
    color: "#26A5E4",
    basePriceNaira: 180,
    rentalSupported: true,
  },
  {
    slug: "instagram",
    name: "Instagram",
    category: "Social & Messaging",
    description: "Confirm an Instagram sign-up or security check without using your own line.",
    color: "#FF0069",
    basePriceNaira: 260,
    rentalSupported: true,
    limitedIn: ["poland", "philippines"],
  },
  {
    slug: "facebook",
    name: "Facebook",
    category: "Social & Messaging",
    description: "Get the Facebook confirmation SMS delivered straight to your dashboard.",
    color: "#0866FF",
    basePriceNaira: 220,
    rentalSupported: true,
    limitedIn: ["indonesia"],
    unavailableIn: ["philippines"],
  },
  {
    slug: "tiktok",
    name: "TikTok",
    category: "Social & Messaging",
    description: "Verify a TikTok account with a number from a region that accepts it.",
    color: "#000000",
    colorDark: "#FFFFFF",
    basePriceNaira: 245,
    limitedIn: ["canada", "poland"],
    unavailableIn: ["nigeria"],
  },
  {
    slug: "x",
    name: "X (Twitter)",
    category: "Social & Messaging",
    description: "Clear the phone step on a new or locked X account.",
    color: "#000000",
    colorDark: "#FFFFFF",
    basePriceNaira: 240,
    limitedIn: ["nigeria", "indonesia"],
  },
  {
    slug: "snapchat",
    name: "Snapchat",
    category: "Social & Messaging",
    description: "Receive the Snapchat sign-up code without tying it to your SIM.",
    color: "#FFC400",
    basePriceNaira: 230,
    limitedIn: ["nigeria"],
  },
  {
    slug: "discord",
    name: "Discord",
    category: "Social & Messaging",
    description: "The cheapest way to clear a Discord phone check.",
    color: "#5865F2",
    basePriceNaira: 150,
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    category: "Social & Messaging",
    description: "Clear LinkedIn's phone step when building a recruiting or sales profile.",
    color: "#0A66C2",
    basePriceNaira: 300,
    rentalSupported: true,
    limitedIn: ["indonesia", "philippines"],
  },
  {
    slug: "signal",
    name: "Signal",
    category: "Social & Messaging",
    description: "Register Signal on a number that isn't your personal one.",
    color: "#3B45FD",
    basePriceNaira: 190,
    rentalSupported: true,
  },
  {
    slug: "viber",
    name: "Viber",
    category: "Social & Messaging",
    description: "Activate Viber messaging with a virtual number.",
    color: "#7360F2",
    basePriceNaira: 175,
  },
  {
    slug: "wechat",
    name: "WeChat",
    category: "Social & Messaging",
    description: "Get a WeChat registration code where the platform allows it.",
    color: "#07C160",
    basePriceNaira: 480,
    limitedIn: ["nigeria", "uk", "germany", "poland"],
  },
  {
    slug: "reddit",
    name: "Reddit",
    category: "Social & Messaging",
    description: "Verify a Reddit account by SMS.",
    color: "#FF4500",
    basePriceNaira: 200,
  },

  // Marketplaces & Freelance
  {
    slug: "fiverr",
    name: "Fiverr",
    category: "Marketplaces & Freelance",
    description: "Verify a Fiverr seller account so you can start taking gigs.",
    color: "#1DBF73",
    basePriceNaira: 400,
    rentalSupported: true,
    limitedIn: ["indonesia"],
  },
  {
    slug: "upwork",
    name: "Upwork",
    category: "Marketplaces & Freelance",
    description: "Pass Upwork's phone verification when setting up a freelancer profile.",
    color: "#6FDA44",
    basePriceNaira: 400,
    rentalSupported: true,
    limitedIn: ["indonesia"],
  },
  {
    slug: "freelancer",
    name: "Freelancer",
    category: "Marketplaces & Freelance",
    description: "Confirm a Freelancer.com account by SMS.",
    color: "#29B2FE",
    basePriceNaira: 350,
    rentalSupported: true,
  },
  {
    slug: "amazon",
    name: "Amazon",
    category: "Marketplaces & Freelance",
    description: "Confirm an Amazon buyer, seller, or developer account.",
    color: "#FF9900",
    basePriceNaira: 475,
    limitedIn: ["indonesia", "poland"],
    unavailableIn: ["nigeria", "philippines"],
  },
  {
    slug: "ebay",
    name: "eBay",
    category: "Marketplaces & Freelance",
    description: "Verify an eBay buying or selling account.",
    color: "#E53238",
    basePriceNaira: 380,
    limitedIn: ["nigeria", "philippines"],
  },
  {
    slug: "etsy",
    name: "Etsy",
    category: "Marketplaces & Freelance",
    description: "Clear Etsy's phone verification when opening a shop.",
    color: "#F16521",
    basePriceNaira: 340,
    limitedIn: ["nigeria", "indonesia"],
  },
  {
    slug: "aliexpress",
    name: "AliExpress",
    category: "Marketplaces & Freelance",
    description: "Register an AliExpress account with a virtual number.",
    color: "#FF4747",
    basePriceNaira: 280,
  },
  {
    slug: "jumia",
    name: "Jumia",
    category: "Marketplaces & Freelance",
    description: "Verify a Jumia buyer or vendor account.",
    color: "#F68B1E",
    basePriceNaira: 200,
    unavailableIn: ["usa", "uk", "canada", "germany", "poland", "philippines", "indonesia"],
  },

  // Finance & Crypto
  {
    slug: "paypal",
    name: "PayPal",
    category: "Finance & Crypto",
    description: "Verify a PayPal account where virtual numbers are accepted.",
    color: "#002991",
    colorDark: "#7DA0FF",
    basePriceNaira: 1200,
    limitedIn: ["usa", "uk", "germany", "poland"],
    unavailableIn: ["nigeria", "canada", "indonesia", "philippines"],
  },
  {
    slug: "payoneer",
    name: "Payoneer",
    category: "Finance & Crypto",
    description: "Confirm a Payoneer account for receiving international payments.",
    color: "#FF4800",
    basePriceNaira: 700,
    limitedIn: ["nigeria"],
  },
  {
    slug: "wise",
    name: "Wise",
    category: "Finance & Crypto",
    description: "Clear the phone step on a Wise multi-currency account.",
    color: "#37517E",
    colorDark: "#9FE870",
    basePriceNaira: 850,
    limitedIn: ["nigeria", "indonesia"],
  },
  {
    slug: "binance",
    name: "Binance",
    category: "Finance & Crypto",
    description: "Verify a Binance account by SMS.",
    color: "#F0B90B",
    basePriceNaira: 620,
    limitedIn: ["nigeria"],
  },
  {
    slug: "coinbase",
    name: "Coinbase",
    category: "Finance & Crypto",
    description: "Complete Coinbase phone verification.",
    color: "#0052FF",
    basePriceNaira: 900,
    unavailableIn: ["nigeria", "indonesia"],
  },
  {
    slug: "revolut",
    name: "Revolut",
    category: "Finance & Crypto",
    description: "Register a Revolut account with a supported number.",
    color: "#191C1F",
    colorDark: "#FFFFFF",
    basePriceNaira: 780,
    limitedIn: ["poland"],
    unavailableIn: ["nigeria", "indonesia", "philippines"],
  },

  // Developer & Cloud
  {
    slug: "google",
    name: "Google",
    category: "Developer & Cloud",
    description: "Complete the phone step on a new Google or Gmail account.",
    color: "#4285F4",
    basePriceNaira: 900,
    limitedIn: ["usa", "uk", "canada"],
    unavailableIn: ["nigeria", "indonesia", "philippines"],
  },
  {
    slug: "apple",
    name: "Apple",
    category: "Developer & Cloud",
    description: "Verify an Apple ID with an SMS code.",
    color: "#000000",
    colorDark: "#FFFFFF",
    basePriceNaira: 950,
    limitedIn: ["uk", "germany"],
    unavailableIn: ["nigeria", "indonesia"],
  },
  {
    slug: "microsoft",
    name: "Microsoft",
    category: "Developer & Cloud",
    description: "Confirm a Microsoft or Outlook account by SMS.",
    color: "#F25022",
    basePriceNaira: 620,
    limitedIn: ["nigeria"],
  },
  {
    slug: "openai",
    name: "OpenAI",
    category: "Developer & Cloud",
    description: "Clear phone verification on a ChatGPT or API account.",
    color: "#0F0F0F",
    colorDark: "#FFFFFF",
    basePriceNaira: 1100,
    limitedIn: ["usa", "uk", "germany", "poland"],
    unavailableIn: ["nigeria", "indonesia", "philippines"],
  },
  {
    slug: "github",
    name: "GitHub",
    category: "Developer & Cloud",
    description: "Verify a GitHub account during sign-up or 2FA setup.",
    color: "#181717",
    colorDark: "#FFFFFF",
    basePriceNaira: 320,
  },

  // Entertainment
  {
    slug: "netflix",
    name: "Netflix",
    category: "Entertainment",
    description: "Confirm a Netflix account by SMS.",
    color: "#E50914",
    basePriceNaira: 520,
    limitedIn: ["nigeria", "indonesia"],
  },
  {
    slug: "spotify",
    name: "Spotify",
    category: "Entertainment",
    description: "Verify a Spotify account with a virtual number.",
    color: "#1ED760",
    basePriceNaira: 380,
  },
  {
    slug: "steam",
    name: "Steam",
    category: "Entertainment",
    description: "Add a phone number to a Steam account for trading and Guard.",
    color: "#000000",
    colorDark: "#FFFFFF",
    basePriceNaira: 300,
    limitedIn: ["nigeria"],
  },
  {
    slug: "twitch",
    name: "Twitch",
    category: "Entertainment",
    description: "Verify a Twitch account to stream or chat.",
    color: "#9146FF",
    basePriceNaira: 290,
  },

  // Travel & Delivery
  {
    slug: "uber",
    name: "Uber",
    category: "Travel & Delivery",
    description: "Register an Uber rider account with a virtual number.",
    color: "#000000",
    colorDark: "#FFFFFF",
    basePriceNaira: 420,
    limitedIn: ["nigeria", "indonesia"],
  },
  {
    slug: "bolt",
    name: "Bolt",
    category: "Travel & Delivery",
    description: "Verify a Bolt account for rides or delivery.",
    color: "#34D186",
    basePriceNaira: 360,
    unavailableIn: ["usa", "canada", "indonesia", "philippines"],
  },
  {
    slug: "airbnb",
    name: "Airbnb",
    category: "Travel & Delivery",
    description: "Clear Airbnb's phone verification as a guest or host.",
    color: "#FF5A5F",
    basePriceNaira: 560,
    limitedIn: ["nigeria", "indonesia"],
  },

  // Dating
  {
    slug: "tinder",
    name: "Tinder",
    category: "Dating",
    description: "Register a Tinder account with a number that isn't your own.",
    color: "#FF6B6B",
    basePriceNaira: 480,
    limitedIn: ["nigeria"],
  },
];

export const services: Service[] = definitions.map((def) => {
  const availability = deriveAvailability(def);
  const livePrices = availability
    .filter((a) => a.status !== "unavailable")
    .map((a) => a.priceNaira);

  return {
    slug: def.slug,
    name: def.name,
    category: def.category,
    description: def.description,
    color: def.color,
    colorDark: def.colorDark,
    rentalSupported: def.rentalSupported ?? false,
    priceFromNaira: livePrices.length ? Math.min(...livePrices) : 0,
    availability,
  };
});

export const serviceCategories = Array.from(
  new Set(services.map((s) => s.category)),
) as ServiceCategory[];

export function getServiceBySlug(slug: string) {
  return services.find((service) => service.slug === slug);
}

export function getAvailabilityForCountry(countrySlug: string) {
  return services
    .map((service) => ({
      service,
      availability: service.availability.find((a) => a.countrySlug === countrySlug),
    }))
    .filter((entry) => entry.availability && entry.availability.status !== "unavailable");
}

export function countAvailableCountries(service: Service) {
  return service.availability.filter((a) => a.status !== "unavailable").length;
}

/** Cheapest live price across the whole catalog, in whole Naira. */
export const catalogFloorNaira = Math.min(
  ...services.filter((s) => s.priceFromNaira > 0).map((s) => s.priceFromNaira),
);
