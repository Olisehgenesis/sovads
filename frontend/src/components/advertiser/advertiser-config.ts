import type { AdvertiserIconName } from './models'

export type AdvertiserSectionId =
  | 'overview'
  | 'campaigns'
  | 'preview'
  | 'analytics'
  | 'billing'
  | 'settings'

export interface AdvertiserSidebarItem {
  label: string
  icon: AdvertiserIconName
  /** Internal section id. Required for in-page sections (no href). */
  sectionId?: AdvertiserSectionId
  /** When set, the sidebar item navigates to this route instead of switching section. */
  href?: string
  /** Stable id for the item (used as React key + selection). Defaults to sectionId or href. */
  id?: string
}

export const advertiserSidebarItems: AdvertiserSidebarItem[] = [
  { label: 'Overview', icon: 'dashboard', sectionId: 'overview' },
  { label: 'Campaigns', icon: 'campaign', sectionId: 'campaigns' },
  { label: 'Review', icon: 'inbox', href: '/advertiser/review', id: 'review' },
  { label: 'Preview', icon: 'preview', sectionId: 'preview' },
  { label: 'Analytics', icon: 'analytics', sectionId: 'analytics' },
  { label: 'Billing', icon: 'wallet', sectionId: 'billing' },
  { label: 'Settings', icon: 'settings', sectionId: 'settings' },
]
