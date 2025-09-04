const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Core V2: basic flows (create/add/swap/batch/flash/MEV/CB)", function () {
  let deployer, lp, trader;
  let weth, usdc;
  let pm;

  const WETH_AMOUNT = ethers.parseEther("1000");
  const USDC_AMOUNT = ethers.parseEther("130000");
  const SWAP_AMOUNT = ethers.parseEther("1");

  before(async function () {
    [deployer, lp, trader] = await ethers.getSigners();

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

    const marking = "0x000001";

    await pm.connect(lp).createPool(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking
    );

    await pm.connect(lp).addLiquidity(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      WETH_AMOUNT,
      USDC_AMOUNT
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

    const markingA = "0x000001";
    const markingB = "0x000002";

    // Ensure pools exist and have liquidity
    for (const marking of [markingA, markingB]) {
      await pm.connect(lp).createPool(
        await weth.getAddress(),
        await usdc.getAddress(),
        await quoter.getAddress(),
        marking
      );
      await pm.connect(lp).addLiquidity(
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
    await pm.connect(lp).addLiquidity(
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


