import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying SovAdsToken with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy SovAdsToken
  const SovAdsToken = await ethers.getContractFactory("SovAdsToken");
  const token = await SovAdsToken.deploy();

  await token.waitForDeployment();

  const tokenAddress = await token.getAddress();
  console.log("SovAdsToken deployed to:", tokenAddress);

  // Get token info
  const name = await token.name();
  const symbol = await token.symbol();
  const totalSupply = await token.totalSupply();
  const maxSupply = await token.maxSupply();

  console.log("\nToken Details:");
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Total Supply:", ethers.formatEther(totalSupply), symbol);
  console.log("Max Supply:", ethers.formatEther(maxSupply), symbol);
  console.log("Decimals: 18");

  // Save deployment info
  const deploymentInfo = {
    network: "celoSepolia",
    address: tokenAddress,
    name,
    symbol,
    decimals: 18,
    totalSupply: totalSupply.toString(),
    maxSupply: maxSupply.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  console.log("\nDeployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  console.log("\n✅ Deployment complete!");
  console.log("\nNext steps:");
  console.log("1. Add token to SovAdsManager supported tokens");
  console.log("2. Update frontend token configuration");
  console.log("3. Verify contract on block explorer");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

