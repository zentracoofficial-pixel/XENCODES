import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing behind auth should be crawled or indexed.
      disallow: ["/dashboard", "/api/", "/verify-email", "/reset-password", "/two-factor"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
