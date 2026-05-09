import { prisma } from '../src/lib/prisma'

async function main() {
  // Upsert a placeholder viewer entry
  const viewer = await prisma.viewerPoints.upsert({
    where: { fingerprint: 'seed-test-cashout' },
    update: {},
    create: {
      fingerprint: 'seed-test-cashout',
      totalPoints: 10400,
      claimedPoints: 10400,
      pendingPoints: 0,
    },
  })

  // Create a completed cashout entry of 10400 G$
  const cashout = await prisma.viewerCashout.create({
    data: {
      viewerId: viewer.id,
      wallet: '0x0000000000000000000000000000000000000001',
      amount: 10400,
      status: 'completed',
      redeemed: true,
      redeemedAt: new Date(),
    },
  })

  console.log('Created cashout:', cashout.id, '— amount:', cashout.amount, 'G$')
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
