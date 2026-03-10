import { ethers, upgrades } from "hardhat";

async function main() {
  console.log("🚀 Deploying SovAdsStreaming...");

  const [deployer] = await ethers.getSigners();
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;

  // Add default supported tokens based on network
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;

  // official GoodDollar token addresses on Celo networks
  const GOOD_DOLLAR_CELO_MAINNET = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";
  const GOOD_DOLLAR_ALFAJORES = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A"; // same on testnet

  const NETWORK_CONFIG: any = {
    42220: { name: "Celo Mainnet" },
    11142220: { name: "Celo Sepolia" },
    44787: { name: "Alfajores" }
  };

  const config = NETWORK_CONFIG[chainId];

  // allow manual override for testing (e.g. on hardhat network)
  let gTokenAddress = process.env.GOOD_DOLLAR_TOKEN || "";

  if (!gTokenAddress) {
    if (network.name === "celo" || chainId === 42220) {
      gTokenAddress = GOOD_DOLLAR_CELO_MAINNET;
    } else if (network.name === "alfajores" || chainId === 44787) {
      gTokenAddress = GOOD_DOLLAR_ALFAJORES;
    } else {
      gTokenAddress = ethers.constants.AddressZero;
    }
  }

  console.log("using GoodDollar token:", gTokenAddress);

  let sovAdsStreamingAddress = "";
  let sovAdsStreamingImpl = "";

  if (gTokenAddress === ethers.constants.AddressZero) {
    console.log("⚠️ Skipped SovAdsStreaming deployment due to missing G$ Token address for this network.");
    return;
  }

  const SovAdsStreaming = await ethers.getContractFactory("SovAdsStreaming");
  const sovAdsStreaming = await upgrades.deployProxy(
    SovAdsStreaming,
    [gTokenAddress, feeRecipient],
    { kind: 'uups' }
  );
  await sovAdsStreaming.deployed();
  sovAdsStreamingAddress = sovAdsStreaming.address;

  // fetch the implementation/logic contract address
  sovAdsStreamingImpl = await upgrades.erc1967.getImplementationAddress(
    sovAdsStreamingAddress
  );

  console.log("✅ SovAdsStreaming Proxy deployed to:", sovAdsStreamingAddress);
  console.log("🔧 Implementation contract at:", sovAdsStreamingImpl);

  console.log("\n📋 Final Contract Addresses:");
  console.log("   SovAdsStreaming:", sovAdsStreamingAddress);
  console.log("\n🔗 Network ChainID:", chainId);

  // Save deployment info
  const deploymentInfo = {
    network: config ? config.name : "unknown",
    chainId: chainId,
    goodDollarToken: gTokenAddress,
    contracts: {
      SovAdsStreaming: {
        proxy: sovAdsStreamingAddress,
        implementation: sovAdsStreamingImpl,
        deployedAt: new Date().toISOString()
      }
    }
  };

  console.log("\n📄 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Save to file
  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const fileName = chainId === 42220 ? "celo.json" : "alfajores.json";
  const filePath = path.join(deploymentsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n💾 Deployment info saved to: ${filePath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
