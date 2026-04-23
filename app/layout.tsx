import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@takaki/go-design-system/tokens.css";
import { DesignTokens, Toaster } from "@takaki/go-design-system";
import { DarkModeInit } from "@/components/layout/dark-mode-init";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MetaGo",
  description: "PSF Product Manager — goシリーズの自律管理プラットフォーム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ja"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <DarkModeInit />
        <DesignTokens primaryColor="#1E3A8A" primaryColorHover="#1E40AF" />
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--sidebar-accent:220 60% 94%;--sidebar-accent-foreground:226 71% 34%}.dark{--sidebar-accent:226 45% 18%;--sidebar-accent-foreground:226 60% 78%}`,
          }}
        />
      </head>
      <body className="min-h-full">
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
