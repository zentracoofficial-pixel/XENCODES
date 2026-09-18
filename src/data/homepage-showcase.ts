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
 * Every service listed below has a real, verified logo in brandIcons
 * (mostly simple-icons, CC0; four of them from Font Awesome Free, CC BY
 * 4.0, since simple-icons no longer carries those after trademark
 * takedown requests — see brand-icons.ts for which and why). The fallback
 * colour below only matters if a slug is ever added here ahead of its
 * brandIcons entry.
 */
export interface ShowcaseService {
  slug: string;
  name: string;
  color: string;
}

function showcase(slug: string, name: string): ShowcaseService {
  return {
    slug,
    name,
    color: brandIcons[slug]?.hex ?? "#63756F",
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
