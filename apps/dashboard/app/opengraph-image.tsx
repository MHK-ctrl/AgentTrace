import { ImageResponse } from "next/og";

export const alt =
  "AgentTrace — See Everything Your AI Agents Do. Open-source observability and debugging for AI agents.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#08090c",
          color: "#e7eaf0",
          padding: "56px 64px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -220,
            right: -160,
            width: 760,
            height: 600,
            borderRadius: 9999,
            background: "rgba(109,140,255,0.14)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -300,
            left: 160,
            width: 760,
            height: 520,
            borderRadius: 9999,
            background: "rgba(45,212,191,0.07)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              border: "1px solid #2a3140",
              background: "#12151c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M5 7.5h7.5" stroke="#6d8cff" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M5 12h13" stroke="#9a7bff" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M8.5 16.5h10" stroke="#2dd4bf" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="16.5" cy="7.5" r="1.6" fill="#6d8cff" />
              <circle cx="5" cy="16.5" r="1.6" fill="#2dd4bf" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 27, fontWeight: 600, letterSpacing: -0.6 }}>AgentTrace</span>
            <span style={{ fontSize: 11, letterSpacing: 3.2, color: "#5c6575", marginTop: 3 }}>
              FLIGHT RECORDER
            </span>
          </div>
          <span
            style={{
              marginLeft: "auto",
              border: "1px solid #2a3140",
              background: "#12151c",
              color: "#8b94a5",
              padding: "7px 14px",
              borderRadius: 9999,
              fontSize: 12,
              letterSpacing: 1.4,
            }}
          >
            OPEN SOURCE · v0.1.0
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 58, maxWidth: 900 }}>
          <div style={{ display: "flex", fontSize: 62, fontWeight: 650, letterSpacing: -3, lineHeight: 1.04 }}>
            See Everything Your AI Agents Do.
          </div>
          <div style={{ display: "flex", fontSize: 23, color: "#8b94a5", marginTop: 24, lineHeight: 1.45 }}>
            Open-source observability and debugging for AI agents.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginTop: "auto" }}>
          {[
            { label: "TRACE", color: "#6d8cff", width: 330 },
            { label: "TOOLS", color: "#9a7bff", width: 248 },
            { label: "RETRIES", color: "#f5b747", width: 196 },
            { label: "OUTPUT", color: "#2dd4bf", width: 276 },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: 9, width: item.width }}>
              <span style={{ fontSize: 10, color: "#5c6575", letterSpacing: 1.8 }}>{item.label}</span>
              <div style={{ display: "flex", height: 6, width: "100%", background: "#171b24", borderRadius: 3 }}>
                <div style={{ display: "flex", width: "78%", height: 6, background: item.color, borderRadius: 3 }} />
              </div>
            </div>
          ))}
          <div style={{ display: "flex", marginLeft: "auto", gap: 14, alignItems: "center", fontSize: 13, color: "#8b94a5" }}>
            <span style={{ display: "flex", width: 8, height: 8, borderRadius: 9999, background: "#34d399" }} />
            Live execution tracing
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
