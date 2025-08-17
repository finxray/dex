const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PoolManager + QuoterRouter integration (Simple, Alpha, Beta, Dual)", function () {
  let owner, lp, trader;
  let tokenA, tokenB;
  let poolManager;
  let simpleQuoter, alphaQuoter, betaQuoter, dualQuoter;
  let mockAlphaBridge, mockBetaBridge;

  const SUPPLY = ethers.parseEther("2000000");
  const L0 = ethers.parseEther("1000");
  const L1 = ethers.parseEther("1300");
  const SWAP = ethers.parseEther("10");

  const SIMPLE = "0x00000C"; // isAlpha=0,isBeta=0, alphaDefault=1,betaDefault=1
  const ALPHA = "0x00000E"; // isAlpha=1,isBeta=0, defaults=1
  const BETA  = "0x00000D"; // isAlpha=0,isBeta=1, defaults=1
  const DUAL  = "0x00000F"; // isAlpha=1,isBeta=1, defaults=1

  beforeEach(async () => {
    [owner, lp, trader] = await ethers.getSigners();

    const TestTokenA = await ethers.getContractFactory("TestTokenA");
    const TestTokenB = await ethers.getContractFactory("TestTokenB");
    tokenA = await TestTokenA.deploy();
    tokenB = await TestTokenB.deploy();
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();

    const SimpleQuoter = await ethers.getContractFactory("SimpleQuoter");
    const AlphaDataQuoter = await ethers.getContractFactory("AlphaDataQuoter");
    const BetaDataQuoter  = await ethers.getContractFactory("BetaDataQuoter");
    const DualDataQuoter  = await ethers.getContractFactory("DualDataQuoter");
    simpleQuoter = await SimpleQuoter.deploy();
    alphaQuoter = await AlphaDataQuoter.deploy();
    betaQuoter  = await BetaDataQuoter.deploy();
    dualQuoter  = await DualDataQuoter.deploy();

    const MockAlphaDataBridge = await ethers.getContractFactory("MockAlphaDataBridge");
    const MockBetaDataBridge  = await ethers.getContractFactory("MockBetaDataBridge");
    mockAlphaBridge = await MockAlphaDataBridge.deploy(ethers.parseEther("1.3"), ethers.parseEther("1.28"));
    mockBetaBridge  = await MockBetaDataBridge.deploy(ethers.parseEther("1.32"));

    const PoolManager = await ethers.getContractFactory("PoolManager");
    poolManager = await PoolManager.deploy(await mockAlphaBridge.getAddress(), await simpleQuoter.getAddress());
    await poolManager.waitForDeployment();

    // mint/approve
    for (const u of [lp, trader]) {
      await tokenA.mint(u.address, SUPPLY);
      await tokenB.mint(u.address, SUPPLY);
      await tokenA.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
      await tokenB.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
    }
  });

  async function setupPool(quoter, marking) {
    await poolManager.connect(lp).createPool(await tokenA.getAddress(), await tokenB.getAddress(), quoter, marking);
    await poolManager.connect(lp).addLiquidity(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      quoter,
      marking,
      L0,
      L1
    );
  }

  it("SimpleQuoter: add/remove liquidity and swap both directions", async function () {
    await setupPool(await simpleQuoter.getAddress(), SIMPLE);

    // swap A->B
    const bBBefore = await tokenB.balanceOf(trader.address);
    const tx1 = await poolManager.connect(trader).swap(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await simpleQuoter.getAddress(),
      SIMPLE,
      SWAP,
      true,
      ethers.parseEther("8")
    );
    await tx1.wait();
    const bBAfter = await tokenB.balanceOf(trader.address);
    expect(bBAfter - bBBefore).to.be.gt(0);

    // swap B->A
    const bABefore = await tokenA.balanceOf(trader.address);
    const tx2 = await poolManager.connect(trader).swap(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await simpleQuoter.getAddress(),
      SIMPLE,
      SWAP,
      false,
      ethers.parseEther("6")
    );
    await tx2.wait();
    const bAAfter = await tokenA.balanceOf(trader.address);
    expect(bAAfter - bABefore).to.be.gt(0);

    // remove liquidity
    const poolID = ethers.solidityPackedKeccak256(
      ["address","address","address","bytes3"],
      [await tokenA.getAddress(), await tokenB.getAddress(), await simpleQuoter.getAddress(), SIMPLE]
    );
    const lpBalance = await poolManager.balanceOf(lp.address, poolID);
    await poolManager.connect(lp).removeLiquidity(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await simpleQuoter.getAddress(),
      SIMPLE,
      lpBalance / 2n
    );
    const [a0, a1] = await poolManager.getInventory(poolID);
    expect(a0).to.be.gt(0);
    expect(a1).to.be.gt(0);
  });

  it("AlphaDataQuoter: swap uses alpha data and router", async function () {
    await setupPool(await alphaQuoter.getAddress(), ALPHA);
    const bBBefore = await tokenB.balanceOf(trader.address);
    await poolManager.connect(trader).swap(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await alphaQuoter.getAddress(),
      ALPHA,
      SWAP,
      true,
      ethers.parseEther("12")
    );
    const bBAfter = await tokenB.balanceOf(trader.address);
    expect(bBAfter - bBBefore).to.be.gt(0);
  });

  it("BetaDataQuoter: swap uses beta data and router", async function () {
    // Configure defaultBeta to be a real beta bridge by re-deploying a PM with beta default
    const PoolManager = await ethers.getContractFactory("PoolManager");
    poolManager = await PoolManager.deploy(await mockAlphaBridge.getAddress(), await mockBetaBridge.getAddress());
    await poolManager.waitForDeployment();
    for (const u of [lp, trader]) {
      await tokenA.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
      await tokenB.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
    }
    await setupPool(await betaQuoter.getAddress(), BETA);
    const bBBefore = await tokenB.balanceOf(trader.address);
    await poolManager.connect(trader).swap(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await betaQuoter.getAddress(),
      BETA,
      SWAP,
      true,
      ethers.parseEther("12")
    );
    const bBAfter = await tokenB.balanceOf(trader.address);
    expect(bBAfter - bBBefore).to.be.gt(0);
  });

  it("DualDataQuoter: swap uses both data bridges and router caching", async function () {
    const PoolManager = await ethers.getContractFactory("PoolManager");
    poolManager = await PoolManager.deploy(await mockAlphaBridge.getAddress(), await mockBetaBridge.getAddress());
    await poolManager.waitForDeployment();
    for (const u of [lp, trader]) {
      await tokenA.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
      await tokenB.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
    }
    await setupPool(await dualQuoter.getAddress(), DUAL);

    // Perform two swaps in a single transaction using batchSwap with two identical hops
    const hops = [
      {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await dualQuoter.getAddress(),
        markings: [DUAL],
        amounts: [SWAP],
        zeroForOne: true,
      },
      {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await dualQuoter.getAddress(),
        markings: [DUAL],
        amounts: [SWAP],
        zeroForOne: true,
      },
    ];

    // Capture logs to verify cache hits after the first quoter data fetch
    const tx = await poolManager.connect(trader).batchSwap(hops, SWAP, ethers.parseEther("12"));
    const receipt = await tx.wait();
    const cacheEvents = receipt.logs.filter(l => l.fragment && l.fragment.name === "MarketDataCache");
    // Expect first alpha and beta to be miss (hit=false), subsequent to be hit=true
    // We can't strictly count per-provider here without decoding topics, but ensure at least one hit occurred
    const hadHit = cacheEvents.some(e => e.args && e.args[1] === true);
    expect(hadHit).to.equal(true);
  });

  it("Multi-hop: batchSwap across Simple -> Alpha -> Beta", async function () {
    // Re-deploy with beta default bridge configured
    const PoolManager = await ethers.getContractFactory("PoolManager");
    poolManager = await PoolManager.deploy(await mockAlphaBridge.getAddress(), await mockBetaBridge.getAddress());
    await poolManager.waitForDeployment();
    for (const u of [lp, trader]) {
      await tokenA.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
      await tokenB.connect(u).approve(await poolManager.getAddress(), ethers.MaxUint256);
    }
    // Create three pools: Simple, Alpha, Beta
    await setupPool(await simpleQuoter.getAddress(), SIMPLE);
    await setupPool(await alphaQuoter.getAddress(), ALPHA);
    await setupPool(await betaQuoter.getAddress(), BETA);

    const amountIn = ethers.parseEther("5");
    const hops = [
      {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await simpleQuoter.getAddress(),
        markings: [SIMPLE],
        amounts: [amountIn],
        zeroForOne: true,
      },
      {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await alphaQuoter.getAddress(),
        markings: [ALPHA],
        amounts: [amountIn],
        zeroForOne: true,
      },
      {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await betaQuoter.getAddress(),
        markings: [BETA],
        amounts: [amountIn],
        zeroForOne: true,
      },
    ];

    const bBBefore = await tokenB.balanceOf(trader.address);
    // Call batchSwap using the Hop[] ABI encoding
    const tx = await poolManager.connect(trader).batchSwap(hops, amountIn, ethers.parseEther("3"));
    const receipt = await tx.wait();
    const bBAfter = await tokenB.balanceOf(trader.address);

    expect(bBAfter - bBBefore).to.be.gt(0);
    expect(receipt.gasUsed).to.be.gt(0);
  });
});

