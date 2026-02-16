import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying SovAds Contracts to Celo mainnet...");

  const SovAdsManager = await ethers.getContractFactory("SovAdsManager");

  console.log("📝 Deploying SovAdsManager...");
  const sovAdsManager = await SovAdsManager.deploy();
  await sovAdsManager.deployed();

  console.log("✅ SovAdsManager deployed to:", sovAdsManager.address);

  console.log("🔧 Adding supported tokens (Celo mainnet)...");

  // ERC20 token addresses on Celo mainnet (from Celo docs)
  const CUSD_MAINNET = "0x765DE816845861e75A25fCA122bb6898B8B1282a"; // Mento Dollar (cUSD)
  const USDC_MAINNET = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C"; // USDC on Celo
  const USDT_MAINNET = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"; // USDT on Celo
  const CELO_WRAPPED = "0x471EcE3750Da237f93B8E339c536989b8978a438"; // wCELO / canonical wrapper

  // Add supported tokens
  try {
    await sovAdsManager.addSupportedToken(CUSD_MAINNET);
    console.log("✅ Added cUSD (Mainnet) as supported token");
  } catch (e) {
    console.warn("⚠️ Failed to add cUSD (may already be added):", e);
  }

  try {
    await sovAdsManager.addSupportedToken(USDC_MAINNET);
    console.log("✅ Added USDC (Mainnet) as supported token");
  } catch (e) {
    console.warn("⚠️ Failed to add USDC (may already be added):", e);
  }

  try {
    await sovAdsManager.addSupportedToken(USDT_MAINNET);
    console.log("✅ Added USDT (Mainnet) as supported token");
  } catch (e) {
    console.warn("⚠️ Failed to add USDT (may already be added):", e);
  }

  try {
    await sovAdsManager.addSupportedToken(CELO_WRAPPED);
    console.log("✅ Added CELO (wrapped) as supported token");
  } catch (e) {
    console.warn("⚠️ Failed to add CELO (may already be added):", e);
  }

  // Set initial fee percentage (5%)
  try {
    await sovAdsManager.setFeePercent(5);
    console.log("✅ Set protocol fee to 5%");
  } catch (e) {
    console.warn("⚠️ Failed to set fee percent:", e);
  }

  // Optional SOV token provided via env
  const SOV_TOKEN_ADDRESS = process.env.SOV_TOKEN_ADDRESS;
  if (SOV_TOKEN_ADDRESS) {
    console.log("\n🔧 Adding SovAds Token (SOV) as supported token...");
    try {
      await sovAdsManager.addSupportedToken(SOV_TOKEN_ADDRESS);
      console.log("✅ Added SOV token as supported token");
    } catch (error) {
      console.warn("⚠️  Failed to add SOV token (may already be added or invalid):", error);
    }
  }

  console.log("\n🎉 Deployment completed successfully!");
  console.log("📋 Contract Addresses:");
  console.log("   SovAdsManager:", sovAdsManager.address);
  if (SOV_TOKEN_ADDRESS) {
    console.log("   SovAdsToken:", SOV_TOKEN_ADDRESS);
  }

  console.log("\n📋 Supported Tokens (Mainnet):");
  console.log("   cUSD:", CUSD_MAINNET);
  console.log("   USDC:", USDC_MAINNET);
  console.log("   USDT:", USDT_MAINNET);
  console.log("   CELO (wrapped):", CELO_WRAPPED);
  if (SOV_TOKEN_ADDRESS) {
    console.log("   SOV:", SOV_TOKEN_ADDRESS);
  }

  console.log("\n🔗 Network:", await ethers.provider.getNetwork());

  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId,
    contracts: {
      SovAdsManager: {
        address: sovAdsManager.address,
        deployedAt: new Date().toISOString(),
        supportedTokens: [CUSD_MAINNET, USDC_MAINNET, USDT_MAINNET, CELO_WRAPPED],
      },
    },
  };

  console.log("\n📄 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
