import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { DarkModeProvider, DarkModeToggle } from "@/components/DarkMode";
import EnvironmentBadge from "@/components/EnvironmentBadge";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Kohler Wood — Outreach Engine",
  description: "Entry level BSME / EIT mechanical engineering outreach engine for the Denver metro area. 315+ companies, automated job tracking, and follow-up management.",
  openGraph: {
    title: "Kohler Wood — Outreach Engine",
    description: "Entry level BSME / EIT mechanical engineering outreach engine for the Denver metro area.",
    url: "https://kohler-outreach.vercel.app",
    siteName: "Outreach Engine",
    images: [
      {
        url: "https://kohler-outreach.vercel.app/og-image.png",
        width: 1200,
        height: 630,
        alt: "Outreach Engine — Entry Level BSME / EIT · Denver Metro",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kohler Wood — Outreach Engine",
    description: "Entry level BSME / EIT mechanical engineering outreach engine for the Denver metro area.",
    images: ["https://kohler-outreach.vercel.app/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <DarkModeProvider>
          <ToastProvider>
            <Nav />
            <main className="mx-auto px-3 sm:px-8 lg:px-16 py-4 sm:py-6">{children}</main>
            <DarkModeToggle />
            <EnvironmentBadge />
          </ToastProvider>
        </DarkModeProvider>
      </body>
    </html>
  );
}
