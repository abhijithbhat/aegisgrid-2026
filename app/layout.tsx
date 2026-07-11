import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "AEGISGRID 2026 | Stadium Safety Command Center";
const description = "From fragmented stadium signals to one safe, explainable decision—human-approved incident fusion and response support for safety supervisors.";

function safeOrigin(host: string | null, protocol: string | null): string {
  const cleanHost = host?.split(",")[0].trim();
  const cleanProtocol = protocol?.split(",")[0].trim();
  if (cleanHost && /^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(cleanHost)) {
    return `${cleanProtocol === "http" ? "http" : "https"}://${cleanHost}`;
  }
  try {
    return new URL(process.env.APP_ORIGIN ?? "http://localhost:3000").origin;
  } catch {
    return "http://localhost:3000";
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const origin = safeOrigin(incoming.get("x-forwarded-host") ?? incoming.get("host"), incoming.get("x-forwarded-proto"));
  const image = `${origin}/og.png`;
  return {
    metadataBase: new URL(origin),
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      type: "website",
      title,
      description,
      siteName: "AEGISGRID 2026",
      images: [{ url: image, width: 1200, height: 630, alt: "AEGISGRID 2026 — From fragmented signals to one safe, explainable decision." }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
