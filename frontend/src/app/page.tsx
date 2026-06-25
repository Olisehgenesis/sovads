import Link from 'next/link'
import BannerAdPreview from '@/components/ads/BannerAdPreview'
import CodeSnippet from '@/components/CodeSnippet'
import StatsStrip from '@/components/StatsStrip'
import AdvertiserIcon from '@/components/advertiser/AdvertiserIcon'
import type { AdvertiserIconName } from '@/components/advertiser/models'

const heroSnippet = `import { SovAds, Banner } from 'sovads-sdk'

const ads = new SovAds({ siteId: 'YOUR_SITE_ID' })
const banner = new Banner(ads, 'ad-container')
await banner.render() // renders after site ready`

type RoleCard = {
  icon: AdvertiserIconName
  title: string
  items: string[]
  link: string
  cta: string
}

const roleCards: RoleCard[] = [
  {
    icon: 'websites',
    title: 'Publishers',
    items: ['Earn per real impression', 'Automatic on-chain payouts', 'Full control of placements'],
    link: '/publisher',
    cta: 'Start earning',
  },
  {
    icon: 'preview',
    title: 'Viewers',
    items: ['Earn SovPoints by viewing ads', 'Accumulate over time', 'No signup friction'],
    link: '/rewards',
    cta: 'View my points',
  },
  {
    icon: 'campaign',
    title: 'Advertisers',
    items: ['Pay only for real reach', 'Transparent metrics', 'No bot-driven traffic'],
    link: '/advertiser',
    cta: 'Create campaign',
  },
]

const sovPointsSteps: { icon: AdvertiserIconName; label: string }[] = [
  { icon: 'preview', label: 'View ads' },
  { icon: 'points', label: 'Earn points' },
  { icon: 'earnings', label: 'Redeem later' },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F5F3F0]">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-12 sm:pt-24 sm:pb-16">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
          <div className="text-center lg:text-left">
            <h1 className="brutal-title text-5xl sm:text-7xl lg:text-8xl">
              Ads that <span className="bg-[#2D2D2D] px-4 text-white">pay</span>
            </h1>
            <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#666] mx-auto lg:mx-0">
              Publishers earn per impression. Viewers earn rewards. Advertisers buy verified human attention.
            </p>

            <div className="mb-4 flex flex-col gap-4 sm:flex-row justify-center lg:justify-start">
              <Link href="/advertiser" className="btn btn-primary text-lg">
                Run an ad campaign
              </Link>
              <Link href="/publisher" className="btn btn-outline text-base">
                Earn as a site owner
              </Link>
            </div>

            <div className="mb-8">
              <Link
                href="/rewards"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2D2D2D] underline decoration-2 underline-offset-4 hover:bg-[#2D2D2D] hover:text-white px-1 transition-colors"
              >
                <span aria-hidden>→</span> Just here to earn? Claim SovPoints as a viewer
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-bold uppercase tracking-widest text-[#999] justify-center lg:justify-start">
              <Link href="/contact" className="transition-colors hover:text-[#2D2D2D]">Contact</Link>
              <a href="/sdk-demo.html" className="transition-colors hover:text-[#2D2D2D]">Developer docs</a>
              <a href="/sdk-demo.html#demo" className="transition-colors hover:text-[#2D2D2D]">SDK demo</a>
            </div>
          </div>

          <div className="hidden lg:block">
            <CodeSnippet chrome="window" filename="snippet.ts" code={heroSnippet} />
          </div>
        </div>
      </div>

      {/* ── Protocol stats — trust signal ────────────────────────────────── */}
      <StatsStrip />

      {/* ── Who earns what ───────────────────────────────────────────────── */}
      <section className="border-t border-[#2D2D2D] bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="brutal-title text-center text-3xl sm:text-4xl mb-12">
            An ad economy for everyone
          </h2>

          <div className="grid gap-8 md:grid-cols-3">
            {roleCards.map((card) => (
              <div
                key={card.title}
                className="border border-[#E5E5E5] bg-white p-6 transition-colors hover:bg-[#FAFAF8]"
              >
                <div className="mb-5 flex h-10 w-10 items-center justify-center bg-[#2D2D2D] text-white">
                  <AdvertiserIcon name={card.icon} className="h-5 w-5" />
                </div>
                <h3 className="brutal-title mb-4 text-2xl">{card.title}</h3>
                <ul className="mb-6 space-y-2.5">
                  {card.items.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13px] font-medium text-[#2D2D2D]">
                      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 bg-[#2D2D2D]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={card.link}
                  className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#2D2D2D] underline decoration-2 underline-offset-4 hover:bg-[#2D2D2D] hover:text-white px-1 transition-colors"
                >
                  {card.cta} <span aria-hidden>→</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SovPoints explainer ──────────────────────────────────────────── */}
      <section className="border-t border-[#E5E5E5] bg-[#F5F3F0] py-16 px-4">
        <div className="mx-auto max-w-4xl border border-[#E5E5E5] bg-white p-8">
          <h3 className="brutal-title mb-3 text-center text-2xl">What are SovPoints?</h3>
          <p className="mx-auto mb-10 max-w-2xl text-center text-[15px] leading-6 text-[#444]">
            Reward points earned for your attention. They accumulate over time and can be redeemed across the
            ecosystem.
          </p>
          <ol className="grid gap-6 text-center sm:grid-cols-3">
            {sovPointsSteps.map((step, i) => (
              <li key={step.label} className="flex flex-col items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center border border-[#2D2D2D] bg-white text-[#2D2D2D]">
                  <AdvertiserIcon name={step.icon} className="h-5 w-5" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Step {i + 1}</span>
                <span className="text-[14px] font-semibold text-[#2D2D2D]">{step.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Live preview ─────────────────────────────────────────────────── */}
      <section className="border-t border-[#E5E5E5] bg-white px-4 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="brutal-title mb-2 text-3xl">Live SovAds preview</h2>
          <p className="mb-10 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#888]">
            View this ad to earn SovPoints automatically
          </p>
          <div className="mx-auto max-w-2xl border border-[#E5E5E5] bg-white p-4">
            <BannerAdPreview className="min-h-[250px] w-full border border-[#E5E5E5]" />
          </div>
        </div>
      </section>

      {/* ── Pre-footer CTA band ──────────────────────────────────────────── */}
      <section className="border-t border-[#2D2D2D] bg-[#F5F3F0] px-4 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="brutal-title mb-5 text-4xl sm:text-6xl">
            Ready to <span className="bg-[#2D2D2D] px-3 text-white">ship</span>?
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-lg text-[#666]">
            Drop in the SDK. Earn from your first impression. No ad-ops team required.
          </p>
          <div className="flex flex-col gap-4 justify-center sm:flex-row">
            <Link href="/advertiser" className="btn btn-primary text-lg">
              Run an ad campaign
            </Link>
            <Link href="/publisher" className="btn btn-outline text-lg">
              Earn as a site owner
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
