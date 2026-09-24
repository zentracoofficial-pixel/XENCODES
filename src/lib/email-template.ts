import { SITE_NAME, SITE_URL, SITE_LOGO_URL } from "@/lib/site";

/**
 * The one HTML shell every admin campaign email renders through, so a
 * customer's inbox and the Xencodes site read as the same product.
 *
 * Table-based layout with inline styles, deliberately: email clients (most
 * of all Outlook, which renders through Word) do not reliably support
 * modern CSS, and a template that looks right in the preview but breaks in
 * Gmail or Outlook is worse than a plain one that renders everywhere. No
 * web fonts, no gradients, no animation, no background images — the same
 * restraint the rest of the product's design keeps.
 *
 * The logo is referenced by absolute URL rather than inlined, because the
 * site's own mark is an SVG React component using a CSS custom property,
 * and mail clients render neither. scripts/generate-email-logo.mts
 * rasterises that same mark to public/xencodes-logo.png for this. Images
 * are blocked by default in several clients, so nothing that matters is
 * carried by the image alone: the wordmark beside it is live text.
 */

export interface CampaignEmailInput {
  title: string;
  /** Plain paragraphs: a blank line starts a new one. Not a rich text
   *  editor's output, so no markup is interpreted inside it. */
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  /** The line most inboxes show next to the subject. Rendered as a hidden
   *  preheader; without one, clients fall back to scraping the first words
   *  of the body, which reads as an accident. */
  previewText?: string;
}

// From src/app/globals.css, so the inbox matches the site exactly.
const FOREST = "#063b2d";
const FOREST_DARK = "#04291f";
const MINT_SOFT = "#eaf8f3";
const INK = "#111827";
const BODY_INK = "#374151";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const CANVAS = "#f4f5f4";

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const LOGO_URL = SITE_LOGO_URL;

/** For text nodes. Does not cover attribute values: see escapeAttribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * For anything landing inside a quoted attribute. escapeHtml alone leaves
 * quotes intact, so a value containing one could close the attribute early
 * and inject further markup into the message.
 */
function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Only absolute http(s) links become a button. A `javascript:` or `data:`
 * URL in a mail client is at best dropped and at worst an attack on the
 * reader, and neither is something to pass through because an admin typed
 * it into a form.
 */
function safeLinkUrl(value: string | undefined): string | null {
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

function paragraphsToHtml(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BODY_INK};">${escapeHtml(
          block,
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

export function buildCampaignEmailHtml(input: CampaignEmailInput): string {
  const ctaUrl = safeLinkUrl(input.ctaUrl);
  const host = SITE_URL.replace(/^https?:\/\//, "");

  const cta =
    ctaUrl && input.ctaText
      ? `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px;">
                  <tr>
                    <td align="center" bgcolor="${FOREST}" style="border-radius:10px;">
                      <a href="${escapeAttribute(ctaUrl)}" style="display:inline-block;padding:13px 28px;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(
                        input.ctaText,
                      )}</a>
                    </td>
                  </tr>
                </table>`
      : "";

  // Sits before any visible content and is hidden in the rendered message.
  // The trailing entities stop a client padding the snippet with the first
  // words of the body after the preheader ends.
  const preheader = input.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${CANVAS};opacity:0;">${escapeHtml(
        input.previewText,
      )}${"&#8199;&#65279;&#847; ".repeat(30)}</div>`
    : "";

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(input.title)}</title>
    <!--[if mso]>
    <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
    <![endif]-->
    <style>
      /* Phone widths only. Everything structural is inline above, so a
         client that ignores this block still renders the message correctly. */
      @media only screen and (max-width:600px) {
        .xc-shell { width:100% !important; border-radius:0 !important; }
        .xc-pad { padding-left:24px !important; padding-right:24px !important; }
        .xc-title { font-size:21px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;width:100%;background:${CANVAS};-webkit-font-smoothing:antialiased;">
    ${preheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
      <tr>
        <td align="center" style="padding:32px 16px;">

          <table role="presentation" class="xc-shell" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">

            <!-- Header -->
            <tr>
              <td class="xc-pad" style="padding:24px 32px;border-bottom:1px solid ${BORDER};">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-right:10px;line-height:0;" valign="middle">
                      <img src="${LOGO_URL}" width="34" height="34" alt="" style="display:block;width:34px;height:34px;border:0;outline:none;text-decoration:none;">
                    </td>
                    <td valign="middle" style="font-family:${FONT_STACK};font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${FOREST};">${SITE_NAME}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td class="xc-pad" style="padding:32px 32px 28px;font-family:${FONT_STACK};">
                <h1 class="xc-title" style="margin:0 0 18px;font-size:23px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;color:${INK};">${escapeHtml(
                  input.title,
                )}</h1>
                ${paragraphsToHtml(input.body)}
                ${cta}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td class="xc-pad" style="padding:22px 32px 26px;background:${MINT_SOFT};border-top:1px solid ${BORDER};font-family:${FONT_STACK};">
                <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${FOREST_DARK};">
                  <a href="${SITE_URL}" style="color:${FOREST_DARK};text-decoration:none;font-weight:600;">${escapeHtml(
                    host,
                  )}</a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
                  You received this email because you have a ${SITE_NAME} account.
                </p>
              </td>
            </tr>

          </table>

          <p style="margin:16px 0 0;font-family:${FONT_STACK};font-size:11px;line-height:1.5;color:${MUTED};">
            &copy; ${new Date().getFullYear()} ${SITE_NAME}
          </p>

        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildCampaignEmailText(input: CampaignEmailInput): string {
  const lines = [input.title, "", input.body];
  const ctaUrl = safeLinkUrl(input.ctaUrl);
  if (ctaUrl && input.ctaText) {
    lines.push("", `${input.ctaText}: ${ctaUrl}`);
  }
  lines.push("", `— ${SITE_NAME}`, SITE_URL);
  return lines.join("\n");
}
