import { MongoClient } from 'mongodb'

async function main() {
  const uri = process.env.MONGODB_URI!
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db('sovads')

  // Check events by the user's siteIds
  const siteIds = [
    'site_44af5dc1-3963-4ebe-ac37-f66dd8c2afc7_0',
    'site_44af5dc1-3963-4ebe-ac37-f66dd8c2afc7_1',
    'site_44af5dc1-3963-4ebe-ac37-f66dd8c2afc7_2',
    'site_44af5dc1-3963-4ebe-ac37-f66dd8c2afc7_3',
  ]
  const evBysite = await db.collection('events').countDocuments({ siteId: { $in: siteIds } })
  console.log('Events by siteId for our publisher:', evBysite)

  // Check publisher_sites for our publisher
  const sites = await db.collection('publisher_sites').find({ publisherId: '44af5dc1-3963-4ebe-ac37-f66dd8c2afc7' }).toArray()
  console.log('Publisher sites in DB:', JSON.stringify(sites.map((s: Record<string, unknown>) => ({ siteId: s.siteId, domain: s.domain, host: s.host })), null, 2))

  // Check all campaigns
  const campaigns = await db.collection('campaigns').find({}).project({ _id: 1, name: 1, active: 1, advertiserId: 1 }).toArray()
  console.log('Campaigns:', JSON.stringify(campaigns, null, 2))

  // Check viewer_points for our wallet
  const vp = await db.collection('viewer_points').findOne({ wallet: '0x53eaf4cd171842d8144e45211308e5d90b4b0088' })
  console.log('Viewer points:', JSON.stringify(vp))

  await client.close()
}

main().catch(console.error)
