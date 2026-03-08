import { ethers, network, upgrades } from "hardhat";

// Superfluid GoodDollar (G$) Token Addresses
// See: https://docs.superfluid.org/superfluid/networks/networks
const GOOD_DOLLAR_CELO_MAINNET = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";
const GOOD_DOLLAR_ALFAJORES = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A"; // Same address on Alfajores

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Network:", network.name);

    let gTokenAddress = "";
    if (network.name === "celo") {
        gTokenAddress = GOOD_DOLLAR_CELO_MAINNET;
    } else if (network.name === "alfajores") {
        gTokenAddress = GOOD_DOLLAR_ALFAJORES;
    } else if (network.name === "hardhat" || network.name === "localhost") {
        console.warn("WARNING: Deploying to local network. Superfluid streams will fail unless you've setup a local Superfluid framework.");
        // For local testing, you'd typically deploy a mock ERC20 or use a local Superfluid deploy.
        gTokenAddress = ethers.constants.AddressZero;
    } else {
        throw new Error(`Unsupported network for Superfluid streaming: ${network.name}`);
    }

    // Admin receiver address for fee distribution
    // Set this to your desired treasury/admin address
    const adminAddress = process.env.ADMIN_ADDRESS || deployer.address;
    console.log("Admin Address configured to:", adminAddress);

    if (gTokenAddress === ethers.constants.AddressZero) {
        console.warn("Skipping deployment due to missing G$ Token address for this network.");
        return;
    }

    console.log("Deploying SovAdsStreaming as UUPS Proxy...");

    const SovAdsStreaming = await ethers.getContractFactory("SovAdsStreaming");
    const sovAdsStreaming = await upgrades.deployProxy(
        SovAdsStreaming,
        [gTokenAddress, adminAddress],
        { kind: 'uups' }
    );

    await sovAdsStreaming.deployed();

    console.log(`SovAdsStreaming Proxy deployed to: ${sovAdsStreaming.address}`);
    console.log(`Using G$ Token at: ${gTokenAddress}`);
    console.log(`Admin Fee/Stream Receiver: ${adminAddress}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
