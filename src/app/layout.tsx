import type { Metadata } from "next";
import { Barlow_Condensed, Birthstone, Source_Sans_3 } from "next/font/google";
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

const birthstone = Birthstone({
  variable: "--font-birthstone",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),

  title: {
    default: "El Solar Timbero | Cuban Music, Dance & Community",
    template: "%s | El Solar Timbero",
  },

  description: "El Solar Timbero brings Cuban music, dance, and community together in New York City. Discover upcoming events featuring timba, son, rumba, and lo mejor de la música cubana.",

  openGraph: {
    title: "El Solar Timbero",
    description: "Cuban music, dance, and community in New York City. Timba, son, rumba, and lo mejor de la música cubana.",
    type: "website",
    locale: "en_US",
    siteName: "El Solar Timbero",
  },

  twitter: {
    card: "summary_large_image",
    title: "El Solar Timbero",
    description: "Cuban music, dance, and community in New York City.",
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${birthstone.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
