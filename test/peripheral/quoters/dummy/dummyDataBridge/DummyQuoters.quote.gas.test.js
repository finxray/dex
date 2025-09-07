const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Dummy Quoters - Quote Execution Gas", function () {
  let quoters = {};
  let deployer;
  
  before(async function () {
    [deployer] = await ethers.getSigners();
    
    console.log("\n=== QUOTER EXECUTION GAS BENCHMARK ===\n");
    
    // Deploy dummy quoters
    const quoterTypes = [
      { name: "Quoter0000", flags: "0000", description: "No data bridges" },
      { name: "Quoter1000", flags: "1000", description: "Only bridge 0" },
      { name: "Quoter1100", flags: "1100", description: "Bridges 0,1" },
      { name: "Quoter1110", flags: "1110", description: "Bridges 0,1,2" },
      { name: "Quoter1111", flags: "1111", description: "All 4 bridges" },
    ];
    
    for (const quoterInfo of quoterTypes) {
      try {
        const QuoterFactory = await ethers.getContractFactory(quoterInfo.name);
        const quoter = await QuoterFactory.deploy();
        quoters[quoterInfo.name] = {
          contract: quoter,
          info: quoterInfo
        };
        console.log(`✅ ${quoterInfo.name}: Deployed`);
      } catch (e) {
        console.log(`❌ ${quoterInfo.name}: Failed to deploy`);
      }
    }
  });

  it("measures quote() execution gas for each quoter", async function () {
    console.log("\n=== QUOTE EXECUTION GAS COMPARISON ===\n");
    
    // Test quote params
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    
    const quoteParams = {
      asset0: WETH,
      asset1: USDC,
      quoter: ethers.ZeroAddress,
      amount: ethers.parseEther("1"),
      asset0Balance: ethers.parseEther("100"),
      asset1Balance: ethers.parseUnits("450000", 6),
      bucketID: 0,
      zeroForOne: true
    };
    
    // Build routed data (d0, d1, d2, d3, dx) with realistic data
    const priceData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [ethers.parseUnits("4500", 18), Math.floor(Date.now()/1000)]);
    const emptyData = "0x";
    
    const routed = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "bytes", "bytes", "bytes", "bytes"],
      [priceData, priceData, priceData, priceData, emptyData]
    );
    
    console.log("Quoter Performance (quote() execution only):");
    console.log("quoter       | bridges | quote gas | quote result | efficiency");
    console.log("-------------+---------+-----------+--------------+-----------");
    
    for (const [name, quoterData] of Object.entries(quoters)) {
      try {
        // Set quoter address in params
        const testParams = { ...quoteParams, quoter: await quoterData.contract.getAddress() };
        
        // Estimate gas for quote call
        const quoteGas = await quoterData.contract.quote.estimateGas(testParams, routed);
        
        // Get quote result
        const result = await quoterData.contract.quote.staticCall(testParams, routed);
        
        // Format result (assume USDC output)
        const resultStr = ethers.formatUnits(result, 6);
        const bridgeCount = quoterData.info.flags.split('').filter(f => f === '1').length;
        
        // Calculate efficiency (gas per bridge, lower is better)
        const efficiency = bridgeCount > 0 ? Math.round(Number(quoteGas) / bridgeCount) : Number(quoteGas);
        
        console.log(`${name.padEnd(12)} | ${bridgeCount.toString().padEnd(7)} | ${quoteGas.toString().padEnd(9)} | ${resultStr.substring(0,12).padEnd(12)} | ${efficiency} gas/bridge`);
        
      } catch (e) {
        const bridgeCount = quoterData.info.flags.split('').filter(f => f === '1').length;
        console.log(`${name.padEnd(12)} | ${bridgeCount.toString().padEnd(7)} | ERROR     | ERROR        | ${e.message.substring(0, 20)}...`);
      }
    }
    
    console.log("\n=== STOIX QUOTER COMPARISON ===");
    
    // Compare with our StoixQuoter
    try {
      const StoixQuoter = await ethers.getContractFactory("StoixQuoter");
      const stoix = await StoixQuoter.deploy();
      
      const testParams = { ...quoteParams, quoter: await stoix.getAddress() };
      const stoixQuoteGas = await stoix.quote.estimateGas(testParams, routed);
      const stoixResult = await stoix.quote.staticCall(testParams, routed);
      const stoixResultStr = ethers.formatUnits(stoixResult, 6);
      
      console.log(`StoixQuoter  | 5       | ${stoixQuoteGas.toString().padEnd(9)} | ${stoixResultStr.substring(0,12).padEnd(12)} | ${Math.round(Number(stoixQuoteGas) / 5)} gas/bridge`);
      
      console.log("\n=== BENCHMARK ANALYSIS ===");
      
      // Calculate the gas increase for StoixQuoter
      const baselineGas = Object.values(quoters)[0] ? 
        await quoters[Object.keys(quoters)[0]].contract.quote.estimateGas(
          { ...quoteParams, quoter: await Object.values(quoters)[0].contract.getAddress() }, 
          routed
        ) : 0;
      
      const gasIncrease = Number(stoixQuoteGas) - Number(baselineGas);
      const percentIncrease = baselineGas > 0 ? Math.round((gasIncrease * 100) / Number(baselineGas)) : 0;
      
      console.log(`• StoixQuoter uses 5 data sources vs 0-4 in dummy quoters`);
      console.log(`• Gas overhead: +${gasIncrease} gas (+${percentIncrease}%) for advanced features`);
      console.log(`• Includes: Chainlink integration, event emission, sophisticated pricing`);
      console.log(`• Efficiency: ${Math.round(Number(stoixQuoteGas) / 5)} gas per data source`);
      
    } catch (e) {
      console.log("❌ StoixQuoter comparison failed:", e.message.substring(0, 100));
    }
    
    expect(Object.keys(quoters).length).to.be.greaterThan(0);
  });
});
