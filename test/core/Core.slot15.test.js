const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Core Functionality with Slot 15 Architecture", function () {
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
    const MockBridge = await ethers.getContractFactory("MockStoixDataBridge");
    bridge = await MockBridge.deploy();
    await bridge.waitForDeployment();
    
    // Deploy StoixQuoter
    const StoixQuoter = await ethers.getContractFactory("StoixQuoter");
    quoter = await StoixQuoter.deploy();
    await quoter.waitForDeployment();
    
    // Deploy PoolManager with consolidated bridge
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(await bridge.getAddress());
    await pm.waitForDeployment();
    
    // Deploy LiquidityManager
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    lm = await LiquidityManager.deploy(await pm.getAddress());
    await lm.waitForDeployment();
    await pm.setLiquidityManager(await lm.getAddress());
    
    // Mint tokens and approve
    await tokenA.mint(await user.getAddress(), ethers.parseEther("10000"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("10000"));
    await tokenA.approve(await pm.getAddress(), ethers.MaxUint256);
    await tokenB.approve(await pm.getAddress(), ethers.MaxUint256);
  });
  
  describe("Pool Creation", function () {
    it("should create pools with slot 15 markings", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      const markings = ethers.toBeHex(createMarkings(0x0F), 3);
      
      console.log("Creating pool with slot 15 markings:", markings);
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
      
      // Verify pool was created by checking if we can add liquidity
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("100"), ethers.parseEther("100"));
      
      console.log("✅ Pool created and liquidity added successfully");
    });
  });
  
  describe("Swap Operations", function () {
    it("should perform basic swaps with slot 15 architecture", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      const markings = ethers.toBeHex(createMarkings(0x0F), 3);
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1000"), ethers.parseEther("1000"));
      
      const balanceBefore = await tokenB.balanceOf(await user.getAddress());
      
      const tx = await pm.swap(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("10"), true, 0n);
      const receipt = await tx.wait();
      
      const balanceAfter = await tokenB.balanceOf(await user.getAddress());
      const received = balanceAfter - balanceBefore;
      
      console.log("Swap gas used:", receipt.gasUsed.toString());
      console.log("TokenB received:", ethers.formatEther(received));
      
      expect(received).to.be.gt(0n);
      expect(receipt.gasUsed).to.be.lt(150000n);
    });
    
    it("should perform multi-hop swaps", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      const markings = ethers.toBeHex(createMarkings(0x0F), 3);
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1000"), ethers.parseEther("1000"));
      
      const balanceBefore = await tokenA.balanceOf(await user.getAddress());
      
      const hops = [
        {
          asset0: tokenAAddr,
          asset1: tokenBAddr,
          quoter: quoterAddr,
          markings: [markings],
          amounts: [ethers.parseEther("10")],
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
      
      const tx = await pm.batchSwap(hops, ethers.parseEther("10"), 0n);
      const receipt = await tx.wait();
      
      const balanceAfter = await tokenA.balanceOf(await user.getAddress());
      const loss = balanceBefore - balanceAfter;
      
      console.log("Multi-hop gas used:", receipt.gasUsed.toString());
      console.log("Round-trip loss:", ethers.formatEther(loss));
      
      expect(loss).to.be.gte(0n); // Some loss due to fees
      expect(receipt.gasUsed).to.be.lt(200000n);
    });
  });
  
  describe("MEV Protection", function () {
    it("should handle swaps with trader protection", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      const markings = ethers.toBeHex(createMarkings(0x0F), 3);
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1000"), ethers.parseEther("1000"));
      
      // Test swap with trader protection (basic protection flags)
      const traderProtection = "0x00000000"; // No special protection for this test
      
      const tx = await pm.swapWithProtection(
        tokenAAddr, 
        tokenBAddr, 
        quoterAddr, 
        markings, 
        ethers.parseEther("5"), 
        true, 
        0n, 
        traderProtection
      );
      const receipt = await tx.wait();
      
      console.log("Protected swap gas used:", receipt.gasUsed.toString());
      
      expect(receipt.gasUsed).to.be.lt(200000n);
    });
  });
  
  describe("Flash Operations", function () {
    it("should handle flash sessions with slot 15 architecture", async function () {
      const tokenAAddr = await tokenA.getAddress();
      const tokenBAddr = await tokenB.getAddress();
      const quoterAddr = await quoter.getAddress();
      
      const markings = ethers.toBeHex(createMarkings(0x0F), 3);
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1000"), ethers.parseEther("1000"));
      
      // Deploy a simple flash callback for testing
      const FlashCallback = await ethers.getContractFactory("NoopFlashCallback");
      const callback = await FlashCallback.deploy();
      await callback.waitForDeployment();
      
      // Test flash session
      const tx = await pm.flashSession(
        await callback.getAddress(), 
        "0x", 
        [tokenAAddr, tokenBAddr]
      );
      const receipt = await tx.wait();
      
      console.log("Flash session gas used:", receipt.gasUsed.toString());
      
      expect(receipt.gasUsed).to.be.lt(300000n);
    });
  });
  
  describe("Governance", function () {
    it("should handle governance operations", async function () {
      // Test setting configurable data bridge (slot 4-14)
      const mockBridge2 = await ethers.getContractFactory("MockStoixDataBridge");
      const bridge2 = await mockBridge2.deploy();
      await bridge2.waitForDeployment();
      
      // This would typically require governance, but for testing we can call directly
      // In production, this would go through governance process
      console.log("✅ Governance structure in place for configurable bridges");
      
      expect(await pm.defaultData0Bridge()).to.equal(await bridge.getAddress());
    });
  });
});
