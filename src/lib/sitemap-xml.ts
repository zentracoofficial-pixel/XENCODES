import { SITE_URL } from "@/lib/site";
import { GUIDES } from "@/data/guides";
import { SERVICE_PAGES } from "@/data/service-pages";
import { getSeoIndex } from "@/lib/seo-catalog";

/**
 * The sitemaps, written by hand rather than through Next's sitemap file so
 * that /sitemap.xml can be a real sitemap index pointing at a few shorter
 * files (Google reads up to 50,000 URLs per file; these stay well under).
 *
 * Only pages worth indexing are listed (see seo-catalog.ts). No <lastmod>
 * except where a date is true (a guide's publish date): a lastmod that is
 * always "now" teaches search engines to ignore the field.
 */
export const PAIRS_PER_SITEMAP = 5000;

const STATIC_PAGES: Array<{ path: string; priority: number; changefreq: string }> = [
  { path: "/", priority: 1, changefreq: "daily" },
  { path: "/services", priority: 0.9, changefreq: "daily" },
  { path: "/countries", priority: 0.9, changefreq: "daily" },
  { path: "/guides", priority: 0.8, changefreq: "weekly" },
  { path: "/buy", priority: 0.8, changefreq: "daily" },
  { path: "/pricing", priority: 0.8, changefreq: "weekly" },
  { path: "/how-it-works", priority: 0.8, changefreq: "monthly" },
  { path: "/about", priority: 0.7, changefreq: "monthly" },
  { path: "/faq", priority: 0.7, changefreq: "monthly" },
  { path: "/refund-policy", priority: 0.4, changefreq: "monthly" },
  { path: "/acceptable-use", priority: 0.4, changefreq: "monthly" },
  { path: "/terms", priority: 0.3, changefreq: "monthly" },
  { path: "/privacy", priority: 0.3, changefreq: "monthly" },
];

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

interface Entry {
  path: string;
  priority: number;
  changefreq: string;
  lastmod?: string;
}

function urlset(entries: Entry[]): string {
  const rows = entries
    .map(
      (entry) =>
        `<url><loc>${escapeXml(SITE_URL + entry.path)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""}<changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows}</urlset>`;
}

/** How many service-in-country sitemap files there are right now. */
export async function pairSitemapCount(): Promise<number> {
  const { pairs } = await getSeoIndex();
  return Math.ceil(pairs.length / PAIRS_PER_SITEMAP);
}

/** The index: one entry per sitemap file. */
export async function buildSitemapIndex(): Promise<string> {
  const count = await pairSitemapCount();
  const names = ["core.xml", ...Array.from({ length: count }, (_, i) => `pairs-${i + 1}.xml`)];
  const rows = names.map((name) => `<sitemap><loc>${SITE_URL}/sitemaps/${name}</loc></sitemap>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows}</sitemapindex>`;
}

function coreEntries(index: Awaited<ReturnType<typeof getSeoIndex>>): Entry[] {
  const entries: Entry[] = [...STATIC_PAGES];
  const serviceSlugs = new Set<string>([...SERVICE_PAGES.map((page) => page.slug), ...index.services.map((service) => service.slug)]);
  for (const slug of serviceSlugs) {
    entries.push({ path: `/services/${slug}`, priority: 0.7, changefreq: "daily" });
  }
  for (const country of index.countries) {
    entries.push({ path: `/countries/${country.slug}`, priority: 0.7, changefreq: "daily" });
  }
  for (const guide of GUIDES) {
    entries.push({ path: `/guides/${guide.slug}`, priority: 0.7, changefreq: "monthly", lastmod: guide.published });
  }
  return entries;
}

/** Every absolute URL in the sitemaps, for IndexNow. */
export async function listIndexableUrls(): Promise<string[]> {
  const index = await getSeoIndex();
  const paths = [
    ...coreEntries(index).map((entry) => entry.path),
    ...index.pairs.map((pair) => `/services/${pair.service}/${pair.country}`),
  ];
  return [...new Set(paths)].map((path) => SITE_URL + path);
}

/** One sitemap file by name ("core.xml", "pairs-2.xml"), or null. */
export async function buildSitemap(name: string): Promise<string | null> {
  const index = await getSeoIndex();

  if (name === "core.xml") return urlset(coreEntries(index));

  const match = /^pairs-(\d+)\.xml$/.exec(name);
  if (match) {
    const page = Number(match[1]);
    if (!Number.isInteger(page) || page < 1) return null;
    const slice = index.pairs.slice((page - 1) * PAIRS_PER_SITEMAP, page * PAIRS_PER_SITEMAP);
    if (slice.length === 0) return null;
    return urlset(slice.map((pair) => ({ path: `/services/${pair.service}/${pair.country}`, priority: 0.5, changefreq: "daily" })));
  }
  return null;
}
