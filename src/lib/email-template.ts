import { SITE_NAME, SITE_TAGLINE, SITE_URL, SITE_LOGO_URL } from "@/lib/site";
import {
  blocksToText,
  escapeHtml,
  inlineToHtml,
  inlineToText,
  parseBlocks,
  safeLinkUrl,
  type InlineStyles,
} from "@/lib/email-format";

/**
 * The one design every Xencodes email renders through: a message is data
 * (a title and an ordered list of blocks), and this file is the only place
 * that turns it into markup. A new email picks blocks; it never writes HTML.
 *
 * Built for mail clients, not browsers:
 * - Table layout with inline styles for everything structural, so a client
 *   that strips <style> (Gmail on non-Google accounts, some Android apps)
 *   still gets the full design, just without dark mode and phone tweaks.
 * - A fluid 600px column (width:100% + max-width) wrapped in an Outlook-only
 *   fixed table, since Outlook for Windows ignores max-width.
 * - System font stack, forced to Arial in Outlook, which otherwise falls
 *   back to Times New Roman on an unknown first font.
 * - Dark mode through prefers-color-scheme (Apple Mail, iOS, Outlook for
 *   Mac, Outlook mobile) and Outlook.com's [data-ogsc]/[data-ogsb] hooks.
 *   Gmail's apps ignore both and invert colours themselves, so the light
 *   palette avoids anything that inverts badly: no pure black or white text
 *   over images, no text that relies on a background image, and a logo on
 *   its own opaque tile (clients never invert images).
 * - Nothing important is carried by the image alone: the brand name next to
 *   the logo is live text.
 */

// ---------------------------------------------------------------------------
// Message model
// ---------------------------------------------------------------------------

export type EmailBlock =
  /** Body copy. Blank line = new paragraph; supports the small safe subset
   *  documented in email-format.ts (bold, links, lists, subheadings). */
  | { type: "text"; text: string }
  /** The primary action. Dropped (HTML and text alike) if the URL is not
   *  an absolute http(s) URL. */
  | { type: "button"; text: string; url: string }
  /** "If the button doesn't work" with the raw URL, for a button that must
   *  work even when a client breaks it. */
  | { type: "fallbackLink"; url: string }
  /** A quiet panel for secondary information (expiry, why you got this). */
  | { type: "note"; text: string }
  /** Label/value rows, e.g. a ticket's metadata. Values are literal text. */
  | { type: "details"; rows: { label: string; value: string }[] }
  /** Someone else's words, verbatim: escaped, line breaks kept, and no
   *  formatting interpreted, since it is not ours to format. */
  | { type: "quote"; text: string }
  /** A full-width, high-contrast bar for the one fact an internal
   *  notification needs visible before anything else — a sale's amount and
   *  outcome, a job's pass/fail. Never used in a customer-facing email:
   *  a coloured status bar reads as an alert, not a welcome. */
  | { type: "statusBanner"; label: string; value: string; tone: "success" | "warning" | "danger" }
  | { type: "divider" };

