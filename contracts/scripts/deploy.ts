import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying SovAds Contracts...");

  // Get the contract factory
  const SovAdsManager = await ethers.getContractFactory("SovAdsManager");
  const [deployer] = await ethers.getSigners();
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;

  // Deploy the contract
  console.log("📝 Deploying SovAdsManager...");
  console.log(`   Fee Recipient: ${feeRecipient}`);

  const sovAdsManager = await SovAdsManager.deploy(feeRecipient);
  await sovAdsManager.deployed();

  console.log("✅ SovAdsManager deployed to:", sovAdsManager.address);

  // Add default supported tokens based on network
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;

  console.log(`\n🔧 Adding supported tokens for ChainID: ${chainId}...`);

  const NETWORK_CONFIG: any = {
    // Celo Mainnet
    42220: {
      name: "Celo Mainnet",
      tokens: {
        cUSD: "0x765DE816845861e75A25fCA122bb6898B8B1282A",
        USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
        USDT: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
        CELO: "0x471EcE3750Da237f93B8E339c536989b8978a438",
      }
    },
    // Celo Sepolia
    11142220: {
      name: "Celo Sepolia",
      tokens: {
        cUSD: "0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80",
        USDC: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
        USDT: "0xd077A400968890Eacc75cdc901F0356c943e4fDb",
        CELO: "0x471EcE3750Da237f93B8E339c536989b8978a438",
      }
    },
    // Alfajores
    44787: {
      name: "Alfajores",
      tokens: {
        cUSD: "0x874069Fa1Eb16D44d13F0F66B92D3971647cE6c9",
        USDC: "0x2C852e740B62308c46DD29B982FBb650D063Bd07",
      }
    }
  };

  const config = NETWORK_CONFIG[chainId];
  if (config && config.tokens) {
    console.log(`📡 Network: ${config.name}`);
    for (const [name, address] of Object.entries(config.tokens)) {
      try {
        await sovAdsManager.addSupportedToken(address as string);
        console.log(`✅ Added ${name} (${address}) as supported token`);
      } catch (error: any) {
        console.warn(`⚠️  Failed to add ${name} (${address}):`, error.message || error);
      }
    }
  } else {
    console.warn(`⚠️  No token configuration found for ChainID: ${chainId}`);
  }

  // Set initial fee percentage (5% = 500 bps)
  await sovAdsManager.setFeeConfig(feeRecipient, 500);
  console.log("✅ Set protocol fee to 5% (500 bps)");

  // Check if SovAdsToken address is provided in env
  const SOV_TOKEN_ADDRESS = process.env.SOV_TOKEN_ADDRESS;
  if (SOV_TOKEN_ADDRESS) {
    console.log("\n🔧 Adding SovAds Token (SOV) as supported token...");
    try {
      await sovAdsManager.addSupportedToken(SOV_TOKEN_ADDRESS);
      console.log("✅ Added SOV token as supported token");
    } catch (error: any) {
      console.warn("⚠️  Failed to add SOV token (may already be added or invalid):", error.message || error);
    }
  }

  console.log("\n🎉 Deployment completed successfully!");
  console.log("📋 Contract Addresses:");
  console.log("   SovAdsManager:", sovAdsManager.address);

  if (config && config.tokens) {
    console.log(`\n📋 Supported Tokens (${config.name}):`);
    for (const [name, address] of Object.entries(config.tokens)) {
      console.log(`   ${name}: ${address}`);
    }
  }

  if (SOV_TOKEN_ADDRESS) {
    console.log("   SOV:", SOV_TOKEN_ADDRESS);
  }

  console.log("\n🔗 Network ChainID:", chainId);

  // Save deployment info
  const deploymentInfo = {
    network: config ? config.name : "unknown",
    chainId: chainId,
    contracts: {
      SovAdsManager: {
        address: sovAdsManager.address,
        deployedAt: new Date().toISOString(),
        supportedTokens: config ? config.tokens : {}
      }
    }
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
