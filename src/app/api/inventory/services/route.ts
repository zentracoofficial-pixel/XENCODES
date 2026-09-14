import { NextResponse } from "next/server";
import { searchServices } from "@/lib/inventory";

/**
 * Service search for the buy page combobox.
 *
 * Public on purpose: which services exist is exactly what the marketing
 * pages already show, and nothing here touches an account or reveals a
 * provider cost. The SMSPool key never leaves the server, because the
 * browser talks to this route and this route talks to SMSPool.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";

  try {
    return NextResponse.json({ services: await searchServices(query) });
  } catch (error) {
    console.error("[api] service search failed:", error);
    return NextResponse.json(
      { services: [], error: "Service list is unavailable right now." },
      { status: 503 },
    );
  }
}
