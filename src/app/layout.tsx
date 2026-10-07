import type { Metadata } from "next";
import { Suspense } from "react";
import { fontClassName, fontVariables } from "@/lib/fonts";
import { MarketToolbar } from "@/features/trading/market-toolbar";
import { Header } from "@/components/layout/header";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceProvider } from "@/components/providers/marketplace-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Realms.market",
  description: "The Realms ecosystem marketplace",
  icons: {
    icon: "/rw-logo.svg",
    shortcut: "/rw-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${fontClassName} antialiased`}
        style={fontVariables}
      >
        <MarketplaceProvider>
          <Suspense fallback={null}>
            <Header />
          </Suspense>
          <MarketplaceLayout><MarketToolbar />{children}</MarketplaceLayout>
        </MarketplaceProvider>
      </body>
    </html>
  );
}
