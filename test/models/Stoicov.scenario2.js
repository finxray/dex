const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Scenario 2: asset0=100, asset1=80, amount=20, zeroForOne=false, midPrice=0.5", function () {
  let skewLib;

  before(async function () {
    const SkewTest = await ethers.getContractFactory("InventorySkewTest");
    skewLib = await SkewTest.deploy();
    await skewLib.waitForDeployment();
  });

  function ppbToActual(ppb) {
    return Number(ppb) / 1e9;
  }

  it("Calculate skews for scenario 2", async function () {
    console.log("\n" + "=" .repeat(100));
    console.log("SCENARIO 2: MANUAL CALCULATION");
    console.log("=" .repeat(100));
    console.log("\nInitial: asset0=100, asset1=80");
    console.log("MidPrice: 0.5 (1 asset0 = 0.5 asset1)");
    console.log("Trade: zeroForOne=FALSE, amount=20 (in ASSET1 units)\n");

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
    console.log("STEP 2: Simulate trade (zeroForOne=FALSE)");
    console.log("=" .repeat(100));
    console.log("zeroForOne=FALSE → Trader GIVES asset1, RECEIVES asset0");
    console.log("Amount: 20 asset1 (trader gives to pool)");
    console.log("");
    console.log("Pool RECEIVES 20 asset1:");
    console.log("  asset1_after = 80 + 20 = 100");
    console.log("  value1_after = 100 / 0.5 = 200 (in asset0 terms)");
    console.log("");
    console.log("Pool GIVES asset0 equivalent:");
    console.log("  asset0 to give = 20 / midPrice = 20 / 0.5 = 40 asset0");
    console.log("  asset0_after = 100 - 40 = 60");
    console.log("  value0_after = 60");
    console.log("");
    console.log("Total after = 60 + 200 = 260");

    console.log("\n" + "=" .repeat(100));
    console.log("STEP 3: Calculate Skews");
    console.log("=" .repeat(100));
    
    console.log("\nRISKY0 (asset0 is risky):");
    console.log("  Skew_before = value0 / total = 100 / 260 = 0.3846");
    console.log("  Skew_after  = value0 / total = 60 / 260  = 0.2308");
    console.log("  Final skew = 0.2308 - 0.3846 = -0.1538");
    console.log("  ✓ Pool REDUCES risky asset0 → BENEFICIAL → NEGATIVE skew");

    console.log("\nNEUTRAL (50/50 target):");
    console.log("  Ideal = 260 / 2 = 130");
    console.log("  Skew_before = |100/130 - 1| = |-0.2308| = 0.2308");
    console.log("  Skew_after  = |60/130 - 1|  = |-0.5385| = 0.5385");
    console.log("  Final skew = |0.5385| - |0.2308| = +0.3077");
    console.log("  ✓ Imbalance INCREASES → DETRIMENTAL → POSITIVE skew");

    console.log("\nRISKY1 (asset1 is risky):");
    console.log("  Skew_before = value1 / total = 160 / 260 = 0.6154");
    console.log("  Skew_after  = value1 / total = 200 / 260 = 0.7692");
    console.log("  Final skew = 0.7692 - 0.6154 = +0.1538");
    console.log("  ✓ Pool INCREASES risky asset1 → DETRIMENTAL → POSITIVE skew");

    console.log("\n" + "=" .repeat(100));
    console.log("ACTUAL CONTRACT CALCULATIONS");
    console.log("=" .repeat(100));

    const skewRisky0 = await skewLib.calculateSkew(inv0, inv1, amount, false, 1, midPrice);
    const skewNeutral = await skewLib.calculateSkew(inv0, inv1, amount, false, 0, midPrice);
    const skewRisky1 = await skewLib.calculateSkew(inv0, inv1, amount, false, 2, midPrice);

    console.log(`\nRISKY0:  ${ppbToActual(skewRisky0).toFixed(6)} (expected: -0.1538)`);
    console.log(`NEUTRAL: ${ppbToActual(skewNeutral).toFixed(6)} (expected: +0.3077)`);
    console.log(`RISKY1:  ${ppbToActual(skewRisky1).toFixed(6)} (expected: +0.1538)`);

    console.log("\n" + "=" .repeat(100));
    console.log("SUMMARY");
    console.log("=" .repeat(100));
    console.log("\nTrade Direction Convention (matches core PoolManager):");
    console.log("  zeroForOne=FALSE → amount in ASSET1 units");
    console.log("  Trader gives asset1 (20), receives asset0 (40)");
    console.log("  Pool receives asset1 (20), gives asset0 (40)");
    console.log("\nInventory Changes:");
    console.log("  asset0: 100 → 60 (pool loses)");
    console.log("  asset1: 80 → 100 (pool gains)");
    console.log("\nReservation Price Impact (r = mid - q·γ·σ²):");
    console.log("  • RISKY0 (-0.154): Beneficial trade → r increases → encourages");
    console.log("  • NEUTRAL (+0.308): Detrimental trade → r decreases → discourages");
    console.log("  • RISKY1 (+0.154): Detrimental trade → r decreases → discourages");
    console.log("=" .repeat(100));
    console.log("\n");
  });
});

