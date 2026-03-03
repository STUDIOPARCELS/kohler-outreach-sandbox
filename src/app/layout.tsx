import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Kohler Outreach",
  description: "Internal outreach letter management tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <header className="no-print bg-gray-900 text-white">
            <div className="mx-auto px-8 sm:px-12 lg:px-16 h-14 flex items-center">
              <a href="/" className="font-bold text-lg tracking-tight">
                Kohler Outreach
              </a>
            </div>
          </header>
          <main className="mx-auto px-8 sm:px-12 lg:px-16 py-6">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