export interface EmailMessage {
  subject: string;
  title: string;
  /** The line most inboxes show beside the subject. Without one, clients
   *  scrape the first words of the body, which reads as an accident. */
  previewText?: string;
  blocks: EmailBlock[];
  /** Why the recipient got this. Defaults to the customer-account line. */
  footerNote?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export type EmailColorScheme = "auto" | "light" | "dark";

// ---------------------------------------------------------------------------
// Design tokens (from src/app/globals.css, adapted for email)
// ---------------------------------------------------------------------------

const LIGHT = {
  canvas: "#eef3f1",
  card: "#ffffff",
  border: "#dce9e4",
  title: "#10231e",
  text: "#2f3e3a",
  muted: "#5b6d67",
  link: "#0b6b4c",
  brand: "#063b2d",
  button: "#063b2d",
  buttonText: "#ffffff",
  panel: "#f4f8f6",
  accent: "#0bd99a",
} as const;

const DARK = {
  canvas: "#0b1210",
  card: "#131c19",
  border: "#26332e",
  title: "#eef4f1",
  text: "#c6d2cd",
  muted: "#8fa29b",
  link: "#3ee0ab",
  brand: "#eef4f1",
  button: "#0bd99a",
  buttonText: "#04291f",
  panel: "#18231f",
  accent: "#0bd99a",
} as const;

// Status-banner tones. From src/app/globals.css's --success/--warning/
// --danger pairs, each with a light-mode-appropriate soft background/text
// and a dark-mode-appropriate one — the same pairing the admin UI's Badge
// component uses, adapted for email (no CSS variables in mail clients).
const TONES = {
  success: {
    light: { bg: "#e3f6ee", text: "#0b7a57", border: "#bfe8d7" },
    dark: { bg: "#0f2b21", text: "#3ee0ab", border: "#1d4534" },
  },
  warning: {
    light: { bg: "#fbf1de", text: "#8a5a00", border: "#f0dcb0" },
    dark: { bg: "#332508", text: "#f0b93d", border: "#4d3a13" },
  },
  danger: {
    light: { bg: "#fbeae8", text: "#a32218", border: "#f3cdc8" },
    dark: { bg: "#33130f", text: "#f2897b", border: "#4d1f18" },
  },
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const DEFAULT_FOOTER_NOTE = `You received this email because you have a ${SITE_NAME} account.`;

const SITE_HOME = `${SITE_URL}/`;
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

const INLINE: InlineStyles = {
  link: `color:${LIGHT.link};text-decoration:underline;`,
  linkClass: "xc-link",
  bold: `font-weight:700;color:${LIGHT.title};`,
};

// ---------------------------------------------------------------------------
// Components. Each returns an HTML fragment; none knows what email it is in.
// ---------------------------------------------------------------------------

function logo(): string {
  // Fixed width/height so a blocked image still holds its space, and the
  // tile's own forest background with white alt text, so a client showing
  // alt text instead of the image still draws a deliberate brand tile.
  return `<img src="${escapeHtml(SITE_LOGO_URL)}" width="36" height="36" alt="${SITE_NAME} logo" style="display:block;width:36px;height:36px;border:0;outline:none;text-decoration:none;border-radius:9px;background-color:${LIGHT.brand};font-family:${FONT};font-size:9px;line-height:12px;font-weight:700;color:#ffffff;text-align:center;">`;
}

function header(): string {
  return `<tr>
  <td class="xc-header" style="padding:0 4px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td valign="middle" style="padding:0 10px 0 0;">${logo()}</td>
        <td valign="middle" class="xc-brand" style="font-family:${FONT};font-size:19px;line-height:24px;font-weight:700;letter-spacing:-0.3px;color:${LIGHT.brand};">${SITE_NAME}</td>
      </tr>
    </table>
  </td>
</tr>`;
}

function title(text: string): string {
  return `<h1 class="xc-title" style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;letter-spacing:-0.2px;color:${LIGHT.title};">${escapeHtml(
    text,
  )}</h1>`;
}

const TEXT_STYLE = `font-family:${FONT};font-size:16px;line-height:26px;color:${LIGHT.text};word-break:break-word;overflow-wrap:break-word;`;

function bodyText(text: string): string {
  return parseBlocks(text)
    .map((block) => {
      if (block.kind === "heading") {
        return `<h2 class="xc-title" style="margin:24px 0 8px;font-family:${FONT};font-size:17px;line-height:24px;font-weight:700;color:${LIGHT.title};">${inlineToHtml(
          block.text,
          INLINE,
        )}</h2>`;
      }
      if (block.kind === "list") {
        const tag = block.ordered ? "ol" : "ul";
        const items = block.items
          .map(
            (item) =>
              `<li class="xc-text" style="margin:0 0 6px;${TEXT_STYLE}">${inlineToHtml(item, INLINE)}</li>`,
          )
          .join("");
        return `<${tag} style="margin:0 0 16px;padding:0 0 0 24px;">${items}</${tag}>`;
      }
      return `<p class="xc-text" style="margin:0 0 16px;${TEXT_STYLE}">${block.lines
        .map((line) => inlineToHtml(line, INLINE))
        .join("<br>")}</p>`;
    })
    .join("\n");
}

/**
 * The "bulletproof" button: a VML roundrect for Outlook on Windows (which
 * ignores padding and border-radius on links), and a padded, rounded link
 * for everything else. The whole shape is the tap target, not just the
 * words, and it goes full width on phones.
 */
function button(text: string, url: string): string {
  const href = escapeHtml(url);
  const label = escapeHtml(text);
  const vmlWidth = Math.max(200, Math.min(520, Math.round(text.length * 9.5 + 64)));
  return `<table role="presentation" class="xc-btn-table" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
  <tr>
    <td align="center" class="xc-btn" bgcolor="${LIGHT.button}" style="border-radius:10px;background-color:${LIGHT.button};">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="21%" stroke="f" fillcolor="${LIGHT.button}">
        <w:anchorlock/>
        <center style="color:${LIGHT.buttonText};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${href}" target="_blank" class="xc-btn-a" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:700;color:${LIGHT.buttonText};text-decoration:none;border-radius:10px;background-color:${LIGHT.button};">${label}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

function fallbackLink(url: string): string {
  const href = escapeHtml(url);
  return `<p class="xc-muted" style="margin:20px 0 4px;font-family:${FONT};font-size:14px;line-height:22px;color:${LIGHT.muted};">If the button doesn't work, copy and paste this link into your browser:</p>
<p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:20px;word-break:break-all;overflow-wrap:anywhere;"><a href="${href}" class="xc-link" style="color:${LIGHT.link};text-decoration:underline;word-break:break-all;">${href}</a></p>`;
}

function panel(inner: string, extraStyle = "", extraClass = ""): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="xc-panel${extraClass ? ` ${extraClass}` : ""}" style="width:100%;margin:24px 0 8px;background-color:${LIGHT.panel};border:1px solid ${LIGHT.border};border-radius:10px;border-collapse:separate;${extraStyle}">
  <tr>
    <td style="padding:14px 18px;">${inner}</td>
  </tr>
</table>`;
}

function note(text: string): string {
  return panel(
    `<p class="xc-muted" style="margin:0;font-family:${FONT};font-size:14px;line-height:22px;color:${LIGHT.muted};">${inlineToHtml(
      text,
      INLINE,
    )}</p>`,
  );
}

function details(rows: { label: string; value: string }[]): string {
  const body = rows
    .map(
      (row) => `<tr>
      <td valign="top" class="xc-muted" style="padding:4px 12px 4px 0;width:34%;font-family:${FONT};font-size:14px;line-height:22px;color:${LIGHT.muted};">${escapeHtml(
        row.label,
      )}</td>
      <td valign="top" class="xc-text" style="padding:4px 0;font-family:${FONT};font-size:14px;line-height:22px;color:${LIGHT.text};word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(
        row.value,
      )}</td>
    </tr>`,
    )
    .join("");
  return panel(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${body}</table>`,
  );
}

