import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'SovAds Docs',
      url: '/docs',
    },
    links: [
      {
        type: 'main',
        text: 'llms.txt',
        url: '/llms.txt',
        external: true,
        description: 'Compact protocol summary for AI assistants',
      },
      {
        type: 'main',
        text: 'Publisher',
        url: '/publisher',
        description: 'Register a site to get a siteId',
      },
      {
        type: 'main',
        text: 'Advertiser',
        url: '/advertiser',
        description: 'Launch a campaign on Celo',
      },
    ],
    githubUrl: 'https://github.com/sovseas/sovads',
  }
}
