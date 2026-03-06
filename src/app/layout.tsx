import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Outreach Engine",
  description: "Outreach engine for entry level BSME",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <main className="mx-auto px-3 sm:px-8 lg:px-16 py-4 sm:py-6">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
