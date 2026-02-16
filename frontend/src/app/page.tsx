import Link from 'next/link'
import BannerAdPreview from '@/components/ads/BannerAdPreview'

export default function Home() {
  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Left content */}
          <div className="text-center lg:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2 text-[var(--text-primary)]">
              Ads that pay — for sites <span className="text-[var(--accent-primary-solid)]">and</span> users
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mb-3 max-w-2xl mx-auto lg:mx-0">
              SovAds is a transparent ad protocol where <strong className="text-[var(--text-primary)]">publishers earn from impressions</strong>, <strong className="text-[var(--text-primary)]">viewers earn SovPoints for attention</strong>, and <strong className="text-[var(--text-primary)]">advertisers get verifiable reach</strong>.
            </p>
            <p className="text-[10px] text-[var(--text-tertiary)] mb-4 max-w-2xl mx-auto lg:mx-0 uppercase tracking-wider">
              On-chain metrics • Fair distribution • No dark patterns
            </p>

            {/* SovPoints Badge */}
            <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 glass-card text-[10px] text-[var(--text-primary)]">
              <span className="text-base">🎯</span>
              <span><strong>New:</strong> View ads. Earn SovPoints. Redeem later.</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center lg:justify-start mb-6">
              <Link href="/advertiser" className="btn btn-primary px-4 py-2">
                Run an Ad Campaign
              </Link>
              <Link href="/publisher" className="btn btn-outline px-4 py-2">
                Earn as a Site Owner
              </Link>
              <Link href="/rewards" className="btn btn-outline px-4 py-2 border-[var(--accent-primary-solid)]/50 text-[var(--accent-primary-solid)] hover:bg-[var(--accent-primary)]/20">
                View My SovPoints
              </Link>
            </div>
            <div className="mt-6 flex items-center justify-center lg:justify-start gap-4 text-[10px] text-[var(--text-tertiary)]">
              <Link href="/contact" className="hover:text-[var(--text-primary)] transition-colors">Contact Us</Link>
              <span className="opacity-40">•</span>
              <Link href="/sdk-demo.html" className="hover:text-[var(--text-primary)] transition-colors">Developer Docs</Link>
              <span className="opacity-40">•</span>
              <Link href="/sdk-demo.html#demo" className="hover:text-[var(--text-primary)] transition-colors">SDK Demo</Link>
            </div>
          </div>

          {/* Right code snippet */}
          <div className="hidden sm:block">
            <div className="max-w-2xl ml-auto rounded-lg overflow-hidden glass-card">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--glass-border)]">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400"></span>
                <span className="h-2.5 w-2.5 rounded-full bg-green-500"></span>
                <span className="ml-2 text-xs text-[var(--text-tertiary)]">snippet.ts</span>
              </div>
              <pre className="bg-black/50 text-[var(--text-primary)] text-sm leading-6 p-4 overflow-x-auto">
                <code>
                  <span className="text-[var(--text-tertiary)]">{`// Site ID auto-detected from domain`}</span>{'\n'}
                  <span className="text-[var(--accent-primary-solid)]">const</span> adsClient = <span className="text-[var(--accent-primary-solid)]">new</span> SovAds(<span className="text-[var(--accent-success-solid)]">publicId</span>);{'\n'}
                  <span className="text-[var(--accent-primary-solid)]">const</span> banner = <span className="text-[var(--accent-primary-solid)]">new</span> Banner(adsClient, <span className="text-[var(--accent-success-solid)]">&apos;banner&apos;</span>);{'\n'}
                  <span className="text-[var(--accent-primary-solid)]">await</span> banner.render(); <span className="text-[var(--text-tertiary)]">{`// renders after site ready`}</span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Who Earns What Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-xl font-bold mb-1 text-center text-[var(--text-primary)]">An ad economy that rewards everyone</h2>
        <p className="text-center text-[var(--text-secondary)] mb-8 max-w-2xl mx-auto text-xs">
          Everyone earns. Not just platforms.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="glass-card rounded-lg p-6">
            <div className="text-2xl mb-3">🧑‍💻</div>
            <h3 className="text-base font-semibold mb-2 text-[var(--text-primary)]">Publishers</h3>
            <ul className="space-y-1.5 text-[var(--text-secondary)] text-xs">
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-primary-solid)] mt-1">•</span>
                <span>Earn per real impression</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-primary-solid)] mt-1">•</span>
                <span>Automatic on-chain payouts</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-primary-solid)] mt-1">•</span>
                <span>Full control of ad placements</span>
              </li>
            </ul>
            <Link href="/publisher" className="mt-4 inline-block text-[var(--accent-primary-solid)] hover:opacity-80 text-sm font-medium">
              Start earning →
            </Link>
          </div>

          <div className="glass-card rounded-lg p-6 relative border-[var(--accent-primary-solid)]/30">
            <div className="absolute top-4 right-4 text-xs px-2 py-1 bg-[var(--accent-primary)]/30 text-[var(--accent-primary-solid)] rounded-md font-medium">
              New
            </div>
            <div className="text-2xl mb-3">👀</div>
            <h3 className="text-base font-semibold mb-2 text-[var(--text-primary)]">Viewers</h3>
            <ul className="space-y-1.5 text-[var(--text-secondary)] text-xs">
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-primary-solid)] mt-1">•</span>
                <span>Earn <strong className="text-[var(--text-primary)]">SovPoints</strong> by viewing ads</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-primary-solid)] mt-1">•</span>
                <span>Points accumulate over time</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-primary-solid)] mt-1">•</span>
                <span>No signup friction</span>
              </li>
            </ul>
            <Link href="/rewards" className="mt-4 inline-block text-[var(--accent-primary-solid)] hover:opacity-80 text-sm font-medium">
              View my points →
            </Link>
          </div>

          <div className="glass-card rounded-lg p-6">
            <div className="text-2xl mb-3">📢</div>
            <h3 className="text-base font-semibold mb-2 text-[var(--text-primary)]">Advertisers</h3>
            <ul className="space-y-1.5 text-[var(--text-secondary)] text-xs">
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-primary-solid)] mt-1">•</span>
                <span>Pay only for real reach</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-primary-solid)] mt-1">•</span>
                <span>Transparent metrics</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--accent-primary-solid)] mt-1">•</span>
                <span>No bot-driven traffic</span>
              </li>
            </ul>
            <Link href="/advertiser" className="mt-4 inline-block text-[var(--accent-primary-solid)] hover:opacity-80 text-sm font-medium">
              Create campaign →
            </Link>
          </div>
        </div>
      </section>

      {/* SovPoints Explainer */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="glass-card rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2 text-center text-[var(--text-primary)]">What are SovPoints?</h3>
          <p className="text-[var(--text-secondary)] text-center max-w-2xl mx-auto text-xs">
            SovPoints are reward points earned by users for viewing ads. They accumulate over time and can be redeemed for benefits across the SovAds ecosystem.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4 text-sm text-[var(--text-tertiary)]">
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
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <h2 className="text-lg font-semibold mb-3 text-center text-[var(--text-primary)]">Live SovAds Preview</h2>
        <p className="text-center text-[10px] text-[var(--text-tertiary)] mb-4 uppercase tracking-wider">
          View this ad to earn SovPoints automatically
        </p>
        <div className="w-full max-w-2xl mx-auto">
          <BannerAdPreview className="min-h-[200px] rounded-lg glass-card max-w-full" />
        </div>
      </section>
    </div>
  )
}
