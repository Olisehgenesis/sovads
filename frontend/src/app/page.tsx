import Link from 'next/link'
import BannerAdPreview from '@/components/ads/BannerAdPreview'

export default function Home() {
  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left content */}
          <div className="text-center lg:text-left">
            <h1 className="brutal-title text-5xl sm:text-7xl lg:text-8xl">
              Ads that <span className="text-white bg-black px-4">pay</span>
            </h1>
            <p className="text-lg font-bold text-black mb-8 max-w-2xl mx-auto lg:mx-0 border-l-4 border-black pl-4">
              SovAds is a transparent ad protocol where <strong className="bg-black text-white px-1">publishers earn</strong>, <strong className="bg-black text-white px-1">viewers earn SovPoints</strong>, and advertisers get verifiable reach.
            </p>

            {/* SovPoints Badge */}
            <div className="mb-8 inline-flex items-center gap-3 px-4 py-2 bg-[#F5F3F0] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-sm font-bold text-black uppercase">
              <span className="text-xl">🎯</span>
              <span><strong>New:</strong> Earn SovPoints. Redeem later.</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
              <Link href="/advertiser" className="btn btn-primary text-lg">
                Run an Ad Campaign
              </Link>
              <Link href="/publisher" className="btn btn-outline text-base">
                Earn as a Site Owner
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-xs font-bold uppercase tracking-widest">
              <Link href="/contact" className="hover:bg-black hover:text-white transition-all">Contact Us</Link>
              <a href="/sdk-demo.html" className="hover:bg-black hover:text-white transition-all">Developer Docs</a>
              <a href="/sdk-demo.html#demo" className="hover:bg-black hover:text-white transition-all">SDK Demo</a>
            </div>
          </div>

          {/* Right code snippet */}
          <div className="hidden lg:block relative">
            <div className="absolute -top-4 -left-4 w-full h-full bg-black"></div>
            <div className="relative border-4 border-black bg-white p-2">
              <div className="flex items-center gap-2 px-4 py-3 border-b-4 border-black bg-[#F5F3F0]">
                <span className="h-3 w-3 border-2 border-black rounded-full bg-red-500"></span>
                <span className="h-3 w-3 border-2 border-black rounded-full bg-yellow-400"></span>
                <span className="h-3 w-3 border-2 border-black rounded-full bg-green-500"></span>
                <span className="ml-4 text-sm font-heading font-bold text-black uppercase tracking-tight">snippet.ts</span>
              </div>
              <pre className="bg-[#141414] text-white text-base leading-relaxed p-8 overflow-x-auto">
                <code className="font-mono">
                  <span className="text-blue-400">import</span> {`{ SovAds, Banner }`} <span className="text-blue-400">from</span> <span className="text-green-400">&apos;sovads-sdk&apos;</span>;{'\n'}
                  <span className="text-blue-400">const</span> ads = <span className="text-blue-400">new</span> SovAds({`{ `}<span className="text-green-400">siteId: &apos;YOUR_SITE_ID&apos;</span>{` }`});{'\n'}
                  <span className="text-blue-400">const</span> banner = <span className="text-blue-400">new</span> Banner(ads, <span className="text-green-400">&apos;ad-container&apos;</span>);{'\n'}
                  <span className="text-blue-400">await</span> banner.render(); <span className="text-gray-500">{`// renders after site ready`}</span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Who Earns What Section */}
      <section className="border-t-4 border-black bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-heading text-center mb-12 uppercase">An ad economy for everyone</h2>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                emoji: '🧑‍💻',
                title: 'Publishers',
                items: ['Earn per real impression', 'Automatic on-chain payouts', 'Full control of placements'],
                link: '/publisher',
                cta: 'Start earning →'
              },
              {
                emoji: '👀',
                title: 'Viewers',
                items: ['Earn SovPoints by viewing ads', 'Accumulate over time', 'No signup friction'],
                link: '/rewards',
                cta: 'View my points →',
                featured: true
              },
              {
                emoji: '📢',
                title: 'Advertisers',
                items: ['Pay only for real reach', 'Transparent metrics', 'No bot-driven traffic'],
                link: '/advertiser',
                cta: 'Create campaign →'
              }
            ].map((card, i) => (
              <div
                key={i}
                className={`card relative p-8 ${card.featured ? 'bg-[#F5F3F0] -rotate-1' : 'bg-white rotate-1'} transition-transform hover:rotate-0`}
              >
                {card.featured && (
                  <div className="absolute -top-4 -right-4 bg-black text-white px-4 py-1 text-sm font-heading uppercase">
                    New
                  </div>
                )}
                <div className="text-5xl mb-6">{card.emoji}</div>
                <h3 className="text-2xl font-heading mb-4 uppercase">{card.title}</h3>
                <ul className="space-y-4 mb-8">
                  {card.items.map((item, j) => (
                    <li key={j} className="flex items-center gap-3 font-bold text-sm">
                      <span className="h-2 w-2 bg-black shrink-0"></span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Link href={card.link} className="text-lg font-heading uppercase underline decoration-4 underline-offset-4 hover:bg-black hover:text-white px-1 transition-all">
                  {card.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SovPoints Explainer */}
      <section className="bg-[#F5F3F0] border-t-2 border-black py-16 px-4">
        <div className="max-w-4xl mx-auto card p-8 bg-white">
          <h3 className="text-2xl font-heading mb-4 text-center uppercase tracking-tight">What are SovPoints?</h3>
          <p className="text-lg font-bold text-center mb-10 max-w-2xl mx-auto">
            Reward points earned for your attention. They accumulate over time and can be redeemed across the ecosystem.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 text-center font-heading text-base">
            <div className="flex flex-col items-center gap-2">
              <span className="text-4xl">👀</span>
              <span>View Ads</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-4xl">🎯</span>
              <span>Earn Points</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-4xl">💰</span>
              <span>Redeem later</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live Preview */}
      <section className="py-16 px-4 bg-white border-t-2 border-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-heading mb-3 uppercase">Live SovAds Preview</h2>
          <p className="font-heading text-sm text-gray-500 mb-12 uppercase tracking-widest">
            View this ad to earn SovPoints automatically
          </p>
          <div className="card bg-white p-4 max-w-2xl mx-auto -rotate-1 hover:rotate-0 transition-transform">
            <BannerAdPreview className="min-h-[250px] w-full border-2 border-black" />
          </div>
        </div>
      </section>
    </div>
  )
}