function quote(text: string): string {
  const lines = escapeHtml(text.replace(/\r\n?/g, "\n").trim()).replace(/\n/g, "<br>");
  return panel(
    `<p class="xc-text" style="margin:0;${TEXT_STYLE}font-size:15px;line-height:24px;">${lines}</p>`,
    `border-left:3px solid ${LIGHT.accent};`,
    "xc-quote",
  );
}

function statusBanner(label: string, value: string, tone: "success" | "warning" | "danger"): string {
  const t = TONES[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="xc-banner xc-banner-${tone}" style="width:100%;margin:0 0 20px;background-color:${t.light.bg};border:1px solid ${t.light.border};border-radius:10px;border-collapse:separate;">
  <tr>
    <td style="padding:16px 20px;">
      <p class="xc-banner-label" style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${t.light.text};">${escapeHtml(
        label,
      )}</p>
      <p class="xc-banner-value" style="margin:0;font-family:${FONT};font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.3px;color:${t.light.text};">${escapeHtml(
        value,
      )}</p>
    </td>
  </tr>
</table>`;
}

function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:28px 0;">
  <tr><td class="xc-divider" style="border-top:1px solid ${LIGHT.border};font-size:1px;line-height:1px;height:1px;">&nbsp;</td></tr>
</table>`;
}

