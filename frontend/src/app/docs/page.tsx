'use client'

import { useState } from 'react'
import Link from 'next/link'

type Tab = 'publisher' | 'advertiser' | 'developer' | 'ai'

export default function DocsPage() {
    const [activeTab, setActiveTab] = useState<Tab>('publisher')

    return (
        <div className="min-h-screen bg-[#F5F3F0] text-black font-body">
            <div className="max-w-6xl mx-auto px-4 py-16 sm:py-24">
                {/* Header */}
                <div className="mb-16 text-center lg:text-left">
                    <h1 className="brutal-title text-6xl sm:text-8xl mb-6 uppercase tracking-tighter">
                        Protocol <span className="bg-black text-[#FBCC5C] px-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">Docs</span>
                    </h1>
                    <p className="text-xl font-bold border-l-8 border-black pl-6 max-w-2xl bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        Integrate, advertise, and build on the SovAds decentralized ad protocol.
                    </p>
                </div>

                {/* Tab Navigation */}
                <div className="flex flex-wrap gap-2 mb-12 border-b-4 border-black pb-4">
                    <button
                        onClick={() => setActiveTab('publisher')}
                        className={`px-6 py-3 text-lg font-heading uppercase transition-all border-2 border-black ${activeTab === 'publisher'
                            ? 'bg-black text-[#FBCC5C] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1'
                            : 'bg-white text-black hover:bg-gray-100'
                            }`}
                    >
                        I own a site (Publisher)
                    </button>
                    <button
                        onClick={() => setActiveTab('advertiser')}
                        className={`px-6 py-3 text-lg font-heading uppercase transition-all border-2 border-black ${activeTab === 'advertiser'
                            ? 'bg-black text-[#FBCC5C] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1'
                            : 'bg-white text-black hover:bg-gray-100'
                            }`}
                    >
                        I want to advertise
                    </button>
                    <button
                        onClick={() => setActiveTab('developer')}
                        className={`px-6 py-3 text-lg font-heading uppercase transition-all border-2 border-black ${activeTab === 'developer'
                            ? 'bg-black text-[#FBCC5C] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1'
                            : 'bg-white text-black hover:bg-gray-100'
                            }`}
                    >
                        Developer Reference
                    </button>
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`px-6 py-3 text-lg font-heading uppercase transition-all border-2 border-black ${activeTab === 'ai'
                            ? 'bg-black text-[#22C55E] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1'
                            : 'bg-white text-black hover:bg-gray-100'
                            }`}
                    >
                        AI Integration
                    </button>
                </div>

                {/* Content Area */}
                <div className="grid lg:grid-cols-[1fr,300px] gap-12">
                    <div className="space-y-12">
                        {activeTab === 'publisher' && <PublisherDocs />}
                        {activeTab === 'advertiser' && <AdvertiserDocs />}
                        {activeTab === 'developer' && <DeveloperDocs />}
                        {activeTab === 'ai' && <AIDocs />}
                    </div>

                    {/* Sidebar */}
                    <aside className="space-y-8">
                        <div className="card bg-black text-[#FBCC5C] p-6 rotate-1">
                            <h3 className="text-xl font-heading mb-4 uppercase">Quick Links</h3>
                            <ul className="space-y-3 text-sm font-bold uppercase text-white">
                                <li><Link href="/publisher" className="hover:underline hover:text-[#FBCC5C]">Register Site</Link></li>
                                <li><Link href="/advertiser" className="hover:underline hover:text-[#FBCC5C]">Launch Campaign</Link></li>
                                <li><Link href="/rewards" className="hover:underline hover:text-[#FBCC5C]">My Rewards</Link></li>
                                <li><a href="https://github.com/sovseas/sovads" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-[#FBCC5C]">GitHub</a></li>
                            </ul>
                        </div>

                        <div className="card bg-white text-black p-6 -rotate-1 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                            <h3 className="text-xl font-heading mb-4 uppercase">Support</h3>
                            <p className="text-xs font-bold leading-relaxed mb-4">
                                Need help with integration? Our team is available on Discord and Telegram.
                            </p>
                            <Link href="/contact" className="btn btn-primary w-full text-center py-2 text-sm">Contact Us</Link>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    )
}

