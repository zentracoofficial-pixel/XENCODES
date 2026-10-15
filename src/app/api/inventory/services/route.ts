import { NextResponse } from "next/server";
import { searchServices } from "@/lib/inventory";

/**
 * Service search for the buy page combobox.
 *
 * Public on purpose: which services exist is exactly what the marketing
 * pages already show, and nothing here touches an account or reveals a
 * provider cost. The provider's credentials never leave the server,
 * because the browser talks to this route and this route talks to the
 * provider.
 */
export const dynamic = "force-dynamic";

/** The whole public directory, as the /services page lists it. */
const DIRECTORY_LIMIT = 5000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";

  try {
    // ?format=names: every listed service name, one per line. The same list
    // the public /services directory shows, in a form that can be checked
    // against what may be sold.
    if (params.get("format") === "names") {
      const services = await searchServices("", DIRECTORY_LIMIT);
      return new NextResponse(services.map((service) => service.name.trim()).join("\n"), {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return NextResponse.json({ services: await searchServices(query) });
  } catch (error) {
    console.error("[api] service search failed:", error);
    return NextResponse.json(
      { services: [], error: "Service list is unavailable right now." },
      { status: 503 },
    );
  }
}