function footer(noteText: string): string {
  return `<tr>
  <td class="xc-footer" align="center" style="padding:28px 16px 0;text-align:center;font-family:${FONT};">
    <p class="xc-brand" style="margin:0 0 2px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;color:${LIGHT.brand};">${SITE_NAME}</p>
    <p class="xc-muted" style="margin:0 0 10px;font-family:${FONT};font-size:13px;line-height:20px;color:${LIGHT.muted};">${escapeHtml(
      SITE_TAGLINE,
    )}</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:13px;line-height:20px;"><a href="${escapeHtml(
      SITE_HOME,
    )}" target="_blank" class="xc-link" style="color:${LIGHT.link};font-weight:600;text-decoration:underline;">${escapeHtml(
      SITE_HOST,
    )}</a></p>
    <p class="xc-muted" style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${LIGHT.muted};">${escapeHtml(
      noteText,
    )}</p>
  </td>
</tr>`;
}

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case "text":
      return bodyText(block.text);
    case "button": {
      const url = safeLinkUrl(block.url);
      return url && block.text.trim() ? button(block.text.trim(), url) : "";
    }
    case "fallbackLink": {
      const url = safeLinkUrl(block.url);
      return url ? fallbackLink(url) : "";
    }
    case "note":
      return note(block.text);
    case "details":
      return block.rows.length ? details(block.rows) : "";
    case "quote":
      return block.text.trim() ? quote(block.text) : "";
    case "statusBanner":
      return statusBanner(block.label, block.value, block.tone);
    case "divider":
      return divider();
  }
}

// ---------------------------------------------------------------------------
// Stylesheet: progressive enhancement only. Everything above is complete
// without it.
// ---------------------------------------------------------------------------

function darkRules(prefix = ""): string {
  const p = prefix ? `${prefix} ` : "";
  return `
${p}.xc-canvas { background-color:${DARK.canvas} !important; }
${p}.xc-card { background-color:${DARK.card} !important; border-color:${DARK.border} !important; }
${p}.xc-title { color:${DARK.title} !important; }
${p}.xc-text { color:${DARK.text} !important; }
${p}.xc-text strong { color:${DARK.title} !important; }
${p}.xc-muted { color:${DARK.muted} !important; }
${p}.xc-link { color:${DARK.link} !important; }
${p}.xc-brand { color:${DARK.brand} !important; }
${p}.xc-btn { background-color:${DARK.button} !important; }
${p}.xc-btn-a { background-color:${DARK.button} !important; color:${DARK.buttonText} !important; }
${p}.xc-panel { background-color:${DARK.panel} !important; border-color:${DARK.border} !important; }
${p}.xc-quote { border-left-color:${DARK.accent} !important; }
${p}.xc-divider { border-top-color:${DARK.border} !important; }
${p}.xc-preheader { color:${DARK.canvas} !important; }
${p}.xc-banner-success { background-color:${TONES.success.dark.bg} !important; border-color:${TONES.success.dark.border} !important; }
${p}.xc-banner-success .xc-banner-label, ${p}.xc-banner-success .xc-banner-value { color:${TONES.success.dark.text} !important; }
${p}.xc-banner-warning { background-color:${TONES.warning.dark.bg} !important; border-color:${TONES.warning.dark.border} !important; }
${p}.xc-banner-warning .xc-banner-label, ${p}.xc-banner-warning .xc-banner-value { color:${TONES.warning.dark.text} !important; }
${p}.xc-banner-danger { background-color:${TONES.danger.dark.bg} !important; border-color:${TONES.danger.dark.border} !important; }
${p}.xc-banner-danger .xc-banner-label, ${p}.xc-banner-danger .xc-banner-value { color:${TONES.danger.dark.text} !important; }`;
}