function PublisherDocs() {
    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-4xl font-heading mb-8 uppercase underline decoration-8 underline-offset-8 decoration-[#FBCC5C]">Publisher Guide</h2>
            <div className="prose prose-lg max-w-none">
                <p className="text-xl font-bold mb-8 text-black">
                    Monetize your traffic with zero middlemen. Earn G$ or SovPoints for every verifiable impression.
                </p>

                <section className="space-y-10">
                    <div className="card p-8 bg-white border-4 border-black">
                        <h3 className="text-2xl font-heading mb-4 uppercase flex items-center gap-3 text-black">
                            <span className="w-10 h-10 bg-black text-[#FBCC5C] rounded-full flex items-center justify-center italic">1</span>
                            Site Registration
                        </h3>
                        <p className="font-bold text-gray-800 mb-4">
                            Head to the <Link href="/publisher" className="text-blue-700 underline font-black">Publisher Dashboard</Link> and connect your wallet. Register your domain to get your account verified.
                        </p>

                        <div className="bg-[#FBCC5C]/20 border-l-4 border-[#FBCC5C] p-4 mt-6">
                            <h4 className="text-sm font-heading uppercase mb-2 text-black">How to find your Site ID:</h4>
                            <p className="text-xs font-bold text-gray-900 leading-relaxed">
                                Once registered, look for the <strong className="bg-black text-white px-1">"Your Websites"</strong> section in the dashboard. Each site has a unique ID (e.g., <code>site_abc123...</code>). You will need this for the SDK integration.
                            </p>
                        </div>
                    </div>

                    <div className="card p-8 bg-white border-4 border-black relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-black text-[#FBCC5C] px-4 py-1 font-heading text-xs uppercase tracking-widest -rotate-2 translate-y-2 translate-x-2 shadow-md">
                            Recommended
                        </div>
                        <h3 className="text-2xl font-heading mb-4 uppercase flex items-center gap-3 text-black">
                            <span className="w-10 h-10 bg-black text-[#FBCC5C] rounded-full flex items-center justify-center italic">2</span>
                            Popup Setup (Best Performance)
                        </h3>
                        <p className="font-bold text-gray-800 mb-6">
                            Popups offer the highest engagement. They appear after a short delay and are non-intrusive.
                        </p>
                        <div className="bg-black p-4 rounded-lg font-mono text-sm mb-6 shadow-inner">
                            <div className="text-gray-500 mb-2">// 1. Import and Show</div>
                            <div className="text-blue-400">import <span className="text-white">{`{ SovAds, Popup }`}</span> from <span className="text-green-400">&apos;sovads-sdk&apos;</span></div>
                            <div className="text-[#FBCC5C] mt-2">const ads = new <span className="text-blue-300">SovAds</span>(<span className="text-white">{`{ `}</span><span className="text-green-400">siteId: &apos;YOUR_SITE_ID&apos;</span><span className="text-white">{` }`}</span>);</div>
                            <div className="text-[#FBCC5C]">const popup = new <span className="text-blue-300">Popup</span>(ads);</div>
                            <div className="text-[#FBCC5C] font-bold">await popup.show();</div>
                        </div>
                    </div>

                    <div className="card p-8 bg-white border-4 border-black">
                        <h3 className="text-2xl font-heading mb-4 uppercase flex items-center gap-3 text-black">
                            <span className="w-10 h-10 bg-black text-[#FBCC5C] rounded-full flex items-center justify-center italic">3</span>
                            Banner Setup
                        </h3>
                        <p className="font-bold text-gray-800 mb-6">
                            Standard banner ads for your headers, footers, or within content.
                        </p>
                        <div className="bg-black p-4 rounded-lg font-mono text-sm shadow-inner">
                            <div className="text-gray-500 mb-2">// HTML: &lt;div id=&quot;ad-container&quot;&gt;&lt;/div&gt;</div>
                            <div className="text-blue-400">import <span className="text-white">{`{ SovAds, Banner }`}</span> from <span className="text-green-400">&apos;sovads-sdk&apos;</span></div>
                            <div className="text-[#FBCC5C] mt-2">const ads = new <span className="text-blue-300">SovAds</span>(<span className="text-white">{`{ `}</span><span className="text-green-400">siteId: &apos;YOUR_SITE_ID&apos;</span><span className="text-white">{` }`}</span>);</div>
                            <div className="text-[#FBCC5C]">const banner = new <span className="text-blue-300">Banner</span>(ads, <span className="text-green-400">&apos;ad-container&apos;</span>);</div>
                            <div className="text-[#FBCC5C]">await banner.render();</div>
                        </div>
                    </div>

                    <div className="card p-8 bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        <h3 className="text-2xl font-heading mb-4 uppercase flex items-center gap-3 text-black">
                            <span className="w-10 h-10 bg-black text-[#FBCC5C] rounded-full flex items-center justify-center italic">4</span>
                            Sidebar & BottomBar
                        </h3>
                        <div className="grid md:grid-cols-2 gap-8">
                            <div>
                                <h4 className="font-heading uppercase text-sm mb-2 text-black bg-[#FBCC5C] inline-block px-1">Sidebar</h4>
                                <p className="text-xs font-bold mb-4">Vertical ads for your side navigation.</p>
                                <div className="bg-black p-3 rounded font-mono text-[10px] text-blue-300">
                                    const side = new Sidebar(ads, &apos;side-id&apos;);<br />
                                    await side.render();
                                </div>
                            </div>
                            <div>
                                <h4 className="font-heading uppercase text-sm mb-2 text-black bg-[#FBCC5C] inline-block px-1">BottomBar</h4>
                                <p className="text-xs font-bold mb-4">Floating bar fixed at the bottom.</p>
                                <div className="bg-black p-3 rounded font-mono text-[10px] text-blue-300">
                                    const bar = new BottomBar(ads);<br />
                                    await bar.show();
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card p-8 bg-white text-black border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        <h3 className="text-2xl font-heading mb-4 uppercase underline decoration-4 decoration-[#FBCC5C] underline-offset-4">Earning Mechanics</h3>
                        <div className="grid sm:grid-cols-2 gap-8">
                            <div>
                                <h4 className="font-heading uppercase text-sm mb-2 text-black bg-[#FBCC5C] inline-block px-1">Payouts</h4>
                                <p className="text-xs leading-relaxed font-bold">
                                    Funds are streamed to your wallet based on aggregated analytics proofs. Withdraw G$ or SOV anytime.
                                </p>
                            </div>
                            <div>
                                <h4 className="font-heading uppercase text-sm mb-2 text-black bg-[#FBCC5C] inline-block px-1">Fees</h4>
                                <p className="text-xs leading-relaxed font-bold">
                                    The protocol takes a flat 10% fee to fund the SovPoints rewards pool for viewers.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}

function AdvertiserDocs() {
    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-4xl font-heading mb-8 uppercase underline decoration-8 underline-offset-8 decoration-blue-500">Advertiser Guide</h2>
            <div className="prose prose-lg max-w-none">
                <p className="text-xl font-bold mb-8 text-black">
                    Direct-to-consumer on-chain advertising. Pay for audited reach, not bot traffic.
                </p>

                <section className="space-y-10">
                    <div className="card p-8 bg-white border-4 border-black">
                        <h3 className="text-2xl font-heading mb-4 uppercase text-black">Campaign Lifecycle</h3>
                        <div className="space-y-6">
                            <div className="flex gap-4">
                                <div className="shrink-0 w-12 h-12 border-4 border-black flex items-center justify-center font-bold bg-black text-[#FBCC5C]">A</div>
                                <div>
                                    <h4 className="font-heading uppercase text-sm text-black">Create & Fund</h4>
                                    <p className="text-xs font-bold text-gray-700">Deposit G$ and define your budget. Your campaign is anchored to Celo mainnet.</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="shrink-0 w-12 h-12 border-4 border-black flex items-center justify-center font-bold bg-black text-[#FBCC5C]">B</div>
                                <div>
                                    <h4 className="font-heading uppercase text-sm text-black">Verification</h4>
                                    <p className="text-xs font-bold text-gray-700">Admins review your creative for safety. Once approved, it enters the delivery pool.</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="shrink-0 w-12 h-12 border-4 border-black flex items-center justify-center font-bold bg-black text-[#FBCC5C]">C</div>
                                <div>
                                    <h4 className="font-heading uppercase text-sm text-black">Delivery & Tracking</h4>
                                    <p className="text-xs font-bold text-gray-700">Ads are served across registered sites. Detailed metrics are available in your portal.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card p-8 bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <h3 className="text-2xl font-heading mb-6 uppercase text-black">Creative Standards</h3>
                        <table className="w-full text-left text-sm font-bold border-collapse">
                            <thead>
                                <tr className="border-b-4 border-black">
                                    <th className="py-2 text-black">Format</th>
                                    <th className="py-2 text-black">Specs</th>
                                    <th className="py-2 text-black">Max Size</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-300">
                                <tr className="text-gray-800">
                                    <td className="py-3">Banner</td>
                                    <td className="py-3">728 x 90px</td>
                                    <td className="py-3">500KB</td>
                                </tr>
                                <tr className="text-gray-800">
                                    <td className="py-3">Rectangle</td>
                                    <td className="py-3">300 x 250px</td>
                                    <td className="py-3">500KB</td>
                                </tr>
                                <tr className="text-gray-800">
                                    <td className="py-3">Sidebar</td>
                                    <td className="py-3">160 x 600px</td>
                                    <td className="py-3">800KB</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    )
}

