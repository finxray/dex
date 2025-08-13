const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Simple Add Liquidity Test", function () {
  let poolManager, tokenA, tokenB, simpleQuoter, mockAlphaDataBridge;
  let user1;
  
  const SIMPLE_MARKING = "0x00000C";
  
  beforeEach(async function () {
    [, user1] = await ethers.getSigners();
    
    // Deploy contracts
    const TestTokenA = await ethers.getContractFactory("TestTokenA");
    tokenA = await TestTokenA.deploy();
    
    const TestTokenB = await ethers.getContractFactory("TestTokenB");
    tokenB = await TestTokenB.deploy();
    
    const MockAlphaDataBridge = await ethers.getContractFactory("MockAlphaDataBridge");
    mockAlphaDataBridge = await MockAlphaDataBridge.deploy(
      ethers.parseEther("1.3"), 
      ethers.parseEther("1.28")
    );
    
    const SimpleQuoter = await ethers.getContractFactory("SimpleQuoter");
    simpleQuoter = await SimpleQuoter.deploy();
    
    const PoolManager = await ethers.getContractFactory("PoolManager");
    poolManager = await PoolManager.deploy(
      await mockAlphaDataBridge.getAddress(),
      await simpleQuoter.getAddress()
    );
    
    // Setup tokens
    await tokenA.mint(user1.address, ethers.parseEther("1000"));
    await tokenB.mint(user1.address, ethers.parseEther("1000"));
    await tokenA.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
    await tokenB.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
  });

  it("Should calculate liquidity correctly", async function () {
    // Manual calculation test
    const amount0 = ethers.parseEther("10");  // 10 tokens
    const amount1 = ethers.parseEther("13");  // 13 tokens
    const rate = ethers.parseEther("1.3");    // 1.3 * 1e18
    
    // Expected: amount0 + (amount1 * 1e18) / rate
    // = 10 + (13 * 1e18) / (1.3 * 1e18)
    // = 10 + 13 / 1.3
    // = 10 + 10 = 20
    
    const expectedLiquidity = amount0 + (amount1 * ethers.parseEther("1")) / rate;
    console.log("Expected liquidity:", ethers.formatEther(expectedLiquidity));
    
    // Create pool
    await poolManager.connect(user1).createPool(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await simpleQuoter.getAddress(),
      SIMPLE_MARKING
    );
    
    // Check user balances before
    const balanceA_before = await tokenA.balanceOf(user1.address);
    const balanceB_before = await tokenB.balanceOf(user1.address);
    console.log("User balance A before:", ethers.formatEther(balanceA_before));
    console.log("User balance B before:", ethers.formatEther(balanceB_before));
    
    // Add liquidity
    try {
      const tx = await poolManager.connect(user1).addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await simpleQuoter.getAddress(),
        SIMPLE_MARKING,
        amount0,
        amount1,
        { gasLimit: 500000 }
      );
      
      const receipt = await tx.wait();
      console.log("Gas used:", receipt.gasUsed.toString());
      
      // Check user balances after
      const balanceA_after = await tokenA.balanceOf(user1.address);
      const balanceB_after = await tokenB.balanceOf(user1.address);
      console.log("User balance A after:", ethers.formatEther(balanceA_after));
      console.log("User balance B after:", ethers.formatEther(balanceB_after));
      
      // Check pool inventory
      const poolID = ethers.solidityPackedKeccak256(
        ["address", "address", "address", "bytes3"],
        [await tokenA.getAddress(), await tokenB.getAddress(), await simpleQuoter.getAddress(), SIMPLE_MARKING]
      );
      
      const [asset0, asset1] = await poolManager.getInventory(poolID);
      console.log("Pool asset0:", ethers.formatEther(asset0));
      console.log("Pool asset1:", ethers.formatEther(asset1));
      
      const totalLiquidity = await poolManager.totalLiquidity(poolID);
      console.log("Total liquidity:", ethers.formatEther(totalLiquidity));
      
      // Check user's LP token balance
      const userLPBalance = await poolManager.balanceOf(user1.address, poolID);
      console.log("User LP balance:", ethers.formatEther(userLPBalance));
      
      // Assertions
      expect(totalLiquidity).to.be.greaterThan(0);
      expect(userLPBalance).to.equal(totalLiquidity);
      expect(asset0).to.equal(amount0);
      expect(asset1).to.equal(amount1);
      
    } catch (error) {
      console.error("Transaction failed:", error.message);
      
      // Let's try to understand why it failed
      if (error.message.includes("InsufficientLiquidityMinted")) {
        console.log("❌ Liquidity calculation returned 0");
        
        // Manual debug of the calculation
        console.log("Debug calculation:");
        console.log("- amount0:", ethers.formatEther(amount0));
        console.log("- amount1:", ethers.formatEther(amount1));
        console.log("- rate:", ethers.formatEther(rate));
        console.log("- amount1 * 1e18:", ethers.formatEther(amount1 * ethers.parseEther("1")));
        console.log("- (amount1 * 1e18) / rate:", ethers.formatEther((amount1 * ethers.parseEther("1")) / rate));
        console.log("- valueAdded:", ethers.formatEther(amount0 + (amount1 * ethers.parseEther("1")) / rate));
      }
      
      throw error;
    }
  });
});