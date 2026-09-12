export interface FaqItem {
  question: string;
  answer: string;
}

export const faqs: FaqItem[] = [
  {
    question: "What is Xencodes?",
    answer:
      "Xencodes gives you a virtual phone number for receiving SMS verification codes. You pick the service you are verifying, choose a country, and the code appears on screen when it arrives.",
  },
  {
    question: "How does Xencodes work?",
    answer:
      "Search for the service you need a number for, choose from the countries that have numbers in stock, and pay from your wallet. The number is yours for the session, and any code sent to it shows up in your activation page.",
  },
  {
    question: "How do I get a number?",
    answer:
      "Create an account, add funds to your wallet, then search for your service on the homepage. Choosing a country buys the number straight away, so there is no long checkout to fill in.",
  },
  {
    question: "How long does it take to receive an SMS?",
    answer:
      "Most codes arrive within a few seconds. Delivery depends on the service and the country, and each country shows its typical delivery time before you buy.",
  },
  {
    question: "What happens if I do not receive a code?",
    answer:
      "You are refunded in full. If the session runs out with no code, the refund is automatic, and you can cancel earlier yourself for the same result. No code means no charge.",
  },
  {
    question: "How do refunds work?",
    answer:
      "Refunds go back to your Xencodes wallet immediately, not to your card, so you can try another country or service right away. Every refund is listed in your wallet history.",
  },
  {
    question: "Which services are supported?",
    answer:
      "Instagram, Facebook, WhatsApp, Telegram, TikTok, Google, Fiverr, Upwork and many more. The Services page lists everything currently available with live prices.",
  },
  {
    question: "Which countries are available?",
    answer:
      "Availability changes with stock, so each service shows only the countries that can receive its codes right now. Nigeria, the United States, the United Kingdom and several others are covered.",
  },
  {
    question: "Can I use one number more than once?",
    answer:
      "A purchase covers one verification session. If you need a second code later, buy another number for that service.",
  },
];
