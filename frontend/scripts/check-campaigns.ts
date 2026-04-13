
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const campaigns = await prisma.campaign.findMany({
    where: { active: true },
  })

  console.log(`Total active campaigns: ${campaigns.length}`)
  campaigns.forEach(c => {
    console.log(`- ID: ${c.id}, Name: ${c.name}, Budget: ${c.budget}, Spent: ${c.spent}, Active: ${c.active}`)
  })

  const allCampaigns = await prisma.campaign.findMany()
  console.log(`Total campaigns: ${allCampaigns.length}`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
