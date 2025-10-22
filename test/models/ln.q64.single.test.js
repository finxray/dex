const { ethers } = require("hardhat");

describe("Q64.64 ln single value", function () {
  it("computes ln(1.5) in Q64.64 and measures gas cost", async function () {
    const Factory = await ethers.getContractFactory("LnHarness");
    const c = await Factory.deploy();
    await c.waitForDeployment();

    const ONE_Q64 = 1n << 64n;
    const xQ64 = (ONE_Q64 * 3n) / 2n; // 1.5 in Q64.64

    // Measure gas cost
    const gasEstimate = await c.lnQ64.estimateGas(xQ64);
    console.log("Gas cost for ln(1.5):", gasEstimate.toString());

    // Execute and get result
    const lnQ64 = await c.lnQ64(xQ64);

    // Convert back to double for display
    const lnAsFloat = Number(lnQ64) / Number(ONE_Q64);
    console.log("ln(1.5) ≈", lnAsFloat.toFixed(12));
    console.log("True ln(1.5) ≈ 0.405465108108");
    
    // Test a few more values to see gas variation
    const testValues = [
      { name: "ln(0.5)", x: ONE_Q64 / 2n },
      { name: "ln(2)", x: ONE_Q64 * 2n },
      { name: "ln(10)", x: ONE_Q64 * 10n },
      { name: "ln(100)", x: ONE_Q64 * 100n }
    ];

    console.log("\nGas costs for different inputs:");
    for (const test of testValues) {
      const gas = await c.lnQ64.estimateGas(test.x);
      const result = await c.lnQ64(test.x);
      const resultFloat = Number(result) / Number(ONE_Q64);
      console.log(`${test.name}: ${gas.toString()} gas, result ≈ ${resultFloat.toFixed(6)}`);
    }
  });
});


