export const pricingFactors = [
  {
    title: "Country",
    description: "Number cost varies by country based on local carrier fees and inventory.",
  },
  {
    title: "Service",
    description: "Some services require higher-quality number pools, which affects price.",
  },
  {
    title: "Availability",
    description: "Live inventory changes throughout the day as numbers are used and refreshed.",
  },
];

export interface PricingExample {
  serviceSlug: string;
  countrySlug: string;
}

export const pricingExamples: PricingExample[] = [
  { serviceSlug: "discord", countrySlug: "nigeria" },
  { serviceSlug: "telegram", countrySlug: "nigeria" },
  { serviceSlug: "instagram", countrySlug: "nigeria" },
  { serviceSlug: "whatsapp", countrySlug: "nigeria" },
  { serviceSlug: "telegram", countrySlug: "usa" },
  { serviceSlug: "instagram", countrySlug: "uk" },
];
