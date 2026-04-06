import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stoix App - Stoix",
  description:
    "Stoix is a liquidity coordination layer for institutional trading desks and market makers.",
  icons: {
    icon: '/stoix tab mid grey.svg',
    shortcut: '/stoix tab mid grey.svg',
    apple: '/stoix tab mid grey.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="bg-black"
      style={{
        backgroundColor: "#000000",
        margin: 0,
        padding: 0,
        width: "100%",
        height: "100%",
        overflowX: "hidden",
        scrollbarGutter: "stable",
      }}
    >
      <head>
        <link href="https://fonts.cdnfonts.com/css/anita-semi-square" rel="stylesheet" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} bg-black text-zinc-100 antialiased`} style={{ margin: 0, padding: 0, width: "100vw", minHeight: "100vh", overflowX: "hidden", backgroundColor: "#000000" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
