const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Inventory Skew Function", function () {
  let skewLib;

  before(async function () {
    // Deploy InventorySkew library wrapper for testing
    const SkewTest = await ethers.getContractFactory("InventorySkewTest");
    skewLib = await SkewTest.deploy();
    await skewLib.waitForDeployment();
  });

  // Helper to convert PPB to actual value
  function ppbToActual(ppb) {
    return Number(ppb) / 1e9;
  }

  describe("Value-Based Skew - Your New Specification", function () {
    const midPrice = 1n * 10n**9n; // midPrice = 1.0 in PPB

    it("demonstrates your example: inv0=100, inv1=50, risky=0, amount=50, zeroForOne=false", async function () {
      console.log("\n=== YOUR NEW EXAMPLE ===");
      console.log("Inventory: asset0=100, asset1=50");
      console.log("Risky asset: asset0 (RISKY0 mode)");
      console.log("Trade: 50 asset1 → asset0 (zeroForOne=false)");
      console.log("MidPrice: 1.0\n");

      const inv0 = 100n * 10n**18n;
      const inv1 = 50n * 10n**18n;
      const amount = 50n * 10n**18n;
      
      console.log("Before trade:");
      console.log(`  value0 = 100, value1 = 50 * 1.0 = 50`);
      console.log(`  Total value = 150`);
      console.log(`  Ideal asset0 (risky=0): 0`);
      console.log(`  Skew before = 100/150 = 0.667 (67% in risky asset0)\n`);
      
      console.log("After trade:");
      console.log(`  value0 = 100 + 50 = 150, value1 = 50 - 50 = 0`);
      console.log(`  Total value = 150`);
      console.log(`  Skew after = 150/150 = 1.0 (100% in risky asset0)\n`);
      
      console.log("Trade-induced skew change:");
      console.log(`  skew = skew_after - skew_before = 1.0 - 0.667 = 0.333\n`);

      const skew = await skewLib.calculateSkew(inv0, inv1, amount, false, 1, midPrice); // RISKY0=1
      console.log(`  Calculated skew: ${ppbToActual(skew).toFixed(3)}`);
      console.log(`  Expected: ~0.333 (trade worsens position)\n`);

      expect(ppbToActual(skew)).to.be.closeTo(0.333, 0.01);
    });

    it("demonstrates neutral mode: inv0=100, inv1=50, amount=50, zeroForOne=false", async function () {
      console.log("\n=== NEUTRAL MODE EXAMPLE ===");
      console.log("Inventory: asset0=100, asset1=50");
      console.log("Mode: NEUTRAL (50/50 target)");
      console.log("Trade: 50 asset1 → asset0 (zeroForOne=false)\n");

      const inv0 = 100n * 10n**18n;
      const inv1 = 50n * 10n**18n;
      const amount = 50n * 10n**18n;
      
      console.log("Before trade:");
      console.log(`  value0 = 100, value1 = 50`);
      console.log(`  Total = 150, Ideal = 75 each`);
      console.log(`  Skew before = (100/75) - 1 = 0.333 (+33% overbought asset0)\n`);
      
      console.log("After trade:");
      console.log(`  value0 = 150, value1 = 0`);
      console.log(`  Skew after = (150/75) - 1 = 1.0 (+100% overbought)\n`);
      
      console.log("Trade impact:");
      console.log(`  abs(skew_before) = 0.333`);
      console.log(`  abs(skew_after) = 1.0`);
      console.log(`  skew = abs(before) - abs(after) = 0.333 - 1.0 = -0.667`);
      console.log(`  Negative means trade worsens balance\n`);

      const skew = await skewLib.calculateSkew(inv0, inv1, amount, false, 0, midPrice); // NEUTRAL=0
      console.log(`  Calculated skew: ${ppbToActual(skew).toFixed(3)}`);
      console.log(`  Expected: ~-0.667 (trade worsens balance)\n`);

      expect(ppbToActual(skew)).to.be.closeTo(-0.667, 0.01);
    });

    it("demonstrates smaller amount: inv0=100, inv1=0, risky=1, amount=10", async function () {
      console.log("\n=== SMALLER TRADE ===");
      console.log("Same inventory, but amount=10 instead of 70\n");

      const inv0 = 100n * 10n**18n;
      const inv1 = 0n;
      const amount = 10n * 10n**18n;
      
      const midPrice = 1n * 10n**9n;
      const skew1 = await skewLib.calculateSkew(inv0, inv1, amount, true, 2, midPrice);
      const skew2 = await skewLib.calculateSkew(inv0, inv1, amount, false, 2, midPrice);
      
      console.log(`zeroForOne=true:  skew = ${ppbToActual(skew1).toFixed(2)} (expected -0.1)`);
      console.log(`zeroForOne=false: skew = ${ppbToActual(skew2).toFixed(2)} (expected +0.1)\n`);

      expect(ppbToActual(skew1)).to.be.closeTo(-0.1, 0.01);
      expect(ppbToActual(skew2)).to.be.closeTo(+0.1, 0.01);
    });

    it("demonstrates RISKY0 mode: inv0=100, inv1=0, risky=0, amount=70", async function () {
      console.log("\n=== RISKY0 MODE (asset0 is risky) ===");
      console.log("Inventory: asset0=100, asset1=0");
      console.log("Risky asset: asset0 (RISKY0 mode)");
      console.log("Trade amount: 70\n");

      const inv0 = 100n * 10n**18n;
      const inv1 = 0n;
      const amount = 70n * 10n**18n;
      
      // Case 1: zeroForOne = true (selling risky asset0 for safe asset1)
      const midPrice = 1n * 10n**9n;
      const skew1 = await skewLib.calculateSkew(inv0, inv1, amount, true, 1, midPrice); // RISKY0=1
      console.log(`Case 1: zeroForOne=true (selling risky for safe)`);
      console.log(`  This DECREASES risky asset0 → BENEFICIAL`);
      console.log(`  Expected skew: +0.7`);
      console.log(`  Actual skew: ${ppbToActual(skew1).toFixed(2)}\n`);
      
      // Case 2: zeroForOne = false (buying risky asset0 with safe asset1)
      const skew2 = await skewLib.calculateSkew(inv0, inv1, amount, false, 1, midPrice);
      console.log(`Case 2: zeroForOne=false (buying risky with safe)`);
      console.log(`  This INCREASES risky asset0 → DETRIMENTAL`);
      console.log(`  Expected skew: -0.7`);
      console.log(`  Actual skew: ${ppbToActual(skew2).toFixed(2)}\n`);

      expect(ppbToActual(skew1)).to.be.closeTo(+0.7, 0.01);
      expect(ppbToActual(skew2)).to.be.closeTo(-0.7, 0.01);
    });

    it("demonstrates NEUTRAL mode with 50/50 target", async function () {
      console.log("\n=== NEUTRAL MODE (50/50 target) ===");
      console.log("Target: Equal amounts of both assets");
      console.log("Trade amount: 30\n");

      const amount = 30n * 10n**18n;

      // Scenario 1: Balanced inventory
      console.log("Scenario 1: Balanced (50 asset0, 50 asset1)");
      const inv0_bal = 50n * 10n**18n;
      const inv1_bal = 50n * 10n**18n;
      const midPrice = 1n * 10n**9n;
      const skew_bal_buy0 = await skewLib.calculateSkew(inv0_bal, inv1_bal, amount, false, 0, midPrice);
      const skew_bal_buy1 = await skewLib.calculateSkew(inv0_bal, inv1_bal, amount, true, 0, midPrice);
      console.log(`  Buying asset0 (zeroForOne=false): skew = ${ppbToActual(skew_bal_buy0).toFixed(2)}`);
      console.log(`  Buying asset1 (zeroForOne=true):  skew = ${ppbToActual(skew_bal_buy1).toFixed(2)}\n`);

      // Scenario 2: Too much asset0
      console.log("Scenario 2: Imbalanced (80 asset0, 20 asset1)");
      const inv0_long = 80n * 10n**18n;
      const inv1_short = 20n * 10n**18n;
      const skew_long_buy0 = await skewLib.calculateSkew(inv0_long, inv1_short, amount, false, 0, midPrice);
      const skew_long_buy1 = await skewLib.calculateSkew(inv0_long, inv1_short, amount, true, 0, midPrice);
      console.log(`  Buying asset0 (zeroForOne=false): skew = ${ppbToActual(skew_long_buy0).toFixed(2)} (makes imbalance worse)`);
      console.log(`  Buying asset1 (zeroForOne=true):  skew = ${ppbToActual(skew_long_buy1).toFixed(2)} (improves balance)\n`);
    });

    it("verifies skew = 0 when inventory is 0", async function () {
      console.log("\n=== EDGE CASE: Zero Inventory ===\n");
      
      const inv0 = 0n;
      const inv1 = 0n;
      const amount = 10n * 10n**18n;
      
      const midPrice = 1n * 10n**9n;
      const skew = await skewLib.calculateSkew(inv0, inv1, amount, true, 1, midPrice);
      console.log(`Inventory: 0, 0`);
      console.log(`Skew: ${ppbToActual(skew).toFixed(2)} (should be 0 to avoid division by zero)\n`);
      
      expect(ppbToActual(skew)).to.equal(0);
    });

    it("verifies clamping at extreme values", async function () {
      console.log("\n=== CLAMPING TEST ===\n");
      
      const inv0 = 50n * 10n**18n;
      const inv1 = 0n;
      const amount = 100n * 10n**18n; // Amount > inventory
      
      const midPrice = 1n * 10n**9n;
      const skew = await skewLib.calculateSkew(inv0, inv1, amount, false, 1, midPrice);
      console.log(`Inventory: 50 asset0`);
      console.log(`Trade amount: 100 (exceeds inventory)`);
      console.log(`Raw skew would be: ${100/50} = 2.0`);
      console.log(`Clamped skew: ${ppbToActual(skew).toFixed(2)} (should be clamped to -1.0 or +1.0)\n`);
      
      expect(Math.abs(ppbToActual(skew))).to.be.at.most(1.0);
    });
  });

  describe("Half-Spread Non-Negativity Constraint", function () {
    it("ensures spread >= 0 even with large negative inventory adjustment", async function () {
      console.log("\n=== SPREAD NON-NEGATIVITY TEST ===");
      console.log("Formula: Half_Spread = 1/k - gam/(2*k²) + (gam*stD²)/2 + q*gam*stD²\n");

      // Example from documentation: 0.5 bps level, 2x stDev
      const invKPpb = 50_000;        // 1/k = 0.5 bps
      const term2Ppb = 25_000;       // gam/(2*k²) = 0.25 bps
      const term3Ppb = 100_000;      // (gam*stD²)/2 = 1.0 bps
      const gammaStDev2Ppb = 2_000_000_000; // gam*stD² = 2.0 (in PPB)

      console.log("Base parameters:");
      console.log(`  1/k = ${invKPpb / 1e5} bps`);
      console.log(`  gam/(2*k²) = ${term2Ppb / 1e5} bps`);
      console.log(`  (gam*stD²)/2 = ${term3Ppb / 1e5} bps`);
      console.log(`  gam*stD² = ${gammaStDev2Ppb / 1e9}\n`);

      // Case 1: Beneficial trade (q = +0.8)
      const skewBeneficial = 800_000_000; // 0.8 in PPB
      const spreadBeneficial = await skewLib.calculateHalfSpreadWithInventory(
        invKPpb,
        term2Ppb,
        term3Ppb,
        skewBeneficial,
        gammaStDev2Ppb
      );
      const expectedBeneficial = 0.5 - 0.25 + 1.0 + (0.8 * 2.0);
      console.log(`Case 1: Beneficial trade (q = +0.8)`);
      console.log(`  q*gam*stD² = 0.8 * 2.0 = ${0.8 * 2.0} bps`);
      console.log(`  Expected: ${expectedBeneficial} bps`);
      console.log(`  Actual: ${Number(spreadBeneficial) / 1e5} bps ✓\n`);

      // Case 2: Detrimental trade (q = -0.9) - WOULD GO NEGATIVE
      const skewDetrimental = -900_000_000; // -0.9 in PPB
      const spreadDetrimental = await skewLib.calculateHalfSpreadWithInventory(
        invKPpb,
        term2Ppb,
        term3Ppb,
        skewDetrimental,
        gammaStDev2Ppb
      );
      const rawDetrimental = 0.5 - 0.25 + 1.0 + (-0.9 * 2.0);
      console.log(`Case 2: Detrimental trade (q = -0.9)`);
      console.log(`  q*gam*stD² = -0.9 * 2.0 = ${-0.9 * 2.0} bps`);
      console.log(`  Raw calculation: ${rawDetrimental} bps ❌ (negative!)`);
      console.log(`  Clamped to: ${Number(spreadDetrimental) / 1e5} bps ✓ (enforced >= 0)\n`);

      expect(spreadDetrimental).to.equal(0);

      // Case 3: Moderate detrimental (q = -0.5) - stays positive
      const skewModerate = -500_000_000; // -0.5 in PPB
      const spreadModerate = await skewLib.calculateHalfSpreadWithInventory(
        invKPpb,
        term2Ppb,
        term3Ppb,
        skewModerate,
        gammaStDev2Ppb
      );
      const expectedModerate = 0.5 - 0.25 + 1.0 + (-0.5 * 2.0);
      console.log(`Case 3: Moderate detrimental (q = -0.5)`);
      console.log(`  q*gam*stD² = -0.5 * 2.0 = ${-0.5 * 2.0} bps`);
      console.log(`  Expected: ${expectedModerate} bps`);
      console.log(`  Actual: ${Number(spreadModerate) / 1e5} bps ✓ (stays positive)\n`);

      expect(Number(spreadModerate) / 1e5).to.be.closeTo(expectedModerate, 0.01);
    });

    it("shows spread behavior across full skew range [-1, +1]", async function () {
      console.log("\n=== SPREAD vs SKEW (10 bps level) ===\n");

      // 10 bps level with moderate volatility
      const invKPpb = 1_000_000;      // 1/k = 10 bps
      const term2Ppb = 500_000;       // gam/(2*k²) = 5 bps
      const term3Ppb = 1_250_000;     // (gam*stD²)/2 = 12.5 bps
      const gammaStDev2Ppb = 2_500_000_000; // gam*stD² = 25

      const baseSpread = (invKPpb - term2Ppb + term3Ppb) / 1e5;
      console.log(`Base spread (q=0): ${baseSpread} bps\n`);

      console.log("Skew |  q*gam*stD² | Half-Spread | Status");
      console.log("-----|-------------|-------------|--------");

      const skewValues = [-1.0, -0.9, -0.5, -0.2, 0.0, 0.2, 0.5, 0.8, 1.0];
      
      for (const skew of skewValues) {
        const skewPpb = Math.floor(skew * 1e9);
        const spread = await skewLib.calculateHalfSpreadWithInventory(
          invKPpb,
          term2Ppb,
          term3Ppb,
          skewPpb,
          gammaStDev2Ppb
        );
        const inventoryTerm = skew * 25;
        const spreadBps = Number(spread) / 1e5;
        const status = spreadBps === 0 ? "CLAMPED" : "OK";
        
        console.log(
          `${skew.toFixed(1).padStart(4)} | ${inventoryTerm.toFixed(1).padStart(11)} | ${spreadBps.toFixed(2).padStart(11)} | ${status}`
        );
      }
      console.log("");
    });
  });
});
