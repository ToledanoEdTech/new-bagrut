import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "מערכת מעקב בגרות | ישיבה תיכונית",
  description: "ניהול פדגוגי ומעקב אחרי בחינות בגרות וחובות תלמידים",
  icons: {
    icon: "/logos/logo-1.png",
    apple: "/logos/logo-1.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