function DeveloperDocs() {
    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-4xl font-heading mb-8 uppercase underline decoration-8 underline-offset-8 decoration-green-500">Developer Reference</h2>
            <div className="prose prose-lg max-w-none space-y-12">
                <section>
                    <h3 className="text-2xl font-heading mb-4 uppercase text-black">SDK API Reference</h3>
                    <div className="bg-black text-white p-8 rounded border-4 border-black shadow-[4px_4px_0px_0px_rgba(34,197,94,0.2)] font-mono text-sm space-y-8">
                        <div>
                            <div className="text-[#FBCC5C] font-bold mb-1">new SovAds({`{ siteId, apiKey?, debug?, ... }`})</div>
                            <div className="text-gray-400 text-xs">Initializes the protocol client. Accepts a config object — <span className="text-white">siteId</span> is required for publishers. All other options are optional.</div>
                        </div>
                        <div>
                            <div className="text-[#FBCC5C] font-bold mb-1">ads.identify(walletAddress)</div>
                            <div className="text-gray-400 text-xs">Links the current device fingerprint to a wallet address for accurate attribution and SovPoints accrual.</div>
                        </div>
                        <div>
                            <div className="text-[#FBCC5C] font-bold mb-1">new Banner(ads, containerId, slotConfig?)</div>
                            <div className="text-gray-400 text-xs">Renders a banner ad into the specified DOM element ID.</div>
                        </div>
                        <div>
                            <div className="text-[#FBCC5C] font-bold mb-1">new Popup(ads)</div>
                            <div className="text-gray-400 text-xs">Creates a non-intrusive popup ad. Frequency-capped — respects session limits and minimum interval between shows.</div>
                        </div>
                        <div>
                            <div className="text-[#FBCC5C] font-bold mb-1">new Sidebar(ads, containerId)</div>
                            <div className="text-gray-400 text-xs">Renders a vertical sidebar ad into the specified container.</div>
                        </div>
                        <div>
                            <div className="text-[#FBCC5C] font-bold mb-1">new BottomBar(ads)</div>
                            <div className="text-gray-400 text-xs">Renders a floating bar fixed at the bottom of the viewport.</div>
                        </div>
                    </div>
                </section>

                <section className="card p-8 bg-white border-4 border-black">
                    <h3 className="text-2xl font-heading mb-4 uppercase text-black">Protocol Architecture</h3>
                    <div className="space-y-4 text-sm font-bold leading-relaxed text-gray-800">
                        <p>
                            SovAds uses a <span className="bg-[#FBCC5C] text-black px-1">Hybrid L2 pattern</span>:
                        </p>
                        <ol className="list-decimal pl-6 space-y-4">
                            <li>
                                <strong>Event Generation:</strong> Users interact with ads via the SDK.
                            </li>
                            <li>
                                <strong>Off-chain Aggregation:</strong> Our gateway validates and aggregates events, preventing sybil attacks.
                            </li>
                            <li>
                                <strong>Blockchain Settlement:</strong> The protocol anchors a Merkle root of activity to the <strong>SovAdsManager</strong> contract on Celo.
                            </li>
                            <li>
                                <strong>Payouts:</strong> Users and Publishers claim rewards using Merkle proofs verified against the on-chain root.
                            </li>
                        </ol>
                    </div>
                </section>
            </div>
        </div>
    )
}
function AIDocs() {
    const prompt = "read ads.sovseas.xyz/llm.txt and implement banner ads in my site"

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        alert('Copied to clipboard!')
    }

    const copyLlmTxt = async () => {
        try {
            const res = await fetch('/llm.txt')
            const text = await res.text()
            navigator.clipboard.writeText(text)
            alert('llm.txt content copied to clipboard!')
        } catch (err) {
            alert('Failed to copy llm.txt')
        }
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-10">
            <h2 className="text-4xl font-heading mb-8 uppercase underline decoration-8 underline-offset-8 decoration-[#22C55E]">AI Integration</h2>

            <div className="card p-8 bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-2xl font-heading mb-4 uppercase text-black">LLM-First Integration</h3>
                <p className="font-bold text-gray-800 mb-6">
                    Our protocol is optimized for LLM assistance. You can ask any AI agent to handle the integration for you using our standard configuration.
                </p>

                <div className="bg-neutral-900 p-6 rounded-lg border-2 border-black mb-6">
                    <h4 className="text-[#22C55E] font-heading uppercase text-xs mb-3">Copy this prompt to your AI:</h4>
                    <div className="bg-black text-white p-4 rounded border border-neutral-700 font-mono text-sm mb-4">
                        &quot;{prompt}&quot;
                    </div>
                    <button
                        onClick={() => copyToClipboard(prompt)}
                        className="bg-[#22C55E] text-black px-6 py-2 font-heading uppercase text-sm border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-2px] transition-transform active:translate-y-[0px]"
                    >
                        Copy Prompt
                    </button>
                </div>

                <div className="space-y-4">
                    <h4 className="font-heading uppercase text-sm text-black">What is llm.txt?</h4>
                    <p className="text-xs font-bold leading-relaxed text-gray-700">
                        The <code>/llm.txt</code> file is a standard way to provide high-density context to LLMs like ChatGPT, Claude, and Gemini. It allows them to understand our SDK perfectly without reading pages of docs.
                    </p>
                    <button
                        onClick={copyLlmTxt}
                        className="btn btn-primary text-xs py-2 px-4"
                    >
                        Copy llm.txt Content
                    </button>
                </div>
            </div>

            <div className="card p-8 bg-black text-white border-4 border-black rotate-1">
                <h3 className="text-2xl font-heading mb-4 uppercase text-[#22C55E]">Pro Tip</h3>
                <p className="text-sm font-bold opacity-90">
                    If you use an IDE with AI (like Cursor, Windsurf, or Copilot), just point it to <code>https://ads.sovseas.xyz/llm.txt</code> and it will know exactly how to implement any ad format.
                </p>
            </div>
        </div>
    )
}
