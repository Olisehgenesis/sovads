'use client'

import Link from 'next/link'
import AdvertiserIcon from './AdvertiserIcon'
import type { AdvertiserSectionId, AdvertiserSidebarItem } from './advertiser-config'

interface Props {
  items: AdvertiserSidebarItem[]
  activeSection: AdvertiserSectionId
  onSelect: (sectionId: AdvertiserSectionId) => void
}

/**
 * Quiet vertical nav. The active item gets the brutalist accent (solid black
 * background); idle items are subtle so they don't compete with content.
 * Items with `href` render as <Link>; items with `sectionId` render as
 * <button> that flips the in-page section.
 */
export default function AdvertiserSidebar({ items, activeSection, onSelect }: Props) {
  return (
    <aside className="lg:sticky lg:top-24 lg:h-fit">
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#888888]">
        Workspace
      </p>
      <nav>
        <ul className="space-y-px">
          {items.map((item) => {
            const key = item.id ?? item.sectionId ?? item.href ?? item.label
            const isActive = !!item.sectionId && item.sectionId === activeSection
            const baseClasses = [
              'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
              isActive
                ? 'bg-[#2D2D2D] font-semibold text-white'
                : 'font-medium text-[#444444] hover:bg-[#EFEFEF] hover:text-[#2D2D2D]',
            ].join(' ')
            const iconClasses = [
              'h-4 w-4 flex-shrink-0',
              isActive ? 'text-white' : 'text-[#888888]',
            ].join(' ')
            return (
              <li key={key}>
                {item.href ? (
                  <Link href={item.href} className={baseClasses}>
                    <AdvertiserIcon name={item.icon} className={iconClasses} />
                    <span>{item.label}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => item.sectionId && onSelect(item.sectionId)}
                    className={baseClasses}
                  >
                    <AdvertiserIcon name={item.icon} className={iconClasses} />
                    <span>{item.label}</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
