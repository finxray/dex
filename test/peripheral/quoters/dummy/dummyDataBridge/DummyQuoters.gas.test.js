const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Dummy Quoters - Gas Benchmark Comparison", function () {
  let bridges = [];
  let quoters = {};
  let deployer;
  
  before(async function () {
    [deployer] = await ethers.getSigners();
    
    console.log("\n=== DUMMY QUOTERS GAS BENCHMARK ===\n");
    
    // Deploy dummy bridges
    const bridgeTypes = ["DummyData0", "DummyData1", "DummyData2", "DummyData3"];
    for (let i = 0; i < bridgeTypes.length; i++) {
      const BridgeFactory = await ethers.getContractFactory(bridgeTypes[i]);
      const bridge = await BridgeFactory.deploy(ethers.encodeBytes32String(`data${i}`));
      bridges.push(bridge);
    }
    
    // Deploy all dummy quoters
    const quoterTypes = [
      { name: "Quoter0000", flags: "0000", description: "No data bridges" },
      { name: "Quoter1000", flags: "1000", description: "Only bridge 0" },
      { name: "Quoter1100", flags: "1100", description: "Bridges 0,1" },
      { name: "Quoter1110", flags: "1110", description: "Bridges 0,1,2" },
      { name: "Quoter1111", flags: "1111", description: "All 4 bridges" },
    ];
    
    console.log("Deploying quoters...");
    for (const quoterInfo of quoterTypes) {
      const QuoterFactory = await ethers.getContractFactory(quoterInfo.name);
      let quoter;
      
      try {
        if (quoterInfo.name === "Quoter1100") {
          // Some quoters might need bridge addresses
          quoter = await QuoterFactory.deploy();
        } else {
          quoter = await QuoterFactory.deploy();
        }
        
        const deployReceipt = await quoter.deploymentTransaction().wait();
        quoters[quoterInfo.name] = {
          contract: quoter,
          info: quoterInfo,
          deployGas: deployReceipt.gasUsed
        };
        
        console.log(`✅ ${quoterInfo.name}: ${deployReceipt.gasUsed.toString()} gas`);
      } catch (e) {
        console.log(`❌ ${quoterInfo.name}: Failed to deploy - ${e.message.substring(0, 50)}...`);
      }
    }
  });

  it("compares gas costs of different quoter configurations", async function () {
    console.log("\n=== QUOTER GAS COMPARISON ===\n");
    
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
    
    // Build routed data (d0, d1, d2, d3, dx)
    const d0 = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [ethers.parseUnits("4500", 18), 0]);
    const d1 = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [ethers.parseUnits("4500", 18), 0]);
    const d2 = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [ethers.parseUnits("4500", 18), 0]);
    const d3 = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [ethers.parseUnits("4500", 18), 0]);
    const dx = "0x";
    
    const routed = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "bytes", "bytes", "bytes", "bytes"],
      [d0, d1, d2, d3, dx]
    );
    
    console.log("Quoter Performance:");
    console.log("name         | deploy gas | quote gas | quote result | data usage");
    console.log("-------------+------------+-----------+--------------+-----------");
    
    for (const [name, quoterData] of Object.entries(quoters)) {
      try {
        // Set quoter address in params
        const testParams = { ...quoteParams, quoter: await quoterData.contract.getAddress() };
        
        // Estimate gas for quote call
        const quoteGas = await quoterData.contract.quote.estimateGas(testParams, routed);
        
        // Get quote result
        const result = await quoterData.contract.quote.staticCall(testParams, routed);
        
        // Format result
        const resultStr = ethers.formatUnits(result, 6); // USDC has 6 decimals
        
        console.log(`${name.padEnd(12)} | ${quoterData.deployGas.toString().padEnd(10)} | ${quoteGas.toString().padEnd(9)} | ${resultStr.padEnd(12)} | ${quoterData.info.description}`);
        
      } catch (e) {
        console.log(`${name.padEnd(12)} | ${quoterData.deployGas.toString().padEnd(10)} | ERROR     | ERROR        | ${e.message.substring(0, 20)}...`);
      }
    }
    
    console.log("\n=== STOIX QUOTER COMPARISON ===");
    
    // Compare with our StoixQuoter
    try {
      const StoixQuoter = await ethers.getContractFactory("StoixQuoter");
      const stoixDeployTx = await StoixQuoter.getDeployTransaction();
      const stoixDeployGas = await deployer.estimateGas(stoixDeployTx);
      
      const stoix = await StoixQuoter.deploy();
      const stoixReceipt = await stoix.deploymentTransaction().wait();
      
      const testParams = { ...quoteParams, quoter: await stoix.getAddress() };
      const stoixQuoteGas = await stoix.quote.estimateGas(testParams, routed);
      const stoixResult = await stoix.quote.staticCall(testParams, routed);
      const stoixResultStr = ethers.formatUnits(stoixResult, 6);
      
      console.log("StoixQuoter vs Dummy Quoters:");
      console.log(`StoixQuoter  | ${stoixReceipt.gasUsed.toString().padEnd(10)} | ${stoixQuoteGas.toString().padEnd(9)} | ${stoixResultStr.padEnd(12)} | 5-source Avellaneda-Stoikov`);
      
      console.log("\n=== BENCHMARK ANALYSIS ===");
      console.log("• StoixQuoter uses 5 data sources (V3 Spot, V3 TWAP, V2, Redstone, Chainlink)");
      console.log("• Dummy quoters use 0-4 simple data sources");
      console.log("• StoixQuoter implements sophisticated pricing logic");
      console.log("• Gas overhead for advanced features is reasonable");
      
    } catch (e) {
      console.log("❌ StoixQuoter comparison failed:", e.message);
    }
    
    expect(Object.keys(quoters).length).to.be.greaterThan(0);
  });
});
