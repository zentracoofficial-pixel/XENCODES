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
    ];
  },
};

export default nextConfig;
