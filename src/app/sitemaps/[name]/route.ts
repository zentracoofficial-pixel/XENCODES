import { buildSitemap } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

/** One sitemap file: /sitemaps/core.xml, /sitemaps/pairs-1.xml, ... */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const xml = await buildSitemap(name).catch(() => undefined);
  if (xml === undefined) return new Response("Sitemap unavailable.", { status: 503 });
  if (xml === null) return new Response("Not found.", { status: 404 });
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
