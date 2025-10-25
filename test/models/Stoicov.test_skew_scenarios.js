const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Inventory Skew Test Scenarios", function () {
  let skewLib;

  before(async function () {
    const SkewTest = await ethers.getContractFactory("InventorySkewTest");
    skewLib = await SkewTest.deploy();
    await skewLib.waitForDeployment();
  });

  function ppbToActual(ppb) {
    return Number(ppb) / 1e9;
  }

  it("Test scenario: asset0=100, asset1=50, amount=20, midPrice=1.0", async function () {
    console.log("\n" + "=" .repeat(100));
    console.log("INVENTORY SKEW CALCULATION TEST");
    console.log("=" .repeat(100));
    console.log("\nInitial State: asset0=100, asset1=50, Trade Amount=20, MidPrice=1.0\n");

    const inv0 = 100n * 10n**18n;
    const inv1 = 50n * 10n**18n;
    const amount = 20n * 10n**18n;
    const midPrice = 1n * 10n**9n; // 1.0 in PPB

    // Calculate all scenarios
    const skewRisky0_false = await skewLib.calculateSkew(inv0, inv1, amount, false, 1, midPrice);
    const skewRisky0_true = await skewLib.calculateSkew(inv0, inv1, amount, true, 1, midPrice);
    const skewNeutral_false = await skewLib.calculateSkew(inv0, inv1, amount, false, 0, midPrice);
    const skewNeutral_true = await skewLib.calculateSkew(inv0, inv1, amount, true, 0, midPrice);
    const skewRisky1_false = await skewLib.calculateSkew(inv0, inv1, amount, false, 2, midPrice);
    const skewRisky1_true = await skewLib.calculateSkew(inv0, inv1, amount, true, 2, midPrice);

    // Calculate expected skew_after values
    const skewAfterRisky0_false = 120/150;  // zeroForOne=false: asset0=120, total=150
    const skewAfterRisky0_true = 80/150;    // zeroForOne=true: asset0=80, total=150  
    const skewAfterNeutral_false = Math.abs((120/75) - 1);  // zeroForOne=false: |1.6 - 1| = 0.6
    const skewAfterNeutral_true = Math.abs((80/75) - 1);    // zeroForOne=true: |1.067 - 1| = 0.067
    const skewAfterRisky1_false = 30/150;   // zeroForOne=false: asset1=30, total=150
    const skewAfterRisky1_true = 70/150;    // zeroForOne=true: asset1=70, total=150

    console.log("Mode    | zeroForOne | Skew Before | Skew After  | Final Skew  | Trade Type");
    console.log("--------|------------|-------------|-------------|-------------|------------------");
    console.log(`RISKY0  |   FALSE    |   0.666667  |   ${skewAfterRisky0_false.toFixed(6)}  | ${ppbToActual(skewRisky0_false).toFixed(6).padStart(11)} | Beneficial`);
    console.log(`RISKY0  |   TRUE     |   0.666667  |   ${skewAfterRisky0_true.toFixed(6)}  | ${ppbToActual(skewRisky0_true).toFixed(6).padStart(11)} | Detrimental`);
    console.log(`NEUTRAL |   FALSE    |   0.333333  |   ${skewAfterNeutral_false.toFixed(6)}  | ${ppbToActual(skewNeutral_false).toFixed(6).padStart(11)} | Beneficial`);
    console.log(`NEUTRAL |   TRUE     |   0.333333  |   ${skewAfterNeutral_true.toFixed(6)}  | ${ppbToActual(skewNeutral_true).toFixed(6).padStart(11)} | Detrimental`);
    console.log(`RISKY1  |   FALSE    |   0.333333  |   ${skewAfterRisky1_false.toFixed(6)}  | ${ppbToActual(skewRisky1_false).toFixed(6).padStart(11)} | Detrimental`);
    console.log(`RISKY1  |   TRUE     |   0.333333  |   ${skewAfterRisky1_true.toFixed(6)}  | ${ppbToActual(skewRisky1_true).toFixed(6).padStart(11)} | Beneficial`);

    console.log("\n" + "=" .repeat(100));
    console.log("FORMULA: Final Skew = Skew_After - Skew_Before (for RISKY modes)");
    console.log("         Final Skew = |Skew_After| - |Skew_Before| (for NEUTRAL mode)");
    console.log("=" .repeat(100));
    
    console.log("\n" + "=" .repeat(100));
    console.log("TRADE INTERPRETATION (from TRADER's perspective)");
    console.log("=" .repeat(100));
    console.log("\nzeroForOne=FALSE → TRADER sells asset1, buys asset0:");
    console.log("  • Pool inventory: asset0 (100→80), asset1 (50→70)");
    console.log("  • RISKY0: Pool reduces risky asset0 → BENEFICIAL → skew = " + ppbToActual(skewRisky0_false).toFixed(3));
    console.log("  • RISKY1: Pool increases risky asset1 → DETRIMENTAL → skew = " + ppbToActual(skewRisky1_false).toFixed(3));
    console.log("  • NEUTRAL: Balances inventory toward 50/50 → BENEFICIAL → skew = " + ppbToActual(skewNeutral_false).toFixed(3));

    console.log("\nzeroForOne=TRUE → TRADER sells asset0, buys asset1:");
    console.log("  • Pool inventory: asset0 (100→120), asset1 (50→30)");
    console.log("  • RISKY0: Pool increases risky asset0 → DETRIMENTAL → skew = " + ppbToActual(skewRisky0_true).toFixed(3));
    console.log("  • RISKY1: Pool reduces risky asset1 → BENEFICIAL → skew = " + ppbToActual(skewRisky1_true).toFixed(3));
    console.log("  • NEUTRAL: Worsens imbalance from 50/50 → DETRIMENTAL → skew = " + ppbToActual(skewNeutral_true).toFixed(3));

    console.log("\n" + "=" .repeat(100));
    console.log("RESERVATION PRICE FORMULA: r = mid - q·γ·σ²");
    console.log("=" .repeat(100));
    console.log("✓ NEGATIVE skew → r = mid - (negative) → r INCREASES → Encourages beneficial trade");
    console.log("✓ POSITIVE skew → r = mid - (positive) → r DECREASES → Discourages detrimental trade");
    console.log("=" .repeat(100));
    console.log("\n");
  });
});

