import React from 'react'

export default function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto p-8 prose prose-invert">
      <h1>About SovAds</h1>
      <p>
        SovAds is a decentralized advertising platform where viewers can earn
        SOV points by interacting with ads, advertisers can fund campaigns, and
        publishers can monetize their traffic. The system tracks impressions and
        clicks using a secure webhook, awards points to viewers, and allows
        points to be redeemed for G$ tokens on the Celo blockchain.
      </p>
      <p>
        Points are earned automatically as users view or click on ads. Each
        impression is worth 1 SOV point and each click is worth 5 SOV points.
        Viewers may claim accumulated points by connecting a wallet, at which
        time the equivalent amount of G$ is disbursed from a global treasury
        campaign.
      </p>
      <p>
        Advertisers create campaigns with a cost-per-click (CPC) budget, and
        the system deducts spent funds on each click. Publishers receive earnings
        from clicks on their sites and can withdraw those earnings as G$ tokens.
      </p>
      <p>
        This about page is intended to give visitors a quick overview of how the
        SovAds platform works and the roles of different participants. For
        developers, additional documentation is available in the repository.
      </p>
    </main>
  )
}
