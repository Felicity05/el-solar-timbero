import type { Metadata } from "next";
import { Barlow_Condensed, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import type { ReactNode } from "react";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  weight: ["400", "600"],
  subsets: ["latin"],
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  weight: ["700", "800"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ?
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")),
  title: "Cuban Night Social · October 12 | El Solar Timbero",
  description: "RSVP for a night of timba, son, and Cuban dance at Guantanamera, NYC. " +
      "Monday, October 12, 2026, 8–11:30 PM. Free admission. Música, baile, comunidad.",
  openGraph: {
    title: "Cuban Night Social · October 12",
    description: "El Solar Timbero at Guantanamera · 8–11:30 PM · NYC · Free admission. " +
        "RSVP and join us on the dance floor.",
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children } : RootLayoutProps) {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} 
      ${barlowCondensed.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
