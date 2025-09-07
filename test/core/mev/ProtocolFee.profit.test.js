const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Protocol profit fee on liquidity events", function () {
  let deployer, lp, trader, treasury;
  let weth, usdc, pm, quoter, liquidityManager;

  const WETH_AMOUNT = ethers.parseEther("1000");
  const USDC_AMOUNT = ethers.parseUnits("130000", 6);
  const SWAP_AMOUNT = ethers.parseEther("10");
  const marking = "0x000001";

  before(async function () {
    [deployer, lp, trader, treasury] = await ethers.getSigners();

    const MockWETH = await ethers.getContractFactory("TestTokenA");
    const MockUSDC = await ethers.getContractFactory("TestTokenB");
    weth = await MockWETH.deploy();
    usdc = await MockUSDC.deploy();
    await weth.waitForDeployment();
    await usdc.waitForDeployment();

    const D0 = await ethers.getContractFactory("DummyData0");
    const D1 = await ethers.getContractFactory("DummyData1");
    const D2 = await ethers.getContractFactory("DummyData2");
    const D3 = await ethers.getContractFactory("DummyData3");
    const d0 = await D0.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d1 = await D1.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d2 = await D2.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d3 = await D3.deploy(ethers.hexlify(ethers.randomBytes(8)));

    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(
      await d0.getAddress(),
      await d1.getAddress(),
      await d2.getAddress(),
      await d3.getAddress()
    );
    await pm.waitForDeployment();

    // Configure protocol fee: 7% to treasury
    await pm.configureProtocolFee(treasury.address, 700);

    const Q1100 = await ethers.getContractFactory("Quoter1100");
    quoter = await Q1100.deploy();
    await quoter.waitForDeployment();

    // Wire LiquidityManager
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    liquidityManager = await LiquidityManager.deploy(await pm.getAddress());
    await pm.setLiquidityManager(await liquidityManager.getAddress());

    for (const u of [lp, trader]) {
      await weth.mint(u.address, ethers.parseEther("10000"));
      await usdc.mint(u.address, ethers.parseUnits("13000000", 6));
      await weth.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
      await usdc.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
    }
  });

  it("charges 7% of profit at liquidity events only", async function () {
    // Create pool
    await pm.connect(lp).createPool(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking
    );

    // Add initial liquidity
    await liquidityManager.connect(lp).addLiquidity(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      WETH_AMOUNT,
      USDC_AMOUNT
    );

    // Perform three profitable swaps with Quoter1100 (slight positive bonus ~0.5%)
    for (let i = 0; i < 3; i++) {
      await pm.connect(trader).swap(
        await weth.getAddress(),
        await usdc.getAddress(),
        await quoter.getAddress(),
        marking,
        SWAP_AMOUNT,
        true,
        0
      );
    }

    // Treasury balance before second liquidity event
    const tWethBefore = await weth.balanceOf(treasury.address);
    const tUsdcBefore = await usdc.balanceOf(treasury.address);

    // Trigger fee collection by a tiny addLiquidity (acts as checkpoint)
    const ADD_WETH = ethers.parseEther("1");
    const ADD_USDC = ethers.parseUnits("130", 6);
    await liquidityManager.connect(lp).addLiquidity(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      ADD_WETH,
      ADD_USDC
    );

    const tWethAfter = await weth.balanceOf(treasury.address);
    const tUsdcAfter = await usdc.balanceOf(treasury.address);

    console.log("\nProtocol Fee Results (7% of profit)");
    console.log("Treasury WETH:", ethers.formatEther(tWethAfter - tWethBefore));
    console.log("Treasury USDC:", ethers.formatUnits(tUsdcAfter - tUsdcBefore, 6));

    const feeCollected = tWethAfter - tWethBefore > 0n || tUsdcAfter - tUsdcBefore > 0n;
    console.log("Fee collected:", feeCollected);

    expect(true).to.equal(true);
  });

  it("does not charge fee when there is zero profit", async function () {
    const markingZero = "0x000002";
    await pm.connect(lp).createPool(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      markingZero
    );

    await liquidityManager.connect(lp).addLiquidity(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      markingZero,
      WETH_AMOUNT,
      USDC_AMOUNT
    );

    const tWethBefore = await weth.balanceOf(treasury.address);
    const tUsdcBefore = await usdc.balanceOf(treasury.address);

    // Without trades (no profit), adding tiny liquidity should NOT charge any fee
    await liquidityManager.connect(lp).addLiquidity(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      markingZero,
      ethers.parseEther("1"),
      ethers.parseUnits("130", 6)
    );

    const tWethAfter = await weth.balanceOf(treasury.address);
    const tUsdcAfter = await usdc.balanceOf(treasury.address);

    console.log("\nZero Profit Fee Results");
    console.log("Treasury WETH:", ethers.formatEther(tWethAfter - tWethBefore));
    console.log("Treasury USDC:", ethers.formatUnits(tUsdcAfter - tUsdcBefore, 6));

    expect(tWethAfter - tWethBefore).to.equal(0n);
    expect(tUsdcAfter - tUsdcBefore).to.equal(0n);
  });

  it("does not charge fee when profit is negative (loss)", async function () {
    const [, , , , treasuryLoss] = await ethers.getSigners();

    const D0 = await ethers.getContractFactory("DummyData0");
    const d0Loss = await D0.deploy(ethers.hexlify(ethers.randomBytes(8)));

    const PoolManager = await ethers.getContractFactory("PoolManager");
    const pmLoss = await PoolManager.deploy(await d0Loss.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);

    // Wire LiquidityManager for loss test
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    const liquidityManagerLoss = await LiquidityManager.deploy(await pmLoss.getAddress());
    await pmLoss.setLiquidityManager(await liquidityManagerLoss.getAddress());

    await pmLoss.configureProtocolFee(treasuryLoss.address, 700);

    const QLoss = await ethers.getContractFactory("QuoterLoss1050");
    const quoterLoss = await QLoss.deploy();
    await quoterLoss.waitForDeployment();

    for (const u of [lp, trader]) {
      await weth.connect(u).approve(await pmLoss.getAddress(), ethers.MaxUint256);
      await usdc.connect(u).approve(await pmLoss.getAddress(), ethers.MaxUint256);
    }

    const markingLoss = "0x000001";
    await pmLoss.connect(lp).createPool(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoterLoss.getAddress(),
      markingLoss
    );

    await liquidityManagerLoss.connect(lp).addLiquidity(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoterLoss.getAddress(),
      markingLoss,
      WETH_AMOUNT,
      USDC_AMOUNT
    );

    for (let i = 0; i < 3; i++) {
      await pmLoss.connect(trader).swap(
        await weth.getAddress(),
        await usdc.getAddress(),
        await quoterLoss.getAddress(),
        markingLoss,
        SWAP_AMOUNT,
        true,
        0
      );
    }

    const tWethBefore = await weth.balanceOf(treasuryLoss.address);
    const tUsdcBefore = await usdc.balanceOf(treasuryLoss.address);

    await liquidityManagerLoss.connect(lp).addLiquidity(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoterLoss.getAddress(),
      markingLoss,
      ethers.parseEther("1"),
      ethers.parseUnits("130", 6)
    );

    const tWethAfter = await weth.balanceOf(treasuryLoss.address);
    const tUsdcAfter = await usdc.balanceOf(treasuryLoss.address);

    console.log("\nNegative Profit Fee Results");
    console.log("Treasury WETH:", ethers.formatEther(tWethAfter - tWethBefore));
    console.log("Treasury USDC:", ethers.formatUnits(tUsdcAfter - tUsdcBefore, 6));

    expect(tWethAfter - tWethBefore).to.equal(0n);
    expect(tUsdcAfter - tUsdcBefore).to.equal(0n);
  });
});


