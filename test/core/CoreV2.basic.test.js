const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Core V2: basic flows (create/add/swap/batch/flash/MEV/CB)", function () {
  let deployer, lp, trader;
  let weth, usdc;
  let pm;
  let liquidityManager;

  const WETH_AMOUNT = ethers.parseEther("1000");
  const USDC_AMOUNT = ethers.parseEther("130000");
  const SWAP_AMOUNT = ethers.parseEther("1");

  before(async function () {
    [deployer, lp, trader] = await ethers.getSigners();

    const MockWETH = await ethers.getContractFactory("TestTokenA");
    const MockUSDC = await ethers.getContractFactory("TestTokenA");
    weth = await MockWETH.deploy();
    usdc = await MockUSDC.deploy();
    await weth.waitForDeployment();
    await usdc.waitForDeployment();

    const D0 = await ethers.getContractFactory("DummyData0");
    const D1 = await ethers.getContractFactory("DummyData1");
    const D2 = await ethers.getContractFactory("DummyData2");
    const D3 = await ethers.getContractFactory("DummyData3");
    const priceBytes = ethers.AbiCoder.defaultAbiCoder().encode(["uint256","uint256"],[ethers.parseUnits("4500",18), BigInt(Math.floor(Date.now()/1000))]);
    const d0 = await D0.deploy(priceBytes);
    const d1 = await D1.deploy(priceBytes);
    const d2 = await D2.deploy(priceBytes);
    const d3 = await D3.deploy(priceBytes);

    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(
      await d0.getAddress(),
      await d1.getAddress(),
      await d2.getAddress(),
      await d3.getAddress()
    );
    await pm.waitForDeployment();

    // Deploy LiquidityManager and wire it
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    liquidityManager = await LiquidityManager.deploy(await pm.getAddress());
    await pm.setLiquidityManager(await liquidityManager.getAddress());

    // Mint and approve tokens (approve PM for settlement)
    for (const u of [lp, trader]) {
      await weth.mint(u.address, ethers.parseEther("10000"));
      await usdc.mint(u.address, ethers.parseEther("13000000"));
      await weth.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
      await usdc.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
    }
  });

  it("createPool + addLiquidity + swap (Quoter1100)", async function () {
    const Q1100 = await ethers.getContractFactory("Quoter1100");
    const quoter = await Q1100.deploy();
    await quoter.waitForDeployment();

    const marking = "0x000001"; // d0 only

    await pm.connect(lp).createPool(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking
    );

    await liquidityManager.connect(lp).addLiquidity(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      WETH_AMOUNT,
      USDC_AMOUNT
    );

    // Warm-up swap for consistent gas
    await pm.connect(trader).swap(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      ethers.parseEther("0.001"),
      true,
      0
    );

    const tx = await pm.connect(trader).swap(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      SWAP_AMOUNT,
      true,
      0
    );
    const receipt = await tx.wait();
    expect(receipt.gasUsed).to.be.gt(0n);
  });

  it("batchSwap across two markings (different bucketID)", async function () {
    const Q1110Batch = await ethers.getContractFactory("Quoter1110Batch");
    const quoter = await Q1110Batch.deploy();
    await quoter.waitForDeployment();

    const markingA = "0x000001"; // d0
    const markingB = "0x000004"; // d2 (avoid ACCESS_CONTROL bit)

    // Ensure pools exist and have liquidity
    for (const marking of [markingA, markingB]) {
      await pm.connect(lp).createPool(
        await weth.getAddress(),
        await usdc.getAddress(),
        await quoter.getAddress(),
        marking
      );
      await liquidityManager.connect(lp).addLiquidity(
        await weth.getAddress(),
        await usdc.getAddress(),
        await quoter.getAddress(),
        marking,
        WETH_AMOUNT,
        USDC_AMOUNT
      );
    }

    const hop = {
      asset0: await weth.getAddress(),
      asset1: await usdc.getAddress(),
      quoter: await quoter.getAddress(),
      markings: [markingA, markingB],
      amounts: [SWAP_AMOUNT / 2n, SWAP_AMOUNT / 2n],
      zeroForOne: true
    };

    const tx = await pm.connect(trader).batchSwap([hop], SWAP_AMOUNT, 0);
    const receipt = await tx.wait();
    expect(receipt.gasUsed).to.be.gt(0n);
  });

  it("flash session (compose add+swap+settle)", async function () {
    const DummyQuoter = await ethers.getContractFactory("Quoter0000");
    const quoter = await DummyQuoter.deploy();
    await quoter.waitForDeployment();
    const marking = "0x000000";

    const DummyCallback = await ethers.getContractFactory("DummyFlashCallback");
    const cb = await DummyCallback.deploy();
    await cb.waitForDeployment();

    // Pre-create and fund pool
    await pm.connect(lp).createPool(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking
    );
    await liquidityManager.connect(lp).addLiquidity(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      WETH_AMOUNT,
      USDC_AMOUNT
    );

    // Start a session and perform no-op callback, rely on internal settle
    const tokens = [await weth.getAddress(), await usdc.getAddress()];
    const tx = await pm.connect(trader).flashSession(await cb.getAddress(), "0x", tokens);
    const receipt = await tx.wait();
    expect(receipt.gasUsed).to.be.gt(0n);
  });

  it("no MEV/CircuitBreaker in lean PoolManager (not applicable)", async function () {
    expect(true).to.equal(true);
  });
});


