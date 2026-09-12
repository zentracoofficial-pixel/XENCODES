import type { Service } from "./types";

export const services: Service[] = [
  {
    slug: "facebook",
    name: "Facebook",
    category: "Social & Messaging",
    description:
      "Verify Facebook accounts with an SMS code delivered to a virtual number in seconds.",
    color: "#1877F2",
    rentalSupported: true,
    priceFrom: 0.35,
    availability: [
      { countrySlug: "usa", status: "available", price: 0.45, avgDeliverySeconds: 12, successRate: 98 },
      { countrySlug: "uk", status: "available", price: 0.5, avgDeliverySeconds: 14, successRate: 97 },
      { countrySlug: "canada", status: "available", price: 0.48, avgDeliverySeconds: 15, successRate: 96 },
      { countrySlug: "nigeria", status: "limited", price: 0.35, avgDeliverySeconds: 22, successRate: 88 },
      { countrySlug: "germany", status: "available", price: 0.52, avgDeliverySeconds: 16, successRate: 95 },
      { countrySlug: "indonesia", status: "limited", price: 0.38, avgDeliverySeconds: 25, successRate: 85 },
      { countrySlug: "poland", status: "available", price: 0.4, avgDeliverySeconds: 18, successRate: 94 },
      { countrySlug: "philippines", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
    ],
  },
  {
    slug: "instagram",
    name: "Instagram",
    category: "Social & Messaging",
    description:
      "Receive Instagram verification codes instantly to complete sign-up or two-factor checks.",
    color: "#E1306C",
    rentalSupported: true,
    priceFrom: 0.4,
    availability: [
      { countrySlug: "usa", status: "available", price: 0.5, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "uk", status: "available", price: 0.55, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "canada", status: "available", price: 0.5, avgDeliverySeconds: 14, successRate: 96 },
      { countrySlug: "nigeria", status: "limited", price: 0.4, avgDeliverySeconds: 24, successRate: 86 },
      { countrySlug: "germany", status: "available", price: 0.56, avgDeliverySeconds: 15, successRate: 95 },
      { countrySlug: "indonesia", status: "available", price: 0.42, avgDeliverySeconds: 19, successRate: 92 },
      { countrySlug: "poland", status: "limited", price: 0.44, avgDeliverySeconds: 21, successRate: 89 },
      { countrySlug: "philippines", status: "limited", price: 0.41, avgDeliverySeconds: 23, successRate: 87 },
    ],
  },
  {
    slug: "telegram",
    name: "Telegram",
    category: "Social & Messaging",
    description:
      "Activate Telegram accounts with dedicated numbers built for messaging-app verification.",
    color: "#26A5E4",
    rentalSupported: true,
    priceFrom: 0.3,
    availability: [
      { countrySlug: "usa", status: "available", price: 0.4, avgDeliverySeconds: 9, successRate: 99 },
      { countrySlug: "uk", status: "available", price: 0.42, avgDeliverySeconds: 10, successRate: 98 },
      { countrySlug: "canada", status: "available", price: 0.4, avgDeliverySeconds: 10, successRate: 98 },
      { countrySlug: "nigeria", status: "available", price: 0.3, avgDeliverySeconds: 16, successRate: 93 },
      { countrySlug: "germany", status: "available", price: 0.42, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "indonesia", status: "available", price: 0.32, avgDeliverySeconds: 15, successRate: 95 },
      { countrySlug: "poland", status: "available", price: 0.34, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "philippines", status: "available", price: 0.33, avgDeliverySeconds: 14, successRate: 95 },
    ],
  },
  {
    slug: "whatsapp",
    name: "WhatsApp",
    category: "Social & Messaging",
    description:
      "Get WhatsApp SMS codes delivered to a temporary number for account setup or testing.",
    color: "#25D366",
    rentalSupported: true,
    priceFrom: 0.6,
    availability: [
      { countrySlug: "usa", status: "limited", price: 0.75, avgDeliverySeconds: 20, successRate: 90 },
      { countrySlug: "uk", status: "limited", price: 0.78, avgDeliverySeconds: 22, successRate: 89 },
      { countrySlug: "canada", status: "available", price: 0.72, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "nigeria", status: "available", price: 0.6, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "germany", status: "limited", price: 0.8, avgDeliverySeconds: 24, successRate: 87 },
      { countrySlug: "indonesia", status: "available", price: 0.62, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "poland", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "philippines", status: "available", price: 0.63, avgDeliverySeconds: 17, successRate: 93 },
    ],
  },
  {
    slug: "tiktok",
    name: "TikTok",
    category: "Social & Messaging",
    description:
      "Verify TikTok accounts quickly with reliable SMS delivery across supported regions.",
    color: "#000000",
    rentalSupported: false,
    priceFrom: 0.38,
    availability: [
      { countrySlug: "usa", status: "available", price: 0.46, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "uk", status: "available", price: 0.48, avgDeliverySeconds: 14, successRate: 95 },
      { countrySlug: "canada", status: "limited", price: 0.44, avgDeliverySeconds: 20, successRate: 88 },
      { countrySlug: "nigeria", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "germany", status: "available", price: 0.5, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "indonesia", status: "available", price: 0.4, avgDeliverySeconds: 14, successRate: 96 },
      { countrySlug: "poland", status: "limited", price: 0.43, avgDeliverySeconds: 19, successRate: 90 },
      { countrySlug: "philippines", status: "available", price: 0.39, avgDeliverySeconds: 13, successRate: 97 },
    ],
  },
  {
    slug: "google",
    name: "Google",
    category: "Developer & Cloud",
    description:
      "Complete Google account verification for testing, development, or new account setup.",
    color: "#4285F4",
    rentalSupported: false,
    priceFrom: 0.55,
    availability: [
      { countrySlug: "usa", status: "limited", price: 0.65, avgDeliverySeconds: 25, successRate: 84 },
      { countrySlug: "uk", status: "limited", price: 0.68, avgDeliverySeconds: 27, successRate: 82 },
      { countrySlug: "canada", status: "limited", price: 0.66, avgDeliverySeconds: 26, successRate: 83 },
      { countrySlug: "nigeria", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "germany", status: "available", price: 0.7, avgDeliverySeconds: 18, successRate: 91 },
      { countrySlug: "indonesia", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "poland", status: "available", price: 0.6, avgDeliverySeconds: 17, successRate: 92 },
      { countrySlug: "philippines", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
    ],
  },
  {
    slug: "fiverr",
    name: "Fiverr",
    category: "Marketplaces & Freelance",
    description:
      "Verify Fiverr seller or buyer accounts with a dedicated activation number.",
    color: "#1DBF73",
    rentalSupported: true,
    priceFrom: 0.5,
    availability: [
      { countrySlug: "usa", status: "available", price: 0.6, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "uk", status: "available", price: 0.62, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "canada", status: "available", price: 0.6, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "nigeria", status: "limited", price: 0.5, avgDeliverySeconds: 23, successRate: 86 },
      { countrySlug: "germany", status: "available", price: 0.64, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "indonesia", status: "limited", price: 0.52, avgDeliverySeconds: 22, successRate: 87 },
      { countrySlug: "poland", status: "available", price: 0.56, avgDeliverySeconds: 19, successRate: 91 },
      { countrySlug: "philippines", status: "available", price: 0.54, avgDeliverySeconds: 18, successRate: 92 },
    ],
  },
  {
    slug: "upwork",
    name: "Upwork",
    category: "Marketplaces & Freelance",
    description:
      "Complete Upwork phone verification for freelancer or client account activation.",
    color: "#14A800",
    rentalSupported: true,
    priceFrom: 0.5,
    availability: [
      { countrySlug: "usa", status: "available", price: 0.58, avgDeliverySeconds: 15, successRate: 95 },
      { countrySlug: "uk", status: "available", price: 0.6, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "canada", status: "available", price: 0.58, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "nigeria", status: "limited", price: 0.5, avgDeliverySeconds: 22, successRate: 87 },
      { countrySlug: "germany", status: "available", price: 0.62, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "indonesia", status: "limited", price: 0.52, avgDeliverySeconds: 21, successRate: 88 },
      { countrySlug: "poland", status: "available", price: 0.55, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "philippines", status: "available", price: 0.53, avgDeliverySeconds: 17, successRate: 93 },
    ],
  },
  {
    slug: "discord",
    name: "Discord",
    category: "Social & Messaging",
    description:
      "Verify Discord accounts and bypass rate limits during legitimate community moderation testing.",
    color: "#5865F2",
    rentalSupported: false,
    priceFrom: 0.28,
    availability: [
      { countrySlug: "usa", status: "available", price: 0.34, avgDeliverySeconds: 10, successRate: 98 },
      { countrySlug: "uk", status: "available", price: 0.36, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "canada", status: "available", price: 0.35, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "nigeria", status: "available", price: 0.28, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "germany", status: "available", price: 0.37, avgDeliverySeconds: 12, successRate: 96 },
      { countrySlug: "indonesia", status: "available", price: 0.3, avgDeliverySeconds: 14, successRate: 95 },
      { countrySlug: "poland", status: "available", price: 0.32, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "philippines", status: "available", price: 0.31, avgDeliverySeconds: 13, successRate: 95 },
    ],
  },
  {
    slug: "paypal",
    name: "PayPal",
    category: "Finance & Shopping",
    description:
      "Verify PayPal accounts with SMS codes for legitimate account setup and testing flows.",
    color: "#003087",
    rentalSupported: false,
    priceFrom: 0.7,
    availability: [
      { countrySlug: "usa", status: "limited", price: 0.85, avgDeliverySeconds: 26, successRate: 81 },
      { countrySlug: "uk", status: "limited", price: 0.88, avgDeliverySeconds: 28, successRate: 80 },
      { countrySlug: "canada", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "nigeria", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "germany", status: "limited", price: 0.9, avgDeliverySeconds: 27, successRate: 82 },
      { countrySlug: "indonesia", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "poland", status: "limited", price: 0.8, avgDeliverySeconds: 25, successRate: 83 },
      { countrySlug: "philippines", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
    ],
  },
  {
    slug: "amazon",
    name: "Amazon",
    category: "Finance & Shopping",
    description:
      "Complete Amazon phone verification for seller, buyer, or developer account activation.",
    color: "#FF9900",
    rentalSupported: false,
    priceFrom: 0.55,
    availability: [
      { countrySlug: "usa", status: "available", price: 0.65, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "uk", status: "available", price: 0.68, avgDeliverySeconds: 19, successRate: 91 },
      { countrySlug: "canada", status: "available", price: 0.66, avgDeliverySeconds: 19, successRate: 91 },
      { countrySlug: "nigeria", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "germany", status: "available", price: 0.7, avgDeliverySeconds: 20, successRate: 90 },
      { countrySlug: "indonesia", status: "limited", price: 0.58, avgDeliverySeconds: 24, successRate: 85 },
      { countrySlug: "poland", status: "limited", price: 0.6, avgDeliverySeconds: 23, successRate: 86 },
      { countrySlug: "philippines", status: "unavailable", price: 0, avgDeliverySeconds: 0, successRate: 0 },
    ],
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    category: "Social & Messaging",
    description:
      "Verify LinkedIn accounts for recruiting, sales, or professional networking testing.",
    color: "#0A66C2",
    rentalSupported: true,
    priceFrom: 0.45,
    availability: [
      { countrySlug: "usa", status: "available", price: 0.52, avgDeliverySeconds: 14, successRate: 95 },
      { countrySlug: "uk", status: "available", price: 0.54, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "canada", status: "available", price: 0.52, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "nigeria", status: "limited", price: 0.45, avgDeliverySeconds: 21, successRate: 88 },
      { countrySlug: "germany", status: "available", price: 0.56, avgDeliverySeconds: 16, successRate: 93 },
      { countrySlug: "indonesia", status: "limited", price: 0.47, avgDeliverySeconds: 20, successRate: 89 },
      { countrySlug: "poland", status: "available", price: 0.5, avgDeliverySeconds: 17, successRate: 92 },
      { countrySlug: "philippines", status: "limited", price: 0.48, avgDeliverySeconds: 19, successRate: 90 },
    ],
  },
];

export function getServiceBySlug(slug: string) {
  return services.find((service) => service.slug === slug);
}

export function getAvailabilityForCountry(countrySlug: string) {
  return services
    .map((service) => ({
      service,
      availability: service.availability.find(
        (a) => a.countrySlug === countrySlug,
      ),
    }))
    .filter((entry) => entry.availability && entry.availability.status !== "unavailable");
}

export function countAvailableCountries(service: Service) {
  return service.availability.filter((a) => a.status !== "unavailable").length;
}
