import type { FaqItem } from "@/data/faq";
import { GUIDE_EXTRAS } from "@/data/guide-extras";

/**
 * Long-form guides. Each one answers a question people really search for,
 * says only what is true of virtual numbers and of Xencodes (no invented
 * statistics, no promise that any service will accept a number), and links
 * to the pages that let the reader act on it.
 */
export interface GuideSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface Guide {
  slug: string;
  title: string;
  /** The <title>: shorter than the page heading, keyword first. */
  metaTitle: string;
  description: string;
  category: "Basics" | "How-to" | "Troubleshooting" | "Privacy";
  published: string;
  readingMinutes: number;
  intro: string;
  sections: GuideSection[];
  faq: FaqItem[];
  /** Service pages worth linking to from this guide. */
  relatedServices: string[];
}

const BASE_GUIDES: Guide[] = [
  {
    slug: "what-is-a-virtual-phone-number",
    title: "What is a virtual phone number, and how does SMS verification work?",
    metaTitle: "What Is a Virtual Phone Number? Explained",
    description:
      "A plain-English guide to virtual phone numbers: what they are, how they receive SMS verification codes, what they cannot do, and when they are the right tool.",
    category: "Basics",
    published: "2026-10-16",
    readingMinutes: 5,
    intro:
      "A virtual phone number is a real phone number that is not tied to a SIM card in your pocket. Messages sent to it arrive online instead, where you can read them on a screen. People use them mostly for one job: receiving the one-time code that an app or website texts to prove you control a phone number.",
    sections: [
      {
        heading: "How a virtual number receives a text",
        paragraphs: [
          "When you sign up for a service and enter a phone number, the service asks an SMS gateway to text a short code to it. The gateway does not care whether the number belongs to a SIM or to a platform that passes messages on. If the number is live on a mobile network, the text is delivered, and the platform shows it to you.",
          "With Xencodes the steps are the same every time: choose the service you are verifying, choose a country, and buy a number. Enter the number in the service, ask for the code, and read it on your activation page when it arrives.",
        ],
      },
      {
        heading: "What a virtual number is good for",
        paragraphs: ["Because it only needs to receive a message, a virtual number is a good fit for short, one-off verification tasks."],
        bullets: [
          "Creating an account without giving out your personal number.",
          "Keeping a work, business or testing account separate from personal ones.",
          "Verifying a service that only accepts numbers from a particular country, while you are somewhere else.",
          "Testing sign-up flows when you build or maintain an app.",
        ],
      },
      {
        heading: "What it cannot do",
        paragraphs: [
          "A number bought for verification is not a permanent line. It receives the code for the activation you bought and then it is released. You cannot make calls with it, and it will not receive later messages from the same service, so a password reset months later will not reach it.",
          "It also does not guarantee that a service will accept it. Each service runs its own fraud checks, and some refuse numbers they have seen too often. If a number is rejected, trying another country is usually the quickest fix.",
        ],
      },
      {
        heading: "Paying only for codes that arrive",
        paragraphs: [
          "At Xencodes you pay per number from a prepaid wallet. If no code arrives, the number is cancelled and the full price is refunded to your wallet automatically, so you only keep the cost of activations that worked.",
        ],
      },
    ],
    faq: [
      { question: "Is a virtual number the same as a burner SIM?", answer: "No. A burner SIM is a physical card you have to buy and activate. A virtual number needs no hardware: messages arrive online." },
      { question: "Can I use a virtual number for calls?", answer: "Numbers bought for SMS verification only receive text messages. They are not meant for calls." },
      { question: "Do I need to be in the same country as the number?", answer: "No. The number only has to receive a text, so it works from anywhere." },
    ],
    relatedServices: ["whatsapp", "telegram", "google"],
  },
  {
    slug: "how-to-receive-sms-online",
    title: "How to receive an SMS online without a SIM card",
    metaTitle: "How to Receive SMS Online Without a SIM Card",
    description:
      "Step-by-step: how to receive a verification text on a virtual number from any country, using nothing but a browser, and what to do if the message does not come.",
    category: "How-to",
    published: "2026-10-16",
    readingMinutes: 4,
    intro:
      "You do not need a SIM card, a second phone or a roaming plan to receive a text message. A virtual number delivers the message to a web page instead. Here is the whole process, start to finish.",
    sections: [
      {
        heading: "Step by step",
        paragraphs: ["The flow is the same for any service."],
        bullets: [
          "Create a Xencodes account and add funds to your wallet. Nothing is spent until you buy a number.",
          "Search for the service you want to verify, for example WhatsApp or Telegram.",
          "Choose a country that has numbers in stock. Prices differ by country, and the exact price is shown before you pay.",
          "Buy the number and copy it exactly as shown, including the country code.",
          "Paste it into the service's phone number field and request the code.",
          "Watch your activation page: the code appears there as soon as the service sends it.",
        ],
      },
      {
        heading: "Tips for a smoother verification",
        paragraphs: [
          "Request the code only once the number is entered. Many services send a single text and then make you wait before sending another, so repeated taps can slow things down rather than speed them up.",
          "Keep the activation page open. It refreshes by itself and shows the code the moment it arrives. Each number is valid for a limited time; if the time runs out before a code arrives, the number is cancelled and refunded.",
        ],
      },
      {
        heading: "If the message never comes",
        paragraphs: [
          "Sometimes a service decides not to send a code to a particular number. That is outside anyone's control but the service's. When it happens, the number is cancelled and refunded to your wallet automatically, and you can try again with a different country.",
        ],
      },
    ],
    faq: [
      { question: "How long does the code take?", answer: "It depends on the service. Many arrive within moments; if nothing arrives before the number expires, it is refunded." },
      { question: "Can I reuse the number?", answer: "No. Each number is for one activation and is released afterwards." },
    ],
    relatedServices: ["whatsapp", "instagram", "facebook"],
  },
  {
    slug: "verify-whatsapp-without-your-personal-number",
    title: "How to verify WhatsApp without using your personal number",
    metaTitle: "Verify WhatsApp Without Your Own Number",
    description:
      "How to receive WhatsApp's verification code on a virtual number, when this is useful, and what to know about WhatsApp's own rules before you try.",
    category: "How-to",
    published: "2026-10-16",
    readingMinutes: 5,
    intro:
      "WhatsApp ties every account to a phone number and texts a six-digit code to confirm it. If you want a separate account for a business, a project or testing, a virtual number can receive that code without involving your personal SIM.",
    sections: [
      {
        heading: "When this makes sense",
        paragraphs: [],
        bullets: [
          "A second WhatsApp line for a small business or side project.",
          "Keeping client conversations away from your personal chats.",
          "Testing how WhatsApp onboarding works before launching something.",
        ],
      },
      {
        heading: "How to do it",
        paragraphs: [
          "Buy a WhatsApp number on Xencodes, choosing a country with stock. Open WhatsApp (or WhatsApp Business), start registration, and enter the number with its country code. Choose to receive the code by SMS, then read it on your Xencodes activation page and type it in.",
        ],
      },
      {
        heading: "Things to know first",
        paragraphs: [
          "The number is released after the activation, and WhatsApp may later ask you to verify again, for example if you reinstall the app or move to a new device. You cannot receive that second code on the same number. Treat an account created this way as one you may not be able to recover, and enable two-step verification inside WhatsApp so you control the account with a PIN.",
          "WhatsApp decides which numbers it accepts and may use a voice call instead of an SMS for some of them. Follow its terms of service, and use numbers only for accounts you own.",
        ],
      },
    ],
    faq: [
      { question: "Will the number work for WhatsApp calls?", answer: "No. It is meant for receiving the verification code only." },
      { question: "What if WhatsApp refuses the number?", answer: "Try a number from another country. If no code arrives, the number is refunded automatically." },
    ],
    relatedServices: ["whatsapp"],
  },
  {
    slug: "create-a-telegram-account-with-a-virtual-number",
    title: "How to create a Telegram account with a virtual number",
    metaTitle: "Create a Telegram Account With a Virtual Number",
    description:
      "How to sign up for Telegram with a virtual number, why it keeps your personal number private, and how to stay in control of the account afterwards.",
    category: "How-to",
    published: "2026-10-16",
    readingMinutes: 4,
    intro:
      "Telegram accounts are linked to a phone number, which means your number can be seen by people who know it. Using a virtual number for a Telegram account is a simple way to keep your personal number out of it.",
    sections: [
      {
        heading: "Setting it up",
        paragraphs: [
          "Buy a Telegram number on Xencodes from a country with stock. In Telegram, enter the number with its country code and request the login code. The code appears on your activation page, and you type it into Telegram to finish.",
        ],
      },
      {
        heading: "Staying in control of the account",
        paragraphs: [
          "Because the virtual number is released after the activation, you will not be able to receive a new login code on it later. Before you rely on the account, open Telegram's settings and set up a password (two-step verification) and a recovery email. Stay signed in on at least one device; Telegram sends login codes to your existing sessions inside the app first, so an active session is what protects you.",
        ],
      },
      {
        heading: "Usernames and privacy",
        paragraphs: [
          "In Telegram's privacy settings you can choose who sees your phone number and set a public username so people can find you without it. Combined with a virtual number, that keeps your personal contact details out of group chats and channels.",
        ],
      },
    ],
    faq: [
      { question: "Can I log in on a new device later?", answer: "Telegram sends the code to your other signed-in device first. Without one, you would need a number that can receive the code again, so set up a password and recovery email early." },
    ],
    relatedServices: ["telegram"],
  },
  {
    slug: "virtual-number-vs-temporary-number-vs-voip",
    title: "Virtual number, temporary number or VoIP: what is the difference?",
    metaTitle: "Virtual vs Temporary vs VoIP Numbers",
    description:
      "The terms are used loosely. Here is what virtual, temporary, VoIP and burner numbers each mean, and which one fits SMS verification.",
    category: "Basics",
    published: "2026-10-16",
    readingMinutes: 5,
    intro:
      "People use the words virtual, temporary, VoIP and burner almost interchangeably, but they describe different things. Knowing which is which helps you pick the right tool and set the right expectations.",
    sections: [
      {
        heading: "Virtual number",
        paragraphs: [
          "A number that is not attached to one physical SIM. Messages and calls are routed to software. This is the broad category the others sit inside.",
        ],
      },
      {
        heading: "Temporary number",
        paragraphs: [
          "A virtual number you hold for a short time, usually for one verification. The number is released afterwards and may be handed to someone else. Xencodes numbers work this way: you rent one for one activation.",
        ],
      },
      {
        heading: "VoIP number",
        paragraphs: [
          "A number delivered over the internet (Voice over IP), typically used for calls. Some services treat VoIP numbers as higher risk and refuse them for verification. Whether a given number is classed as VoIP is up to the carrier data a service looks up, and nobody can promise how a particular service will treat it.",
        ],
      },
      {
        heading: "Burner number",
        paragraphs: [
          "Usually a throwaway line you keep for a while to avoid sharing your real one, either a cheap prepaid SIM or an app-based number. It lasts longer than a temporary number but is not meant to be permanent.",
        ],
      },
      {
        heading: "Which one for SMS verification?",
        paragraphs: [
          "For a single verification code, a temporary virtual number is the simplest and cheapest choice. If you need to keep an account long term and receive codes repeatedly, a number you control permanently is the safer option.",
        ],
      },
    ],
    faq: [
      { question: "Will every service accept a virtual number?", answer: "No. Each service applies its own checks and may refuse some numbers. Trying another country often helps." },
    ],
    relatedServices: ["telegram", "google"],
  },
  {
    slug: "sms-verification-code-not-received",
    title: "SMS verification code not received? Nine things to check",
    metaTitle: "SMS Verification Code Not Received? Fixes",
    description:
      "Why a verification text may not arrive, and what to check: number format, timing, service limits, country choice and how refunds work.",
    category: "Troubleshooting",
    published: "2026-10-16",
    readingMinutes: 5,
    intro:
      "Waiting for a code that never shows up is frustrating. Most of the time the cause is one of the points below, and none of them need technical skill to check.",
    sections: [
      {
        heading: "Check these first",
        paragraphs: [],
        bullets: [
          "Number format: enter the number exactly as shown, with the country code, and without extra zeros or spaces the form does not expect.",
          "Request only once: many services send one text and then enforce a wait before the next. Tapping repeatedly can delay things.",
          "Wait a little: some services take a minute or two, especially at busy times.",
          "Right service: the number must be bought for the service you are verifying; a number bought for another service will not receive this code.",
          "Expiry: each number is valid for a limited time. Once it expires, the number is cancelled.",
        ],
      },
      {
        heading: "If those are fine",
        paragraphs: [
          "The service may be refusing the number. Services keep their own lists of numbers they distrust, for example numbers used many times before. This is the service's decision and it can vary by country, so try a number from another country.",
          "Some services send a voice call instead of a text for certain numbers. A number bought for SMS cannot take that call, so use the text option where the service offers a choice.",
        ],
      },
      {
        heading: "What about my money?",
        paragraphs: [
          "If no code arrives, the number is cancelled and the full price is refunded to your wallet automatically; you do not need to ask. You only keep the cost of activations whose code arrived.",
        ],
      },
    ],
    faq: [
      { question: "How long should I wait?", answer: "Watch the activation page until the number expires. If no code has arrived by then, it is refunded." },
      { question: "Can I ask for the same number again?", answer: "No. Each number is for one activation. Buy a new one, ideally from a different country." },
    ],
    relatedServices: ["whatsapp", "google", "instagram"],
  },
  {
    slug: "keep-your-personal-number-private-online",
    title: "Keeping your personal phone number private when you sign up online",
    metaTitle: "Keep Your Phone Number Private Online",
    description:
      "Why handing your real number to every website is risky, and practical ways to limit it, including using a separate number for sign-ups.",
    category: "Privacy",
    published: "2026-10-16",
    readingMinutes: 4,
    intro:
      "Your phone number is one of the most persistent identifiers you have. It follows you across apps, is hard to change, and is routinely used to link accounts together. Limiting where it appears is one of the easiest privacy gains available.",
    sections: [
      {
        heading: "Why it matters",
        paragraphs: [
          "Companies that collect your number can store it, share it with partners, and lose it in a data breach. Once it is out, it can be used for spam, scam calls and attempts to hijack your accounts through your carrier. Giving it to fewer places means fewer places to leak it.",
        ],
      },
      {
        heading: "Sensible habits",
        paragraphs: [],
        bullets: [
          "Give your real number only to services that genuinely need it, such as your bank.",
          "For one-off sign-ups, use a separate number that can receive the verification code and nothing else.",
          "Turn on app-based or hardware two-factor authentication for important accounts instead of SMS where the service allows it.",
          "Review privacy settings on messaging apps so that your number is not visible to everyone.",
        ],
      },
      {
        heading: "Where a virtual number fits",
        paragraphs: [
          "A temporary virtual number is suited to low-stakes accounts where all you need is to receive a verification code once. For accounts you will rely on, such as banking or your main email, use a number you control permanently, because you will need to receive codes again.",
        ],
      },
    ],
    faq: [
      { question: "Is using a virtual number legal?", answer: "Receiving a verification code on a virtual number is lawful in most places, but you must follow the terms of the service you sign up to and use numbers only for accounts you own." },
    ],
    relatedServices: ["telegram", "facebook"],
  },
  {
    slug: "how-sms-one-time-passwords-work",
    title: "How SMS one-time passwords (OTP) work, and why websites use them",
    metaTitle: "How SMS One-Time Passwords (OTP) Work",
    description:
      "What an OTP is, how a site generates and checks it, why phone numbers are used for verification, and the limits of SMS-based security.",
    category: "Basics",
    published: "2026-10-16",
    readingMinutes: 5,
    intro:
      "That six-digit code a website texts you is called a one-time password, or OTP. It is a small, simple idea that stops many kinds of fake sign-ups and account takeovers.",
    sections: [
      {
        heading: "What happens behind the scenes",
        paragraphs: [
          "When you enter your number, the site generates a random code and stores it with a short expiry. It sends the code through an SMS gateway to your number. You type the code back in, and the site compares it with what it stored. If it matches and has not expired, you have shown that you can receive messages at that number.",
        ],
      },
      {
        heading: "Why phone numbers",
        paragraphs: [
          "Phone numbers are cheap to check and hard to create in bulk, compared with email addresses. Asking for one makes mass-created fake accounts more expensive, and it gives the service a way to reach you for security alerts.",
        ],
      },
      {
        heading: "The limits of SMS codes",
        paragraphs: [
          "SMS is convenient but not the strongest option. Messages can be intercepted in rare cases, and criminals can trick carriers into moving a number to another SIM. For important accounts, prefer an authenticator app or a hardware key where the service supports it.",
          "That is also why you should never share an OTP with anyone who asks for it, whatever reason they give. A genuine service will never need you to read the code back to them.",
        ],
      },
    ],
    faq: [
      { question: "How long is an OTP valid?", answer: "Usually a few minutes. The service decides the exact time." },
      { question: "Why did my code arrive twice?", answer: "Some services resend automatically or when you request a second code. Use the most recent one." },
    ],
    relatedServices: ["google", "microsoft"],
  },
  {
    slug: "verify-accounts-when-travelling-or-living-abroad",
    title: "Verifying accounts when you travel or live abroad",
    metaTitle: "Verify Accounts Abroad Without a Local SIM",
    description:
      "Roaming and new SIMs make verification codes awkward. How a virtual number lets you receive them from anywhere, and what to set up before you leave.",
    category: "How-to",
    published: "2026-10-16",
    readingMinutes: 4,
    intro:
      "When you move or travel, your home number may stop receiving texts, or roaming charges make it not worth leaving on. Meanwhile apps keep asking for verification codes. A virtual number helps you get through those moments.",
    sections: [
      {
        heading: "Problems people run into",
        paragraphs: [],
        bullets: [
          "Your home SIM is switched off or in a drawer, but a service wants to text it.",
          "A local service only accepts numbers from its own country.",
          "Roaming makes receiving texts slow or expensive.",
        ],
      },
      {
        heading: "How a virtual number helps",
        paragraphs: [
          "You choose a number from the country a service expects and receive the one verification code online, from any connection. There is no SIM to insert and nothing to pay roaming on.",
        ],
      },
      {
        heading: "Before you leave",
        paragraphs: [
          "Move important accounts such as banking and email onto an authenticator app, so you are not dependent on texts. Make a note of backup codes. A virtual number is best for the low-stakes, one-off sign-ups you meet while travelling, not for accounts you must be able to recover later.",
        ],
      },
    ],
    faq: [
      { question: "Which country should I pick?", answer: "Pick one that has the service in stock. If the service insists on a particular country, choose that one." },
    ],
    relatedServices: ["uber", "airbnb", "whatsapp"],
  },
  {
    slug: "sms-verification-numbers-for-app-testing",
    title: "SMS verification numbers for app testing and QA",
    metaTitle: "SMS Verification Numbers for App Testing and QA",
    description:
      "How developers and testers use virtual numbers to check sign-up and login flows that rely on SMS codes, across different countries.",
    category: "How-to",
    published: "2026-10-16",
    readingMinutes: 4,
    intro:
      "If your product sends SMS codes, you need to see what a real user in another country sees. Virtual numbers let a tester receive those messages without buying a SIM for every market.",
    sections: [
      {
        heading: "What you can check",
        paragraphs: [],
        bullets: [
          "Whether the code arrives, and how quickly, in different countries.",
          "How your form handles country codes and number formats.",
          "What the message looks like when it reaches a real handset network.",
          "Whether resend timers and expiry behave as designed.",
        ],
      },
      {
        heading: "Good practice",
        paragraphs: [
          "Use numbers only against products you own or have permission to test. Keep the activation page open while the test runs so you can read each message, and record the time it took. Because each number is for one activation, plan one purchase per test run.",
          "For automated test suites, a dedicated test number from your SMS provider is usually a better long-term fit; virtual numbers are well suited to manual checks and spot testing in new markets.",
        ],
      },
    ],
    faq: [
      { question: "Is there an API?", answer: "Xencodes is built for buying numbers in the dashboard. Ask support if you need something for larger volumes." },
    ],
    relatedServices: ["google", "microsoft"],
  },
  {
    slug: "which-country-should-you-pick-for-a-virtual-number",
    title: "Which country should you pick for a virtual number?",
    metaTitle: "Which Country to Pick for a Virtual Number",
    description:
      "How to choose a country for an SMS verification number: price, stock, the service's own rules, and what to do when a number is refused.",
    category: "How-to",
    published: "2026-10-16",
    readingMinutes: 4,
    intro:
      "Dozens of countries are on offer, and the cheapest is not always the right one. A few simple rules make the choice easy.",
    sections: [
      {
        heading: "Start with stock",
        paragraphs: [
          "Pick a country that has the service in stock. The country list on every service page shows what is on sale at that moment, from the lowest current price.",
        ],
      },
      {
        heading: "Then price",
        paragraphs: [
          "Prices differ by country and by service. If several countries have stock, the lower price is a sensible default, since you can always try another country if the first number is refused.",
        ],
      },
      {
        heading: "Respect the service's own rules",
        paragraphs: [
          "Some services only accept numbers from certain countries, or behave differently by region. If a service insists on a particular country, choose it. If a number is refused, switch to a different country rather than retrying the same one.",
        ],
      },
      {
        heading: "You do not need to be there",
        paragraphs: [
          "The number only receives a text, so its country has nothing to do with where you are.",
        ],
      },
    ],
    faq: [
      { question: "Does the country affect delivery?", answer: "It can: services may treat countries differently. That is why trying a second country is the usual fix for a refused number." },
    ],
    relatedServices: ["whatsapp", "telegram"],
  },
  {
    slug: "using-virtual-numbers-safely-and-responsibly",
    title: "Using virtual numbers safely and responsibly",
    metaTitle: "Using Virtual Numbers Safely and Responsibly",
    description:
      "What a virtual number should and should not be used for, how to protect accounts you create with one, and the rules every user agrees to.",
    category: "Privacy",
    published: "2026-10-16",
    readingMinutes: 4,
    intro:
      "Virtual numbers are a useful privacy and convenience tool, and like any tool they should be used responsibly. These are the principles we ask every customer to follow.",
    sections: [
      {
        heading: "Use them for accounts you own",
        paragraphs: [
          "Numbers are for receiving verification codes on your own accounts. Do not use them to impersonate anyone, to evade a ban or to create accounts in bulk against a service's rules.",
        ],
      },
      {
        heading: "Respect what we do not sell",
        paragraphs: [
          "Xencodes does not offer numbers for trading and investing, gambling, tobacco, alcohol, adult or dating services, and no setting can turn them on.",
        ],
      },
      {
        heading: "Protect accounts you create",
        paragraphs: [],
        bullets: [
          "Add a strong password and, where offered, an authenticator app.",
          "Add a recovery email you control, because the number will not be available later.",
          "Do not rely on a temporary number for anything you could not afford to lose access to.",
          "Never share a verification code with anyone.",
        ],
      },
    ],
    faq: [
      { question: "What happens if I break a service's rules?", answer: "The service may restrict the account. That is between you and the service; Xencodes only provides the number." },
    ],
    relatedServices: ["telegram", "whatsapp"],
  },
];

/** The guides as published: the headline content plus the deeper sections. */
export const GUIDES: Guide[] = BASE_GUIDES.map((guide) => {
  const extra = GUIDE_EXTRAS[guide.slug];
  return extra ? { ...guide, sections: [...guide.sections, ...extra.sections], faq: [...guide.faq, ...(extra.faq ?? [])] } : guide;
});

export function getGuide(slug: string): Guide | null {
  return GUIDES.find((guide) => guide.slug === slug) ?? null;
}
