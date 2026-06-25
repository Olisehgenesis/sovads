'use client'

/**
 * Shared dark code snippet panel.
 *
 * Used on the marketing home page and on the publisher Integration section so
 * the SDK install example reads identically in both surfaces.
 *
 * - `chrome="window"` adds the macOS-style traffic lights + filename strip.
 * - `chrome="plain"` is just the dark pane (no chrome). Default.
 * - Pass `onCopy` to show a copy button in the top right.
 */

import { useState } from 'react'

type Props = {
  code: string
  filename?: string
  chrome?: 'plain' | 'window'
  className?: string
  /** Optional custom copy handler. If omitted, the component uses navigator.clipboard. */
  onCopy?: (code: string) => void
}

export default function CodeSnippet({ code, filename, chrome = 'plain', className = '', onCopy }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (onCopy) {
      onCopy(code)
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(code)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (chrome === 'window') {
    return (
      <div className={`relative border border-[#2D2D2D] bg-white shadow-[6px_6px_0_0_#2D2D2D] ${className}`}>
        <div className="flex items-center gap-2 border-b border-[#2D2D2D] bg-[#F4F4F2] px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          {filename ? (
            <span className="ml-2 font-mono text-[12px] font-semibold text-[#2D2D2D]">{filename}</span>
          ) : null}
          <button
            type="button"
            onClick={handleCopy}
            className="ml-auto text-[11px] font-semibold text-[#666] hover:text-[#2D2D2D]"
            aria-label="Copy code snippet"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="overflow-x-auto bg-[#1F1F1F] p-5 text-[13px] leading-6 text-[#F4F4F2]">
          <code className="font-mono">{code}</code>
        </pre>
      </div>
    )
  }

  return (
    <div className={`relative border border-[#2D2D2D] bg-[#1F1F1F] ${className}`}>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 border border-[#3A3A3A] bg-[#1F1F1F]/80 px-2 py-0.5 text-[11px] font-semibold text-[#C9C9C9] backdrop-blur hover:bg-[#2A2A2A]"
        aria-label="Copy code snippet"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto p-4 text-[12px] leading-5 text-[#F4F4F2]">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}
