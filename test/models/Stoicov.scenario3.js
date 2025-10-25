const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Scenario 3: asset0=100, asset1=80, amount=20, zeroForOne=TRUE, midPrice=0.5", function () {
  let skewLib;

  before(async function () {
    const SkewTest = await ethers.getContractFactory("InventorySkewTest");
    skewLib = await SkewTest.deploy();
    await skewLib.waitForDeployment();
  });

  function ppbToActual(ppb) {
    return Number(ppb) / 1e9;
  }

  it("Calculate skews for scenario 3", async function () {
    console.log("\n" + "=" .repeat(100));
    console.log("SCENARIO 3: MANUAL CALCULATION");
    console.log("=" .repeat(100));
    console.log("\nInitial: asset0=100, asset1=80");
    console.log("MidPrice: 0.5 (1 asset0 = 0.5 asset1)");
    console.log("Trade: zeroForOne=TRUE, amount=20 (in ASSET0 units)\n");

    const inv0 = 100n * 10n**18n;
    const inv1 = 80n * 10n**18n;
    const amount = 20n * 10n**18n;
    const midPrice = 500_000_000n; // 0.5 in PPB

    console.log("=" .repeat(100));
    console.log("STEP 1: Convert to common value (asset0 terms)");
    console.log("=" .repeat(100));
    console.log("value0_before = 100");
    console.log("value1_before = 80 / midPrice = 80 / 0.5 = 160 (in asset0 terms)");
    console.log("Total before = 100 + 160 = 260");

    console.log("\n" + "=" .repeat(100));
    console.log("STEP 2: Simulate trade (zeroForOne=TRUE)");
    console.log("=" .repeat(100));
    console.log("zeroForOne=TRUE → Trader GIVES asset0, RECEIVES asset1");
    console.log("Amount: 20 asset0 (trader gives to pool)");
    console.log("");
    console.log("Pool RECEIVES 20 asset0:");
    console.log("  asset0_after = 100 + 20 = 120");
    console.log("  value0_after = 120");
    console.log("");
    console.log("Pool GIVES asset1 equivalent:");
    console.log("  asset1 to give = 20 × midPrice = 20 × 0.5 = 10 asset1");
    console.log("  asset1_after = 80 - 10 = 70");
    console.log("  value1_after = 70 / 0.5 = 140 (in asset0 terms)");
    console.log("");
    console.log("Total after = 120 + 140 = 260");

    console.log("\n" + "=" .repeat(100));
    console.log("STEP 3: Calculate Skews");
    console.log("=" .repeat(100));
    
    console.log("\nRISKY0 (asset0 is risky):");
    console.log("  Skew_before = value0 / total = 100 / 260 = 0.3846");
    console.log("  Skew_after  = value0 / total = 120 / 260 = 0.4615");
    console.log("  Final skew = 0.4615 - 0.3846 = +0.0769");
    console.log("  ✓ Pool INCREASES risky asset0 → DETRIMENTAL → POSITIVE skew");

    console.log("\nNEUTRAL (50/50 target):");
    console.log("  Ideal = 260 / 2 = 130");
    console.log("  Skew_before = |100/130 - 1| = |-0.2308| = 0.2308");
    console.log("  Skew_after  = |120/130 - 1| = |-0.0769| = 0.0769");
    console.log("  Final skew = |0.0769| - |0.2308| = -0.1538");
    console.log("  ✓ Imbalance DECREASES → BENEFICIAL → NEGATIVE skew");

    console.log("\nRISKY1 (asset1 is risky):");
    console.log("  Skew_before = value1 / total = 160 / 260 = 0.6154");
    console.log("  Skew_after  = value1 / total = 140 / 260 = 0.5385");
    console.log("  Final skew = 0.5385 - 0.6154 = -0.0769");
    console.log("  ✓ Pool DECREASES risky asset1 → BENEFICIAL → NEGATIVE skew");

    console.log("\n" + "=" .repeat(100));
    console.log("ACTUAL CONTRACT CALCULATIONS");
    console.log("=" .repeat(100));

    const skewRisky0 = await skewLib.calculateSkew(inv0, inv1, amount, true, 1, midPrice);
    const skewNeutral = await skewLib.calculateSkew(inv0, inv1, amount, true, 0, midPrice);
    const skewRisky1 = await skewLib.calculateSkew(inv0, inv1, amount, true, 2, midPrice);

    console.log(`\nRISKY0:  ${ppbToActual(skewRisky0).toFixed(6)} (expected: +0.0769)`);
    console.log(`NEUTRAL: ${ppbToActual(skewNeutral).toFixed(6)} (expected: -0.1538)`);
    console.log(`RISKY1:  ${ppbToActual(skewRisky1).toFixed(6)} (expected: -0.0769)`);

    console.log("\n" + "=" .repeat(100));
    console.log("SUMMARY");
    console.log("=" .repeat(100));
    console.log("\nTrade Direction Convention (matches core PoolManager):");
    console.log("  zeroForOne=TRUE → amount in ASSET0 units");
    console.log("  Trader gives asset0 (20), receives asset1 (10)");
    console.log("  Pool receives asset0 (20), gives asset1 (10)");
    console.log("\nInventory Changes:");
    console.log("  asset0: 100 → 120 (pool gains)");
    console.log("  asset1: 80 → 70 (pool loses)");
    console.log("\nReservation Price Impact (r = mid - q·γ·σ²):");
    console.log("  • RISKY0 (+0.077): Detrimental trade → r decreases → discourages");
    console.log("  • NEUTRAL (-0.154): Beneficial trade → r increases → encourages");
    console.log("  • RISKY1 (-0.077): Beneficial trade → r increases → encourages");
    console.log("=" .repeat(100));
    console.log("\n");
  });
});

