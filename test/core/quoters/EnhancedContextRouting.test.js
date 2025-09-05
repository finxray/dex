const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Enhanced Context Routing", function () {
  let deployer, trader, lp;
  let weth, usdc, pm, quoterBase, quoterCtx;
  let baseGasUsed = 0n;

  const WETH_AMOUNT = ethers.parseEther("1000");
  const USDC_AMOUNT = ethers.parseEther("130000");
  const SWAP_AMOUNT = ethers.parseEther("10");

  const BASE = "0x000000";       // No enhanced context
  const CONTEXT = "0x000001";    // ENHANCED_CONTEXT_FLAG
  let baseGasCtxQuoter = 0n;

  before(async function () {
    [deployer, trader, lp] = await ethers.getSigners();

    const A = await ethers.getContractFactory("TestTokenA");
    const B = await ethers.getContractFactory("TestTokenB");
    weth = await A.deploy();
    usdc = await B.deploy();
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

    const QBase = await ethers.getContractFactory("Quoter1100");
    quoterBase = await QBase.deploy();
    await quoterBase.waitForDeployment();

    const QCtx = await ethers.getContractFactory("QuoterCtxLogger");
    quoterCtx = await QCtx.deploy();
    await quoterCtx.waitForDeployment();

    for (const user of [trader, lp]) {
      await weth.mint(user.address, ethers.parseEther("20000"));
      await usdc.mint(user.address, ethers.parseEther("26000000"));
      await weth.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
      await usdc.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
    }
  });

  it("Base quoter: no context overhead", async function () {
    await pm.connect(lp).createPool(await weth.getAddress(), await usdc.getAddress(), await quoterBase.getAddress(), BASE);
    await pm.connect(lp).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoterBase.getAddress(), BASE, WETH_AMOUNT, USDC_AMOUNT);
    const tx = await pm.connect(trader).swap(await weth.getAddress(), await usdc.getAddress(), await quoterBase.getAddress(), BASE, SWAP_AMOUNT, true, 0);
    const receipt = await tx.wait();
    baseGasUsed = receipt.gasUsed;
    console.log("Base quoter gas:", receipt.gasUsed.toString());
    expect(receipt.gasUsed).to.be.greaterThan(0n);
  });

  it("Context quoter: decodes context and shows overhead", async function () {
    await pm.connect(lp).createPool(await weth.getAddress(), await usdc.getAddress(), await quoterCtx.getAddress(), CONTEXT);
    await pm.connect(lp).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoterCtx.getAddress(), CONTEXT, WETH_AMOUNT, USDC_AMOUNT);
    const tx = await pm.connect(trader).swap(await weth.getAddress(), await usdc.getAddress(), await quoterCtx.getAddress(), CONTEXT, SWAP_AMOUNT, true, 0);
    const receipt = await tx.wait();
    console.log("Context quoter gas:", receipt.gasUsed.toString());
    const overhead = receipt.gasUsed - baseGasUsed;
    console.log("Overhead:", overhead.toString());

    // No event expected; ensure tx succeeded and gas recorded
    expect(receipt.gasUsed).to.be.greaterThan(0n);
  });

  it("Context decode (no emit): measures pure routing+decode overhead", async function () {
    const QDecode = await ethers.getContractFactory("QuoterCtxDecode");
    const quoterNoEmit = await QDecode.deploy();
    await quoterNoEmit.waitForDeployment();

    // Create base pool for same quoter to get its baseline
    await pm.connect(lp).createPool(await weth.getAddress(), await usdc.getAddress(), await quoterNoEmit.getAddress(), BASE);
    await pm.connect(lp).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoterNoEmit.getAddress(), BASE, WETH_AMOUNT, USDC_AMOUNT);
    let tx = await pm.connect(trader).swap(await weth.getAddress(), await usdc.getAddress(), await quoterNoEmit.getAddress(), BASE, SWAP_AMOUNT, true, 0);
    let receipt = await tx.wait();
    baseGasCtxQuoter = receipt.gasUsed;
    console.log("No-emit quoter base gas:", baseGasCtxQuoter.toString());

    // Now enhanced context
    await pm.connect(lp).createPool(await weth.getAddress(), await usdc.getAddress(), await quoterNoEmit.getAddress(), CONTEXT);
    await pm.connect(lp).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoterNoEmit.getAddress(), CONTEXT, WETH_AMOUNT, USDC_AMOUNT);
    tx = await pm.connect(trader).swap(await weth.getAddress(), await usdc.getAddress(), await quoterNoEmit.getAddress(), CONTEXT, SWAP_AMOUNT, true, 0);
    receipt = await tx.wait();
    const overhead = receipt.gasUsed - baseGasCtxQuoter;
    console.log("No-emit quoter context gas:", receipt.gasUsed.toString());
    console.log("No-emit overhead:", overhead.toString());
    expect(overhead).to.be.greaterThan(0n);
  });
});


