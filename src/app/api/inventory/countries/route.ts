import { NextResponse } from "next/server";
import { getServiceCountries } from "@/lib/inventory";
import { getCurrencyConfig, getDefaultCurrency } from "@/lib/currency-config";

/**
 * The countries one service can actually be bought in, priced for
 * display. Only pairs the provider currently quotes come back, so the
 * picker cannot offer a country that would fail at purchase.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const serviceSlug = params.get("service");
  if (!serviceSlug) {
    return NextResponse.json({ countries: [] }, { status: 400 });
  }

  // The requested currency must be one of the two Xencodes actually sells
  // in (NGN or USD); a client sending anything else (a stale value, a
  // tampered request) falls back to the platform default rather than
  // pricing in a currency that does not exist here.
  const requestedCurrency = params.get("currency");
  const currency =
    (requestedCurrency ? await getCurrencyConfig(requestedCurrency) : null) ??
    (await getDefaultCurrency());

  try {
    return NextResponse.json({
      countries: await getServiceCountries(serviceSlug, currency),
    });
  } catch (error) {
    console.error(`[api] country lookup failed for "${serviceSlug}":`, error);
    return NextResponse.json(
      { countries: [], error: "Availability is unavailable right now." },
      { status: 503 },
    );
  }
}
