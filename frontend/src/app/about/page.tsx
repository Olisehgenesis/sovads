import React from 'react'
import Link from 'next/link'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <div className="max-w-4xl">
          {/* Header Section */}
          <div className="mb-16">
            <h1 className="brutal-title text-6xl sm:text-8xl">
              About <span className="text-white bg-black px-4">SovAds</span>
            </h1>
            <p className="text-xl font-bold text-black border-l-8 border-black pl-6 py-2 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-w-2xl">
              A transparent, decentralized ad protocol where attention is valued and rewards are distributed fairly.
            </p>
          </div>

          {/* Vision Section */}
          <div className="grid md:grid-cols-2 gap-8 mb-20">
            <div className="card p-8 bg-white rotate-1 hover:rotate-0 transition-transform">
              <h2 className="text-3xl font-heading mb-6 uppercase">The Protocol</h2>
              <p className="font-bold text-lg leading-relaxed mb-4">
                SovAds is built to eliminate the middlemen and fraud that plague digital advertising.
              </p>
              <p className="text-sm font-bold text-gray-700">
                By using blockchain technology and verifiable proofs, we ensure that every impression is real, every click is valid, and every participant is rewarded.
              </p>
            </div>
            <div className="card p-8 bg-[#F5F3F0] -rotate-1 hover:rotate-0 transition-transform">
              <h2 className="text-3xl font-heading mb-6 uppercase">The Engine</h2>
              <p className="font-bold text-lg leading-relaxed mb-4">
                Powered by the Celo blockchain and G$ tokens.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 font-black text-sm uppercase">
                  <span className="h-2 w-2 bg-black"></span> Verifiable Reach
                </li>
                <li className="flex items-center gap-2 font-black text-sm uppercase">
                  <span className="h-2 w-2 bg-black"></span> Instant Payouts
                </li>
                <li className="flex items-center gap-2 font-black text-sm uppercase">
                  <span className="h-2 w-2 bg-black"></span> No Bot Traffic
                </li>
              </ul>
            </div>
          </div>

          {/* Roles Section */}
          <h3 className="text-4xl font-heading mb-12 uppercase text-center md:text-left">How it works</h3>
          <div className="grid sm:grid-cols-3 gap-6 mb-20">
            {[
              {
                title: 'Viewers',
                desc: 'Earn SovPoints automatically for your attention.',
                points: '1 Point / View',
                color: 'bg-white'
              },
              {
                title: 'Publishers',
                desc: 'Monetize your site with zero platform fees.',
                points: 'G$ Earnings',
                color: 'bg-white'
              },
              {
                title: 'Advertisers',
                desc: 'Launch transparent, high-impact campaigns.',
                points: 'Verifiable Reach',
                color: 'bg-white'
              }
            ].map((role, i) => (
              <div key={i} className={`card p-6 ${role.color} border-4 border-black transition-all hover:-translate-y-2`}>
                <h4 className="text-xl font-heading mb-4 uppercase bg-black text-white inline-block px-2">{role.title}</h4>
                <p className="font-bold text-sm mb-6">{role.desc}</p>
                <div className="text-xs font-black uppercase tracking-tighter border-t-2 border-black pt-4">
                  {role.points}
                </div>
              </div>
            ))}
          </div>

          {/* CTA Section */}
          <div className="border-4 border-black bg-black text-white p-12 text-center shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-4xl font-heading mb-6 uppercase">Ready to get started?</h2>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/docs" className="btn bg-white text-black hover:bg-[#F5F3F0] px-8 py-4">
                Read the Docs
              </Link>
              <Link href="/advertiser" className="btn border-white text-white hover:bg-white hover:text-black px-8 py-4">
                Launch Campaign
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

