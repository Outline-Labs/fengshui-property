import { ImageResponse } from "next/og";

// Branded social-share card, generated at build time (statically cached). No
// external font/asset — Latin-only text on the default font so it can't tofu.
// Satori requires explicit display:flex on any element with children.
export const alt =
  "Fengshui AI — AI-powered fengshui analysis for Singapore property";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#f5efe6";
const INK = "#1c140e";
const INK_SOFT = "#2a1f15";
const CINNABAR = "#8b2c1c";
const JADE = "#3f5a3d";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: "80px",
        }}
      >
        {/* wordmark + compass-diamond mark */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "34px",
              height: "34px",
              background: CINNABAR,
              transform: "rotate(45deg)",
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: "30px",
              letterSpacing: "0.32em",
              color: INK,
            }}
          >
            FENGSHUI AI
          </div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: "84px",
              fontWeight: 700,
              color: INK,
              lineHeight: 1.05,
            }}
          >
            AI fengshui for Singapore property
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "36px",
              color: INK_SOFT,
              marginTop: "28px",
              maxWidth: "880px",
            }}
          >
            Instant map analysis. Detailed unit-level readings.
          </div>
        </div>

        {/* footer rule + domain */}
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div style={{ width: "72px", height: "6px", background: CINNABAR }} />
          <div style={{ display: "flex", fontSize: "28px", color: JADE }}>
            fengshuiai.sg
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