function stylesheet(scheme: EmailColorScheme): string {
  const dark =
    scheme === "dark"
      ? darkRules()
      : scheme === "auto"
        ? `
@media (prefers-color-scheme: dark) {${darkRules()}
}
/* Outlook.com / Outlook web dark mode */${darkRules("[data-ogsc]")}${darkRules("[data-ogsb]")}`
        : "";

  return `<style>
:root { color-scheme:${scheme === "auto" ? "light dark" : scheme}; supported-color-schemes:${scheme === "auto" ? "light dark" : scheme}; }
body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
table, td { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; font-size:inherit !important; font-family:inherit !important; font-weight:inherit !important; line-height:inherit !important; }
@media only screen and (max-width:620px) {
  .xc-outer { padding:24px 12px !important; }
  .xc-card-pad { padding:28px 22px !important; }
  .xc-title { font-size:21px !important; line-height:28px !important; }
  .xc-btn-table { width:100% !important; }
  .xc-btn-a { display:block !important; text-align:center !important; }
}${dark}
</style>`;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function renderEmailHtml(
  message: EmailMessage,
  options: { colorScheme?: EmailColorScheme } = {},
): string {
  const scheme = options.colorScheme ?? "auto";
  const metaScheme = scheme === "auto" ? "light dark" : scheme;
  const content = message.blocks.map(renderBlock).filter(Boolean).join("\n");

  // Hidden in the rendered message. The trailing zero-width entities stop a
  // client padding the inbox snippet with the first words of the body.
  const preheader = message.previewText
    ? `<div class="xc-preheader" style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${LIGHT.canvas};opacity:0;">${escapeHtml(
        message.previewText,
      )}${"&#8199;&#65279;&#847; ".repeat(40)}</div>`
    : "";

  return `<!doctype html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="${metaScheme}">
<meta name="supported-color-schemes" content="${metaScheme}">
<title>${escapeHtml(message.title)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table, td, div, h1, h2, p, a, li, span { font-family: Arial, Helvetica, sans-serif !important; }</style>
<![endif]-->
${stylesheet(scheme)}
</head>
<body class="xc-canvas" style="margin:0;padding:0;width:100%;background-color:${LIGHT.canvas};">
<div role="article" aria-roledescription="email" aria-label="${escapeHtml(message.title)}" lang="en" dir="ltr" class="xc-canvas" style="background-color:${LIGHT.canvas};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="xc-canvas" bgcolor="${LIGHT.canvas}" style="width:100%;background-color:${LIGHT.canvas};">
  <tr>
    <td align="center" class="xc-outer" style="padding:40px 16px;">
      <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        ${header()}
        <tr>
          <td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="xc-card" bgcolor="${LIGHT.card}" style="width:100%;background-color:${LIGHT.card};border:1px solid ${LIGHT.border};border-radius:12px;border-collapse:separate;">
              <tr>
                <td class="xc-card-pad" style="padding:36px 40px 32px;">
                  ${title(message.title)}
                  ${content}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${footer(message.footerNote ?? DEFAULT_FOOTER_NOTE)}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</div>
</body>
</html>`;
}

function blockToText(block: EmailBlock): string {
  switch (block.type) {
    case "text":
      return blocksToText(parseBlocks(block.text));
    case "button": {
      const url = safeLinkUrl(block.url);
      return url && block.text.trim() ? `${block.text.trim()}: ${url}` : "";
    }
    case "fallbackLink":
      // The button line already carries the URL in plain text.
      return "";
    case "note":
      return inlineToText(block.text);
    case "details":
      return block.rows.map((row) => `${row.label}: ${row.value}`).join("\n");
    case "quote":
      return block.text.replace(/\r\n?/g, "\n").trim();
    case "statusBanner":
      return `${block.label.toUpperCase()}: ${block.value}`;
    case "divider":
      return "----";
  }
}

export function renderEmailText(message: EmailMessage): string {
  const parts = [message.title, ...message.blocks.map(blockToText)].filter((part) => part.trim());
  parts.push(
    "----",
    `${SITE_NAME} · ${SITE_TAGLINE}`,
    SITE_HOME,
    message.footerNote ?? DEFAULT_FOOTER_NOTE,
  );
  return parts.join("\n\n");
}

export function renderEmail(message: EmailMessage): RenderedEmail {
  return {
    subject: message.subject,
    html: renderEmailHtml(message),
    text: renderEmailText(message),
  };
}
