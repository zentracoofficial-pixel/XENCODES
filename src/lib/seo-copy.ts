import type { FaqItem } from "@/data/faq";

/**
 * The words on the pages built for search engines. Everything here states a
 * fact the product really has (a price read from the catalog, a dial code, a
 * refund rule) and nothing it cannot promise: no delivery percentage, no
 * guaranteed speed, no claim that a service will accept a number.
 */

export const REFUND_SENTENCE = "If no code arrives, the number is cancelled and the full price is refunded to your wallet automatically.";

/** "a Russia" / "an Amazon": the right indefinite article for a name. */
export function withArticle(name: string): string {
  return `${/^[aeio]/i.test(name) ? "an" : "a"} ${name}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

export function serviceFaqs(input: {
  name: string;
  countryCount: number;
  fromUsd: string | null;
  exampleCountries: string[];
}): FaqItem[] {
  const { name, countryCount, fromUsd, exampleCountries } = input;
  return [
    {
      question: `How do I get a virtual number for ${name}?`,
      answer: `Pick ${name}, choose a country that has numbers in stock, and buy a number from your Xencodes wallet. Enter the number where ${name} asks for a phone number, request the code, and it appears on your activation page when it arrives.`,
    },
    {
      question: `Which countries can I use for ${name}?`,
      answer: `${name} numbers are available in ${plural(countryCount, "country", "countries")} right now${exampleCountries.length ? `, including ${exampleCountries.join(", ")}` : ""}. Stock changes constantly, so the list on this page shows what is on sale at this moment.`,
    },
    {
      question: `How much does ${withArticle(name)} number cost?`,
      answer: `${fromUsd ? `Prices start from ${fromUsd}, and ` : "Prices "}depend on the country you choose. You pay per number, from a prepaid wallet, and the exact price is shown before you buy.`,
    },
    {
      question: `What if the ${name} code never arrives?`,
      answer: `${REFUND_SENTENCE} You only pay for a number that actually receives its code.`,
    },
    {
      question: `Can I keep the number after verifying ${name}?`,
      answer: `No. The number is for receiving the verification code for this one activation. It is not a permanent line, so it cannot be used for calls or for receiving ${name} codes again later.`,
    },
  ];
}

export function countryFaqs(input: { country: string; dialCode: string; serviceCount: number; examples: string[] }): FaqItem[] {
  const { country, dialCode, serviceCount, examples } = input;
  return [
    {
      question: `What is ${withArticle(country)} virtual phone number?`,
      answer: `It is a phone number with the ${country} country code${dialCode ? ` (${dialCode})` : ""} that receives text messages online. You use it to receive the one-time code a service sends when you verify an account; it is not a SIM card and you do not need to be in ${country}.`,
    },
    {
      question: `Which services work with ${withArticle(country)} number?`,
      answer: `${plural(serviceCount, "service")} currently have ${country} numbers in stock${examples.length ? `, such as ${examples.join(", ")}` : ""}. Whether a particular service accepts a particular number is decided by that service.`,
    },
    {
      question: `How do I buy ${withArticle(country)} number?`,
      answer: `Choose the service you want to verify, select ${country}, and pay from your wallet. The number is shown straight away, and the code appears on your activation page when the service sends it.`,
    },
    {
      question: `What if I do not receive an SMS?`,
      answer: REFUND_SENTENCE,
    },
  ];
}

export function pairFaqs(input: {
  service: string;
  country: string;
  dialCode: string;
  fromUsd: string;
  nationalDigits: number;
}): FaqItem[] {
  const { service, country, dialCode, fromUsd, nationalDigits } = input;
  return [
    {
      question: `How much is ${withArticle(service)} number for ${country}?`,
      answer: `${service} numbers for ${country} start from ${fromUsd}. The price can move with supply, so the exact amount is confirmed on the buy page before anything is charged.`,
    },
    {
      question: `What does ${withArticle(country)} number look like?`,
      answer: `It starts with ${dialCode || "the country code"}${nationalDigits ? ` followed by about ${nationalDigits} digits` : ""}. You enter it exactly as shown, including the country code, in the ${service} sign-up or login screen.`,
    },
    {
      question: `Do I need to be in ${country} to use the number?`,
      answer: `No. The number only has to receive one text message, so it works from anywhere. ${service} may still apply its own rules about which numbers it accepts.`,
    },
    {
      question: `What happens if the ${service} code does not arrive?`,
      answer: REFUND_SENTENCE,
    },
  ];
}
