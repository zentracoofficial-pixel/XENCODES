import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { SERVICE_PAGES } from "@/data/service-pages";

// Public, indexable pages only. Login, register, and every authenticated
// route are deliberately absent: they carry their own noindex metadata (see
// each route group's layout.tsx) and have no business being offered to
// Google as a page worth finding, per the sitemap's actual job of listing
// URLs someone might want to land on from a search.
const routes: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" },
  { path: "/services", priority: 0.9, changeFrequency: "daily" },
  ...SERVICE_PAGES.map((page) => ({
    path: `/services/${page.slug}`,
    priority: 0.7,
    changeFrequency: "daily" as const,
  })),
  { path: "/buy", priority: 0.9, changeFrequency: "daily" },
  { path: "/pricing", priority: 0.8, changeFrequency: "weekly" },
  { path: "/faq", priority: 0.7, changeFrequency: "monthly" },
  { path: "/refund-policy", priority: 0.4, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
];

// No <lastmod>: stamping every URL with "now" on each request claimed every
// page had just changed, which it had not, and a lastmod search engines learn
// is unreliable gets ignored. Better none than a false one.
export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));
}
