import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Entry Level",
  description: "Entry level job outreach management tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <main className="mx-auto px-8 sm:px-12 lg:px-16 py-6">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
