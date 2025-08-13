const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Gas: single swap using DualDataQuoter", function () {
  it("reports exact gas usage", async function () {
    const [owner, lp, trader] = await ethers.getSigners();

    // Deploy tokens
    const TestTokenA = await ethers.getContractFactory("TestTokenA");
    const TestTokenB = await ethers.getContractFactory("TestTokenB");
    const tokenA = await TestTokenA.deploy();
    const tokenB = await TestTokenB.deploy();

    // Deploy data bridges
    const MockAlphaDataBridge = await ethers.getContractFactory("MockAlphaDataBridge");
    const MockBetaDataBridge = await ethers.getContractFactory("MockBetaDataBridge");
    const alphaBridge = await MockAlphaDataBridge.deploy(
      ethers.parseEther("1.3"),
      ethers.parseEther("1.28")
    );
    const betaBridge = await MockBetaDataBridge.deploy(
      ethers.parseEther("1.32")
    );

    // Deploy DualDataQuoter
    const DualDataQuoter = await ethers.getContractFactory("DualDataQuoter");
    const dualQuoter = await DualDataQuoter.deploy();

    // Deploy PoolManager with defaults pointing to bridges
    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(
      await alphaBridge.getAddress(),
      await betaBridge.getAddress()
    );

    // Mint & approve
    const SUPPLY = ethers.parseEther("2000000");
    for (const u of [lp, trader]) {
      await tokenA.mint(u.address, SUPPLY);
      await tokenB.mint(u.address, SUPPLY);
      await tokenA.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
      await tokenB.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
    }

    // Create pool with dual quoter
    const DUAL = "0x00000F"; // dual data, defaults enabled
    await poolManager
      .connect(lp)
      .createPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await dualQuoter.getAddress(),
        DUAL
      );

    // Add liquidity
    const L0 = ethers.parseEther("1000");
    const L1 = ethers.parseEther("1300");
    await poolManager
      .connect(lp)
      .addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await dualQuoter.getAddress(),
        DUAL,
        L0,
        L1
      );

    // Single swap: A -> B using DualDataQuoter
    const SWAP = ethers.parseEther("10");
    const tx = await poolManager
      .connect(trader)
      .swap(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await dualQuoter.getAddress(),
        DUAL,
        SWAP,
        true,
        ethers.parseEther("12")
      );
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed;

    console.log("\n=== DualDataQuoter single swap gas ===");
    console.log("Gas used:", gasUsed.toString());

    expect(gasUsed).to.be.gt(0n);
  });
});

