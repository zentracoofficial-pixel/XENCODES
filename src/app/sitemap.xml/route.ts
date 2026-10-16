import { buildSitemapIndex } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

/** The sitemap index: the one address to give Search Console. */
export async function GET() {
  const xml = await buildSitemapIndex().catch(() => null);
  if (!xml) return new Response("Sitemap unavailable.", { status: 503 });
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
