export const rentalDurations = [
  { days: 1, label: "1 day", multiplier: 1 },
  { days: 7, label: "7 days", multiplier: 4.2 },
  { days: 14, label: "14 days", multiplier: 7.5 },
  { days: 30, label: "30 days", multiplier: 12.5 },
] as const;

export const walletTopUps = [
  { amount: 10, bonus: 0 },
  { amount: 25, bonus: 1 },
  { amount: 50, bonus: 3 },
  { amount: 100, bonus: 8 },
  { amount: 250, bonus: 25 },
] as const;

export interface ApiPlan {
  name: string;
  priceLabel: string;
  monthlyFee: number | null;
  description: string;
  features: string[];
  highlighted?: boolean;
}

export const apiPlans: ApiPlan[] = [
  {
    name: "Developer",
    priceLabel: "Pay as you go",
    monthlyFee: 0,
    description: "Wallet-based usage billing with no monthly commitment.",
    features: [
      "Full REST API access",
      "Standard rate limits",
      "Webhook delivery",
      "Community support",
    ],
  },
  {
    name: "Business",
    priceLabel: "$49/mo",
    monthlyFee: 49,
    description: "Higher throughput and priority delivery for production apps.",
    features: [
      "Everything in Developer",
      "5x higher rate limits",
      "Priority SMS routing",
      "Email + chat support",
      "Usage analytics dashboard",
    ],
    highlighted: true,
  },
  {
    name: "Enterprise",
    priceLabel: "Custom",
    monthlyFee: null,
    description: "Dedicated infrastructure and contracts for large-scale usage.",
    features: [
      "Everything in Business",
      "Dedicated number pools",
      "Custom rate limits",
      "SLA-backed uptime",
      "Dedicated account manager",
    ],
  },
];

export const pricingFactors = [
  {
    title: "Country",
    description:
      "Number cost varies by country based on local carrier fees and inventory depth.",
  },
  {
    title: "Service",
    description:
      "Some services require higher-quality number pools, which affects price and success rate.",
  },
  {
    title: "Provider",
    description:
      "Xencodes routes across multiple number and SMS providers, each with different costs.",
  },
  {
    title: "Inventory",
    description:
      "Live availability changes throughout the day as numbers are used and refreshed.",
  },
];
