import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Renders the Xencodes mark to public/xencodes-logo.png, the logo emails
 * (and the Organization structured data) reference by absolute URL.
 *
 * The mark itself is an inline SVG React component
 * (src/components/layout/wordmark.tsx) whose second stroke is a CSS custom
 * property. Most mail clients render neither SVG nor custom properties, so
 * the same geometry is rasterised here instead.
 *
 * Drawn as the site's "light" variant (white + mint strokes, what
 * <Wordmark tone="light" /> renders on forest backgrounds) on a rounded
 * forest tile with transparent corners. The previous version was the
 * forest + mint mark on an opaque white square, which showed as a white box
 * in every dark-mode inbox and whose forest stroke disappeared against a
 * dark background. A tile with its own opaque colour reads the same on a
 * light page, a dark page, and under a client's forced colour inversion
 * (which leaves images alone).
 *
 * Run with: npx tsx scripts/generate-email-logo.mts
 */

type RGB = [number, number, number];

// From src/app/globals.css.
const FOREST: RGB = [0x06, 0x3b, 0x2d];
const MINT: RGB = [0x0b, 0xd9, 0x9a];
const WHITE: RGB = [0xff, 0xff, 0xff];

// Shown at 36px in email; 4x keeps it crisp on high-density screens while
// staying a few KB.
const SIZE = 144;
const CORNER_RADIUS = SIZE * 0.24;
// The mark occupies the middle of the tile, matching the site's 22px mark
// inside a ~36px touch target.
const MARK_SCALE = (SIZE * 0.62) / 24;
const MARK_OFFSET = (SIZE - 24 * MARK_SCALE) / 2;
const STROKE_WIDTH = 3.2 * MARK_SCALE;

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: RGB;
}

/** XenMark's two strokes, in its own paint order, mapped onto the tile. */
const SEGMENTS: Segment[] = [
  { x1: 5.5, y1: 5.5, x2: 18.5, y2: 18.5, color: WHITE },
  { x1: 18.5, y1: 5.5, x2: 5.5, y2: 18.5, color: MINT },
].map((s) => ({
  x1: MARK_OFFSET + s.x1 * MARK_SCALE,
  y1: MARK_OFFSET + s.y1 * MARK_SCALE,
  x2: MARK_OFFSET + s.x2 * MARK_SCALE,
  y2: MARK_OFFSET + s.y2 * MARK_SCALE,
  color: s.color,
}));

/** Distance from a point to a segment. With a round cap, this is exactly
 *  the shape the stroke covers, so no cap is drawn separately. */
function distanceToSegment(px: number, py: number, s: Segment): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / lengthSquared));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

/** 0..1 coverage of the rounded-square tile at this pixel centre. */
function tileCoverage(px: number, py: number): number {
  const r = CORNER_RADIUS;
  const cx = Math.max(r, Math.min(SIZE - r, px));
  const cy = Math.max(r, Math.min(SIZE - r, py));
  const distance = Math.hypot(px - cx, py - cy);
  return Math.max(0, Math.min(1, r - distance + 0.5));
}

function renderPixels(): Buffer {
  const half = STROKE_WIDTH / 2;
  // RGBA rows, each preceded by a filter byte (0 = none).
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  let offset = 0;

  for (let y = 0; y < SIZE; y += 1) {
    raw[offset] = 0;
    offset += 1;

    for (let x = 0; x < SIZE; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      let pixel: RGB = [...FOREST];

      for (const segment of SEGMENTS) {
        const coverage = Math.max(0, Math.min(1, half - distanceToSegment(px, py, segment) + 0.5));
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
      raw[offset + 3] = Math.round(tileCoverage(px, py) * 255);
      offset += 4;
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
  header[9] = 6; // colour type 6 = truecolour with alpha
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

const outputPath = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "xencodes-logo.png");
writeFileSync(outputPath, encodePng(renderPixels()));
console.log(`Wrote ${outputPath} (${SIZE}x${SIZE})`);
