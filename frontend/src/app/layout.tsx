import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { headers } from 'next/headers'
import ContextProvider from '@/context'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PopupAdClient from '@/components/ads/PopupAdClient'

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SovAds - Decentralized Ad Network",
  description: "Earn crypto by serving ads on your website. Transparent, fraud-resistant, and on-chain accountable.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersObj = await headers();
  const cookies = headersObj.get('cookie')

  return (
    <html lang="en" className={`dark ${geistMono.variable}`}>
      <body className="antialiased bg-background text-foreground min-h-screen flex flex-col">
        <ContextProvider cookies={cookies}>
          <Header />
          <main className="flex-1 pt-16 relative z-10">
            {children}
          </main>
          <Footer />
          <PopupAdClient delay={4000} />
        </ContextProvider>
      </body>
    </html>
  );
}
