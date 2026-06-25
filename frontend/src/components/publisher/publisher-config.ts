import type { AdvertiserSidebarItem } from '../advertiser/advertiser-config'

import type { PublisherSectionId } from './models'

/**
 * Publisher sidebar items. The shape is intentionally identical to the
 * advertiser sidebar item — both use the shared `AdvertiserSidebar` /
 * `AdvertiserIcon` primitives so the two workspaces look like one product.
 *
 * `sectionId` is typed as a generic `string` on `AdvertiserSidebarItem`;
 * publisher consumers downcast it to `PublisherSectionId` at the boundary.
 */
export type PublisherSidebarItem = Omit<AdvertiserSidebarItem, 'sectionId'> & {
  sectionId?: PublisherSectionId
}

export const publisherSidebarItems: PublisherSidebarItem[] = [
  { label: 'Dashboard', icon: 'dashboard', sectionId: 'dashboard' },
  { label: 'Analytics', icon: 'analytics', sectionId: 'analytics' },
  { label: 'Websites', icon: 'websites', sectionId: 'websites' },
  { label: 'Integration', icon: 'copy', sectionId: 'integration' },
  { label: 'Earnings', icon: 'earnings', sectionId: 'earnings' },
  { label: 'Rewards', icon: 'rewards', sectionId: 'rewards' },
  { label: 'Settings', icon: 'settings', sectionId: 'settings' },
]
