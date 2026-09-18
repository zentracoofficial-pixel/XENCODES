import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * The one HTML shell every admin campaign email renders through, so a
 * customer's inbox and the Xencodes site read as the same product.
 *
 * Table-based layout with inline styles, deliberately: email clients (most
 * of all Outlook) do not reliably support modern CSS, and a template that
 * looks right in the preview but breaks in Gmail or Outlook is worse than a
 * plain one that renders everywhere. No web fonts, no gradients, no
 * animation — the same restraint the rest of the product's design keeps.
 */

export interface CampaignEmailInput {
  title: string;
  /** Plain paragraphs: a blank line starts a new one. Not a rich text
   *  editor's output, so no markup is interpreted inside it. */
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}

const FOREST = "#0F3D2E";
const MINT = "#22C55E";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function paragraphsToHtml(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1F2937;">${escapeHtml(
          block,
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

export function buildCampaignEmailHtml(input: CampaignEmailInput): string {
  const cta =
    input.ctaText && input.ctaUrl
      ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr>
          <td style="border-radius:10px;background:${FOREST};">
            <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
              ${escapeHtml(input.ctaText)}
            </a>
          </td>
        </tr>
      </table>`
      : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F4F5F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F4;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid ${BORDER};overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 20px;border-bottom:1px solid ${BORDER};">
                <span style="font-size:18px;font-weight:700;color:${FOREST};">${SITE_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:#111827;">${escapeHtml(input.title)}</h1>
                ${paragraphsToHtml(input.body)}
                ${cta}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px;border-top:1px solid ${BORDER};">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
                  You're receiving this because you have an account with ${SITE_NAME}.
                  <br>
                  <a href="${SITE_URL}" style="color:${MINT};text-decoration:none;">${SITE_URL.replace(/^https?:\/\//, "")}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildCampaignEmailText(input: CampaignEmailInput): string {
  const lines = [input.title, "", input.body];
  if (input.ctaText && input.ctaUrl) {
    lines.push("", `${input.ctaText}: ${input.ctaUrl}`);
  }
  lines.push("", `— ${SITE_NAME}`, SITE_URL);
  return lines.join("\n");
}
