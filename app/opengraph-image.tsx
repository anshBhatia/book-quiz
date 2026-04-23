import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Load Instrument Serif from Google Fonts
  const css = await fetch(
    "https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap",
    { headers: { "User-Agent": "Mozilla/5.0 (compatible)" } },
  ).then((r) => r.text());

  const fontUrl = css.match(/src: url\((.+?)\) format\('woff2'\)/)?.[1];
  const fontData = fontUrl ? await fetch(fontUrl).then((r) => r.arrayBuffer()) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#f7f4ee",
          padding: "80px",
        }}
      >
        <p
          style={{
            fontSize: 18,
            fontFamily: "sans-serif",
            color: "#716a60",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontWeight: 500,
            margin: 0,
            marginBottom: 28,
          }}
        >
          Book Quiz
        </p>
        <h1
          style={{
            fontSize: 88,
            fontFamily: fontData ? "Instrument Serif" : "serif",
            color: "#211f1b",
            lineHeight: 0.95,
            margin: 0,
            marginBottom: 60,
            fontWeight: 400,
          }}
        >
          Enter a book to check your knowledge.
        </h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              height: 68,
              border: "1.5px solid #ded7ca",
              borderRadius: 8,
              backgroundColor: "#fffdf8",
              display: "flex",
              alignItems: "center",
              paddingLeft: 24,
              fontSize: 22,
              color: "#b0a99e",
              fontFamily: "sans-serif",
            }}
          >
            The Great Gatsby
          </div>
          <div
            style={{
              height: 60,
              borderRadius: 8,
              backgroundColor: "#211f1b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              color: "white",
              fontFamily: "sans-serif",
              fontWeight: 600,
              letterSpacing: "0.01em",
            }}
          >
            Find book
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [{ name: "Instrument Serif", data: fontData, style: "normal", weight: 400 }]
        : [],
    },
  );
}
