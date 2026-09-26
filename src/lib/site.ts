/**
 * The one place the production domain is configured.
 *
 * Every canonical URL, the sitemap, robots.txt's sitemap reference, Open
 * Graph/Twitter URLs, and every structured-data URL are all built from this
 * single value. Nothing else in the app should read an env var to build a
 * public-facing absolute URL: it should import SITE_URL from here instead,
 * so there is exactly one place to change when the real domain goes live.
 *
 * NEXT_PUBLIC_SITE_URL overrides it per deployment (no trailing slash).
 * The fallback is the live production domain, so anything read outside the
 * app — above all an email's logo, links and footer — points at the real
 * site even on a deployment where the variable was never set.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.xencodes.com"
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

/**
 * The support address: shown to customers on the dashboard's "Contact
 * support" card and its mailto link, and where a customer's support
 * activity (a new ticket, a follow-up reply) gets emailed as a nudge on top
 * of the in-dashboard notification system (src/lib/notifications.ts, the
 * real system of record). Set SUPPORT_EMAIL in this deployment's
 * environment variables to change it without a code change.
 *
 * (A prior revision routed the notification nudge to a second, unlisted
 * address instead of this one, as a workaround while the Resend API key was
 * still scoped to the sandbox test domain — which can only deliver to the
 * Resend account's own email. Now that the key has full sending access on
 * the verified domain, that workaround no longer applies, and both uses
 * share this one address again.)
 */
export const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL ?? "Xencodeshq@gmail.com").trim();

/**
 * Where a sales notification (successful wallet funding, successful number
 * purchase — see src/lib/sales-notification.ts) is sent. Defaults to
 * SUPPORT_EMAIL rather than a second hardcoded address, since both name the
 * same inbox today; set SALES_NOTIFICATION_EMAIL to route sales alerts
 * somewhere else without changing where support tickets land.
 */
export const SALES_NOTIFICATION_EMAIL = (
  process.env.SALES_NOTIFICATION_EMAIL ?? SUPPORT_EMAIL
).trim();
