import type { Metadata } from "next";
import { Anton, Space_Mono } from "next/font/google";
import "./globals.css";
import { headers } from 'next/headers'
import ContextProvider from '@/context'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PopupAdClient from '@/components/ads/PopupAdClient'

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
    <html lang="en" className={`${anton.variable} ${spaceMono.variable}`}>
      <body className="antialiased bg-background text-foreground min-h-screen flex flex-col font-body">
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
