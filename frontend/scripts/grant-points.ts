import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const WALLET = "0x53eaF4CD171842d8144e45211308e5D90B4b0088";

async function main() {
  // Find existing viewer by wallet (case-insensitive)
  let viewer = await prisma.viewerPoints.findFirst({
    where: { wallet: { equals: WALLET, mode: "insensitive" } },
  });

  if (!viewer) {
    // Create new viewer
    viewer = await prisma.viewerPoints.create({
      data: {
        wallet: WALLET,
        fingerprint: "test-fingerprint-owner",
        totalPoints: 100,
        claimedPoints: 0,
        pendingPoints: 0,
      },
    });
    console.log("Created new viewer with 100 points:", viewer.id);
  } else {
    // Update existing viewer — add 100 points
    viewer = await prisma.viewerPoints.update({
      where: { id: viewer.id },
      data: { totalPoints: viewer.totalPoints + 100 },
    });
    console.log("Updated viewer, new totalPoints:", viewer.totalPoints);
  }

  // Also create a ViewerReward record so there's a history entry
  await prisma.viewerReward.create({
    data: {
      viewerId: viewer.id,
      wallet: WALLET,
      fingerprint: "test-fingerprint-owner",
      type: "test-grant",
      campaignId: "test-campaign",
      adId: "test-ad",
      siteId: "test-site",
      points: 100,
      claimed: false,
    },
  });
  console.log("Created reward entry for 100 points");

  // Show final state
  const final = await prisma.viewerPoints.findUnique({
    where: { id: viewer.id },
    include: { cashouts: true },
  });
  console.log("Final viewer state:", JSON.stringify(final, null, 2));
}

main().finally(() => prisma.$disconnect());
