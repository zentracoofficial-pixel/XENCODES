export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.AUTH_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
  "https://xencodes.vercel.app"
).replace(/\/$/, "");

export const SITE_NAME = "Xencodes";

export const SITE_TAGLINE = "Virtual numbers for SMS verification in Nigeria";
