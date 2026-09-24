import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Crawl guidance for the whole app.
 *
 * This is one of two layers keeping private pages out of search results,
 * not the only one: it stops a well-behaved crawler from spending budget
 * on pages that can never show real content to a logged-out visitor
 * (admin, the dashboard, the auth utility pages), but a disallowed URL can
 * still be indexed bare (no snippet) if something elsewhere links to it.
 * The actual guarantee is the `robots: { index: false }` metadata on each
 * of these route groups' own layouts, which this list mirrors.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/dashboard",
        "/api/",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/two-factor",
        "/verify-email",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
