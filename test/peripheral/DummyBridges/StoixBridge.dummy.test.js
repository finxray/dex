const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StoixBridge Architecture - Dummy Tests", function () {
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
  
  describe("Slot 15 Architecture", function () {
    it("should use slot 15 for consolidated bridge data", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      // Test different function flag combinations
      const allFlags = createMarkings(0x0F); // All sources
      const clv3Flags = createMarkings(0x0A); // Chainlink + V3 only
      
      console.log("All flags markings:", ethers.toBeHex(allFlags, 3));
      console.log("CL+V3 flags markings:", ethers.toBeHex(clv3Flags, 3));
      
      // Create pools
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, ethers.toBeHex(allFlags, 3));
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, ethers.toBeHex(clv3Flags, 3));
      
      // Add liquidity
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, ethers.toBeHex(allFlags, 3), ethers.parseEther("100"), ethers.parseEther("100"));
      
      // Test quotes with different flag combinations
      const swapParams = {
        asset0: tokenAAddr,
        asset1: tokenBAddr,
        quoter: quoterAddr,
        amount: [ethers.parseEther("10")],
        zeroForOne: true,
        marking: [ethers.toBeHex(allFlags, 3)],
        traderProtection: "0x00000000"
      };
      
      const [quoteAll] = await pm.getQuote.staticCall(swapParams, 0n, 0n);
      
      swapParams.marking = [ethers.toBeHex(clv3Flags, 3)];
      const [quoteCLV3] = await pm.getQuote.staticCall(swapParams, 0n, 0n);
      
      console.log("Quote (all flags):", ethers.formatEther(quoteAll));
      console.log("Quote (CL+V3 only):", ethers.formatEther(quoteCLV3));
      
      expect(quoteAll).to.be.gt(0n);
      expect(quoteCLV3).to.be.gt(0n);
      // CL+V3 should be different from all flags (fewer sources)
      expect(quoteAll).to.not.equal(quoteCLV3);
    });
    
    it("should perform swaps with slot 15 consolidated bridge", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      const markings = ethers.toBeHex(createMarkings(0x0F), 3);
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("100"), ethers.parseEther("100"));
      
      const balanceBefore = await tokenB.balanceOf(await user.getAddress());
      
      // Perform swap
      const tx = await pm.swap(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("5"), true, 0n);
      const receipt = await tx.wait();
      
      const balanceAfter = await tokenB.balanceOf(await user.getAddress());
      const received = balanceAfter - balanceBefore;
      
      console.log("Gas used:", receipt.gasUsed.toString());
      console.log("TokenB received:", ethers.formatEther(received));
      
      expect(received).to.be.gt(0n);
      expect(receipt.gasUsed).to.be.lt(150000n); // Should be gas efficient
    });
    
    it("should handle multi-hop swaps", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      const markings = ethers.toBeHex(createMarkings(0x0F), 3);
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("100"), ethers.parseEther("100"));
      
      const balanceBefore = await tokenA.balanceOf(await user.getAddress());
      
      // Multi-hop: A -> B -> A (round trip)
      const hops = [
        {
          asset0: tokenAAddr,
          asset1: tokenBAddr,
          quoter: quoterAddr,
          markings: [markings],
          amounts: [ethers.parseEther("5")],
          zeroForOne: true
        },
        {
          asset0: tokenAAddr,
          asset1: tokenBAddr,
          quoter: quoterAddr,
          markings: [markings],
          amounts: [0n], // Filled by first hop output
          zeroForOne: false
        }
      ];
      
      const tx = await pm.batchSwap(hops, ethers.parseEther("5"), 0n);
      const receipt = await tx.wait();
      
      const balanceAfter = await tokenA.balanceOf(await user.getAddress());
      const loss = balanceBefore - balanceAfter;
      
      console.log("Multi-hop gas used:", receipt.gasUsed.toString());
      console.log("Round-trip loss:", ethers.formatEther(loss));
      
      expect(loss).to.be.gt(0n); // Should have some loss due to fees
      expect(loss).to.be.lt(ethers.parseEther("5")); // But not the full amount
      expect(receipt.gasUsed).to.be.lt(200000n); // Should be gas efficient
    });
  });
  
  describe("Gas Efficiency", function () {
    it("should measure gas costs for different operations", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      const markings = ethers.toBeHex(createMarkings(0x0F), 3);
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
      
      console.log("Quote gas:", quoteGas.toString());
      console.log("Swap gas:", swapGas.toString());
      
      expect(quoteGas).to.be.lt(100000n); // Should be efficient
      expect(swapGas).to.be.lt(150000n); // Should be efficient
    });
  });
});
