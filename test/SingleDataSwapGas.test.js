const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Gas: single swap using SingleDataQuoter (Alpha)", function () {
  it("reports exact gas usage", async function () {
    const [owner, lp, trader] = await ethers.getSigners();

    // Deploy tokens
    const TestTokenA = await ethers.getContractFactory("TestTokenA");
    const TestTokenB = await ethers.getContractFactory("TestTokenB");
    const tokenA = await TestTokenA.deploy();
    const tokenB = await TestTokenB.deploy();

    // Deploy alpha data bridge
    const MockAlphaDataBridge = await ethers.getContractFactory("MockAlphaDataBridge");
    const alphaBridge = await MockAlphaDataBridge.deploy(
      ethers.parseEther("1.3"),
      ethers.parseEther("1.28")
    );

    // Deploy AlphaDataQuoter
    const AlphaDataQuoter = await ethers.getContractFactory("AlphaDataQuoter");
    const alphaQuoter = await AlphaDataQuoter.deploy();

    // Deploy PoolManager with defaultAlpha set
    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(
      await alphaBridge.getAddress(),
      ethers.ZeroAddress // defaultBeta unused for single data
    );

    // Mint & approve
    const SUPPLY = ethers.parseEther("2000000");
    for (const u of [lp, trader]) {
      await tokenA.mint(u.address, SUPPLY);
      await tokenB.mint(u.address, SUPPLY);
      await tokenA.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
      await tokenB.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
    }

    // Create pool with alpha single-data quoter
    const ALPHA = "0x00000E"; // alpha data, defaults enabled
    await poolManager
      .connect(lp)
      .createPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await alphaQuoter.getAddress(),
        ALPHA
      );

    // Add liquidity
    const L0 = ethers.parseEther("1000");
    const L1 = ethers.parseEther("1300");
    await poolManager
      .connect(lp)
      .addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await alphaQuoter.getAddress(),
        ALPHA,
        L0,
        L1
      );

    // Single swap: A -> B using AlphaDataQuoter
    const SWAP = ethers.parseEther("10");
    const tx = await poolManager
      .connect(trader)
      .swap(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await alphaQuoter.getAddress(),
        ALPHA,
        SWAP,
        true,
        ethers.parseEther("12")
      );
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed;

    console.log("\n=== SingleDataQuoter (Alpha) single swap gas ===");
    console.log("Gas used:", gasUsed.toString());

    expect(gasUsed).to.be.gt(0n);
  });
});

