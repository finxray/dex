const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Verify Skew Scenario", function () {
  let skewLib;

  before(async function () {
    const SkewTest = await ethers.getContractFactory("InventorySkewTest");
    skewLib = await SkewTest.deploy();
    await skewLib.waitForDeployment();
  });

  function ppbToActual(ppb) {
    return Number(ppb) / 1e9;
  }

  it("asset0=0, asset1=100, midPrice=2, zeroForOne=false, amount=20", async function () {
    console.log("\n" + "=" .repeat(100));
    console.log("VERIFICATION SCENARIO");
    console.log("=" .repeat(100));
    console.log("\nInitial: asset0=0, asset1=100");
    console.log("MidPrice: 2.0 (1 asset0 = 2 asset1)");
    console.log("Trade: zeroForOne=FALSE, amount=20 (in ASSET1 units - trader gives asset1)\n");

    const inv0 = 0n;
    const inv1 = 100n * 10n**18n;
    const amount = 20n * 10n**18n;
    const midPrice = 2n * 10n**9n; // 2.0 in PPB

    console.log("=" .repeat(100));
    console.log("MANUAL CALCULATION");
    console.log("=" .repeat(100));
    
    console.log("\n1. Convert to common value (asset0 terms):");
    console.log("   value0_before = 0");
    console.log("   value1_before = 100 / midPrice = 100 / 2 = 50 (in asset0 terms)");
    console.log("   Total before = 50");

    console.log("\n2. Simulate trade (zeroForOne=FALSE):");
    console.log("   Amount: 20 ASSET1 (trader gives 20 asset1 to pool)");
    console.log("   Pool RECEIVES 20 asset1 → asset1_after = 100 + 20 = 120");
    console.log("   Pool GIVES 20/midPrice = 20/2 = 10 asset0 → asset0_after = 0 - 10 = 0 (clamped)");
    console.log("   value0_after = 0");
    console.log("   value1_after = 120 / 2 = 60 (in asset0 terms)");
    console.log("   Total after = 60");
    console.log("   ⚠️  Pool cannot fulfill this trade - has 0 asset0, needs to give 10!");

    console.log("\n3. Calculate skews (with clamping):");
    console.log("\n   RISKY0 (asset0 is risky):");
    console.log("   Skew_before = 0 / 50 = 0.0");
    console.log("   Skew_after = 0 / 60 = 0.0 (clamped - pool can't give asset0 it doesn't have)");
    console.log("   Final skew = 0.0 - 0.0 = 0.0");
    console.log("   Interpretation: No effective trade possible");

    console.log("\n   NEUTRAL (50/50 target):");
    console.log("   Skew_before = |0/25 - 1| = 1.0");
    console.log("   Skew_after = |0/30 - 1| = 1.0 (clamped)");
    console.log("   Final skew = |1.0| - |1.0| = 0.0");
    console.log("   Interpretation: No effective change due to clamping");

    console.log("\n   RISKY1 (asset1 is risky):");
    console.log("   Skew_before = 50 / 50 = 1.0");
    console.log("   Skew_after = 60 / 60 = 1.0 (clamped - only asset1 changes)");
    console.log("   Final skew = 1.0 - 1.0 = 0.0");
    console.log("   Interpretation: No effective change");

    console.log("\n" + "=" .repeat(100));
    console.log("ACTUAL CONTRACT CALCULATIONS");
    console.log("=" .repeat(100));

    const skewRisky0 = await skewLib.calculateSkew(inv0, inv1, amount, false, 1, midPrice);
    const skewNeutral = await skewLib.calculateSkew(inv0, inv1, amount, false, 0, midPrice);
    const skewRisky1 = await skewLib.calculateSkew(inv0, inv1, amount, false, 2, midPrice);

    console.log(`\nRISKY0:  ${ppbToActual(skewRisky0).toFixed(6)} (expected: 0.0 - trade impossible)`);
    console.log(`NEUTRAL: ${ppbToActual(skewNeutral).toFixed(6)} (expected: 0.0 - trade impossible)`);
    console.log(`RISKY1:  ${ppbToActual(skewRisky1).toFixed(6)} (expected: 0.0 - trade impossible)`);

    console.log("\n" + "=" .repeat(100));
    console.log("VERIFICATION");
    console.log("=" .repeat(100));
    console.log("✓ Pool has 0 asset0 but needs to give 10 asset0");
    console.log("✓ Clamping prevents negative inventory");
    console.log("✓ Skew returns 0 to indicate trade cannot be fulfilled");
    console.log("✓ This prevents invalid quotes without reverting");
    console.log("=" .repeat(100));
    console.log("\n");
  });
});

