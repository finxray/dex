const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Inventory Skew Verification - Second Scenario", function () {
  let skewLib;

  before(async function () {
    const SkewTest = await ethers.getContractFactory("InventorySkewTest");
    skewLib = await SkewTest.deploy();
    await skewLib.waitForDeployment();
  });

  function ppbToActual(ppb) {
    return Number(ppb) / 1e9;
  }

  it("verifies: asset0=25, asset1=100, midPrice=0.3, zeroForOne=false, amount=75", async function () {
    console.log("\n=== VERIFICATION TEST ===");
    console.log("Inventory: asset0=25, asset1=100");
    console.log("Trade: 75 asset1 → asset0 (zeroForOne=false)");
    console.log("MidPrice (asset0/asset1): 0.3 (1 asset0 = 0.3 asset1)\n");

    const inv0 = 25n * 10n**18n;
    const inv1 = 100n * 10n**18n;
    const amount = 75n * 10n**18n;
    const midPrice = 300_000_000n; // 0.3 in PPB

    console.log("Step 1: Convert to common value (asset0 terms)");
    console.log("  MidPrice = 0.3 means 1 asset0 = 0.3 asset1");
    console.log("  value0 = inventory0 = 25");
    console.log("  value1 = inventory1 / midPrice = 100 / 0.3 = 333.33");
    console.log("  Total value = 358.33\n");

    console.log("Step 2: Simulate trade (selling 75 asset1 → buying asset0)");
    console.log("  Selling 75 asset1 in asset0 terms: 75 / 0.3 = 250");
    console.log("  Buying asset0: 75 / 0.3 = 250");
    console.log("  After trade:");
    console.log("  value0 = 25 + 250 = 275");
    console.log("  value1 = 333.33 - 250 = 83.33");
    console.log("  Total value = 358.33\n");

    // Case 1: RISKY0 mode
    console.log("=".repeat(60));
    console.log("CASE 1: RISKY0 (asset0 is risky, want to minimize asset0)\n");
    
    console.log("Before trade:");
    console.log("  Skew = value0 / (value0 + value1) = 25 / 358.33 = 0.070\n");
    
    console.log("After trade:");
    console.log("  Skew = value0 / (value0 + value1) = 275 / 358.33 = 0.768\n");
    
    console.log("Skew change:");
    console.log("  skew = skew_after - skew_before");
    console.log("  skew = 0.768 - 0.070 = +0.698");
    console.log("  Interpretation: Positive = trade increases risky holdings (DETRIMENTAL)\n");

    const skewRisky0 = await skewLib.calculateSkew(inv0, inv1, amount, false, 1, midPrice);
    console.log(`Calculated skew: ${ppbToActual(skewRisky0).toFixed(3)}`);
    console.log(`Expected: ~+0.698\n`);

    // Case 2: RISKY1 mode
    console.log("=".repeat(60));
    console.log("CASE 2: RISKY1 (asset1 is risky, want to minimize asset1)\n");
    
    console.log("Before trade:");
    console.log("  Skew = value1 / (value0 + value1) = 333.33 / 358.33 = 0.930\n");
    
    console.log("After trade:");
    console.log("  Skew = value1 / (value0 + value1) = 83.33 / 358.33 = 0.232\n");
    
    console.log("Skew change:");
    console.log("  skew = skew_after - skew_before");
    console.log("  skew = 0.232 - 0.930 = -0.698");
    console.log("  Interpretation: Negative = trade reduces risky holdings (BENEFICIAL)\n");

    const skewRisky1 = await skewLib.calculateSkew(inv0, inv1, amount, false, 2, midPrice);
    console.log(`Calculated skew: ${ppbToActual(skewRisky1).toFixed(3)}`);
    console.log(`Expected: ~-0.698\n`);

    // Case 3: NEUTRAL mode
    console.log("=".repeat(60));
    console.log("CASE 3: NEUTRAL (target 50/50 value split)\n");
    
    console.log("Before trade:");
    console.log("  Ideal value per asset = (value0 + value1) / 2 = 358.33 / 2 = 179.17");
    console.log("  Skew = (value0 / ideal) - 1 = (25 / 179.17) - 1 = -0.860");
    console.log("  Status: -86% underbought asset0 (heavily short)\n");
    
    console.log("After trade:");
    console.log("  Ideal value per asset = 358.33 / 2 = 179.17");
    console.log("  Skew = (value0 / ideal) - 1 = (275 / 179.17) - 1 = 0.535");
    console.log("  Status: +53.5% overbought asset0\n");
    
    console.log("Skew change:");
    console.log("  abs(skew_before) = abs(-0.860) = 0.860");
    console.log("  abs(skew_after) = abs(0.535) = 0.535");
    console.log("  skew = abs(before) - abs(after) = 0.860 - 0.535 = +0.325");
    console.log("  Interpretation: Positive = trade improves balance (reduces imbalance)\n");

    const skewNeutral = await skewLib.calculateSkew(inv0, inv1, amount, false, 0, midPrice);
    console.log(`Calculated skew: ${ppbToActual(skewNeutral).toFixed(3)}`);
    console.log(`Expected: ~+0.325\n`);

    console.log("=".repeat(60));
    console.log("\nSUMMARY:");
    console.log(`RISKY0:   ${ppbToActual(skewRisky0).toFixed(3)} (buying risky → detrimental)`);
    console.log(`RISKY1:   ${ppbToActual(skewRisky1).toFixed(3)} (selling risky → beneficial)`);
    console.log(`NEUTRAL:  ${ppbToActual(skewNeutral).toFixed(3)} (improves balance)`);

    // Verify signs are correct
    expect(ppbToActual(skewRisky0)).to.be.greaterThan(0); // Detrimental
    expect(ppbToActual(skewRisky1)).to.be.lessThan(0); // Beneficial
    expect(ppbToActual(skewNeutral)).to.be.greaterThan(0); // Improves balance
  });
});


