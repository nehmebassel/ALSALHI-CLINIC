import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlSalhi Clinical Platform",
  description: "Bilingual clinical workflow platform for the AlSalhi Pilot 0 implementation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className="h-full" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
