import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("SovAdsManager Unified", function () {
  let sovAdsManager: Contract;
  let mockToken: Contract;
  let owner: SignerWithAddress;
  let advertiser: SignerWithAddress;
  let publisher: SignerWithAddress;
  let viewer: SignerWithAddress;
  let admin: SignerWithAddress;
  let feeRecipient: SignerWithAddress;

  beforeEach(async function () {
    [owner, advertiser, publisher, viewer, admin, feeRecipient] = await ethers.getSigners();

    // Deploy Mock Token
    const MockToken = await ethers.getContractFactory("SovAdsToken"); // Using existing token as mock
    mockToken = await MockToken.deploy();
    await mockToken.deployed();

    // Deploy SovAdsManager
    const SovAdsManager = await ethers.getContractFactory("SovAdsManager");
    sovAdsManager = await SovAdsManager.deploy(feeRecipient.address);
    await sovAdsManager.deployed();

    // Setup
    await sovAdsManager.addSupportedToken(mockToken.address);
    await sovAdsManager.setAdmin(admin.address, true);

    // Transfer some tokens to advertiser
    await mockToken.transfer(advertiser.address, ethers.utils.parseEther("1000"));
    await mockToken.connect(advertiser).approve(sovAdsManager.address, ethers.utils.parseEther("1000"));
  });

  describe("Campaigns", function () {
    it("Should create a campaign", async function () {
      const amount = ethers.utils.parseEther("100");
      const duration = 86400;
      const metadata = "ipfs://campaign-metadata";

      await expect(sovAdsManager.connect(advertiser).createCampaign(
        mockToken.address,
        amount,
        duration,
        metadata
      )).to.emit(sovAdsManager, "CampaignCreated")
        .withArgs(1, advertiser.address, mockToken.address, amount);

      const campaign = await sovAdsManager.campaigns(1);
      expect(campaign.creator).to.equal(advertiser.address);
      expect(campaign.active).to.be.true;
    });

    it("Should top up a campaign", async function () {
      await sovAdsManager.connect(advertiser).createCampaign(
        mockToken.address,
        ethers.utils.parseEther("100"),
        86400,
        "metadata"
      );

      const topUpAmount = ethers.utils.parseEther("50");
      await expect(sovAdsManager.connect(advertiser).topUpCampaign(1, topUpAmount))
        .to.emit(sovAdsManager, "CampaignFunded")
        .withArgs(1, topUpAmount);

      const vault = await sovAdsManager.getCampaignVault(1);
      expect(vault.totalFunded).to.equal(ethers.utils.parseEther("150"));
    });
  });

  describe("Publishers", function () {
    it("Should subscribe a publisher", async function () {
      const sites = ["site1.com", "site2.com"];
      await expect(sovAdsManager.connect(publisher).subscribePublisher(sites))
        .to.emit(sovAdsManager, "PublisherSubscribed")
        .withArgs(publisher.address, sites);

      expect(await sovAdsManager.isPublisher(publisher.address)).to.be.true;
    });
  });

  describe("Interactions & Claims", function () {
    beforeEach(async function () {
      await sovAdsManager.connect(advertiser).createCampaign(
        mockToken.address,
        ethers.utils.parseEther("100"),
        86400,
        "metadata"
      );
      await sovAdsManager.connect(publisher).subscribePublisher(["site1.com"]);
    });

    it("Should record interactions and allow claiming", async function () {
      // Admin records 10 impressions for the viewer via the publisher (wait, contract doesn't track publisher in interaction yet, just user)
      // Actually recorded per campaign per user.
      await sovAdsManager.connect(admin).recordInteraction(1, viewer.address, 10, "IMPRESSION");

      const [accrued] = await sovAdsManager.getBalanceInfo(1, viewer.address);
      const impressionRate = await sovAdsManager.impressionRate();
      expect(accrued).to.equal(impressionRate.mul(10));

      // Create claim
      const claimAmount = accrued;
      await expect(sovAdsManager.connect(viewer).createClaim(1, claimAmount))
        .to.emit(sovAdsManager, "ClaimCreated")
        .withArgs(1, 1, viewer.address, claimAmount);

      // Process claim
      const initialBalance = await mockToken.balanceOf(viewer.address);
      const feePercent = await sovAdsManager.feePercent();
      const fee = claimAmount.mul(feePercent).div(10000);
      const netAmount = claimAmount.sub(fee);

      await expect(sovAdsManager.connect(admin).processClaim(1, true))
        .to.emit(sovAdsManager, "ClaimProcessed")
        .withArgs(1, viewer.address, claimAmount, true);

      expect(await mockToken.balanceOf(viewer.address)).to.equal(initialBalance.add(netAmount));
      expect(await mockToken.balanceOf(feeRecipient.address)).to.equal(fee);
    });
  });

  describe("Admin", function () {
    it("Should set rates", async function () {
      const newImpressionRate = ethers.utils.parseEther("0.01");
      const newClickRate = ethers.utils.parseEther("0.05");

      await expect(sovAdsManager.connect(owner).setRates(newImpressionRate, newClickRate))
        .to.emit(sovAdsManager, "RateUpdated")
        .withArgs("IMPRESSION", newImpressionRate);

      expect(await sovAdsManager.impressionRate()).to.equal(newImpressionRate);
      expect(await sovAdsManager.clickRate()).to.equal(newClickRate);
    });

    it("Should set fee config", async function () {
      const newRecipient = advertiser.address;
      const newBps = 1000; // 10%

      await sovAdsManager.connect(owner).setFeeConfig(newRecipient, newBps);

      expect(await sovAdsManager.feeRecipient()).to.equal(newRecipient);
      expect(await sovAdsManager.feePercent()).to.equal(newBps);
    });
  });
});
