export interface BlogArticle {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  readTime: string;
  content: string[];
}

export const blogArticles: BlogArticle[] = [
  {
    slug: "what-is-sms-verification",
    title: "What Is SMS Verification and Why Does It Matter?",
    excerpt:
      "A look at how SMS-based phone verification protects online services and why developers rely on it during testing.",
    category: "Fundamentals",
    publishedAt: "2026-01-14",
    readTime: "5 min read",
    content: [
      "SMS verification is a widely used method for confirming that a real, reachable phone number is associated with an account. When a user signs up for a service, the platform sends a one-time code by text message, and the user enters that code to prove they control the number.",
      "For developers and QA teams, testing sign-up flows that require phone verification can be slow and expensive if it requires a personal number for every test account. Virtual numbers solve this by providing disposable, purpose-built numbers that can receive these codes without tying up a personal line.",
      "Xencodes exists to make this process fast, transparent, and reliable for legitimate testing and verification use cases, with clear pricing and real-time delivery into a single dashboard.",
    ],
  },
  {
    slug: "choosing-the-right-country-for-verification",
    title: "Choosing the Right Country for a Verification Number",
    excerpt:
      "Availability and delivery speed vary by country. Here's how to think about picking the right one for your use case.",
    category: "Guides",
    publishedAt: "2026-02-02",
    readTime: "4 min read",
    content: [
      "Not every country performs the same for every service. Carrier relationships, number inventory, and provider coverage all vary by region, which is why Xencodes shows live availability status per country and service rather than a blanket guarantee.",
      "As a general rule, larger markets like the United States, United Kingdom, and Canada tend to have deeper inventory and faster delivery across most services, while some services are more selective about which countries they accept.",
      "Before purchasing a number, check the live availability indicator on the country or service page — it reflects current carrier and inventory conditions rather than a fixed promise.",
    ],
  },
  {
    slug: "activations-vs-rentals",
    title: "Activations vs. Rentals: Which Should You Use?",
    excerpt:
      "Short activation sessions and longer-term rentals solve different problems. Here's when to use each.",
    category: "Guides",
    publishedAt: "2026-02-20",
    readTime: "4 min read",
    content: [
      "An activation is a short-lived session designed for a single verification event: you purchase a number, receive one code, and the session ends. This is the fastest and most cost-effective option when you only need to verify one account one time.",
      "A rental reserves a number for a longer, defined period, which is useful when a service may send multiple codes over time, such as periodic security checks or ongoing account access.",
      "Xencodes supports both models so you can pick the option that matches your workflow instead of paying for more access than you need.",
    ],
  },
  {
    slug: "building-with-the-xencodes-api",
    title: "Building With the Xencodes Developer API",
    excerpt:
      "An overview of how the Xencodes API lets you automate number purchases, SMS retrieval, and activation status.",
    category: "Developers",
    publishedAt: "2026-03-05",
    readTime: "6 min read",
    content: [
      "The Xencodes API mirrors the core dashboard workflow: check available countries and services, purchase a number, poll or receive a webhook for incoming SMS, and read the verification code programmatically.",
      "This makes it straightforward to integrate verification testing directly into automated QA pipelines, staging environments, or internal tooling without manual dashboard interaction.",
      "Webhooks notify your systems the moment a message arrives, so most integrations don't need to poll at all — see the Webhooks documentation for payload details and setup steps.",
    ],
  },
];

export function getArticleBySlug(slug: string) {
  return blogArticles.find((article) => article.slug === slug);
}
