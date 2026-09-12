import type { Service } from "./types";

export const services: Service[] = [
  {
    slug: "whatsapp",
    name: "WhatsApp",
    category: "Social & Messaging",
    description:
      "Receive a WhatsApp verification code on a number you don't have to own.",
    color: "#25D366",
    rentalSupported: true,
    priceFromNaira: 550,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 550, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "usa", status: "limited", priceNaira: 690, avgDeliverySeconds: 20, successRate: 90 },
      { countrySlug: "uk", status: "limited", priceNaira: 720, avgDeliverySeconds: 22, successRate: 89 },
      { countrySlug: "canada", status: "available", priceNaira: 665, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "germany", status: "limited", priceNaira: 745, avgDeliverySeconds: 24, successRate: 87 },
      { countrySlug: "indonesia", status: "available", priceNaira: 575, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "poland", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "philippines", status: "available", priceNaira: 585, avgDeliverySeconds: 17, successRate: 93 },
    ],
  },
  {
    slug: "telegram",
    name: "Telegram",
    category: "Social & Messaging",
    description:
      "Activate a Telegram account on a temporary number in under a minute.",
    color: "#26A5E4",
    rentalSupported: true,
    priceFromNaira: 180,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 180, avgDeliverySeconds: 16, successRate: 95 },
      { countrySlug: "usa", status: "available", priceNaira: 220, avgDeliverySeconds: 9, successRate: 99 },
      { countrySlug: "uk", status: "available", priceNaira: 240, avgDeliverySeconds: 10, successRate: 98 },
      { countrySlug: "canada", status: "available", priceNaira: 230, avgDeliverySeconds: 10, successRate: 98 },
      { countrySlug: "germany", status: "available", priceNaira: 250, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "indonesia", status: "available", priceNaira: 200, avgDeliverySeconds: 15, successRate: 95 },
      { countrySlug: "poland", status: "available", priceNaira: 215, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "philippines", status: "available", priceNaira: 205, avgDeliverySeconds: 14, successRate: 95 },
    ],
  },
  {
    slug: "instagram",
    name: "Instagram",
    category: "Social & Messaging",
    description:
      "Confirm an Instagram sign-up or security check without using your own line.",
    color: "#E1306C",
    rentalSupported: true,
    priceFromNaira: 260,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 260, avgDeliverySeconds: 19, successRate: 93 },
      { countrySlug: "usa", status: "available", priceNaira: 325, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "uk", status: "available", priceNaira: 350, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "canada", status: "available", priceNaira: 335, avgDeliverySeconds: 14, successRate: 96 },
      { countrySlug: "germany", status: "available", priceNaira: 365, avgDeliverySeconds: 15, successRate: 95 },
      { countrySlug: "indonesia", status: "available", priceNaira: 285, avgDeliverySeconds: 19, successRate: 92 },
      { countrySlug: "poland", status: "limited", priceNaira: 305, avgDeliverySeconds: 21, successRate: 89 },
      { countrySlug: "philippines", status: "limited", priceNaira: 295, avgDeliverySeconds: 23, successRate: 87 },
    ],
  },
  {
    slug: "facebook",
    name: "Facebook",
    category: "Social & Messaging",
    description:
      "Get the Facebook confirmation SMS delivered straight to your dashboard.",
    color: "#1877F2",
    rentalSupported: true,
    priceFromNaira: 220,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 220, avgDeliverySeconds: 18, successRate: 94 },
      { countrySlug: "usa", status: "available", priceNaira: 275, avgDeliverySeconds: 12, successRate: 98 },
      { countrySlug: "uk", status: "available", priceNaira: 295, avgDeliverySeconds: 14, successRate: 97 },
      { countrySlug: "canada", status: "available", priceNaira: 285, avgDeliverySeconds: 15, successRate: 96 },
      { countrySlug: "germany", status: "available", priceNaira: 310, avgDeliverySeconds: 16, successRate: 95 },
      { countrySlug: "indonesia", status: "limited", priceNaira: 240, avgDeliverySeconds: 25, successRate: 85 },
      { countrySlug: "poland", status: "available", priceNaira: 260, avgDeliverySeconds: 18, successRate: 94 },
      { countrySlug: "philippines", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
    ],
  },
  {
    slug: "tiktok",
    name: "TikTok",
    category: "Social & Messaging",
    description:
      "Verify a TikTok account with a number from a region that accepts it.",
    color: "#000000",
    rentalSupported: false,
    priceFromNaira: 245,
    availability: [
      { countrySlug: "nigeria", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "usa", status: "available", priceNaira: 290, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "uk", status: "available", priceNaira: 310, avgDeliverySeconds: 14, successRate: 95 },
      { countrySlug: "canada", status: "limited", priceNaira: 280, avgDeliverySeconds: 20, successRate: 88 },
      { countrySlug: "germany", status: "available", priceNaira: 325, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "indonesia", status: "available", priceNaira: 255, avgDeliverySeconds: 14, successRate: 96 },
      { countrySlug: "poland", status: "limited", priceNaira: 270, avgDeliverySeconds: 19, successRate: 90 },
      { countrySlug: "philippines", status: "available", priceNaira: 245, avgDeliverySeconds: 13, successRate: 97 },
    ],
  },
  {
    slug: "discord",
    name: "Discord",
    category: "Social & Messaging",
    description:
      "The cheapest way to clear a Discord phone check, from ₦150.",
    color: "#5865F2",
    rentalSupported: false,
    priceFromNaira: 150,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 150, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "usa", status: "available", priceNaira: 190, avgDeliverySeconds: 10, successRate: 98 },
      { countrySlug: "uk", status: "available", priceNaira: 200, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "canada", status: "available", priceNaira: 195, avgDeliverySeconds: 11, successRate: 97 },
      { countrySlug: "germany", status: "available", priceNaira: 210, avgDeliverySeconds: 12, successRate: 96 },
      { countrySlug: "indonesia", status: "available", priceNaira: 165, avgDeliverySeconds: 14, successRate: 95 },
      { countrySlug: "poland", status: "available", priceNaira: 180, avgDeliverySeconds: 13, successRate: 96 },
      { countrySlug: "philippines", status: "available", priceNaira: 170, avgDeliverySeconds: 13, successRate: 95 },
    ],
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    category: "Social & Messaging",
    description:
      "Clear LinkedIn's phone step when you're building a recruiting or sales profile.",
    color: "#0A66C2",
    rentalSupported: true,
    priceFromNaira: 300,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 300, avgDeliverySeconds: 19, successRate: 92 },
      { countrySlug: "usa", status: "available", priceNaira: 345, avgDeliverySeconds: 14, successRate: 95 },
      { countrySlug: "uk", status: "available", priceNaira: 365, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "canada", status: "available", priceNaira: 345, avgDeliverySeconds: 15, successRate: 94 },
      { countrySlug: "germany", status: "available", priceNaira: 375, avgDeliverySeconds: 16, successRate: 93 },
      { countrySlug: "indonesia", status: "limited", priceNaira: 310, avgDeliverySeconds: 20, successRate: 89 },
      { countrySlug: "poland", status: "available", priceNaira: 325, avgDeliverySeconds: 17, successRate: 92 },
      { countrySlug: "philippines", status: "limited", priceNaira: 315, avgDeliverySeconds: 19, successRate: 90 },
    ],
  },
  {
    slug: "fiverr",
    name: "Fiverr",
    category: "Marketplaces & Freelance",
    description:
      "Verify a Fiverr seller account so you can start taking gigs.",
    color: "#1DBF73",
    rentalSupported: true,
    priceFromNaira: 400,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 400, avgDeliverySeconds: 20, successRate: 91 },
      { countrySlug: "usa", status: "available", priceNaira: 470, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "uk", status: "available", priceNaira: 490, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "canada", status: "available", priceNaira: 470, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "germany", status: "available", priceNaira: 510, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "indonesia", status: "limited", priceNaira: 420, avgDeliverySeconds: 22, successRate: 87 },
      { countrySlug: "poland", status: "available", priceNaira: 445, avgDeliverySeconds: 19, successRate: 91 },
      { countrySlug: "philippines", status: "available", priceNaira: 425, avgDeliverySeconds: 18, successRate: 92 },
    ],
  },
  {
    slug: "upwork",
    name: "Upwork",
    category: "Marketplaces & Freelance",
    description:
      "Pass Upwork's phone verification when setting up a freelancer profile.",
    color: "#14A800",
    rentalSupported: true,
    priceFromNaira: 400,
    availability: [
      { countrySlug: "nigeria", status: "available", priceNaira: 400, avgDeliverySeconds: 20, successRate: 91 },
      { countrySlug: "usa", status: "available", priceNaira: 465, avgDeliverySeconds: 15, successRate: 95 },
      { countrySlug: "uk", status: "available", priceNaira: 485, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "canada", status: "available", priceNaira: 465, avgDeliverySeconds: 16, successRate: 94 },
      { countrySlug: "germany", status: "available", priceNaira: 500, avgDeliverySeconds: 17, successRate: 93 },
      { countrySlug: "indonesia", status: "limited", priceNaira: 420, avgDeliverySeconds: 21, successRate: 88 },
      { countrySlug: "poland", status: "available", priceNaira: 440, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "philippines", status: "available", priceNaira: 430, avgDeliverySeconds: 17, successRate: 93 },
    ],
  },
  {
    slug: "amazon",
    name: "Amazon",
    category: "Finance & Shopping",
    description:
      "Confirm an Amazon buyer, seller, or developer account by SMS.",
    color: "#FF9900",
    rentalSupported: false,
    priceFromNaira: 475,
    availability: [
      { countrySlug: "nigeria", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "usa", status: "available", priceNaira: 530, avgDeliverySeconds: 18, successRate: 92 },
      { countrySlug: "uk", status: "available", priceNaira: 545, avgDeliverySeconds: 19, successRate: 91 },
      { countrySlug: "canada", status: "available", priceNaira: 535, avgDeliverySeconds: 19, successRate: 91 },
      { countrySlug: "germany", status: "available", priceNaira: 565, avgDeliverySeconds: 20, successRate: 90 },
      { countrySlug: "indonesia", status: "limited", priceNaira: 475, avgDeliverySeconds: 24, successRate: 85 },
      { countrySlug: "poland", status: "limited", priceNaira: 490, avgDeliverySeconds: 23, successRate: 86 },
      { countrySlug: "philippines", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
    ],
  },
  {
    slug: "google",
    name: "Google",
    category: "Developer & Cloud",
    description:
      "Complete the phone step on a new Google or Gmail account.",
    color: "#4285F4",
    rentalSupported: false,
    priceFromNaira: 900,
    availability: [
      { countrySlug: "nigeria", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "usa", status: "limited", priceNaira: 960, avgDeliverySeconds: 25, successRate: 84 },
      { countrySlug: "uk", status: "limited", priceNaira: 1000, avgDeliverySeconds: 27, successRate: 82 },
      { countrySlug: "canada", status: "limited", priceNaira: 980, avgDeliverySeconds: 26, successRate: 83 },
      { countrySlug: "germany", status: "available", priceNaira: 1020, avgDeliverySeconds: 18, successRate: 91 },
      { countrySlug: "indonesia", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "poland", status: "available", priceNaira: 900, avgDeliverySeconds: 17, successRate: 92 },
      { countrySlug: "philippines", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
    ],
  },
  {
    slug: "paypal",
    name: "PayPal",
    category: "Finance & Shopping",
    description:
      "Verify a PayPal account by SMS where virtual numbers are accepted.",
    color: "#003087",
    rentalSupported: false,
    priceFromNaira: 1200,
    availability: [
      { countrySlug: "nigeria", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "usa", status: "limited", priceNaira: 1290, avgDeliverySeconds: 26, successRate: 81 },
      { countrySlug: "uk", status: "limited", priceNaira: 1330, avgDeliverySeconds: 28, successRate: 80 },
      { countrySlug: "canada", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "germany", status: "limited", priceNaira: 1370, avgDeliverySeconds: 27, successRate: 82 },
      { countrySlug: "indonesia", status: "unavailable", priceNaira: 0, avgDeliverySeconds: 0, successRate: 0 },
      { countrySlug: "poland", status: "limited", priceNaira: 1200, avgDeliverySeconds: 25, successRate: 83 },
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

/** Cheapest live price across the whole catalog, in whole Naira. */
export const catalogFloorNaira = Math.min(...services.map((s) => s.priceFromNaira));
