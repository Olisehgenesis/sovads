import type { AdvertiserIconName } from './models'

export type AdvertiserSectionId = 'dashboard' | 'campaigns' | 'create' | 'analytics' | 'billing' | 'settings'

export interface AdvertiserSidebarItem {
  label: string
  icon: AdvertiserIconName
  sectionId?: AdvertiserSectionId
}

export const advertiserSidebarItems: AdvertiserSidebarItem[] = [
  { label: 'Dashboard', icon: 'dashboard', sectionId: 'dashboard' },
  { label: 'Campaigns', icon: 'campaign', sectionId: 'campaigns' },
  { label: 'New Campaign', icon: 'activate', sectionId: 'create' },
  { label: 'Analytics', icon: 'analytics', sectionId: 'analytics' },
  { label: 'Billing', icon: 'earnings', sectionId: 'billing' },
  { label: 'Settings', icon: 'settings', sectionId: 'settings' },
]

export const advertiserTheme = {
  primary: '#000000',
  background: '#F5F3F0',
  card: '#FFFFFF',
  textPrimary: '#141414',
  textSecondary: '#666666',
  border: '#000000',
  success: '#22c55e',
  warning: '#F59E0B',
  danger: '#ef4444',
  shadow: '4px 4px 0px 0px rgba(0,0,0,1)',
} as const