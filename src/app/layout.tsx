import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PR Reviewer",
  description: "Get a structured review of a GitHub pull request.",
  themeColor: "#090b0c",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090b0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${sourceSans.variable} ${geistMono.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-foreground focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
