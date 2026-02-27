'use client'

import React from 'react'
import Link from 'next/link'

interface LoginModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
    if (!isOpen) return null

    const roles = [
        {
            title: 'Advertiser',
            description: 'Run targeted ad campaigns',
            link: '/advertiser',
            emoji: '📢',
            color: 'bg-white'
        },
        {
            title: 'Publisher',
            description: 'Monetize your website traffic',
            link: '/publisher',
            emoji: '🧑‍💻',
            color: 'bg-white'
        },
        {
            title: 'Rewards',
            description: 'View and redeem SovPoints',
            link: '/rewards',
            emoji: '🎯',
            color: 'bg-[#F5F3F0]'
        }
    ]

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative w-full max-w-2xl bg-white border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] p-8 z-10">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-heading uppercase tracking-tighter">Choose Your Path</h2>
                    <button
                        onClick={onClose}
                        className="text-4xl font-heading hover:rotate-90 transition-transform"
                    >
                        ×
                    </button>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    {roles.map((role) => (
                        <Link
                            key={role.title}
                            href={role.link}
                            onClick={onClose}
                            className={`group relative card p-6 ${role.color} hover:-translate-y-2 transition-all flex flex-col h-full`}
                        >
                            <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">{role.emoji}</div>
                            <h3 className="text-xl font-heading mb-2 uppercase">{role.title}</h3>
                            <p className="text-xs font-bold text-black uppercase leading-tight mb-4 flex-grow opacity-60">
                                {role.description}
                            </p>
                            <div className="text-xs font-heading underline decoration-2 underline-offset-4 group-hover:bg-yellow-100 px-1 whitespace-nowrap transition-all">
                                Enter Dashboard →
                            </div>
                        </Link>
                    ))}
                </div>

                <div className="mt-10 pt-6 border-t-4 border-black text-center">
                    <p className="text-[10px] font-heading uppercase tracking-widest text-gray-500">
                        Secure On-Chain Identity Verified via Wallet
                    </p>
                </div>
            </div>
        </div>
    )
}
