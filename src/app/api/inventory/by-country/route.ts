import { NextResponse } from "next/server";
import { getCountryCatalog, getCountryServices } from "@/lib/inventory";
import { getCurrencyConfig, getDefaultCurrency } from "@/lib/currency-config";

/**
 * Browsing by country first. Without `country`: every country with
 * something on sale. With it: that country's services, each at its lowest
 * current price. Both come from the synced catalog, never a live supplier
 * call; the price charged is quoted live once a service is picked.
 * Customer-facing: names no supplier, returns no cost.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const countrySlug = params.get("country");
  // Same rule as the other inventory routes: an unknown currency is never
  // trusted and falls back to the platform default.
  const requestedCurrency = params.get("currency");
  const currency =
    (requestedCurrency ? await getCurrencyConfig(requestedCurrency) : null) ?? (await getDefaultCurrency());

  try {
    if (!countrySlug) {
      return NextResponse.json(
        { countries: await getCountryCatalog() },
        { headers: { "Cache-Control": "private, max-age=60" } },
      );
    }
    const result = await getCountryServices(countrySlug, currency);
    if (!result) return NextResponse.json({ country: null, services: [] }, { status: 404 });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    console.error(`[api] country catalog failed for "${countrySlug ?? "all"}":`, error);
    return NextResponse.json(
      { countries: [], services: [], error: "Prices could not be loaded right now. Please try again." },
      { status: 503 },
    );
  }
}
