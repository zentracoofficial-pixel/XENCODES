import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Google indexed pages under the auto-generated xencodes.vercel.app
  // domain before the real domain went live, and a <link rel="canonical">
  // alone (see src/lib/site.ts) only nudges search engines to consolidate
  // eventually. A permanent redirect is the definitive signal: it tells
  // Google the vercel.app URL has moved for good, which gets it dropped
  // from search results in favor of the real domain much sooner. Vercel
  // keeps this domain live alongside any custom domain by default, so
  // without this it would otherwise keep serving the site right alongside
  // xencodes.com indefinitely.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "xencodes.vercel.app" }],
        destination: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.xencodes.com"}/:path*`,
        permanent: true,
      },
      // Public pages removed in the 12 September 2026 rebuild that have a
      // genuine replacement today. Only those: a removed page with no
      // equivalent (the blog, the status page, the country pages, the
      // developer/API pages) is left to answer 404, which is the truthful
      // answer, rather than being pointed at a page that is not about it.
      // The old per-service pages are handled in services/[slug]/page.tsx,
      // since whether a service still exists depends on the live catalog.
      { source: "/support", destination: "/dashboard/support", permanent: true },
      { source: "/contact", destination: "/about#contact", permanent: true },
      { source: "/acceptable-use", destination: "/terms", permanent: true },
      { source: "/numbers", destination: "/services", permanent: true },
    ];
  },
};

export default nextConfig;
