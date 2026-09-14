import { NextResponse } from "next/server";
import { getLiveQuote } from "@/lib/inventory";

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
  unavailable: "That country is out of stock for this service right now.",
  disabled: "That combination is not available for purchase.",
  provider_error: "The number provider is not responding. Try again in a moment.",
};

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

  const result = await getLiveQuote(serviceSlug, countrySlug);

  if (!result.ok) {
    return NextResponse.json({
      available: false,
      message: UNAVAILABLE[result.reason] ?? UNAVAILABLE.provider_error,
    });
  }

  return NextResponse.json({ available: true, priceKobo: result.priceKobo });
}
