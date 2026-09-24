import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * The default social-share image for every public page that does not
 * define its own (none currently do). Generated at request time from real
 * markup, not a screenshot or a stock photo, so it always matches the
 * site's actual brand colours and never goes stale.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FOREST = "#063b2d";
const FOREST_DARK = "#04291f";
const MINT = "#0bd99a";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${FOREST} 0%, ${FOREST_DARK} 100%)`,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* The XenMark: two crossing strokes, the same geometry as
              components/layout/wordmark.tsx, redrawn here since this
              renders through Satori rather than the app's own React tree. */}
          <svg width={96} height={96} viewBox="0 0 24 24" fill="none">
            <path
              d="M5.5 5.5 L18.5 18.5"
              stroke="#ffffff"
              strokeWidth="3.4"
              strokeLinecap="round"
            />
            <path
              d="M18.5 5.5 L5.5 18.5"
              stroke={MINT}
              strokeWidth="3.4"
              strokeLinecap="round"
            />
          </svg>
          <span
            style={{
              fontSize: 88,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
            }}
          >
            {SITE_NAME}
          </span>
        </div>
        <span
          style={{
            marginTop: 28,
            fontSize: 34,
            color: "rgba(255,255,255,0.82)",
            textAlign: "center",
          }}
        >
          {SITE_TAGLINE}
        </span>
      </div>
    ),
    { ...size },
  );
}
