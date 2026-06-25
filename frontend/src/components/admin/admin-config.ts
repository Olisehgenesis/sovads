import type { AdvertiserIconName } from '@/components/advertiser/models'

export type AdminSectionId =
  | 'overview'
  | 'campaigns'
  | 'publishers'
  | 'advertisers'
  | 'system'
  | 'audit'

export interface AdminSidebarItem {
  label: string
  icon: AdvertiserIconName
  /** Internal section id. Required for in-page sections (no href). */
  sectionId?: AdminSectionId
  /** When set, the sidebar item navigates to this route instead of switching section. */
  href?: string
  /** Stable id for the item (used as React key + selection). Defaults to sectionId or href. */
  id?: string
}

export const adminSidebarItems: AdminSidebarItem[] = [
  { label: 'Overview', icon: 'dashboard', sectionId: 'overview' },
  { label: 'Campaigns', icon: 'campaign', sectionId: 'campaigns' },
  { label: 'Publishers', icon: 'websites', sectionId: 'publishers' },
  { label: 'Advertisers', icon: 'wallet', sectionId: 'advertisers' },
  { label: 'System', icon: 'settings', sectionId: 'system' },
  { label: 'Audit', icon: 'inbox', sectionId: 'audit' },
]
