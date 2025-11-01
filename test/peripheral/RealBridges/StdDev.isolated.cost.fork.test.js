const { expect } = require("chai");
const { ethers, network } = require("hardhat");

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, "0x1000000000000000000"]);
  return await ethers.getSigner(addr);
}

describe("Standard Deviation Isolated Cost Analysis", function () {
  let bridge;
  let weth, usdc;
  
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const ETH_USD_CHAINLINK = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const USDC_WETH_V3_3000_POOL = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";
  
  beforeEach(async function () {
    const StoixDB = await ethers.getContractFactory("StoixDataBridge");
    bridge = await StoixDB.deploy(UNISWAP_V2_FACTORY, UNISWAP_V3_FACTORY, ETH_USD_CHAINLINK, WETH, USDC);
    await bridge.waitForDeployment();
  });
  
  it("Measure std dev short cost in isolation", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("STANDARD DEVIATION SHORT (15-MIN) - ISOLATED COST MEASUREMENT");
    console.log("=".repeat(80));
    
    const testParams = {
      asset0: WETH,
      asset1: USDC,
      quoter: ethers.ZeroAddress,
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: 0, // Use 0 to avoid any optimization logic
      zeroForOne: true,
      functionFlags: 0x20 // ONLY std dev short
    };
    
    console.log("Request: std dev short ONLY (flag 0x20)");
    console.log("BucketID: 0 (no optimizations)");
    
    try {
      const gas = await bridge.getData.estimateGas(testParams);
      const data = await bridge.getData.staticCall(testParams);
      
      const [mask, v2Q, v3Q, twQ, clQ, clTs, sdShort, sdLong] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"],
        data
      );
      
      const maskNum = Number(mask);
      
      console.log("\n=== RESULTS ===");
      console.log("Gas cost:             " + gas.toString());
      console.log("Mask returned:        0b" + mask.toString(2).padStart(8, '0'));
      console.log("Std dev fetched:      " + ((maskNum & 0x20) !== 0 ? "✅ YES" : "❌ NO"));
      
      if ((maskNum & 0x20) !== 0) {
        console.log("Std dev value:        " + (Number(sdShort) / 100).toFixed(2) + " bps");
        console.log("\n🎯 ISOLATED STD DEV SHORT COST: " + gas.toString() + " gas");
      } else {
        console.log("\n⚠️  Std dev calculation returned 0 or failed");
        console.log("   Possible reasons:");
        console.log("   1. UniV3 pool oracle cardinality is insufficient");
        console.log("   2. Not enough historical observations available");
        console.log("   3. Time window (15 min) exceeds available data");
        
        // Check pool cardinality
        const pool = await ethers.getContractAt(
          ["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)"],
          USDC_WETH_V3_3000_POOL
        );
        const slot0 = await pool.slot0();
        console.log("\n   Pool observationIndex:        " + slot0[2].toString());
        console.log("   Pool observationCardinality:  " + slot0[3].toString());
        console.log("   Pool observationCardinalityNext: " + slot0[4].toString());
        
        if (Number(slot0[3]) < 10) {
          console.log("\n   ❌ Cardinality too low! Need at least 10+ observations");
          console.log("      The pool needs to accumulate more observations over time.");
        }
      }
    } catch (error) {
      console.log("\n❌ ERROR: " + error.message);
    }
  });
  
  it("Measure std dev long cost in isolation", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("STANDARD DEVIATION LONG (24-HOUR) - ISOLATED COST MEASUREMENT");
    console.log("=".repeat(80));
    
    const testParams = {
      asset0: WETH,
      asset1: USDC,
      quoter: ethers.ZeroAddress,
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: 0,
      zeroForOne: true,
      functionFlags: 0x40 // ONLY std dev long
    };
    
    console.log("Request: std dev long ONLY (flag 0x40)");
    console.log("BucketID: 0 (no optimizations)");
    
    try {
      const gas = await bridge.getData.estimateGas(testParams);
      const data = await bridge.getData.staticCall(testParams);
      
      const [mask, v2Q, v3Q, twQ, clQ, clTs, sdShort, sdLong] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"],
        data
      );
      
      const maskNum = Number(mask);
      
      console.log("\n=== RESULTS ===");
      console.log("Gas cost:             " + gas.toString());
      console.log("Mask returned:        0b" + mask.toString(2).padStart(8, '0'));
      console.log("Std dev fetched:      " + ((maskNum & 0x40) !== 0 ? "✅ YES" : "❌ NO"));
      
      if ((maskNum & 0x40) !== 0) {
        console.log("Std dev value:        " + (Number(sdLong) / 100).toFixed(2) + " bps");
        console.log("\n🎯 ISOLATED STD DEV LONG COST: " + gas.toString() + " gas");
      } else {
        console.log("\n⚠️  Std dev calculation returned 0 or failed");
        console.log("   This is expected if the pool doesn't have 24-hour history");
      }
    } catch (error) {
      console.log("\n❌ ERROR: " + error.message);
    }
  });
  
  it("Measure all data sources individually", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("ALL DATA SOURCES - INDIVIDUAL COST MEASUREMENT");
    console.log("=".repeat(80));
    
    const sources = [
      { flag: 0x01, name: "V2 spot", bit: 0 },
      { flag: 0x02, name: "V3 spot", bit: 1 },
      { flag: 0x04, name: "TWAP (standalone)", bit: 2 },
      { flag: 0x08, name: "Chainlink price", bit: 3 },
      { flag: 0x20, name: "Std dev short (15-min)", bit: 5 },
      { flag: 0x40, name: "Std dev long (24-hour)", bit: 6 }
    ];
    
    console.log("\nSource                          | Gas Cost  | Fetched | Value");
    console.log("-".repeat(75));
    
    const results = [];
    
    for (const source of sources) {
      const testParams = {
        asset0: WETH,
        asset1: USDC,
        quoter: ethers.ZeroAddress,
        amount: ethers.parseEther("1"),
        asset0Balance: 0n,
        asset1Balance: 0n,
        bucketID: 0,
        zeroForOne: true,
        functionFlags: source.flag
      };
      
      try {
        const gas = await bridge.getData.estimateGas(testParams);
        const data = await bridge.getData.staticCall(testParams);
        const [mask] = ethers.AbiCoder.defaultAbiCoder().decode(["uint8"], data);
        const maskNum = Number(mask);
        const fetched = (maskNum & (1 << source.bit)) !== 0;
        
        results.push({ ...source, gas: Number(gas), fetched });
        
        console.log(
          source.name.padEnd(30) + " | " +
          gas.toString().padStart(9) + " | " +
          (fetched ? "   ✅   " : "   ❌   ") + " |"
        );
      } catch (error) {
        console.log(
          source.name.padEnd(30) + " | " +
          "   ERROR".padStart(9) + " | " +
          "   ❌   " + " | " + error.message.split('(')[0]
        );
      }
    }
    
    console.log("-".repeat(75));
    
    // Calculate baseline (no data)
    const baselineParams = {
      asset0: WETH,
      asset1: USDC,
      quoter: ethers.ZeroAddress,
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: 0,
      zeroForOne: true,
      functionFlags: 0x00 // No data sources
    };
    
    const baselineGas = await bridge.getData.estimateGas(baselineParams);
    console.log("Baseline (no data sources)      | " + baselineGas.toString().padStart(9) + " |         |");
    
    console.log("\n=== ACTUAL FETCH COSTS (excluding baseline) ===");
    for (const result of results) {
      if (result.fetched) {
        const actualCost = result.gas - Number(baselineGas);
        console.log(result.name.padEnd(30) + " : ~" + actualCost.toLocaleString().padStart(9) + " gas 🔴");
      }
    }
    
    console.log("\n🎯 KEY FINDINGS:");
    const v2 = results.find(r => r.flag === 0x01);
    const v3 = results.find(r => r.flag === 0x02);
    const twap = results.find(r => r.flag === 0x04);
    const cl = results.find(r => r.flag === 0x08);
    const stdShort = results.find(r => r.flag === 0x20);
    const stdLong = results.find(r => r.flag === 0x40);
    
    if (v2 && v2.fetched) console.log("✅ V2 spot:           ~" + (v2.gas - Number(baselineGas)).toLocaleString() + " gas (cheap)");
    if (v3 && v3.fetched) console.log("✅ V3 spot:           ~" + (v3.gas - Number(baselineGas)).toLocaleString() + " gas (cheap)");
    if (twap && twap.fetched) console.log("✅ TWAP:              ~" + (twap.gas - Number(baselineGas)).toLocaleString() + " gas (moderate)");
    if (cl && cl.fetched) console.log("✅ Chainlink:         ~" + (cl.gas - Number(baselineGas)).toLocaleString() + " gas (very cheap)");
    if (stdShort && stdShort.fetched) console.log("🔴 Std dev short:     ~" + (stdShort.gas - Number(baselineGas)).toLocaleString() + " gas (EXPENSIVE!)");
    if (stdLong && stdLong.fetched) console.log("🔴 Std dev long:      ~" + (stdLong.gas - Number(baselineGas)).toLocaleString() + " gas (VERY EXPENSIVE!)");
    
    if (stdShort && !stdShort.fetched) {
      console.log("⚠️  Std dev short NOT available (pool cardinality issue)");
    }
    if (stdLong && !stdLong.fetched) {
      console.log("⚠️  Std dev long NOT available (insufficient historical data)");
    }
  });
});

