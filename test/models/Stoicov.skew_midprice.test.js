const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Inventory Skew with MidPrice = 2.0", function () {
  let skewLib;

  before(async function () {
    const SkewTest = await ethers.getContractFactory("InventorySkewTest");
    skewLib = await SkewTest.deploy();
    await skewLib.waitForDeployment();
  });

  function ppbToActual(ppb) {
    return Number(ppb) / 1e9;
  }

  it("demonstrates skew calculation with asset0=100, asset1=50, amount=25, zeroForOne=true, midPrice=2", async function () {
    console.log("\n=== SKEW CALCULATION TEST ===");
    console.log("Inventory: asset0=100, asset1=50");
    console.log("Trade: 25 asset0 → asset1 (zeroForOne=true)");
    console.log("MidPrice (asset0/asset1): 2.0 (1 asset0 = 2 asset1)\n");

    const inv0 = 100n * 10n**18n;
    const inv1 = 50n * 10n**18n;
    const amount = 25n * 10n**18n;
    const midPrice = 2n * 10n**9n; // 2.0 in PPB

    console.log("Step 1: Convert to common value (asset0 terms)");
    console.log("  MidPrice = 2 means 1 asset0 = 2 asset1");
    console.log("  value0 = inventory0 = 100");
    console.log("  value1 = inventory1 / midPrice = 50 / 2 = 25");
    console.log("  Total value = 125\n");

    console.log("Step 2: Simulate trade (selling 25 asset0 → buying 50 asset1)");
    console.log("  After trade:");
    console.log("  value0 = 100 - 25 = 75");
    console.log("  value1 = 25 + (50 / 2) = 25 + 25 = 50");
    console.log("  Total value = 125\n");

    // Case 1: RISKY0 mode
    console.log("=".repeat(60));
    console.log("CASE 1: RISKY0 (asset0 is risky, want to minimize asset0)\n");
    
    console.log("Before trade:");
    console.log("  Skew = value0 / (value0 + value1) = 100 / 125 = 0.8\n");
    
    console.log("After trade:");
    console.log("  Skew = value0 / (value0 + value1) = 75 / 125 = 0.6\n");
    
    console.log("Skew change:");
    console.log("  skew = skew_after - skew_before");
    console.log("  skew = 0.6 - 0.8 = -0.2");
    console.log("  Interpretation: Negative = trade reduces risky holdings (BENEFICIAL)\n");

    const skewRisky0 = await skewLib.calculateSkew(inv0, inv1, amount, true, 1, midPrice);
    console.log(`Calculated skew: ${ppbToActual(skewRisky0).toFixed(3)}`);
    console.log(`Expected: -0.2\n`);

    // Case 2: RISKY1 mode
    console.log("=".repeat(60));
    console.log("CASE 2: RISKY1 (asset1 is risky, want to minimize asset1)\n");
    
    console.log("Before trade:");
    console.log("  Skew = value1 / (value0 + value1) = 25 / 125 = 0.2\n");
    
    console.log("After trade:");
    console.log("  Skew = value1 / (value0 + value1) = 50 / 125 = 0.4\n");
    
    console.log("Skew change:");
    console.log("  skew = skew_after - skew_before");
    console.log("  skew = 0.4 - 0.2 = +0.2");
    console.log("  Interpretation: Positive = trade increases risky holdings (DETRIMENTAL)\n");

    const skewRisky1 = await skewLib.calculateSkew(inv0, inv1, amount, true, 2, midPrice);
    console.log(`Calculated skew: ${ppbToActual(skewRisky1).toFixed(3)}`);
    console.log(`Expected: +0.2\n`);

    // Case 3: NEUTRAL mode
    console.log("=".repeat(60));
    console.log("CASE 3: NEUTRAL (target 50/50 value split)\n");
    
    console.log("Before trade:");
    console.log("  Ideal value per asset = (value0 + value1) / 2 = 125 / 2 = 62.5");
    console.log("  Skew = (value0 / ideal) - 1 = (100 / 62.5) - 1 = 0.6");
    console.log("  Status: +60% overbought asset0\n");
    
    console.log("After trade:");
    console.log("  Ideal value per asset = 125 / 2 = 62.5");
    console.log("  Skew = (value0 / ideal) - 1 = (75 / 62.5) - 1 = 0.2");
    console.log("  Status: +20% overbought asset0\n");
    
    console.log("Skew change:");
    console.log("  abs(skew_before) = abs(0.6) = 0.6");
    console.log("  abs(skew_after) = abs(0.2) = 0.2");
    console.log("  skew = abs(before) - abs(after) = 0.6 - 0.2 = +0.4");
    console.log("  Interpretation: Positive = trade improves balance (from 60% to 20% imbalance)\n");

    const skewNeutral = await skewLib.calculateSkew(inv0, inv1, amount, true, 0, midPrice);
    console.log(`Calculated skew: ${ppbToActual(skewNeutral).toFixed(3)}`);
    console.log(`Expected: +0.4\n`);

    console.log("=".repeat(60));
    console.log("\nSUMMARY:");
    console.log(`RISKY0:   ${ppbToActual(skewRisky0).toFixed(3)} (selling risky → beneficial)`);
    console.log(`RISKY1:   ${ppbToActual(skewRisky1).toFixed(3)} (buying risky → detrimental)`);
    console.log(`NEUTRAL:  ${ppbToActual(skewNeutral).toFixed(3)} (balanced → imbalanced)`);

    expect(ppbToActual(skewRisky0)).to.be.closeTo(-0.2, 0.01);
    expect(ppbToActual(skewRisky1)).to.be.closeTo(+0.2, 0.01);
    expect(ppbToActual(skewNeutral)).to.be.closeTo(+0.4, 0.01);
  });
});

