import { NextResponse } from "next/server";
import { quotePair } from "@/lib/inventory";
import { getCurrencyConfig, getDefaultCurrency } from "@/lib/currency-config";
import { serverForProvider } from "@/lib/provider/customer-servers";

/**
 * The live price for one pair, fetched with no cache in the way, so the
 * figure a customer confirms against is the current one.
 *
 * Only the customer price crosses this boundary. The provider cost and
 * the markup that produced it stay on the server: the browser has no
 * reason to know either, and no say in either.
 */
export const dynamic = "force-dynamic";

const UNAVAILABLE: Record<string, string> = {
  no_provider: "Numbers are not on sale right now.",
  unavailable: "That country is out of stock for this service right now.",
  disabled: "That combination is not available for purchase.",
  unpriceable:
    "We could not confirm a price for that country, so it is not on sale.",
  provider_error: "This service is temporarily unavailable. Please try again.",
};

/**
 * This route is public and every answer asks the suppliers live, so a page
 * refreshing in a loop (or a script) would spend their rate limits, which
 * Server II's price reads share. The same question asked again within a few
 * seconds shares one answer; the purchase itself always re-quotes live and
 * never reads this.
 */
const QUOTE_SHARE_MS = 4_000;
const recentQuotes = new Map<string, { at: number; answer: Promise<Awaited<ReturnType<typeof quotePair>>> }>();

function recentQuote(
  key: string,
  ask: () => Promise<Awaited<ReturnType<typeof quotePair>>>,
): Promise<Awaited<ReturnType<typeof quotePair>>> {
  const now = Date.now();
  const known = recentQuotes.get(key);
  if (known && now - known.at < QUOTE_SHARE_MS) return known.answer;
  if (recentQuotes.size > 500) {
    for (const [oldKey, entry] of recentQuotes) if (now - entry.at >= QUOTE_SHARE_MS) recentQuotes.delete(oldKey);
  }
  const answer = ask();
  recentQuotes.set(key, { at: now, answer });
  // A failed question is not remembered: the next one asks again.
  answer.catch(() => {
    if (recentQuotes.get(key)?.answer === answer) recentQuotes.delete(key);
  });
  return answer;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const serviceSlug = params.get("service");
  const countrySlug = params.get("country");

  if (!serviceSlug || !countrySlug) {
    return NextResponse.json(
      { available: false, message: "Choose a service and a country." },
      { status: 400 },
    );
  }

  // NGN-only business rule: getCurrencyConfig() only ever resolves NGN now
  // (see its own doc comment in currency-config.ts), so a client sending
  // anything else here — including "USD" — falls back to the platform
  // default instead of being trusted.
  const requestedCurrency = params.get("currency");
  const currency =
    (requestedCurrency ? await getCurrencyConfig(requestedCurrency) : null) ??
    (await getDefaultCurrency());

  const result = await recentQuote(`${serviceSlug}|${countrySlug}|${currency.code}`, () =>
    quotePair(serviceSlug, countrySlug, currency),
  );

  if (!result.ok) {
    return NextResponse.json({
      available: false,
      message: UNAVAILABLE[result.reason] ?? UNAVAILABLE.provider_error,
    });
  }

  // What each server would charge, under the names a customer knows them by
  // ("I", "II"), "I" first. A provider with no customer-facing name is not
  // offered as a choice.
  const options = result.options
    .flatMap((option) => {
      const server = serverForProvider(option.provider);
      return server ? [{ server, priceKobo: option.priceKobo }] : [];
    })
    .sort((a, b) => a.server.length - b.server.length || a.server.localeCompare(b.server));

  return NextResponse.json({
    available: true,
    priceKobo: result.quote.customerPriceKobo,
    options,
  });
}
