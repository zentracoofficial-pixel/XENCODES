import { SITE_NAME, SITE_TAGLINE, SITE_URL, SUPPORT_EMAIL } from "@/lib/site";
import { GUIDES } from "@/data/guides";
import { SERVICE_PAGES } from "@/data/service-pages";

export const dynamic = "force-static";
export const revalidate = 86400;

/**
 * A plain-text summary of the site for AI tools that look for one.
 *
 * Be clear about what this is: no AI provider has said it reads this file
 * and studies have found no effect on citations, so it is a cheap courtesy
 * that costs nothing, not a ranking lever. The pages themselves (server
 * rendered, with structured data) are what assistants actually read.
 *
 * Every statement is something the product really does; nothing here
 * promises a delivery rate or that any service will accept a number.
 */
export function GET() {
  const services = SERVICE_PAGES.map((page) => `- [${page.name} numbers](${SITE_URL}/services/${page.slug})`)
    .join("\n");
  const guides = GUIDES.map((guide) => `- [${guide.title}](${SITE_URL}/guides/${guide.slug}): ${guide.description}`).join("\n");

  const body = `# ${SITE_NAME}

> ${SITE_TAGLINE}. ${SITE_NAME} sells virtual phone numbers that receive the one-time SMS code a website or app sends to verify an account. You pay per number, from a wallet in US dollars or Nigerian naira, and the price is shown before you buy.

## How it works
- Choose a service and a country, see the price, and buy a number from your wallet.
- Enter the number in the service, request the code, and read it on your activation page.
- If no code arrives within the session, the number is cancelled and the full price is refunded to the same wallet automatically.
- Codes are not guaranteed, and a service may still refuse a virtual number. Numbers come from third-party suppliers.
- Prices differ by service, country and supplier and change with supply; the live price on each page is the one that applies.
- Use is subject to the acceptable use rules: no fraud, no abuse, no breaking a service's terms or laws.

## Key pages
- [Services](${SITE_URL}/services): every supported service
- [Countries](${SITE_URL}/countries): every supported country
- [Pricing](${SITE_URL}/pricing)
- [How it works](${SITE_URL}/how-it-works)
- [FAQ](${SITE_URL}/faq)
- [Refund policy](${SITE_URL}/refund-policy)
- [Acceptable use](${SITE_URL}/acceptable-use)
- [About and contact](${SITE_URL}/about)

## Popular services
${services}

## Guides
${guides}

## Contact
${SUPPORT_EMAIL}. The only official site is ${SITE_URL}.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
