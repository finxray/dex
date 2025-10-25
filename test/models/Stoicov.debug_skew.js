const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Debug Skew Calculation", function () {
  let skewLib;

  before(async function () {
    const SkewTest = await ethers.getContractFactory("InventorySkewTest");
    skewLib = await SkewTest.deploy();
    await skewLib.waitForDeployment();
  });

  function ppbToActual(ppb) {
    return Number(ppb) / 1e9;
  }

  it("Debug: zeroForOne=FALSE with RISKY0", async function () {
    const inv0 = 100n * 10n**18n;
    const inv1 = 50n * 10n**18n;
    const amount = 20n * 10n**18n;
    const midPrice = 1n * 10n**9n; // 1.0 in PPB

    console.log("\n=== DEBUG: zeroForOne=FALSE ===");
    console.log("Initial: asset0=100, asset1=50");
    console.log("Amount: 20 (in asset1 units for FALSE)");
    console.log("Expected after: asset0=120, asset1=30");
    console.log("Expected skew_after: 120/150 = 0.8\n");

    const skew = await skewLib.calculateSkew(inv0, inv1, amount, false, 1, midPrice);
    console.log(`Calculated skew: ${ppbToActual(skew).toFixed(6)}`);
    console.log(`Expected: 0.8 - 0.6667 = 0.1333\n`);
  });

  it("Debug: zeroForOne=TRUE with RISKY0", async function () {
    const inv0 = 100n * 10n**18n;
    const inv1 = 50n * 10n**18n;
    const amount = 20n * 10n**18n;
    const midPrice = 1n * 10n**9n;

    console.log("\n=== DEBUG: zeroForOne=TRUE ===");
    console.log("Initial: asset0=100, asset1=50");
    console.log("Amount: 20 (in asset0 units for TRUE)");
    console.log("Expected after: asset0=120, asset1=30");
    console.log("Expected skew_after: 120/150 = 0.8\n");

    const skew = await skewLib.calculateSkew(inv0, inv1, amount, true, 1, midPrice);
    console.log(`Calculated skew: ${ppbToActual(skew).toFixed(6)}`);
    console.log(`Expected: 0.8 - 0.6667 = 0.1333\n`);
  });
});

