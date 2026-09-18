import { brandIcons } from "./brand-icons";

/**
 * The homepage's "kinds of services people use Xencodes for" showcase.
 *
 * This is a fixed, curated list of widely recognised brands, not a view
 * onto GrizzlySMS's catalog. It exists purely to make the homepage feel
 * complete on first load, including when the provider is unreachable, so
 * it never awaits a provider call and never filters by what is currently
 * in stock. Nothing here implies a brand is actually purchasable: what a
 * customer can buy always comes from the live synchronised inventory
 * (src/lib/inventory.ts), never from this file. Real availability is
 * what the search box, /services and /buy show, and only those surfaces
 * are allowed to say "available", "supported", a price, or "get number".
 *
 * Rows are deliberately different sets, not one list split in half, so
 * the two scrolling rows do not visibly repeat each other.
 */

/**
 * Real, verified logos come from brandIcons, itself vendored from
 * simple-icons (CC0). Amazon, Microsoft, LinkedIn and Yahoo are not in
 * that set: all four have been removed from simple-icons after brand
 * takedown requests, so there is no verified glyph to vendor. Reproducing
 * one from memory risks shipping a subtly wrong trademarked mark, which
 * is worse than not having one, so these four instead render with the
 * same deliberate initials-on-a-tint fallback ServiceLogo already uses
 * for the hundreds of provider services with no vendored icon, tinted
 * with the brand's own well-published colour rather than a guessed shape.
 */
const UNVENDORED_BRAND_COLOR: Record<string, string> = {
  amazon: "#FF9900",
  microsoft: "#0078D4",
  linkedin: "#0A66C2",
  yahoo: "#6001D2",
};

export interface ShowcaseService {
  slug: string;
  name: string;
  color: string;
}

function showcase(slug: string, name: string): ShowcaseService {
  return {
    slug,
    name,
    color: brandIcons[slug]?.hex ?? UNVENDORED_BRAND_COLOR[slug] ?? "#63756F",
  };
}

export const HOMEPAGE_SHOWCASE_ROWS: readonly ShowcaseService[][] = [
  [
    showcase("facebook", "Facebook"),
    showcase("instagram", "Instagram"),
    showcase("whatsapp", "WhatsApp"),
    showcase("telegram", "Telegram"),
    showcase("tiktok", "TikTok"),
    showcase("google", "Google"),
    showcase("x", "X"),
    showcase("discord", "Discord"),
    showcase("snapchat", "Snapchat"),
    showcase("fiverr", "Fiverr"),
  ],
  [
    showcase("amazon", "Amazon"),
    showcase("microsoft", "Microsoft"),
    showcase("uber", "Uber"),
    showcase("airbnb", "Airbnb"),
    showcase("signal", "Signal"),
    showcase("reddit", "Reddit"),
    showcase("linkedin", "LinkedIn"),
    showcase("paypal", "PayPal"),
    showcase("viber", "Viber"),
    showcase("yahoo", "Yahoo"),
  ],
];
