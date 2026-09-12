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
    priceFromNaira: 120,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 120, avgDeliverySeconds: 18, successRate: 94 },
      { countrySlug: "usa", status: "available", priceNaira: 150, avgDeliverySeconds: 12, successRate: 98 },
      { countrySlug: "uk", status: "available", priceNaira: 165, avgDeliverySeconds: 14, successRate: 97 },
      { countrySlug: "canada", status: "available", priceNaira: 160, avgDeliverySeconds: 15, successRate: 96 },
      { countrySlug: "germany", status: "available", priceNaira: 175, avgDeliverySeconds: 16, successRate: 95 },
      { countrySlug: "indonesia", status: "limited", priceNaira: 130, avgDeliverySeconds: 25, successRate: 85 },
      { countrySlug: "poland", status: "available", priceNaira: 140, avgDeliverySeconds: 18, successRate: 94 },
      { countrySlug: "philippines", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
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
    priceFromNaira: 140,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 140, avgDeliverySeconds: 19, successRate: 93 },
      { countrySlug: "usa", status: "available", priceNaira: 175, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "uk", status: "available", priceNaira: 190, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "canada", status: "available", priceNaira: 180, avgDeliverySeconds: 14, successRate: 96 },
      { countrySlug: "germany", status: "available", priceNaira: 195, avgDeliverySeconds: 15, successRate: 95 },
      { countrySlug: "indonesia", status: "available", priceNaira: 150, avgDeliverySeconds: 19, successRate: 92 },
      { countrySlug: "poland", status: "limited", priceNaira: 160, avgDeliverySeconds: 21, successRate: 89 },
      { countrySlug: "philippines", status: "limited", priceNaira: 155, avgDeliverySeconds: 23, successRate: 87 },
    ],
  },
  {
    slug: "whatsapp",
    name: "WhatsApp",
    category: "Social & Messaging",
    description:
      "Get WhatsApp SMS codes delivered to a temporary number for account setup.",
    color: "#25D366",
    rentalSupported: true,
    priceFromNaira: 300,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 300, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "usa", status: "limited", priceNaira: 380, avgDeliverySeconds: 20, successRate: 90 },
      { countrySlug: "uk", status: "limited", priceNaira: 395, avgDeliverySeconds: 22, successRate: 89 },
      { countrySlug: "canada", status: "available", priceNaira: 365, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "germany", status: "limited", priceNaira: 410, avgDeliverySeconds: 24, successRate: 87 },
      { countrySlug: "indonesia", status: "available", priceNaira: 315, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "poland", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "philippines", status: "available", priceNaira: 320, avgDeliverySeconds: 17, successRate: 93 },
    ],
  },
  {
    slug: "telegram",
    name: "Telegram",
    category: "Social & Messaging",
    description:
      "Activate Telegram accounts with numbers built for messaging-app verification.",
    color: "#26A5E4",
    rentalSupported: true,
    priceFromNaira: 100,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 100, avgDeliverySeconds: 16, successRate: 95 },
      { countrySlug: "usa", status: "available", priceNaira: 130, avgDeliverySeconds: 9, successRate: 99 },
      { countrySlug: "uk", status: "available", priceNaira: 140, avgDeliverySeconds: 10, successRate: 98 },
      { countrySlug: "canada", status: "available", priceNaira: 135, avgDeliverySeconds: 10, successRate: 98 },
      { countrySlug: "germany", status: "available", priceNaira: 145, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "indonesia", status: "available", priceNaira: 105, avgDeliverySeconds: 15, successRate: 95 },
      { countrySlug: "poland", status: "available", priceNaira: 115, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "philippines", status: "available", priceNaira: 110, avgDeliverySeconds: 14, successRate: 95 },
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
    priceFromNaira: 135,
    availability: [
      { countrySlug: "nigeria", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "usa", status: "available", priceNaira: 160, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "uk", status: "available", priceNaira: 170, avgDeliverySeconds: 14, successRate: 95 },
      { countrySlug: "canada", status: "limited", priceNaira: 155, avgDeliverySeconds: 20, successRate: 88 },
      { countrySlug: "germany", status: "available", priceNaira: 180, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "indonesia", status: "available", priceNaira: 140, avgDeliverySeconds: 14, successRate: 96 },
      { countrySlug: "poland", status: "limited", priceNaira: 150, avgDeliverySeconds: 19, successRate: 90 },
      { countrySlug: "philippines", status: "available", priceNaira: 135, avgDeliverySeconds: 13, successRate: 97 },
    ],
  },
  {
    slug: "google",
    name: "Google",
    category: "Developer & Cloud",
    description:
      "Complete Google account verification for new account setup or testing.",
    color: "#4285F4",
    rentalSupported: false,
    priceFromNaira: 390,
    availability: [
      { countrySlug: "nigeria", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "usa", status: "limited", priceNaira: 420, avgDeliverySeconds: 25, successRate: 84 },
      { countrySlug: "uk", status: "limited", priceNaira: 440, avgDeliverySeconds: 27, successRate: 82 },
      { countrySlug: "canada", status: "limited", priceNaira: 430, avgDeliverySeconds: 26, successRate: 83 },
      { countrySlug: "germany", status: "available", priceNaira: 450, avgDeliverySeconds: 18, successRate: 91 },
      { countrySlug: "indonesia", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "poland", status: "available", priceNaira: 390, avgDeliverySeconds: 17, successRate: 92 },
      { countrySlug: "philippines", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
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
    priceFromNaira: 220,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 220, avgDeliverySeconds: 20, successRate: 91 },
      { countrySlug: "usa", status: "available", priceNaira: 260, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "uk", status: "available", priceNaira: 270, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "canada", status: "available", priceNaira: 260, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "germany", status: "available", priceNaira: 280, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "indonesia", status: "limited", priceNaira: 230, avgDeliverySeconds: 22, successRate: 87 },
      { countrySlug: "poland", status: "available", priceNaira: 245, avgDeliverySeconds: 19, successRate: 91 },
      { countrySlug: "philippines", status: "available", priceNaira: 235, avgDeliverySeconds: 18, successRate: 92 },
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
    priceFromNaira: 220,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 220, avgDeliverySeconds: 20, successRate: 91 },
      { countrySlug: "usa", status: "available", priceNaira: 255, avgDeliverySeconds: 15, successRate: 95 },
      { countrySlug: "uk", status: "available", priceNaira: 265, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "canada", status: "available", priceNaira: 255, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "germany", status: "available", priceNaira: 275, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "indonesia", status: "limited", priceNaira: 230, avgDeliverySeconds: 21, successRate: 88 },
      { countrySlug: "poland", status: "available", priceNaira: 240, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "philippines", status: "available", priceNaira: 235, avgDeliverySeconds: 17, successRate: 93 },
    ],
  },
  {
    slug: "discord",
    name: "Discord",
    category: "Social & Messaging",
    description:
      "Verify Discord accounts for community setup and moderation testing.",
    color: "#5865F2",
    rentalSupported: false,
    priceFromNaira: 80,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 80, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "usa", status: "available", priceNaira: 110, avgDeliverySeconds: 10, successRate: 98 },
      { countrySlug: "uk", status: "available", priceNaira: 120, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "canada", status: "available", priceNaira: 115, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "germany", status: "available", priceNaira: 130, avgDeliverySeconds: 12, successRate: 96 },
      { countrySlug: "indonesia", status: "available", priceNaira: 90, avgDeliverySeconds: 14, successRate: 95 },
      { countrySlug: "poland", status: "available", priceNaira: 100, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "philippines", status: "available", priceNaira: 95, avgDeliverySeconds: 13, successRate: 95 },
    ],
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    category: "Social & Messaging",
    description:
      "Verify LinkedIn accounts for recruiting, sales, or professional networking.",
    color: "#0A66C2",
    rentalSupported: true,
    priceFromNaira: 160,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 160, avgDeliverySeconds: 19, successRate: 92 },
      { countrySlug: "usa", status: "available", priceNaira: 185, avgDeliverySeconds: 14, successRate: 95 },
      { countrySlug: "uk", status: "available", priceNaira: 195, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "canada", status: "available", priceNaira: 185, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "germany", status: "available", priceNaira: 200, avgDeliverySeconds: 16, successRate: 93 },
      { countrySlug: "indonesia", status: "limited", priceNaira: 165, avgDeliverySeconds: 20, successRate: 89 },
      { countrySlug: "poland", status: "available", priceNaira: 175, avgDeliverySeconds: 17, successRate: 92 },
      { countrySlug: "philippines", status: "limited", priceNaira: 170, avgDeliverySeconds: 19, successRate: 90 },
    ],
  },
  {
    slug: "amazon",
    name: "Amazon",
    category: "Finance & Shopping",
    description:
      "Complete Amazon phone verification for seller, buyer, or developer accounts.",
    color: "#FF9900",
    rentalSupported: false,
    priceFromNaira: 260,
    availability: [
      { countrySlug: "nigeria", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "usa", status: "available", priceNaira: 290, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "uk", status: "available", priceNaira: 300, avgDeliverySeconds: 19, successRate: 91 },
      { countrySlug: "canada", status: "available", priceNaira: 295, avgDeliverySeconds: 19, successRate: 91 },
      { countrySlug: "germany", status: "available", priceNaira: 310, avgDeliverySeconds: 20, successRate: 90 },
      { countrySlug: "indonesia", status: "limited", priceNaira: 260, avgDeliverySeconds: 24, successRate: 85 },
      { countrySlug: "poland", status: "limited", priceNaira: 270, avgDeliverySeconds: 23, successRate: 86 },
      { countrySlug: "philippines", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
    ],
  },
  {
    slug: "paypal",
    name: "PayPal",
    category: "Finance & Shopping",
    description:
      "Verify PayPal accounts with SMS codes for account setup and testing flows.",
    color: "#003087",
    rentalSupported: false,
    priceFromNaira: 580,
    availability: [
      { countrySlug: "nigeria", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "usa", status: "limited", priceNaira: 620, avgDeliverySeconds: 26, successRate: 81 },
      { countrySlug: "uk", status: "limited", priceNaira: 640, avgDeliverySeconds: 28, successRate: 80 },
      { countrySlug: "canada", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "germany", status: "limited", priceNaira: 660, avgDeliverySeconds: 27, successRate: 82 },
      { countrySlug: "indonesia", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "poland", status: "limited", priceNaira: 580, avgDeliverySeconds: 25, successRate: 83 },
      { countrySlug: "philippines", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
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
