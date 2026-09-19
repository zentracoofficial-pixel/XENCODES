import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Renders the Xencodes mark to a PNG for use in email.
 *
 * The mark itself lives as an inline SVG React component
 * (src/components/layout/wordmark.tsx). Email clients cannot use that: most
 * of them do not render SVG at all, and the component's mint stroke is a CSS
 * custom property, which no mail client resolves. So the same geometry is
 * rasterised here, once, into a file the email can reference by absolute URL.
 *
 * This is the same mark, not a redrawn approximation: the two strokes below
 * are the exact path endpoints and stroke width from XenMark's 24x24
 * viewBox, scaled up, painted in the same order (forest first, mint over it)
 * and in the project's real brand colours from globals.css.
 *
 * Run with: npx tsx scripts/generate-email-logo.mts
 */

// From src/app/globals.css.
const FOREST: RGB = [0x06, 0x3b, 0x2d];
const MINT: RGB = [0x0b, 0xd9, 0x9a];
const WHITE: RGB = [0xff, 0xff, 0xff];

// XenMark's viewBox is 24 units; 10x gives a 240px source rendered around
// 40px in the email, which stays crisp on high-density displays.
const SCALE = 10;
const SIZE = 24 * SCALE;
const STROKE_WIDTH = 3.2 * SCALE;

type RGB = [number, number, number];
interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: RGB;
}

/** The two crossing strokes, in XenMark's own paint order. */
const SEGMENTS: Segment[] = [
  { x1: 5.5, y1: 5.5, x2: 18.5, y2: 18.5, color: FOREST },
  { x1: 18.5, y1: 5.5, x2: 5.5, y2: 18.5, color: MINT },
].map((s) => ({
  x1: s.x1 * SCALE,
  y1: s.y1 * SCALE,
  x2: s.x2 * SCALE,
  y2: s.y2 * SCALE,
  color: s.color,
}));

/** Distance from a point to a line segment. With a round cap, this is
 *  exactly the shape the stroke covers, so no cap is drawn separately. */
function distanceToSegment(px: number, py: number, s: Segment): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(
    0,
    Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / lengthSquared),
  );
  const cx = s.x1 + t * dx;
  const cy = s.y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function renderPixels(): Buffer {
  const half = STROKE_WIDTH / 2;
  // RGB rows, each preceded by a filter byte (0 = none).
  const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
  let offset = 0;

  for (let y = 0; y < SIZE; y += 1) {
    raw[offset] = 0;
    offset += 1;

    for (let x = 0; x < SIZE; x += 1) {
      // Opaque white: the email card behind the logo is white, and a flat
      // background avoids the black fill some clients paint behind
      // transparency.
      let pixel: RGB = [...WHITE];

      for (const segment of SEGMENTS) {
        const distance = distanceToSegment(x + 0.5, y + 0.5, segment);
        // One pixel of feathering at the edge, which is what keeps the
        // diagonals from looking like staircases.
        const coverage = Math.max(0, Math.min(1, half - distance + 0.5));
        if (coverage <= 0) continue;
        pixel = [
          Math.round(pixel[0] * (1 - coverage) + segment.color[0] * coverage),
          Math.round(pixel[1] * (1 - coverage) + segment.color[1] * coverage),
          Math.round(pixel[2] * (1 - coverage) + segment.color[2] * coverage),
        ];
      }

      raw[offset] = pixel[0];
      raw[offset + 1] = pixel[1];
      raw[offset + 2] = pixel[2];
      offset += 3;
    }
  }

  return raw;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(raw: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type 2 = truecolour RGB
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outputPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "xencodes-logo.png",
);
writeFileSync(outputPath, encodePng(renderPixels()));
console.log(`Wrote ${outputPath} (${SIZE}x${SIZE})`);
