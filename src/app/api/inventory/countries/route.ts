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

  // NGN-only business rule: getCurrencyConfig() only ever resolves NGN now
  // (see its own doc comment in currency-config.ts), so a client sending
  // anything else here — including "USD" — falls back to the platform
  // default instead of being trusted.
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
