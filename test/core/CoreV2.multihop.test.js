const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Core V2: multi-hop batchSwap with multiple buckets", function () {
  let deployer, lp, trader, pm, weth, usdc, dai;
  const LIQ = ethers.parseEther("100000");
  const SWAP_IN = ethers.parseEther("10");

  before(async function () {
    [deployer, lp, trader] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("TestTokenA");
    const TokenB = await ethers.getContractFactory("TestTokenB");
    weth = await Token.deploy();
    usdc = await TokenB.deploy();
    dai = await Token.deploy();

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
      for (const t of [weth, usdc, dai]) {
        await t.mint(u.address, ethers.parseEther("10000000"));
        await t.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
      }
    }
  });

  it("WETH->USDC->DAI multi-hop across buckets", async function () {
    const Q = await ethers.getContractFactory("Quoter1110Batch");
    const quoter = await Q.deploy();
    const m1 = "0x000001"; // bucket 1
    const m2 = "0x000002"; // bucket 2

    // Create WETH/USDC pool in bucket 1 and add liquidity
    await pm.connect(lp).createPool(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), m1);
    await pm.connect(lp).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), m1, LIQ, LIQ);

    // Create USDC/DAI pool in bucket 2 and add liquidity
    await pm.connect(lp).createPool(await usdc.getAddress(), await dai.getAddress(), await quoter.getAddress(), m2);
    await pm.connect(lp).addLiquidity(await usdc.getAddress(), await dai.getAddress(), await quoter.getAddress(), m2, LIQ, LIQ);

    const hops = [
      {
        asset0: await weth.getAddress(),
        asset1: await usdc.getAddress(),
        quoter: await quoter.getAddress(),
        markings: [m1],
        amounts: [SWAP_IN],
        zeroForOne: true
      },
      {
        asset0: await usdc.getAddress(),
        asset1: await dai.getAddress(),
        quoter: await quoter.getAddress(),
        markings: [m2],
        amounts: [0n], // will be replaced by previous hop output internally
        zeroForOne: true
      }
    ];

    const balBefore = await dai.balanceOf(trader.address);
    const tx = await pm.connect(trader).batchSwap(hops, SWAP_IN, 0);
    const rc = await tx.wait();
    const balAfter = await dai.balanceOf(trader.address);
    expect(balAfter - balBefore).to.be.gt(0n);
    expect(rc.gasUsed).to.be.gt(0n);
  });
});


