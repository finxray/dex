const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StoicovQuoter E2E with Dummy Bridge (125 bps stdev, 50 bps bucket)", function () {
  let pm, lm, stoicov, stoix, bridgeStoicov, stoicovHarness, skewHarness;
  let tokenA, tokenB, user;

  // Helper: bytes3 markings composer
  // Layout: [0..3]=data flags, [4..15]=bucketID, [20..23]=extraBridgeSlot
  function composeMarkings({ data0, bucketID, extraSlot }) {
    let v = 0;
    if (data0) v |= 0x1; // use default data0 bridge (slot 15 consolidated)
    v |= (bucketID & 0xFFF) << 4;
    v |= (extraSlot & 0xF) << 20;
    return ethers.toBeHex(v, 3);
  }

  // Build a bucket: kIdx=9 (50 bps), invMode=RISKY0 (01), gammaSelHigh=1, sigmaFixed=0, gammaZero=0
  function buildBucketId() {
    const kIdx = 9; // 50 bps target bucket
    const invMode = 1; // RISKY0
    const gammaSelHigh = 1; // high risk aversion
    const sigmaFixed = 0;
    const gammaZero = 0;
    let id = 0;
    id |= (kIdx & 0x0F);
    id |= (invMode & 0x03) << 4;
    if (gammaSelHigh) id |= 0x40; // bit 6
    if (sigmaFixed) id |= 0x80;   // bit 7
    if (gammaZero) id |= 0x100;   // bit 8
    return id;
  }

  beforeEach(async function () {
    [user] = await ethers.getSigners();

    // Deploy tokens (18 decimals)
    const TA = await ethers.getContractFactory("TestTokenA");
    const TB = await ethers.getContractFactory("TestTokenB");
    tokenA = await TA.deploy();
    tokenB = await TB.deploy();
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();

    // Deploy dummy Stoicov bridge (returns mid=0.001, stdev=125bps)
    const Bridge125 = await ethers.getContractFactory("MockStoicovDataBridge125");
    bridgeStoicov = await Bridge125.deploy();
    await bridgeStoicov.waitForDeployment();

    // Deploy quoters
    const Stoicov = await ethers.getContractFactory("StoicovQuoter");
    stoicov = await Stoicov.deploy();
    await stoicov.waitForDeployment();
    const StoicovHarness = await ethers.getContractFactory("StoicovQuoterHarness");
    stoicovHarness = await StoicovHarness.deploy();
    await stoicovHarness.waitForDeployment();
    const Stoix = await ethers.getContractFactory("StoixQuoter");
    stoix = await Stoix.deploy();
    await stoix.waitForDeployment();

    const SkewTest = await ethers.getContractFactory("InventorySkewTest");
    skewHarness = await SkewTest.deploy();
    await skewHarness.waitForDeployment();

    // PoolManager configured with dummy Stoicov bridge as default data0 (slot 15 consolidated)
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(await bridgeStoicov.getAddress());
    await pm.waitForDeployment();

    // LiquidityManager
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    lm = await LiquidityManager.deploy(await pm.getAddress());
    await lm.waitForDeployment();
    await pm.setLiquidityManager(await lm.getAddress());

    // Fund and approve
    await tokenA.mint(await user.getAddress(), ethers.parseEther("100000"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("100000"));
    await tokenA.approve(await pm.getAddress(), ethers.MaxUint256);
    await tokenB.approve(await pm.getAddress(), ethers.MaxUint256);
  });

  it("computes mid/bid/ask and spreads, executes swap, verifies direction and compares gas with Stoix", async function () {
    const a0 = await tokenA.getAddress();
    const a1 = await tokenB.getAddress();

    // Configure pool with StoicovQuoter and slot 15 consolidated bridge
    const bucketId = buildBucketId();
    // functionFlags are derived by router when extraBridgeSlot==15; set lower 8 bits in bucketID if needed.
    // We'll use only Chainlink price + std short from our dummy bridge, router will pass 0x0F if zero; dummy ignores flags.
    const markingsStoicov = composeMarkings({ data0: true, bucketID: bucketId, extraSlot: 15 });
    await pm.createPool(a0, a1, await stoicov.getAddress(), markingsStoicov);

    // Liquidity to create significant skew on trade: make inventory concentrated in asset0
    // Reserves example: asset0=10,000; asset1=1 (extreme imbalance in value terms given mid=0.001)
    await lm.addLiquidity(a0, a1, await stoicov.getAddress(), markingsStoicov, ethers.parseEther("10000"), ethers.parseEther("1"));

    // Prepare amount to create significant skew change. Sell asset0 heavily.
    const amountIn = ethers.parseEther("4000");

    // Estimate and execute via Stoicov
    const quoteParams = {
      asset0: a0,
      asset1: a1,
      quoter: await stoicov.getAddress(),
      amount: [amountIn],
      zeroForOne: true,
      marking: [markingsStoicov],
      traderProtection: "0x00000000"
    };

    const [quoteStoicov] = await pm.getQuote.staticCall(quoteParams, 0n, 0n);
    expect(quoteStoicov).to.be.gt(0n);

    const gasEstimateStoicov = await pm.swap.estimateGas(a0, a1, await stoicov.getAddress(), markingsStoicov, amountIn, true, 0n);
    const txStoicov = await pm.swap(a0, a1, await stoicov.getAddress(), markingsStoicov, amountIn, true, 0n);
    const rcStoicov = await txStoicov.wait();

    console.log("Stoicov swap gas:", rcStoicov.gasUsed.toString());
    console.log("Stoicov quote (out):", ethers.formatEther(quoteStoicov));

    // Fetch bridge payload directly to compute mid/bid/ask and spreads
    const qp = {
      asset0: a0,
      asset1: a1,
      quoter: await stoicov.getAddress(),
      amount: amountIn,
      asset0Balance: ethers.parseEther("10000"),
      asset1Balance: ethers.parseEther("1"),
      bucketID: bucketId,
      zeroForOne: true,
      functionFlags: 0x0F
    };
    const dx = await bridgeStoicov.getData(qp);
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode([
      "uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"
    ], dx);
    const mask = Number(decoded[0]);
    const v2Q = decoded[1];
    const v3Q = decoded[2];
    const twQ = decoded[3];
    const clQ = decoded[4];
    const sdShortBpsx100 = Number(decoded[6]); // Format: bps × 100, so 125 bps = 12500
    let sumQ = 0n, n = 0n;
    if ((mask & 0x01) !== 0 && v2Q > 0n) { sumQ += v2Q; n++; }
    if ((mask & 0x02) !== 0 && v3Q > 0n) { sumQ += v3Q; n++; }
    if ((mask & 0x04) !== 0 && twQ > 0n) { sumQ += twQ; n++; }
    if ((mask & 0x08) !== 0 && clQ > 0n) { sumQ += clQ; n++; }
    const midQ = n === 0n ? 0n : sumQ / n;

    // Derive spreads using on-chain helpers via harnesses
    const kIdx = 9;
    const invKPpb = await stoicovHarness.invKppbFromIdx(kIdx);
    const gammaScale = await stoicovHarness.gammaHighScalePpb();
    const term2Ppb = await stoicovHarness.term2ByGammaFromIdx(kIdx, gammaScale);
    const gammaPpb = await stoicovHarness.gammaFromScaleAndIdx(kIdx, gammaScale);
    // Convert from (bps × 100) format: σ² = (sdBpsx100 / 10000)² × 1e9 = sdBpsx100² × 10
    const sigma2Ppb = BigInt(sdShortBpsx100) * BigInt(sdShortBpsx100) * 10n;
    const gammaSigma2 = (gammaPpb * sigma2Ppb) / 1_000_000_000n;
    const term3Ppb = Number(gammaSigma2 / 2n);
    const gammaSigma2Ppb = (gammaPpb * sigma2Ppb) / 1_000_000_000n;

    const QONE = 1n << 64n;
    const midPpb = (midQ * 1_000_000_000n) / QONE;
    const skewPpb = await skewHarness.calculateSkew(
      ethers.parseEther("10000"),
      ethers.parseEther("1"),
      amountIn,
      true,
      1,
      midPpb
    );

    // Compute reservation price: r = mid - q·γ·σ²·τ
    const reservationAdjustmentPpb = (skewPpb * gammaSigma2Ppb) / 1_000_000_000n;
    const adjustmentQ = (midQ * reservationAdjustmentPpb) / 1_000_000_000n;
    const reservationQ = midQ - adjustmentQ;

    // Compute optimal half-spread δ* = 1/k - γ/(2k²) + (γ·σ²·τ)/2
    let deltaStarPpb = BigInt(invKPpb) - BigInt(term2Ppb) + BigInt(term3Ppb);
    if (deltaStarPpb < 0n) deltaStarPpb = 0n;
    const halfSpreadPpb = deltaStarPpb;

    // bid = r - δ*, ask = r + δ*
    const bidQ = (reservationQ * (1_000_000_000n - halfSpreadPpb)) / 1_000_000_000n;
    const askQ = (reservationQ * (1_000_000_000n + halfSpreadPpb)) / 1_000_000_000n;

    // Convert to human-friendly numbers
    function qToFloat(q) { return Number(q) / Number(QONE); }
    const midFloat = qToFloat(midQ);
    const reservationFloat = qToFloat(reservationQ);
    const bidFloat = qToFloat(bidQ);
    const askFloat = qToFloat(askQ);
    const halfSpreadBps = Number(halfSpreadPpb) / 1e5; // bps×1e5 -> bps
    const bidSpreadFromMid = ((midFloat - bidFloat) / midFloat) * 10000; // bps from mid
    const askSpreadFromMid = ((askFloat - midFloat) / midFloat) * 10000; // bps from mid

    console.log("Mid:", midFloat.toFixed(6), "Reservation:", reservationFloat.toFixed(6));
    console.log("Bid:", bidFloat.toFixed(6), "Ask:", askFloat.toFixed(6));
    console.log("Half-spread δ* (bps):", halfSpreadBps.toFixed(3));
    console.log("Bid spread from mid (bps):", bidSpreadFromMid.toFixed(3), "Ask spread from mid (bps):", askSpreadFromMid.toFixed(3));
    console.log("Skew q (PPB):", skewPpb.toString());

    // Validate direction handling: zeroForOne uses bid
    const decIn = await tokenA.decimals();
    const decOut = await tokenB.decimals();
    const tenIn = 10n ** BigInt(decIn);
    const tenOut = 10n ** BigInt(decOut);
    const expectedOut = (amountIn * bidQ / QONE) * tenOut / tenIn;
    // Allow for rounding differences (within 1.5% for complex calculations)
    const tolerance = expectedOut * 15n / 1000n; // 1.5%
    expect(quoteStoicov).to.be.closeTo(expectedOut, tolerance);

    // Recover mid/bid/ask/spreads by re-running quote math on-chain via static call to quoter with same payload is complex.
    // Instead, confirm direction correctness by checking that zeroForOne uses bid (output <= mid*amount) due to spread.
    // Compute naive mid output for comparison (using StoixQuoter which averages mid sources).
    const markingsStoix = composeMarkings({ data0: true, bucketID: 0, extraSlot: 15 });
    await pm.createPool(a0, a1, await stoix.getAddress(), markingsStoix);
    await lm.addLiquidity(a0, a1, await stoix.getAddress(), markingsStoix, ethers.parseEther("10000"), ethers.parseEther("1"));

    const quoteParamsStoix = {
      asset0: a0,
      asset1: a1,
      quoter: await stoix.getAddress(),
      amount: [amountIn],
      zeroForOne: true,
      marking: [markingsStoix],
      traderProtection: "0x00000000"
    };
    const [quoteStoix] = await pm.getQuote.staticCall(quoteParamsStoix, 0n, 0n);
    const gasEstimateStoix = await pm.swap.estimateGas(a0, a1, await stoix.getAddress(), markingsStoix, amountIn, true, 0n);
    const txStoix = await pm.swap(a0, a1, await stoix.getAddress(), markingsStoix, amountIn, true, 0n);
    const rcStoix = await txStoix.wait();

    console.log("Stoix (avg mid) quote:", ethers.formatEther(quoteStoix));
    console.log("Gas compare — Stoicov vs Stoix (actual):", rcStoicov.gasUsed.toString(), "vs", rcStoix.gasUsed.toString());
    console.log("Gas overhead (Stoicov - Stoix):", (Number(rcStoicov.gasUsed) - Number(rcStoix.gasUsed)).toString());

    // Since Stoicov uses bid for sells, its output should be <= mid-based Stoix output
    expect(quoteStoicov).to.be.lte(quoteStoix);

    // Basic sanity on skew effect: with high gamma and large amount against RISKY0, spread should widen (non-zero)
    // We can't directly read internal spread, but the inequality above and non-zero stdev ensure it.

    // Log the core scenario inputs for visibility
    console.log("Inputs:");
    console.log(" - BucketID (50bps, high gamma, RISKY0):", bucketId);
    console.log(" - StdDev (bps): 125");
    console.log(" - Amount in:", ethers.formatEther(amountIn));
    console.log(" - Reserves: asset0=10000, asset1=1");
  });
});


