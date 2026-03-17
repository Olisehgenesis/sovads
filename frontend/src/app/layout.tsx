import type { Metadata } from "next";
import { Anton, Space_Mono } from "next/font/google";
import "./globals.css";
import { headers } from 'next/headers'
import ContextProvider from '@/context'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PopupAdClient from '@/components/ads/PopupAdClient'
import { SDKIdentityHelper } from '@/components/ads/SDKIdentityHelper'
import GoodDollarClaimGate from '@/components/GoodDollarClaimGate'

const anton = Anton({
  variable: "--font-heading",
  weight: "400",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-body",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SovAds - Sovereign Decentralized Ad Network",
    template: "%s | SovAds"
  },
  description: "The decentralized ad protocol where publishers earn, viewers get rewarded with SovPoints, and advertisers reach real human audiences on-chain.",
  keywords: ["decentralized ads", "web3 advertising", "on-chain marketing", "sovpoints", "payouts", "publisher ads"],
  authors: [{ name: "SovAds Team" }],
  creator: "SovAds Protocol",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://ads.sovseas.xyz",
    siteName: "SovAds",
    title: "SovAds - Decentralized Ad Network",
    description: "Earn crypto by serving ads on your website. Transparent, fraud-resistant, and on-chain accountable.",
    images: [{
      url: "/logo.svg",
      width: 512,
      height: 512,
      alt: "SovAds Logo",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SovAds - Decentralized Ad Network",
    description: "Transparent, fraud-resistant, and on-chain accountable ad protocol.",
    images: ["/logo.svg"],
    creator: "@sovads",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersObj = await headers();
  const cookies = headersObj.get('cookie')

  return (
    <html lang="en" className={`${anton.variable} ${spaceMono.variable}`}>
      <head>
        <link
          rel="preload"
          href="https://fonts.reown.com/KHTeka-Medium.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="antialiased bg-background text-foreground min-h-screen flex flex-col font-body">
        <ContextProvider cookies={cookies}>
          <Header />
          <main className="flex-1 pt-16 relative z-10">
            {children}
          </main>
          <Footer />
          <PopupAdClient delay={4000} />
          <SDKIdentityHelper />
          <GoodDollarClaimGate />
        </ContextProvider>
      </body>
    </html>
  );
}
