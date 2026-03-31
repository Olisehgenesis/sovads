'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CampaignsFallbackPage({ params }: { params: { id: string[] } }) {
  const router = useRouter()
  const [resolvedId, setResolvedId] = useState<string | null>(null)

  useEffect(() => {
    const idParam = Array.isArray(params.id) ? params.id[0] : (params.id as unknown as string)
    if (!idParam) {
      router.replace('/admin/campaigns')
      return
    }
    setResolvedId(idParam)
    router.replace(`/admin/campaigns/${encodeURIComponent(idParam)}`)
  }, [params.id, router])

  return (
    <div className="p-6 text-center">
      <h1 className="text-xl font-bold">Redirecting to campaign details…</h1>
      <p className="mt-2 text-sm text-gray-500">If this does not redirect automatically, click the link below.</p>
      {resolvedId ? (
        <a className="mt-4 inline-block btn btn-outline" href={`/admin/campaigns/${encodeURIComponent(resolvedId)}`}>
          View campaign {resolvedId}
        </a>
      ) : null}
    </div>
  )
}
