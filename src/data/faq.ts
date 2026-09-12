export interface FaqItem {
  question: string;
  answer: string;
  category: "General" | "Billing" | "Activations" | "API" | "Account";
}

export const faqs: FaqItem[] = [
  {
    category: "General",
    question: "What is Xencodes?",
    answer:
      "Xencodes is a platform that provides temporary and rentable virtual phone numbers so you can receive SMS verification codes for supported online services, for legitimate account verification, testing, and development purposes.",
  },
  {
    category: "General",
    question: "Is Xencodes intended for fraudulent use?",
    answer:
      "No. Xencodes is built strictly for legitimate verification and testing. It must not be used for fraud, impersonation, unauthorized account access, or circumventing a platform's bans or security controls. Accounts found violating our acceptable use policy are suspended.",
  },
  {
    category: "Activations",
    question: "How does an activation work?",
    answer:
      "Select a service and country, purchase an available number, and enter it where the target service asks for phone verification. The SMS and its code appear in your Xencodes dashboard in real time once it arrives.",
  },
  {
    category: "Activations",
    question: "What happens if I don't receive an SMS?",
    answer:
      "If a code doesn't arrive within the activation window, you can retry where permitted or cancel the activation. Eligible failed activations are refunded automatically to your wallet.",
  },
  {
    category: "Activations",
    question: "Can I keep a number for longer than one activation?",
    answer:
      "Yes. Supported countries and services allow number rentals, letting you hold a number for a defined period such as 7, 14, or 30 days instead of a single short activation.",
  },
  {
    category: "Billing",
    question: "How does pricing work?",
    answer:
      "Xencodes uses pay-as-you-go wallet billing. Prices vary by country, service, provider, and current inventory, and are always shown before you confirm a purchase.",
  },
  {
    category: "Billing",
    question: "How do refunds work?",
    answer:
      "Activations that fail to deliver a valid code within the allowed time, or numbers that a provider marks unusable before delivery, are automatically refunded to your wallet balance.",
  },
  {
    category: "API",
    question: "Does Xencodes offer a developer API?",
    answer:
      "Yes. The Xencodes API gives developers programmatic access to countries, services, pricing, activations, SMS retrieval, and account balance, along with webhook notifications for activation events.",
  },
  {
    category: "API",
    question: "Are there rate limits on the API?",
    answer:
      "Yes, rate limits depend on your plan. Developer accounts get standard limits suitable for low-volume integrations, while Business and Enterprise plans unlock higher throughput.",
  },
  {
    category: "Account",
    question: "Is two-factor authentication supported?",
    answer:
      "Yes. You can enable two-factor authentication from your account security settings for additional protection on your Xencodes account and wallet.",
  },
];
