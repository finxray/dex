const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StoixBridge Gas Comparison Tests", function () {
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
  
  describe("Gas Efficiency by Source Count", function () {
    it("should compare gas usage across different source combinations", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      // Test different flag combinations and their gas usage
      const testConfigs = [
        { flags: 0x01, label: "V2 only", sources: 1 },
        { flags: 0x02, label: "V3 only", sources: 1 },
        { flags: 0x08, label: "Chainlink only", sources: 1 },
        { flags: 0x03, label: "V2 + V3", sources: 2 },
        { flags: 0x0A, label: "V3 + Chainlink", sources: 2 },
        { flags: 0x0F, label: "All sources", sources: 4 }
      ];
      
      const results = [];
      
      for (const config of testConfigs) {
        const markings = ethers.toBeHex(createMarkings(config.flags), 3);
        
        // Create pool and add liquidity
        await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
        await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("100"), ethers.parseEther("100"));
        
        // Measure quote gas
        const quoteGas = await pm.getQuote.estimateGas({
          asset0: tokenAAddr,
          asset1: tokenBAddr,
          quoter: quoterAddr,
          amount: [ethers.parseEther("1")],
          zeroForOne: true,
          marking: [markings],
          traderProtection: "0x00000000"
        }, 0n, 0n);
        
        // Measure swap gas
        const swapGas = await pm.swap.estimateGas(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1"), true, 0n);
        
        results.push({
          ...config,
          quoteGas: Number(quoteGas),
          swapGas: Number(swapGas)
        });
        
        console.log(`${config.label}: Quote ${quoteGas} gas, Swap ${swapGas} gas`);
      }
      
      // Analyze gas scaling
      console.log("\n=== Gas Scaling Analysis ===");
      const singleSource = results.filter(r => r.sources === 1);
      const multiSource = results.filter(r => r.sources > 1);
      const allSources = results.find(r => r.flags === 0x0F);
      
      const avgSingleQuote = singleSource.reduce((sum, r) => sum + r.quoteGas, 0) / singleSource.length;
      const avgSingleSwap = singleSource.reduce((sum, r) => sum + r.swapGas, 0) / singleSource.length;
      
      console.log(`Average single source - Quote: ${avgSingleQuote.toFixed(0)}, Swap: ${avgSingleSwap.toFixed(0)}`);
      console.log(`All sources - Quote: ${allSources.quoteGas}, Swap: ${allSources.swapGas}`);
      console.log(`Gas overhead per extra source - Quote: ${((allSources.quoteGas - avgSingleQuote) / 3).toFixed(0)}, Swap: ${((allSources.swapGas - avgSingleSwap) / 3).toFixed(0)}`);
      
      // Verify gas efficiency expectations
      expect(allSources.quoteGas).to.be.lt(150000); // Should be under 150k gas
      expect(allSources.swapGas).to.be.lt(200000); // Should be under 200k gas
      
      // Gas should scale reasonably with source count
      expect(allSources.quoteGas).to.be.lt(avgSingleQuote * 2); // Less than 2x single source
      expect(allSources.swapGas).to.be.lt(avgSingleSwap * 2); // Less than 2x single source
    });
  });
  
  describe("Operation Gas Breakdown", function () {
    it("should measure gas for different operations", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      const markings = ethers.toBeHex(createMarkings(0x0F), 3);
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("100"), ethers.parseEther("100"));
      
      // Test different swap amounts
      const amounts = [
        ethers.parseEther("0.1"),
        ethers.parseEther("1"),
        ethers.parseEther("10"),
        ethers.parseEther("50")
      ];
      
      console.log("\n=== Gas by Swap Amount ===");
      for (const amount of amounts) {
        const gas = await pm.swap.estimateGas(tokenAAddr, tokenBAddr, quoterAddr, markings, amount, true, 0n);
        console.log(`${ethers.formatEther(amount)} tokens: ${gas} gas`);
        
        // Gas should be roughly constant regardless of amount
        expect(gas).to.be.lt(200000);
      }
      
      // Test quote vs swap gas difference
      const quoteGas = await pm.getQuote.estimateGas({
        asset0: tokenAAddr,
        asset1: tokenBAddr,
        quoter: quoterAddr,
        amount: [ethers.parseEther("1")],
        zeroForOne: true,
        marking: [markings],
        traderProtection: "0x00000000"
      }, 0n, 0n);
      
      const swapGas = await pm.swap.estimateGas(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1"), true, 0n);
      
      const overhead = Number(swapGas) - Number(quoteGas);
      console.log(`\nQuote gas: ${quoteGas}`);
      console.log(`Swap gas: ${swapGas}`);
      console.log(`Swap overhead: ${overhead} gas`);
      
      // Swap should have reasonable overhead over quote
      expect(overhead).to.be.gt(0); // Swap should use more gas than quote
      expect(overhead).to.be.lt(100000); // But not too much more
    });
  });
  
  describe("Multi-hop Gas Scaling", function () {
    it("should measure gas scaling for multi-hop swaps", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      const markings = ethers.toBeHex(createMarkings(0x0F), 3);
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("100"), ethers.parseEther("100"));
      
      // Single hop gas
      const singleHopGas = await pm.swap.estimateGas(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1"), true, 0n);
      
      // Multi-hop gas (round trip)
      const hops = [
        {
          asset0: tokenAAddr,
          asset1: tokenBAddr,
          quoter: quoterAddr,
          markings: [markings],
          amounts: [ethers.parseEther("1")],
          zeroForOne: true
        },
        {
          asset0: tokenAAddr,
          asset1: tokenBAddr,
          quoter: quoterAddr,
          markings: [markings],
          amounts: [0n],
          zeroForOne: false
        }
      ];
      
      const multiHopGas = await pm.batchSwap.estimateGas(hops, ethers.parseEther("1"), 0n);
      
      console.log(`Single hop gas: ${singleHopGas}`);
      console.log(`Multi-hop (2 hops) gas: ${multiHopGas}`);
      console.log(`Gas per additional hop: ${Number(multiHopGas) - Number(singleHopGas)}`);
      
      // Multi-hop should be less than 2x single hop (due to shared overhead)
      expect(multiHopGas).to.be.lt(Number(singleHopGas) * 2);
      expect(multiHopGas).to.be.lt(300000); // Should be under 300k total
    });
  });
});
