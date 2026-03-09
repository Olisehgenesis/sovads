import { ethers, run } from "hardhat";

async function main() {
  const streamingAddress = process.argv[2];

  if (!streamingAddress) {
    console.error("❌ Please provide SovAdsStreaming address");
    console.log("Usage: npx hardhat run scripts/verify.ts --network <network> <streaming-address>");
    process.exit(1);
  }

  console.log("🌐 Network:", await ethers.provider.getNetwork());

  console.log("\n🔍 Verifying SovAdsStreaming at:", streamingAddress);
  try {
    await run("verify:verify", {
      address: streamingAddress,
    });
    console.log("✅ SovAdsStreaming verified successfully!");
  } catch (error: any) {
    if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
      console.log("✅ SovAdsStreaming already verified");
    } else {
      console.error("❌ Verification failed for SovAdsStreaming:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
