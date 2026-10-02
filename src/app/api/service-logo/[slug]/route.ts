import { resolveServiceLogo } from "@/lib/brand-logo-server";

/**
 * One service's logo as a standalone SVG, for ServiceLogo to show when the
 * small curated set bundled into the page has nothing for it. A 404 means
 * "no known logo"; ServiceLogo keeps its lettermark in that case.
 *
 * The slug and name are only lookup keys: nothing from the request is ever
 * written into the response body, which is built entirely from the icon
 * data itself.
 */

// Long-lived on purpose: the icon set only changes with a deploy, and a
// directory page asks for hundreds of these at once.
const CACHE_CONTROL = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

/** WCAG relative luminance of a #RRGGBB colour, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = new URL(request.url).searchParams.get("name") ?? slug;

  const icon =
    slug.length <= 120 && name.length <= 200 ? resolveServiceLogo(slug, name) : undefined;

  if (!icon) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain", "Cache-Control": CACHE_CONTROL, ...SECURITY_HEADERS },
    });
  }

  const viewBox = icon.viewBox ?? "0 0 24 24";
  const width = Number(viewBox.split(/\s+/)[2]) || 24;
  // A light brand colour (DHL's or Snapchat's yellow) all but disappears on
  // the site's light tiles without a faint outline.
  const outline =
    luminance(icon.hex) > 0.6
      ? ` stroke="#10231e" stroke-opacity="0.35" stroke-width="${(width / 40).toFixed(2)}"`
      : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path fill="${icon.hex}"${outline} d="${icon.path}"/></svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
      ...SECURITY_HEADERS,
    },
  });
}
