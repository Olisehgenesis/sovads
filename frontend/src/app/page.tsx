import Link from 'next/link'
import BannerAdPreview from '@/components/ads/BannerAdPreview'

export default function Home() {
  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Left content */}
          <div className="text-center lg:text-left">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4">
              Ads that pay — for sites <span className="text-primary">and</span> users
            </h1>
            <p className="text-lg sm:text-xl text-foreground/80 mb-4 max-w-2xl mx-auto lg:mx-0">
              SovAds is a transparent ad protocol where <strong>publishers earn from impressions</strong>, <strong>viewers earn SovPoints for attention</strong>, and <strong>advertisers get verifiable reach</strong>.
            </p>
            <p className="text-sm text-foreground/60 mb-6 max-w-2xl mx-auto lg:mx-0">
              On-chain metrics • Fair distribution • No dark patterns
            </p>
            
            {/* SovPoints Badge */}
            <div className="mb-8 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm text-foreground">
              <span className="text-lg">🎯</span>
              <span><strong>New:</strong> View ads. Earn SovPoints. Redeem later.</span>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center lg:justify-start mb-8">
              <Link href="/advertiser" className="btn btn-primary px-8 py-3">
                Run an Ad Campaign
              </Link>
              <Link href="/publisher" className="btn btn-outline px-8 py-3">
                Earn as a Site Owner
              </Link>
              <Link href="/rewards" className="btn btn-outline px-8 py-3 border-primary/50 text-primary hover:bg-primary/10">
                View My SovPoints
              </Link>
            </div>
            <div className="mt-8 flex items-center justify-center lg:justify-start gap-6 text-sm text-foreground/70">
              <Link href="/contact" className="hover:text-foreground">Contact Us</Link>
              <span className="opacity-40">•</span>
              <Link href="/sdk-demo.html" className="hover:text-foreground">Developer Docs</Link>
              <span className="opacity-40">•</span>
              <Link href="/sdk-demo.html#demo" className="hover:text-foreground">SDK Demo</Link>
            </div>
          </div>

          {/* Right code snippet - top right like SovSeas */}
          <div className="hidden sm:block">
            <div className="max-w-2xl ml-auto rounded-2xl overflow-hidden shadow-sm border border-border">
              <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400"></span>
                <span className="h-2.5 w-2.5 rounded-full bg-green-500"></span>
                <span className="ml-2 text-xs text-neutral-400">snippet.ts</span>
              </div>
              <pre className="bg-neutral-950 text-neutral-100 text-sm leading-6 p-4 overflow-x-auto">
                <code>
                  <span className="text-white">{`// Site ID auto-detected from domain`}</span>{'\n'}
                  <span className="text-primary">const</span> adsClient = <span className="text-accent">new</span> SovAds(<span className="text-blue-400">publicId</span>);{'\n'}
                  <span className="text-primary">const</span> banner = <span className="text-accent">new</span> Banner(adsClient, <span className="text-green-400">&apos;banner&apos;</span>);{'\n'}
                  <span className="text-primary">await</span> banner.render(); <span className="text-neutral-400">{`// renders after site ready`}</span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
      {/* Who Earns What Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold mb-2 text-center">An ad economy that rewards everyone</h2>
        <p className="text-center text-foreground/70 mb-12 max-w-2xl mx-auto">
          Everyone earns. Not just platforms.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          {/* Publishers */}
          <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg p-6">
            <div className="text-3xl mb-4">🧑‍💻</div>
            <h3 className="text-xl font-semibold mb-3">Publishers</h3>
            <ul className="space-y-2 text-foreground/80 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Earn per real impression</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Automatic on-chain payouts</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Full control of ad placements</span>
              </li>
            </ul>
            <Link href="/publisher" className="mt-4 inline-block text-primary hover:underline text-sm font-medium">
              Start earning →
            </Link>
          </div>

          {/* Viewers */}
          <div className="bg-card/80 backdrop-blur-sm border border-primary/30 rounded-lg p-6 relative">
            <div className="absolute top-4 right-4 text-xs px-2 py-1 bg-primary/20 text-primary rounded-full font-medium">
              New
            </div>
            <div className="text-3xl mb-4">👀</div>
            <h3 className="text-xl font-semibold mb-3">Viewers</h3>
            <ul className="space-y-2 text-foreground/80 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Earn <strong>SovPoints</strong> by viewing ads</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Points accumulate over time</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>No signup friction</span>
              </li>
            </ul>
            <Link href="/rewards" className="mt-4 inline-block text-primary hover:underline text-sm font-medium">
              View my points →
            </Link>
          </div>

          {/* Advertisers */}
          <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg p-6">
            <div className="text-3xl mb-4">📢</div>
            <h3 className="text-xl font-semibold mb-3">Advertisers</h3>
            <ul className="space-y-2 text-foreground/80 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Pay only for real reach</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Transparent metrics</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>No bot-driven traffic</span>
              </li>
            </ul>
            <Link href="/advertiser" className="mt-4 inline-block text-primary hover:underline text-sm font-medium">
              Create campaign →
            </Link>
          </div>
        </div>
      </section>

      {/* SovPoints Explainer */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg p-8">
          <h3 className="text-2xl font-semibold mb-4 text-center">What are SovPoints?</h3>
          <p className="text-foreground/80 text-center max-w-2xl mx-auto">
            SovPoints are reward points earned by users for viewing ads. They accumulate over time and can be redeemed for benefits across the SovAds ecosystem.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4 text-sm text-foreground/70">
            <div className="flex items-center gap-2">
              <span className="text-lg">👀</span>
              <span>View → +SovPoints</span>
            </div>
            <span className="opacity-40">•</span>
            <div className="flex items-center gap-2">
              <span className="text-lg">🌍</span>
              <span>Site → Revenue</span>
            </div>
            <span className="opacity-40">•</span>
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <span>Advertiser → Reach</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live Preview */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <h2 className="text-2xl font-semibold mb-4 text-center">Live SovAds Preview</h2>
        <p className="text-center text-sm text-foreground/60 mb-6">
          View this ad to earn SovPoints automatically
        </p>
        <div className="w-full max-w-2xl mx-auto">
          <BannerAdPreview className="min-h-[200px] rounded-2xl border border-border bg-card max-w-full" />
        </div>
      </section>
    </div>
  )
}