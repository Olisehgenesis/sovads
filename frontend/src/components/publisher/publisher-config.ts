import type { PublisherSidebarItem } from './models'

export const publisherSidebarItems: PublisherSidebarItem[] = [
  { label: 'Dashboard', icon: 'dashboard', sectionId: 'dashboard' },
  { label: 'Analytics', icon: 'analytics', sectionId: 'analytics' },
  { label: 'Websites', icon: 'websites', sectionId: 'websites' },
  { label: 'Integration', icon: 'copy', sectionId: 'integration' },
  { label: 'Earnings', icon: 'earnings', sectionId: 'earnings' },
  { label: 'Rewards', icon: 'rewards', sectionId: 'rewards' },
  { label: 'Settings', icon: 'settings', sectionId: 'settings' },
]

export const publisherTheme = {
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
