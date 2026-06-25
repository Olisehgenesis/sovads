/**
 * Quick diagnostic: count every signal that could plausibly be "1009".
 * Helps figure out what the user is seeing on the dashboard vs. what's in DB.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const campaigns = await prisma.campaign.findMany({
    select: { id: true, name: true, budget: true, spent: true, cpc: true },
  })

  for (const c of campaigns) {
    const [impr, click, view, taskComp, sdkInter, allEvents] = await Promise.all([
      prisma.event.count({ where: { campaignId: c.id, type: 'IMPRESSION' } }),
      prisma.event.count({ where: { campaignId: c.id, type: 'CLICK' } }),
      prisma.event.count({ where: { campaignId: c.id, type: 'VIEW' } }),
      prisma.taskCompletion.count({ where: { task: { campaignId: c.id } } }),
      prisma.sdkInteraction.count({ where: { campaignId: c.id } }),
      prisma.event.count({ where: { campaignId: c.id } }),
    ])
    const eventTypes = await prisma.event.groupBy({
      by: ['type'],
      where: { campaignId: c.id },
      _count: { _all: true },
    })
    console.log(`\n■ ${c.name}  budget=${c.budget}  spent=${c.spent}  cpc=${c.cpc}`)
    console.log(`    Event totals: impressions=${impr}  clicks=${click}  views=${view}  ALL=${allEvents}`)
    console.log(`    Event types breakdown:`, eventTypes.map((e) => `${e.type}=${e._count._all}`).join(', '))
    console.log(`    TaskCompletion=${taskComp}  SdkInteraction=${sdkInter}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
