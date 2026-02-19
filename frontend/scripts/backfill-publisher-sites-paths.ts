#!/usr/bin/env tsx

import { MongoClient } from 'mongodb'

type SiteDoc = {
  _id: string
  domain?: string
  host?: string
  pathPrefix?: string
  matchType?: 'PREFIX'
}

const normalizeHost = (value: string): string => {
  let normalized = value.trim().toLowerCase()
  normalized = normalized.replace(/^https?:\/\//, '')
  normalized = normalized.split('/')[0] ?? normalized
  if (normalized.startsWith('www.')) {
    normalized = normalized.substring(4)
  }
  if (normalized.includes(':') && !normalized.includes('mongodb')) {
    normalized = normalized.split(':')[0] ?? normalized
  }
  return normalized
}

async function run() {
  const uri = process.env.MONGODB_URI
  const dbName = process.env.MONGODB_DB || 'sovads'

  if (!uri) {
    throw new Error('MONGODB_URI is required')
  }

  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(dbName)
    const sitesCollection = db.collection<SiteDoc>('publisher_sites')

    const sites = await sitesCollection.find({}).toArray()
    let updated = 0

    for (const site of sites) {
      const fallbackDomain = String(site.host ?? site.domain ?? '').trim()
      const host = normalizeHost(fallbackDomain)
      if (!host) {
        continue
      }

      const nextPathPrefix = site.pathPrefix && site.pathPrefix.trim() ? site.pathPrefix : '/'
      const nextMatchType = site.matchType ?? 'PREFIX'

      const needsUpdate = site.host !== host || site.pathPrefix !== nextPathPrefix || site.matchType !== nextMatchType
      if (!needsUpdate) {
        continue
      }

      await sitesCollection.updateOne(
        { _id: site._id },
        {
          $set: {
            host,
            domain: host,
            pathPrefix: nextPathPrefix,
            matchType: nextMatchType,
            updatedAt: new Date(),
          },
        }
      )
      updated += 1
    }

    let duplicateGroups: Array<{ _id: { host: string; pathPrefix: string }; count: number; siteIds: string[] }> = []
    try {
      duplicateGroups = await sitesCollection.aggregate<{
        _id: { host: string; pathPrefix: string }
        count: number
        siteIds: string[]
      }>([
        { $group: { _id: { host: '$host', pathPrefix: '$pathPrefix' }, count: { $sum: 1 }, siteIds: { $push: '$_id' } } },
        { $match: { count: { $gt: 1 } } },
      ]).toArray()
    } catch (error) {
      console.error('Failed to compute duplicate host/pathPrefix groups:', error)
    }

    if (duplicateGroups.length === 0) {
      await sitesCollection.createIndex({ host: 1, pathPrefix: 1 }, { unique: true })
    } else {
      console.warn(
        `Skipping unique (host,pathPrefix) index because duplicate groups exist: ${duplicateGroups.length}`
      )
    }

    await sitesCollection.createIndex({ host: 1 })

    console.log(JSON.stringify({
      scanned: sites.length,
      updated,
      duplicateGroups: duplicateGroups.map((group) => ({
        host: group._id.host,
        pathPrefix: group._id.pathPrefix,
        count: group.count,
        siteIds: group.siteIds,
      })),
    }, null, 2))
  } finally {
    await client.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
