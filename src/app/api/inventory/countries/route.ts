import { NextResponse } from "next/server";
import { getServiceCountries } from "@/lib/inventory";

/**
 * The countries one service can actually be bought in, priced for
 * display. Only pairs the provider currently quotes come back, so the
 * picker cannot offer a country that would fail at purchase.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const serviceSlug = new URL(request.url).searchParams.get("service");
  if (!serviceSlug) {
    return NextResponse.json({ countries: [] }, { status: 400 });
  }

  try {
    return NextResponse.json({ countries: await getServiceCountries(serviceSlug) });
  } catch (error) {
    console.error(`[api] country lookup failed for "${serviceSlug}":`, error);
    return NextResponse.json(
      { countries: [], error: "Availability is unavailable right now." },
      { status: 503 },
    );
  }
}
