export interface FaqItem {
  question: string;
  answer: string;
}

export const faqs: FaqItem[] = [
  {
    question: "What is Xencodes?",
    answer:
      "Xencodes lets you purchase a virtual phone number to receive SMS verification codes for supported online services, for legitimate account verification and testing.",
  },
  {
    question: "How does a virtual number work?",
    answer:
      "You choose a service and country, then purchase an available number. That number is temporarily assigned to you so it can receive the verification SMS sent by the service you're signing up for.",
  },
  {
    question: "How do I receive my verification code?",
    answer:
      "Once your number is purchased, enter it on the service you're verifying. When the SMS arrives, the code appears automatically on your Xencodes activation page — no refreshing needed.",
  },
  {
    question: "How long does it take?",
    answer:
      "Most codes arrive within seconds to a couple of minutes, depending on the service, country, and current carrier conditions.",
  },
  {
    question: "What happens if I don't receive a code?",
    answer:
      "If your number doesn't receive a code within the session period, you can cancel the activation and the amount is refunded to your wallet in full — no code, no charge.",
  },
  {
    question: "Can I use the number more than once?",
    answer:
      "A standard purchase is for a single verification session. If a service you're using may send more than one code over time, look for rental availability for that service and country.",
  },
  {
    question: "Which services are supported?",
    answer:
      "Xencodes supports a growing list of services including Facebook, Instagram, WhatsApp, Telegram, TikTok, Google, Fiverr, Upwork, and others. Search the full list on the Services page.",
  },
  {
    question: "Which countries are available?",
    answer:
      "Available countries vary by service based on live carrier and inventory conditions. Country options are shown when you select a service in the buying flow.",
  },
  {
    question: "How do refunds work?",
    answer:
      "Activations that don't receive a valid code within the allowed session are refunded automatically to your wallet balance when cancelled or expired. See our Refund Policy for details.",
  },
  {
    question: "Is Xencodes an official service of Facebook, Instagram, Fiverr, etc.?",
    answer:
      "No. Xencodes is an independent service and is not affiliated with, endorsed by, or officially connected to any of the platforms whose verification services may be supported.",
  },
];
