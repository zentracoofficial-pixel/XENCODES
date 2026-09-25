/**
 * The one place the production domain is configured.
 *
 * Every canonical URL, the sitemap, robots.txt's sitemap reference, Open
 * Graph/Twitter URLs, and every structured-data URL are all built from this
 * single value. Nothing else in the app should read an env var to build a
 * public-facing absolute URL: it should import SITE_URL from here instead,
 * so there is exactly one place to change when the real domain goes live.
 *
 * To connect the real domain: set NEXT_PUBLIC_SITE_URL in this deployment's
 * environment variables (e.g. "https://xencodes.com", no trailing slash).
 * Nothing else needs to change. Until it is set, this falls back to the
 * current Vercel deployment URL below, which is a real, working address but
 * not the permanent one — search engines should not be encouraged to treat
 * it as canonical, which is why NEXT_PUBLIC_SITE_URL is checked first.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://xencodes.vercel.app"
).replace(/\/$/, "");

export const SITE_NAME = "Xencodes";

export const SITE_TAGLINE = "Virtual numbers for SMS verification, worldwide";

/**
 * The Xencodes logo, as an absolute URL. Used wherever a logo needs one
 * (Organization structured data, email templates): a relative path works
 * inside the app itself, but anything read by an external system (Google,
 * an email client) needs the full address.
 */
export const SITE_LOGO_URL = `${SITE_URL}/xencodes-logo.png`;
