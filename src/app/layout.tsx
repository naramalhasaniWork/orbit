import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Martian_Mono } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { SessionProvider } from "@/components/providers/session-provider";
import { themeInitScript } from "@/lib/theme";
import { SITE, pageTitle } from "@/lib/marketing/site";
import "./globals.css";

// UI face. 400 and 500 only; hierarchy comes from size and ink, not weight.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-instrument-sans",
  display: "swap",
});

// Instrument labels and numbers (uppercase 10.5–11px, tabular). Never sentences.
const martianMono = Martian_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-martian-mono",
  display: "swap",
});

// Site-wide defaults. Pages set their own title, canonical and og:url; private areas are noindex
// in their layouts. The Open Graph / Twitter image comes from app/opengraph-image.tsx.
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: pageTitle(),
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: pageTitle(),
    description: SITE.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle(),
    description: SITE.description,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F7F5" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0C0E" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The theme class is set before paint by themeInitScript, so React must not reconcile it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${instrumentSans.variable} ${martianMono.variable} ${GeistMono.variable} font-sans antialiased`}
      >
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
