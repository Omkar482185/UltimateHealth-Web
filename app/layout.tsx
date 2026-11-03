import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { SITE } from "@/lib/config";

import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

/** Display and long-form face: page titles and the library's article text. */
const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

/** Tabular figures for measurements, scores and thresholds. */
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: SITE.title,
    template: `%s | ${SITE.title}`,
  },
  description: SITE.description,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Font variables must be declared on <html> so that `body` can resolve them.
    // Declaring them on <main> left `font-family: var(--font-sans)` unresolved on
    // body, which fell back to the browser default serif.
    <html lang="en" className={[sans.variable, serif.variable, mono.variable].join(" ")}>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <div className="container site-header__inner">
            <SiteNav />
          </div>
        </header>
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
