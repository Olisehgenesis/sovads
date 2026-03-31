import Link from 'next/link'

export const metadata = {
  title: 'Contact',
  description: 'Get in touch with the SovAds team.',
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <div className="mb-16">
          <h1 className="brutal-title text-6xl sm:text-8xl">
            Contact <span className="text-white bg-black px-4">Us</span>
          </h1>
          <p className="text-xl font-bold text-black border-l-8 border-black pl-6 py-2 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-w-2xl mt-6">
            Questions, partnerships, or integration help — we&apos;re here.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-8 mb-16">
          <div className="card p-8 bg-white border-4 border-black rotate-1 hover:rotate-0 transition-transform">
            <div className="text-4xl mb-4">💬</div>
            <h2 className="text-2xl font-heading mb-3 uppercase">Discord</h2>
            <p className="font-bold text-sm text-gray-700 mb-6">
              Join our community server for real-time support and announcements.
            </p>
            <a
              href="https://discord.gg/sovseas"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary text-sm"
            >
              Join Discord →
            </a>
          </div>

          <div className="card p-8 bg-[#F5F3F0] border-4 border-black -rotate-1 hover:rotate-0 transition-transform">
            <div className="text-4xl mb-4">✈️</div>
            <h2 className="text-2xl font-heading mb-3 uppercase">Telegram</h2>
            <p className="font-bold text-sm text-gray-700 mb-6">
              Chat with the team and other publishers directly on Telegram.
            </p>
            <a
              href="https://t.me/sovseas"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline text-sm"
            >
              Open Telegram →
            </a>
          </div>
        </div>

        <div className="card p-8 bg-black text-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <h2 className="text-2xl font-heading mb-4 uppercase">Integration Help</h2>
          <p className="font-bold text-sm mb-6 opacity-80">
            Looking to integrate SovAds into your site? Check the docs first — most questions are answered there.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/docs" className="btn bg-white text-black hover:bg-[#F5F3F0] text-sm px-6 py-3">
              Read the Docs
            </Link>
            <a
              href="https://github.com/sovseas/sovads"
              target="_blank"
              rel="noopener noreferrer"
              className="btn border-white text-white hover:bg-white hover:text-black text-sm px-6 py-3"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
