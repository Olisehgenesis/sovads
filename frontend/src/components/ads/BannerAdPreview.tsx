'use client'

import { BannerAd } from './AdSlots'

type BannerAdPreviewProps = {
  siteId?: string
  consumerId?: string
  className?: string
  placeholder?: React.ReactNode
}

export default function BannerAdPreview(props: BannerAdPreviewProps) {
  return <BannerAd {...props} />
}

