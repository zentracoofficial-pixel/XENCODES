/**
 * The ISO 3166-1 alpha-2 code behind a flag emoji, or null when the text is
 * not a flag (the generic globe, an empty string). A flag emoji is two
 * regional indicator symbols, so the letters are recovered by subtraction.
 */
export function flagIso2(flag: string | null | undefined): string | null {
  if (!flag) return null;
  const points = [...flag].map((char) => char.codePointAt(0) ?? 0);
  if (points.length !== 2 || points.some((point) => point < 0x1f1e6 || point > 0x1f1ff)) return null;
  return points.map((point) => String.fromCharCode(point - 0x1f1e6 + 97)).join("");
}
