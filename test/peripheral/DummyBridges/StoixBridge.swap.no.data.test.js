const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StoixBridge swap() with No Data", function () {
  let pm, lm, quoter, bridge;
  let tokenA, tokenB, user;
  
  // Helper to create slot 15 markings
  function createMarkings(functionFlags) {
    return (functionFlags << 4) | (15 << 20); // bucketID=functionFlags, extraBridgeSlot=15
  }
  
  beforeEach(async function () {
    [user] = await ethers.getSigners();
    
    // Deploy test tokens
    const TA = await ethers.getContractFactory("TestTokenA");
    const TB = await ethers.getContractFactory("TestTokenB");
    tokenA = await TA.deploy();
    tokenB = await TB.deploy();
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();
    
    // Deploy MockStoixDataBridge
    const Bridge = await ethers.getContractFactory("MockStoixDataBridge");
    bridge = await Bridge.deploy();
    await bridge.waitForDeployment();
    
    // Deploy StoixQuoter
    const StoixQuoter = await ethers.getContractFactory("StoixQuoter");
    quoter = await StoixQuoter.deploy();
    await quoter.waitForDeployment();
    
    // Deploy PoolManager with MockStoixDataBridge
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(await bridge.getAddress());
    await pm.waitForDeployment();
    
    // Deploy LiquidityManager
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    lm = await LiquidityManager.deploy(await pm.getAddress());
    await lm.waitForDeployment();
    await pm.setLiquidityManager(await lm.getAddress());
    
    // Mint tokens and approve
    await tokenA.mint(await user.getAddress(), ethers.parseEther("1000"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("1000"));
    await tokenA.approve(await pm.getAddress(), ethers.MaxUint256);
    await tokenB.approve(await pm.getAddress(), ethers.MaxUint256);
  });
  
  describe("Zero Data Sources", function () {
    it("should handle swap() attempt with no data sources (flags = 0x00)", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      console.log("=== TESTING SWAP WITH NO DATA SOURCES ===");
      
      // Create markings with NO data sources enabled (functionFlags = 0x00)
      const noDataFlags = 0x00;
      const markings = ethers.toBeHex(createMarkings(noDataFlags), 3);
      
      console.log("Function flags:", "0x" + noDataFlags.toString(16).padStart(2, '0'));
      console.log("Markings:", markings);
      
      // Create pool and add liquidity
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("100"), ethers.parseEther("100"));
      
      console.log("\n=== BRIDGE DATA WITH NO FLAGS ===");
      // Check what bridge returns with no flags
      const paramsBase = {
        asset0: tokenAAddr,
        asset1: tokenBAddr,
        quoter: quoterAddr,
        amount: ethers.parseEther("1"),
        asset0Balance: 0n,
        asset1Balance: 0n,
        bucketID: 0n,
        zeroForOne: true,
        functionFlags: noDataFlags
      };
      
      const bridgeData = await bridge.getData.staticCall(paramsBase);
      console.log("Bridge data length:", bridgeData.length);
      
      if (bridgeData.length > 0) {
        const [mask, v2Q, v3Q, twQ, clQ] = ethers.AbiCoder.defaultAbiCoder().decode(["uint8","uint128","uint128","uint128","uint128"], bridgeData);
        console.log("Data mask:", "0b" + mask.toString(2).padStart(8, '0'), `(0x${mask.toString(16)})`);
        console.log("V2 price:", v2Q.toString());
        console.log("V3 price:", v3Q.toString()); 
        console.log("TWAP price:", twQ.toString());
        console.log("Chainlink price:", clQ.toString());
      } else {
        console.log("Bridge returned empty data");
      }
      
      console.log("\n=== QUOTER RESPONSE ===");
      // Test quoter directly
      const routedData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes","bytes","bytes","bytes","bytes"],
        ["0x","0x","0x","0x", bridgeData]
      );
      const directQuote = await quoter.quote.staticCall(paramsBase, routedData);
      console.log("Direct quoter result:", directQuote.toString());
      
      console.log("\n=== POOLMANAGER QUOTE ===");
      // Test through PoolManager
      const swapParams = {
        asset0: tokenAAddr,
        asset1: tokenBAddr,
        quoter: quoterAddr,
        amount: [ethers.parseEther("1")],
        zeroForOne: true,
        marking: [markings],
        traderProtection: "0x00000000"
      };
      
      const [pmQuote] = await pm.getQuote.staticCall(swapParams, 0n, 0n);
      console.log("PoolManager quote result:", pmQuote.toString());
      
      console.log("\n=== SWAP ATTEMPT ===");
      if (pmQuote === 0n) {
        console.log("Quote is 0 - testing if swap reverts...");
        
        // Test if swap reverts with 0 quote
        try {
          const gasEstimate = await pm.swap.estimateGas(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1"), true, 0n);
          console.log("Unexpected: Swap gas estimate succeeded:", gasEstimate.toString());
        } catch (error) {
          console.log("Expected: Swap reverted with error:", error.message.split('(')[0]);
          
          // Check if it's the expected InvalidQuote error
          if (error.message.includes("PoolManager__InvalidQuote")) {
            console.log("✅ Correctly reverted with PoolManager__InvalidQuote()");
          } else {
            console.log("❌ Unexpected revert reason");
          }
        }
      } else {
        console.log("Unexpected: Quote is non-zero, attempting swap...");
        const tx = await pm.swap(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1"), true, 0n);
        const receipt = await tx.wait();
        console.log("Swap succeeded with gas:", receipt.gasUsed.toString());
      }
      
      // Verify expected behavior
      expect(directQuote).to.equal(0n); // Direct quoter should return 0
      expect(pmQuote).to.equal(0n); // PoolManager should return 0
    });
    
    it("should test different invalid flag combinations", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      console.log("\n=== TESTING VARIOUS INVALID FLAG COMBINATIONS ===");
      
      const testConfigs = [
        { flags: 0x00, label: "No flags", description: "All sources disabled" },
        { flags: 0x80, label: "Invalid flag", description: "Non-existent source flag" },
        { flags: 0xF0, label: "High bits", description: "Flags in reserved range" }
      ];
      
      for (const config of testConfigs) {
        console.log(`\n--- Testing ${config.label} (${config.description}) ---`);
        
        const markings = ethers.toBeHex(createMarkings(config.flags), 3);
        
        // Create pool
        await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
        await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("100"), ethers.parseEther("100"));
        
        // Test quote
        const swapParams = {
          asset0: tokenAAddr,
          asset1: tokenBAddr,
          quoter: quoterAddr,
          amount: [ethers.parseEther("1")],
          zeroForOne: true,
          marking: [markings],
          traderProtection: "0x00000000"
        };
        
        const [quote] = await pm.getQuote.staticCall(swapParams, 0n, 0n);
        console.log(`Flags 0x${config.flags.toString(16).padStart(2, '0')}: Quote = ${quote.toString()}`);
        
        // Test swap behavior
        if (quote === 0n) {
          try {
            await pm.swap.estimateGas(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1"), true, 0n);
            console.log("❌ Swap unexpectedly succeeded");
          } catch (error) {
            if (error.message.includes("PoolManager__InvalidQuote")) {
              console.log("✅ Correctly reverted with InvalidQuote");
            } else {
              console.log("⚠️  Reverted with different error:", error.message.split('(')[0]);
            }
          }
        } else {
          console.log("⚠️  Non-zero quote with invalid flags");
        }
        
        expect(quote).to.equal(0n); // All invalid configs should return 0
      }
    });
  });
  
  describe("Edge Cases", function () {
    it("should handle slot 15 but no function flags", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      console.log("\n=== TESTING SLOT 15 WITH NO FUNCTION FLAGS ===");
      
      // This tests the edge case where extraBridgeSlot=15 (consolidated bridge)
      // but functionFlags=0 (no data sources requested)
      const markings = (0 << 4) | (15 << 20); // bucketID=0, extraBridgeSlot=15
      const markingsB3 = ethers.toBeHex(markings, 3);
      
      console.log("Markings (slot 15, no flags):", markingsB3);
      
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markingsB3);
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markingsB3, ethers.parseEther("100"), ethers.parseEther("100"));
      
      // Test what _inferFunctionFlags returns
      console.log("Expected _inferFunctionFlags result: 0 (bucketID=0, so returns 0)");
      
      const swapParams = {
        asset0: tokenAAddr,
        asset1: tokenBAddr,
        quoter: quoterAddr,
        amount: [ethers.parseEther("1")],
        zeroForOne: true,
        marking: [markingsB3],
        traderProtection: "0x00000000"
      };
      
      const [quote] = await pm.getQuote.staticCall(swapParams, 0n, 0n);
      console.log("Quote result:", quote.toString());
      
      expect(quote).to.equal(0n); // Should return 0 because functionFlags=0
    });
  });
});
