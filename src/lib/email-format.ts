/**
 * Turns the plain text an admin types (or a template writes) into email
 * HTML and a matching plain-text rendering.
 *
 * Only a deliberately small set of formatting is recognised, because the
 * failure this exists to prevent is a customer seeing literal `**` and
 * `[...](...)` characters in an email:
 *
 *   blank line           new paragraph
 *   single line break    line break within a paragraph
 *   # Heading            a subheading (one level, however many #s)
 *   - item / * item      bulleted list
 *   1. item              numbered list
 *   **text**             bold
 *   [text](https://...)  link (http/https only)
 *   https://...          bare link
 *
 * Everything else is literal text, HTML-escaped. There is no way to inject
 * markup: input is tokenised on the raw string and every piece of text is
 * escaped individually before any tag is emitted, so no escaped entity is
 * ever re-parsed.
 */

export type FormattedBlock =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only absolute http(s) URLs are ever linked. A `javascript:` or `data:`
 *  URL in a mail client is at best dropped and at worst an attack on the
 *  reader. */
export function safeLinkUrl(value: string | undefined | null): string | null {
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

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function parseBlocks(input: string): FormattedBlock[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const blocks: FormattedBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: "list", ...list });
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading && heading[1].trim()) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", text: heading[1].trim() });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if ((bullet || numbered) && (bullet ?? numbered)![1].trim()) {
      const ordered = Boolean(numbered);
      flushParagraph();
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1].trim());
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}

// [text](url) | **bold** | bare URL. A bare URL stops before trailing
// punctuation so "visit https://x.com." links "https://x.com".
const INLINE =
  /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+?)\*\*|(https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]])/g;

type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "link"; text: string; url: string };

function tokenizeInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  INLINE.lastIndex = 0;
  for (let match = INLINE.exec(input); match; match = INLINE.exec(input)) {
    if (match.index > last) tokens.push({ kind: "text", value: input.slice(last, match.index) });
    const [whole, linkText, linkUrl, bold, bareUrl] = match;
    if (linkText !== undefined) {
      const url = safeLinkUrl(linkUrl);
      // An unsafe or malformed target stays exactly as typed, as text.
      tokens.push(url ? { kind: "link", text: linkText, url } : { kind: "text", value: whole });
    } else if (bold !== undefined) {
      tokens.push({ kind: "bold", value: bold });
    } else {
      const url = safeLinkUrl(bareUrl);
      tokens.push(url ? { kind: "link", text: bareUrl, url } : { kind: "text", value: whole });
    }
    last = match.index + whole.length;
  }
  if (last < input.length) tokens.push({ kind: "text", value: input.slice(last) });
  return tokens;
}

export interface InlineStyles {
  link: string;
  linkClass: string;
  bold: string;
}

export function inlineToHtml(input: string, styles: InlineStyles): string {
  return tokenizeInline(input)
    .map((token) => {
      if (token.kind === "text") return escapeHtml(token.value);
      if (token.kind === "bold") return `<strong style="${styles.bold}">${escapeHtml(token.value)}</strong>`;
      return `<a href="${escapeHtml(token.url)}" class="${styles.linkClass}" style="${styles.link}">${escapeHtml(
        token.text,
      )}</a>`;
    })
    .join("");
}

export function inlineToText(input: string): string {
  return tokenizeInline(input)
    .map((token) => {
      if (token.kind === "text") return token.value;
      if (token.kind === "bold") return token.value;
      return token.text === token.url || token.text === token.url.replace(/\/$/, "")
        ? token.url
        : `${token.text} (${token.url})`;
    })
    .join("");
}

/** The plain-text twin of a formatted body: same structure, no markup. */
export function blocksToText(blocks: FormattedBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === "heading") return inlineToText(block.text);
      if (block.kind === "paragraph") return block.lines.map(inlineToText).join("\n");
      return block.items
        .map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${inlineToText(item)}`)
        .join("\n");
    })
    .join("\n\n");
}
