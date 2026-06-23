import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : "https://fayde.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Fayde",
    template: "%s | Fayde",
  },
  description: "Fayde — your personal productivity suite",
  manifest: "/manifest.json",
  openGraph: {
    title: "Fayde",
    description: "Fayde — your personal productivity suite",
    url: "/",
    siteName: "Fayde",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Fayde Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary", // Displays a square card with the logo. Change to 'summary_large_image' if you add a wide 1200x630 banner
    title: "Fayde",
    description: "Fayde — your personal productivity suite",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
