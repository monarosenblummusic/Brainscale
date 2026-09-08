import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider, themeScript } from "@/components/ui/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BrainScale — Dual N-Back and brain training",
    template: "%s · BrainScale",
  },
  description:
    "Free, science-backed brain training: dual n-back, complex working memory, memory span, Corsi block-tapping, PASAT, mental math and cryptograms. No account needed.",
  applicationName: "BrainScale",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1b20" },
  ],
  width: "device-width",
  initialScale: 1,
  // The play environment relies on stable geometry; a pinch-zoom mid-trial
  // moves the stimulus under the player's finger.
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
