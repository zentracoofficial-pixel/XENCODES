import type { FaqItem } from "@/data/faq";
import type { GuideSection } from "@/data/guides";

/**
 * The deeper half of each guide: the details, worked examples and
 * troubleshooting that make an article worth reading to the end. Kept apart
 * from the headline content in guides.ts and merged by slug.
 */
export interface GuideExtra {
  sections: GuideSection[];
  faq?: FaqItem[];
}

export const GUIDE_EXTRAS: Record<string, GuideExtra> = {
  "what-is-a-virtual-phone-number": {
    sections: [
      {
        heading: "Virtual numbers in the real world",
        paragraphs: [
          "Behind every phone number there is a carrier or a numbering provider that owns a block of numbers and decides where messages to them are delivered. A traditional number delivers to a SIM. A virtual number delivers to software: an app, a web page, or an API. The number itself is just as real, and the sender cannot tell the difference, because they only hand a message to the network addressed to that number.",
          "That is why the same idea shows up in very different places. Businesses use virtual numbers for customer support lines that ring on any device. Freelancers use them to keep client calls separate from personal ones. And for verification, a number only has to receive one text, which makes the cheapest and shortest-lived kind of virtual number a good fit.",
        ],
      },
      {
        heading: "A worked example",
        paragraphs: [
          "Say you want a second Telegram account for a community you moderate. You open Xencodes, search for Telegram, and see a list of countries with numbers in stock, each with its own price. You pick one and buy a number. The number appears on screen. In Telegram you type it in, tap to receive the code, and watch your Xencodes activation page. A few moments later the code appears. You type it into Telegram, the account is verified, and the activation is complete.",
          "If instead the code never arrives, nothing is lost: the number is cancelled when its time runs out and the price goes back into your wallet automatically.",
        ],
      },
      {
        heading: "Choosing between a virtual number and your own",
        paragraphs: [
          "Use your own number for anything you will rely on for years, such as your bank, your main email and your government accounts. Those services will text you again, and you need to receive it. Use a temporary virtual number for the lower-stakes accounts where you only need to clear a verification step once: trials, communities, test accounts, and services you are not sure you will keep.",
          "If you ever have to choose between convenience and recovery, choose recovery. An account you cannot get back into is worth less than the minutes you saved.",
        ],
      },
      {
        heading: "Common misunderstandings",
        paragraphs: [],
        bullets: [
          "It is not anonymous in a legal sense. It reduces what a website learns about you, but you are still bound by the rules of the service and the platform you use.",
          "It is not a guarantee. A service may still decline a number for its own reasons, which is why trying another country is a normal next step.",
          "It does not make an account safe. Add a strong password and, where it is offered, an authenticator app.",
        ],
      },
    ],
    faq: [
      { question: "How long does a virtual number last?", answer: "A Xencodes number is yours for one activation, for a limited time, and is released afterwards." },
    ],
  },
  "how-to-receive-sms-online": {
    sections: [
      {
        heading: "What you need before you start",
        paragraphs: [
          "Just three things: an internet connection, a Xencodes account with some funds in the wallet, and the service you want to verify open in another tab or app. There is nothing to install and no SIM to insert. Everything happens in the browser.",
        ],
      },
      {
        heading: "Reading the activation page",
        paragraphs: [
          "After you buy a number, the activation page shows the number, a countdown for how long it remains valid, and a space where the code will appear. The page checks for new messages by itself, so you do not need to refresh it. When a code lands, it appears in large type so you can copy it into the service straight away.",
          "If you need to leave, you can come back through your order history while the number is still valid. Codes that have arrived stay in the history, so you can look them up later.",
        ],
      },
      {
        heading: "Common mistakes that delay a code",
        paragraphs: [],
        bullets: [
          "Typing the number without its country code, or with an extra leading zero the service does not expect.",
          "Choosing a country in the service's form that does not match the number's country, so the service tries to text a different number.",
          "Requesting the code several times in a row. Many services block repeat requests for a short time after the first.",
          "Buying a number for one service and using it for another. A number is bought for a specific service.",
        ],
      },
      {
        heading: "When a different country is the answer",
        paragraphs: [
          "Services sometimes treat countries differently, depending on how many numbers from that country they have seen recently. If a number from one country is refused or never gets a code, buying from a different country is usually faster than retrying the same one. The price differs by country, and the one you pay is always shown before you buy.",
        ],
      },
    ],
    faq: [
      { question: "Do I need to keep the page open?", answer: "It helps, because the code appears there as soon as it arrives, but codes are saved to your order history too." },
    ],
  },
  "verify-whatsapp-without-your-personal-number": {
    sections: [
      {
        heading: "WhatsApp, WhatsApp Business and why it matters",
        paragraphs: [
          "WhatsApp offers two apps: the standard one and WhatsApp Business. Both register with a phone number and both text a code to verify it. If you want a business profile with a catalogue and quick replies, the Business app is usually the better fit, and a dedicated number keeps customer messages away from your personal chats. The verification step is identical in both.",
        ],
      },
      {
        heading: "A step-by-step walk-through",
        paragraphs: [],
        bullets: [
          "On Xencodes, search for WhatsApp and choose a country with stock. Note the price shown before you buy.",
          "Buy the number and copy it exactly, including the country code.",
          "Open WhatsApp or WhatsApp Business, choose to register a new number, pick the matching country, and paste the rest of the number.",
          "Choose SMS as the way to receive the code and tap to continue.",
          "Watch your Xencodes activation page. When the six-digit code appears, enter it in WhatsApp.",
          "Finish the profile, and switch on two-step verification in WhatsApp's settings straight away.",
        ],
      },
      {
        heading: "Protecting the account after verification",
        paragraphs: [
          "This is the part people skip, and the part that matters most. Because the number is released after verification, you will not be able to receive another code on it. Two-step verification adds a PIN that WhatsApp asks for when the account is registered again, which keeps it yours. Add a recovery email in the same menu, so you can reset the PIN if you forget it.",
          "Keep the app signed in on the device you registered it on. If you uninstall it without a way to verify again, you may lose the account and its chat history. Back up your chats to the cloud before you change phones.",
        ],
      },
      {
        heading: "When WhatsApp does not accept a number",
        paragraphs: [
          "Sometimes WhatsApp says the number cannot be used or does not send a code. That is its own anti-abuse decision. Wait for the activation to expire and the number is refunded, then try a number from a different country. Do not tap resend repeatedly: WhatsApp slows down further requests for the same number.",
        ],
      },
    ],
    faq: [
      { question: "Can I move my existing WhatsApp account to a virtual number?", answer: "WhatsApp lets you change the number on an existing account from within the app, but the new number must be able to receive a code and then keep working. A temporary number is not suited to this." },
    ],
  },
  "create-a-telegram-account-with-a-virtual-number": {
    sections: [
      {
        heading: "How Telegram uses your number",
        paragraphs: [
          "Telegram uses your phone number as your account identifier and to send login codes when you sign in on a new device. Unlike many apps it does not need the number to stay reachable after you are signed in, because it sends later codes to your already signed-in devices inside the app. That makes it one of the better-suited services for a short-lived number, as long as you set the account up carefully.",
        ],
      },
      {
        heading: "Step by step",
        paragraphs: [],
        bullets: [
          "Buy a Telegram number on Xencodes from a country with stock.",
          "In Telegram, start signing up and enter the number with its country code.",
          "Telegram sends a login code. It appears on your Xencodes activation page; type it into Telegram.",
          "Choose a name and, importantly, a username so people can reach you without your number.",
          "Open Settings and add a password for two-step verification and a recovery email.",
        ],
      },
      {
        heading: "What to configure before you rely on it",
        paragraphs: [
          "Open Privacy and Security and set who can see your phone number to Nobody. Set who can find you by number to My contacts or Nobody. These two settings keep the virtual number out of groups and search results.",
          "Check Active Sessions and keep at least one signed-in device. If you ever lose all sessions, Telegram would text a code to the number, which you will no longer have. A second device or a desktop session is your safety net.",
        ],
      },
      {
        heading: "Using Telegram for communities and channels",
        paragraphs: [
          "Many people create a separate Telegram account to run a channel, a support group or a community without exposing their personal profile. The same rules apply: set a public username, hide the number, and protect the account with a password. If more than one person manages the channel, use Telegram's admin roles rather than sharing the login.",
        ],
      },
    ],
    faq: [
      { question: "Will Telegram ask for the number again?", answer: "Only if you sign in on a new device and have no other signed-in device. Keep a second session open and set a password." },
    ],
  },
  "virtual-number-vs-temporary-number-vs-voip": {
    sections: [
      {
        heading: "Why services treat numbers differently",
        paragraphs: [
          "When you enter a number, many services look it up in a database that says which carrier it belongs to and what type of line it is: mobile, landline or internet-based. Some services are strict and allow only mobile lines; others accept anything that can receive a text. This is why the same number can work for one service and fail for another, and why no honest provider can promise that a number will be accepted everywhere.",
        ],
      },
      {
        heading: "A quick comparison",
        paragraphs: [],
        bullets: [
          "Temporary virtual number: short-lived, cheap, ideal for one verification code. Released afterwards.",
          "Rented long-term virtual number: kept for weeks or months, can receive repeated messages from the same service.",
          "VoIP number: delivered over the internet, mostly for calls. Some services refuse these for verification.",
          "Prepaid SIM: a physical mobile number you keep. The most widely accepted, and the least private.",
        ],
      },
      {
        heading: "Picking by what you need",
        paragraphs: [
          "If you need a single code and the account is low stakes, a temporary number is sensible. If you need to receive messages from the same service repeatedly, for example to log in on new devices, a number you keep is better. If a service refuses everything virtual, a real prepaid SIM is the reliable fallback.",
          "In every case, the account's own security matters more than the number: use a password manager, switch on an authenticator app wherever it is offered, and keep a recovery email you control.",
        ],
      },
    ],
    faq: [
      { question: "Is a temporary number the same as a disposable email?", answer: "They are similar ideas for different channels: both exist to receive one verification message without exposing your own contact details." },
    ],
  },
  "sms-verification-code-not-received": {
    sections: [
      {
        heading: "Why codes go missing: a closer look",
        paragraphs: [
          "A verification text crosses several hands: the service, its SMS gateway, one or more carriers, and the receiving platform. A delay or refusal at any step can stop it. The service may decline to send to a number that has requested many codes recently; the gateway may queue messages during busy periods; and a carrier may filter messages that look like bulk traffic. Most of these are invisible to you, which is why the practical fixes below focus on what you control.",
        ],
      },
      {
        heading: "A practical order to try things in",
        paragraphs: [],
        bullets: [
          "Wait for the full time window on the activation page before assuming nothing will arrive.",
          "Check that the country selected in the service's form matches the number's country.",
          "Make sure you chose the SMS option and not a voice call.",
          "Do not request again immediately. Wait for the service's resend timer.",
          "If the time runs out, take the automatic refund and buy again from a different country.",
          "Try a different time: some services are slower at busy hours.",
        ],
      },
      {
        heading: "Patterns worth knowing",
        paragraphs: [
          "If several numbers from the same country fail with one service, try another country. If numbers work for some services but not others, the problem is the service's rules rather than the number. If every attempt fails everywhere, check that you are entering the number with the correct country code.",
          "Each failed attempt that gets no code is refunded, so trying again costs you only the cost of the attempts that actually work.",
        ],
      },
      {
        heading: "When to contact support",
        paragraphs: [
          "If a code arrived on the activation page but the service says it is wrong, or if an order looks stuck after its time ran out, open a support ticket from your dashboard with the order details. Include the service and the time, and we will look at what happened.",
        ],
      },
    ],
    faq: [
      { question: "Can a code arrive after the number expires?", answer: "Once a number expires it is cancelled, so a late message would not be delivered to your page. Buy a new number to try again." },
    ],
  },
  "keep-your-personal-number-private-online": {
    sections: [
      {
        heading: "What can go wrong when your number is everywhere",
        paragraphs: [
          "A phone number does more than reach you. It is often a login, a recovery method and a way to link your accounts across companies. The more places hold it, the more places can leak it, and the easier it is for someone to tie your accounts together. It is also the key to SIM-swap fraud, where a criminal persuades a carrier to move your number to a SIM they control and then uses it to reset passwords.",
        ],
      },
      {
        heading: "A privacy routine that is easy to keep",
        paragraphs: [],
        bullets: [
          "Decide which accounts truly need your real number (bank, main email, government) and keep it for them only.",
          "Use a different method for everything else: an authenticator app for security, a temporary number for one-off verification.",
          "Ask your carrier to add a PIN or lock on SIM changes.",
          "Check app privacy settings for who can see your number or find you by it.",
          "Be cautious with forms that ask for a number you do not need. Leave optional fields empty.",
        ],
      },
      {
        heading: "Spotting scams that use your number",
        paragraphs: [
          "Never read a verification code to someone who contacts you. Real services do not ask for it. A message that says a code was sent to you and asks you to forward it is almost always an attempt to take over an account. If you receive a code you did not request, someone may be trying to sign in as you; change your password for that service.",
        ],
      },
      {
        heading: "Privacy is a habit, not a product",
        paragraphs: [
          "A virtual number reduces how many companies hold your real contact details. It does not replace good security. Combine it with unique passwords, a password manager and an authenticator app for the accounts that matter.",
        ],
      },
    ],
    faq: [
      { question: "Should I use a virtual number for my bank?", answer: "No. Banks text you repeatedly and may refuse virtual numbers. Use your real number for financial accounts." },
    ],
  },
  "how-sms-one-time-passwords-work": {
    sections: [
      {
        heading: "OTP versus two-factor authentication",
        paragraphs: [
          "An OTP is the code itself. Two-factor authentication (2FA) is the practice of asking for something you know, like a password, plus something you have, like a phone that receives a code. SMS is one way to deliver the second factor. Others are authenticator apps that generate codes offline, and hardware keys that prove you hold a physical device.",
        ],
      },
      {
        heading: "Ranking the options",
        paragraphs: [],
        bullets: [
          "Hardware security key: the strongest option for important accounts.",
          "Authenticator app: strong and works without signal, recommended for most people.",
          "SMS code: better than a password alone, but weaker, because texts can be redirected through SIM-swap attacks.",
          "Email code: depends entirely on the security of the email account.",
        ],
      },
      {
        heading: "Why sign-up forms use SMS anyway",
        paragraphs: [
          "For a new account, a service has no authenticator app to rely on. SMS works on every phone, needs no installation, and proves a working number exists. That is why it remains the default for sign-up verification even where stronger options exist for later logins.",
        ],
      },
      {
        heading: "Handling OTPs safely",
        paragraphs: [
          "Treat a code like a password that lasts a few minutes. Enter it only on the site or app you just used, never share it, and be suspicious of any request that creates urgency. If a code arrives that you did not ask for, ignore it and consider changing the account's password.",
        ],
      },
    ],
    faq: [
      { question: "Why do some codes have a time limit?", answer: "A short lifetime limits the damage if a code is intercepted. After it expires you need to request a new one." },
    ],
  },
  "verify-accounts-when-travelling-or-living-abroad": {
    sections: [
      {
        heading: "The travel verification checklist",
        paragraphs: [],
        bullets: [
          "Before you leave, move important logins to an authenticator app and print or store the backup codes safely.",
          "Tell your bank you are travelling so security checks do not lock you out.",
          "Keep your home SIM active if you rely on it for banking codes.",
          "Download offline copies of tickets and bookings.",
          "For new local accounts abroad, decide whether you need a number you keep or just one code.",
        ],
      },
      {
        heading: "Ride, delivery and booking apps abroad",
        paragraphs: [
          "Apps such as ride-hailing and delivery services often ask for a phone number from the country where you are using them. If you only need to complete a one-off verification, a virtual number from the right country can receive the code. Be aware that these apps may later need to call or text you, for example a driver or courier, and a temporary number will not stay reachable. For anything you will actively use, a local SIM or eSIM is the better tool.",
        ],
      },
      {
        heading: "Living abroad for longer",
        paragraphs: [
          "If you are settled for months or years, a local number you keep, whether a SIM, an eSIM or a number you rent, is the dependable choice for banking and government services. Virtual numbers for single codes remain useful for trial accounts, communities and test sign-ups, where recovery does not matter.",
        ],
      },
    ],
    faq: [
      { question: "Should I use a virtual number for a ride-hailing app abroad?", answer: "Only for the verification step. The driver may need to contact you, which a temporary number cannot do." },
    ],
  },
  "sms-verification-numbers-for-app-testing": {
    sections: [
      {
        heading: "A test plan that covers the basics",
        paragraphs: [
          "Write down each step of your SMS flow and the behaviour you expect, then run it against numbers from several countries. At minimum, check that the form accepts a correct number and rejects an invalid one, that the message arrives, that the code works once and not twice, that it expires on time, that a resend arrives and invalidates the previous code, and that too many attempts are rate limited.",
        ],
      },
      {
        heading: "Things that differ by country",
        paragraphs: [],
        bullets: [
          "Number length and formatting, including leading zeros and spaces.",
          "Sender names: some countries restrict or rewrite alphanumeric sender IDs.",
          "Message encoding: non-Latin characters can change message length.",
          "Delivery time: routes and carriers behave differently.",
        ],
      },
      {
        heading: "Record what you see",
        paragraphs: [
          "Keep a simple log with the country, the time you requested the code, the time it arrived and anything unusual in how it looked. A pattern, for example one country that is consistently slow, tells you where to look at your SMS provider's routing.",
          "Remember that each number is for one activation. Plan one purchase per test and buy another for the next run.",
        ],
      },
    ],
    faq: [
      { question: "Can I test voice calls?", answer: "No. These numbers receive text messages only." },
    ],
  },
  "which-country-should-you-pick-for-a-virtual-number": {
    sections: [
      {
        heading: "How prices vary and why",
        paragraphs: [
          "Prices differ because supply differs. A country with many numbers available for a service is generally cheaper than one with few. Prices also move over time as stock sells and is replenished, which is why the figure on each page is the lowest current price and the exact amount is confirmed before you buy.",
        ],
      },
      {
        heading: "A simple decision path",
        paragraphs: [],
        bullets: [
          "Open the service you want and look at the countries in stock.",
          "Start with a lower-priced country that has plenty of stock.",
          "If the number is refused or no code arrives, you are refunded; try the next country.",
          "If a service requires a specific country, choose that one regardless of price.",
        ],
      },
      {
        heading: "What not to optimise for",
        paragraphs: [
          "Do not choose a country because you think the account will look more local. A virtual number is only used for the verification step. Do not assume the most expensive country is the most reliable; acceptance depends on the service's own rules, not on price.",
        ],
      },
    ],
    faq: [
      { question: "Can I choose a country I am not in?", answer: "Yes. The number only receives a text, so its country is independent of where you are." },
    ],
  },
  "using-virtual-numbers-safely-and-responsibly": {
    sections: [
      {
        heading: "What we do not allow, and why",
        paragraphs: [
          "Xencodes numbers must not be used to commit fraud, harass anyone, evade a ban or create accounts in bulk against a service's rules. We do not sell numbers for categories where verification is a regulatory tool, such as trading and investing, gambling, tobacco, alcohol, adult and dating services. Those restrictions are built in and cannot be switched off from the admin side.",
        ],
      },
      {
        heading: "Good habits for accounts you create",
        paragraphs: [
          "Treat every account made with a temporary number as one you may not be able to recover through that number. Add a strong, unique password in a password manager, turn on an authenticator app where offered, and add a recovery email you control. Write down any backup codes the service gives you.",
        ],
      },
      {
        heading: "If something goes wrong",
        paragraphs: [
          "If a service restricts an account you created, follow its appeal process; it is the service's decision. If an order looks wrong on our side, such as a code that did not appear or a refund that did not arrive, open a support ticket from your dashboard and we will review it.",
        ],
      },
    ],
    faq: [
      { question: "Can I resell the numbers?", answer: "No. Numbers are for receiving verification codes on accounts you own." },
    ],
  },
};
