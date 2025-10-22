const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Stoicov Comprehensive Quote Test - 30 bps level", function () {
  let harness, skewLib;

  before(async function () {
    const Factory = await ethers.getContractFactory("StoicovQuoterHarness");
    harness = await Factory.deploy();
    await harness.waitForDeployment();

    const SkewTest = await ethers.getContractFactory("InventorySkewTest");
    skewLib = await SkewTest.deploy();
    await skewLib.waitForDeployment();
  });

  function ppbToActual(ppb) {
    return Number(ppb) / 1e9;
  }

  it("demonstrates full quote calculation for 30 bps level", async function () {
    console.log("\n".repeat(2));
    console.log("=".repeat(80));
    console.log("STOICOV COMPREHENSIVE QUOTE TEST - 30 BPS LEVEL");
    console.log("=".repeat(80));
    console.log("\n");

    // Parameters
    const levelIdx = 8; // 30 bps level
    const gammaScale = 1.0; // High risk aversion
    const stDevScale = 2.0; // 2x stDev
    
    // Inventory and trade parameters
    const inv0 = 250n * 10n**18n;
    const inv1 = 150n * 10n**18n;
    const midPrice = 1.25 * 1e9; // 1.25 in PPB
    const zeroForOne = false;
    const amount = 65n * 10n**18n;
    
    // Risky asset mode (assume NEUTRAL for this test)
    const riskyMode = 0; // NEUTRAL

    console.log("INPUT PARAMETERS:");
    console.log("-".repeat(80));
    console.log(`  Min Target Level: 30 bps`);
    console.log(`  Gamma Scale: ${gammaScale} (high risk aversion)`);
    console.log(`  StDev Scale: ${stDevScale}x (stDev = 60 bps)`);
    console.log(`  Mid Price (S): ${midPrice / 1e9} (asset0/asset1)`);
    console.log(`  Inventory: asset0=${Number(inv0) / 1e18}, asset1=${Number(inv1) / 1e18}`);
    console.log(`  Trade: ${Number(amount) / 1e18} asset1 → asset0 (zeroForOne=${zeroForOne})`);
    console.log(`  Risky Mode: NEUTRAL (50/50 target)\n`);

    // Step 1: Get base parameters from Stoicov tables
    console.log("STEP 1: BASE SPREAD PARAMETERS");
    console.log("-".repeat(80));
    
    const kPpb = await harness.gammaFromScaleAndIdx(levelIdx, 1n * 10n**9n); // k with scale=1
    const k_actual = ppbToActual(kPpb);
    console.log(`  k = ${k_actual.toFixed(6)}`);
    
    const gammaHighScale = await harness.gammaHighScalePpb();
    const gammaPpb = await harness.gammaFromScaleAndIdx(levelIdx, gammaHighScale);
    const gamma_actual = ppbToActual(gammaPpb);
    console.log(`  gamma = k × ${gammaScale} = ${gamma_actual.toFixed(6)}`);
    
    const invKPpb = await harness.invKppbFromIdx(levelIdx);
    const invK_bps = Number(invKPpb) / 1e5;
    console.log(`  1/k = ${invK_bps.toFixed(2)} bps`);
    
    const term2Ppb = await harness.term2ByGammaFromIdx(levelIdx, gammaHighScale);
    const term2_bps = Number(term2Ppb) / 1e5;
    console.log(`  gam/(2*k²) = ${term2_bps.toFixed(2)} bps`);
    
    // Calculate stDev and sigma2Tau
    const stDev_bps = 30 * stDevScale; // 60 bps
    const sigma2TauPpb = Math.round((stDev_bps / 100) * (stDev_bps / 100) * 1e9);
    const term3_bps = (gamma_actual * stDev_bps * stDev_bps) / 2; // stDev_bps is the actual value
    console.log(`  stDev = ${stDev_bps} bps (${stDevScale}x target)`);
    console.log(`  (gam*stD²)/2 = ${term3_bps.toFixed(2)} bps\n`);

    // Step 2: Calculate inventory skew
    console.log("STEP 2: INVENTORY SKEW CALCULATION");
    console.log("-".repeat(80));
    
    const skewPpb = await skewLib.calculateSkew(
      inv0,
      inv1,
      amount,
      zeroForOne,
      riskyMode,
      BigInt(Math.floor(midPrice))
    );
    const skew_actual = ppbToActual(skewPpb);
    console.log(`  Inventory skew (q): ${skew_actual.toFixed(3)}`);
    
    const gammaStDev2 = gamma_actual * stDev_bps * stDev_bps;
    const inventoryAdjustment_bps = skew_actual * gammaStDev2;
    console.log(`  gam*stD² = ${gammaStDev2.toFixed(2)}`);
    console.log(`  q*gam*stD² = ${inventoryAdjustment_bps.toFixed(2)} bps (inventory adjustment)\n`);

    // Get S early for use in calculations
    const S = midPrice / 1e9;

    // Step 3: Calculate half-spread (WITHOUT inventory term)
    console.log("STEP 3: HALF-SPREAD CALCULATION");
    console.log("-".repeat(80));
    
    const halfSpread_bps = invK_bps - term2_bps + term3_bps;
    console.log(`  Half-spread (δ*): 1/k - gam/(2*k²) + (gam*stD²)/2`);
    console.log(`                  = ${invK_bps.toFixed(2)} - ${term2_bps.toFixed(2)} + ${term3_bps.toFixed(2)}`);
    console.log(`                  = ${halfSpread_bps.toFixed(2)} bps (relative)\n`);
    
    const halfSpread_absolute = S * (halfSpread_bps / 10000);
    console.log(`  Half-spread (absolute): S × (δ*/10000)`);
    console.log(`                        = ${S.toFixed(4)} × ${(halfSpread_bps / 10000).toFixed(6)}`);
    console.log(`                        = ${halfSpread_absolute.toFixed(6)}\n`);

    // Step 4: Calculate reservation price
    console.log("STEP 4: RESERVATION PRICE (CANONICAL A-S)");
    console.log("-".repeat(80));
    
    // Reservation shift: -q·γ·σ²·τ (in relative bps)
    const reservationShift_bps = skew_actual * gammaStDev2;
    
    // Convert to absolute and apply to price
    const reservationShift_absolute = S * (reservationShift_bps / 10000);
    const reservationPrice = S - reservationShift_absolute;
    
    console.log(`  Mid Price (S): ${S.toFixed(4)}`);
    console.log(`  Reservation shift (relative): -q·γ·σ²·τ = -${reservationShift_bps.toFixed(2)} bps`);
    console.log(`  Reservation shift (absolute): S × shift/10000`);
    console.log(`                               = ${S.toFixed(4)} × ${(reservationShift_bps/10000).toFixed(6)}`);
    console.log(`                               = ${reservationShift_absolute.toFixed(6)}`);
    console.log(`  Reservation Price (r): S - shift_absolute`);
    console.log(`                        = ${S.toFixed(4)} - ${reservationShift_absolute.toFixed(6)}`);
    console.log(`                        = ${reservationPrice.toFixed(4)}\n`);

    // Step 5: Final quotes
    console.log("STEP 5: FINAL QUOTES");
    console.log("-".repeat(80));
    
    const bidPrice = reservationPrice - halfSpread_absolute;
    const askPrice = reservationPrice + halfSpread_absolute;
    
    console.log(`  Bid = r - δ*_absolute = ${reservationPrice.toFixed(4)} - ${halfSpread_absolute.toFixed(6)}`);
    console.log(`                        = ${bidPrice.toFixed(4)}\n`);
    
    console.log(`  Ask = r + δ*_absolute = ${reservationPrice.toFixed(4)} + ${halfSpread_absolute.toFixed(6)}`);
    console.log(`                        = ${askPrice.toFixed(4)}\n`);

    // Summary table
    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`  Mid Price (S):              ${S.toFixed(4)}`);
    console.log(`  Reservation Price (r):      ${reservationPrice.toFixed(4)}`);
    console.log(`  Half-Spread (relative):     ${halfSpread_bps.toFixed(2)} bps`);
    console.log(`  Half-Spread (absolute):     ${halfSpread_absolute.toFixed(6)}`);
    console.log(`  Bid Price:                  ${bidPrice.toFixed(4)}`);
    console.log(`  Ask Price:                  ${askPrice.toFixed(4)}`);
    console.log(`  Bid-Ask Spread (relative):  ${((askPrice - bidPrice) / S * 10000).toFixed(2)} bps`);
    console.log(`  Bid-Ask Spread (absolute):  ${(askPrice - bidPrice).toFixed(6)}`);
    console.log(`  Inventory Skew (q):         ${skew_actual.toFixed(3)}`);
    console.log("=".repeat(80));
    console.log("\n");

    // Verification
    expect(halfSpread_bps).to.be.at.least(0);
    expect(bidPrice).to.be.lessThan(askPrice);
    expect(askPrice).to.be.greaterThan(0);
  });
});

