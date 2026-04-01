'use client'

import PublisherIcon from './PublisherIcon'
import type { PublisherSectionId, PublisherSidebarItem } from './models'

export default function PublisherSidebar({
  items,
  activeSection,
  onSelect,
}: {
  items: PublisherSidebarItem[]
  activeSection: PublisherSectionId
  onSelect: (sectionId: PublisherSectionId) => void
}) {
  return (
    <aside className="lg:sticky lg:top-24 lg:h-fit">
      <nav>
        <ul className="space-y-px">
          {items.map((item) => {
            if (!item.sectionId) return null
            const isActive = item.sectionId === activeSection
            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => onSelect(item.sectionId!)}
                  className={[
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left text-[12px] font-semibold transition-colors duration-100',
                    isActive
                      ? 'bg-[#141414] text-white'
                      : 'text-[#666666] hover:bg-[#e8e6e3] hover:text-[#141414]',
                  ].join(' ')}
                >
                  <PublisherIcon
                    name={item.icon}
                    className={['h-4 w-4 flex-shrink-0 transition-colors', isActive ? 'text-white' : 'text-[#999999]'].join(' ')}
                  />
                  <span>{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
