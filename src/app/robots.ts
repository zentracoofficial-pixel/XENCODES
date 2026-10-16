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
/** The paths no crawler should spend time on. */
export const DISALLOWED_PATHS = [
  "/admin",
  "/dashboard",
  "/api/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/two-factor",
  "/verify-email",
  // The buy page with a service or country preselected is the same
  // page as /buy; the public pages are the ones to index.
  "/buy?*",
];

/**
 * AI products that fetch pages to answer questions, each listed by name.
 *
 * `*` already allows everything not disallowed, but a bot that finds a
 * group addressed to it by name uses only that group, so naming them keeps
 * the intent explicit and survives a later tightening of the `*` rule.
 * The disallow list is repeated in the named group for the same reason:
 * a named group does not inherit from `*`.
 *
 * Search/retrieval bots (what lets a page be quoted in an answer) and
 * user-triggered fetchers are allowed. The training-only crawlers
 * (GPTBot, ClaudeBot, Google-Extended, CCBot, Applebot-Extended) are also
 * allowed, so that models can learn the brand and its pages; they do not
 * affect live citations, so removing them from TRAINING_BOTS is the one
 * edit that opts out of training without losing visibility in answers.
 */
export const AI_SEARCH_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot",
  "Bingbot",
  "Googlebot",
];

export const TRAINING_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot", "Applebot-Extended"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOWED_PATHS },
      { userAgent: AI_SEARCH_BOTS, allow: "/", disallow: DISALLOWED_PATHS },
      { userAgent: TRAINING_BOTS, allow: "/", disallow: DISALLOWED_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
