const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Minimal PoolManager Test", function () {
  it("Should test basic functionality step by step", async function () {
    const [owner, user1] = await ethers.getSigners();
    
    // Deploy minimal contracts
    const TestTokenA = await ethers.getContractFactory("TestTokenA");
    const tokenA = await TestTokenA.deploy();
    
    const TestTokenB = await ethers.getContractFactory("TestTokenB");
    const tokenB = await TestTokenB.deploy();
    
    const MockAlphaDataBridge = await ethers.getContractFactory("MockAlphaDataBridge");
    const mockAlpha = await MockAlphaDataBridge.deploy(
      ethers.parseEther("1.3"), 
      ethers.parseEther("1.28")
    );
    
    const SimpleQuoter = await ethers.getContractFactory("SimpleQuoter");
    const simpleQuoter = await SimpleQuoter.deploy();
    
    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(
      await mockAlpha.getAddress(),
      await simpleQuoter.getAddress()
    );
    
    console.log("✅ All contracts deployed successfully");
    
    // Test 1: Check if pool creation works
    const SIMPLE_MARKING = "0x00000C";
    
    const createTx = await poolManager.connect(user1).createPool(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await simpleQuoter.getAddress(),
      SIMPLE_MARKING
    );
    await createTx.wait();
    console.log("✅ Pool created successfully");
    
    // Test 2: Calculate pool ID manually to verify it matches
    const a0 = (await tokenA.getAddress()).toLowerCase();
    const a1 = (await tokenB.getAddress()).toLowerCase();
    const [x0, x1] = a0 < a1 ? [await tokenA.getAddress(), await tokenB.getAddress()] : [await tokenB.getAddress(), await tokenA.getAddress()];
    const calculatedPoolID = ethers.solidityPackedKeccak256(
      ["address", "address", "address", "bytes3"],
      [x0, x1, await simpleQuoter.getAddress(), SIMPLE_MARKING]
    );
    console.log("📊 Calculated Pool ID:", calculatedPoolID);
    
    // Test 3: Check inventory before adding liquidity
    const [initialAsset0, initialAsset1] = await poolManager.getInventory(calculatedPoolID);
    console.log("📦 Initial inventory - Asset0:", initialAsset0.toString(), "Asset1:", initialAsset1.toString());
    
    // Test 4: Check total liquidity before
    const initialTotalLiquidity = await poolManager.totalLiquidity(calculatedPoolID);
    console.log("💧 Initial total liquidity:", initialTotalLiquidity.toString());
    
    // Test 5: Setup tokens and try minimal liquidity addition
    await tokenA.mint(user1.address, ethers.parseEther("100"));
    await tokenB.mint(user1.address, ethers.parseEther("100"));
    await tokenA.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
    await tokenB.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
    
    console.log("💰 Tokens minted and approved");
    
    // Test 6: Try to add a very small amount of liquidity
    const smallAmount0 = ethers.parseEther("1");
    const smallAmount1 = ethers.parseEther("1");
    
    console.log("🔄 Attempting to add liquidity...");
    console.log("   - Amount0:", ethers.formatEther(smallAmount0));
    console.log("   - Amount1:", ethers.formatEther(smallAmount1));
    
    try {
      // Let's manually call the library function to test
      const PoolManagerLib = await ethers.getContractFactory("PoolManagerLib");
      
      // Test the calculation directly
      console.log("🧮 Testing liquidity calculation manually:");
      console.log("   - totalLiquidity[poolID] should be 0 for new pool");
      console.log("   - amount0 + amount1 =", ethers.formatEther(smallAmount0 + smallAmount1));
      
      const liquidityTx = await poolManager.connect(user1).addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await simpleQuoter.getAddress(),
        SIMPLE_MARKING,
        smallAmount0,
        smallAmount1,
        { gasLimit: 1000000 }
      );
      
      const receipt = await liquidityTx.wait();
      console.log("⛽ Gas used:", receipt.gasUsed.toString());
      
      // Check results
      const [finalAsset0, finalAsset1] = await poolManager.getInventory(calculatedPoolID);
      const finalTotalLiquidity = await poolManager.totalLiquidity(calculatedPoolID);
      const userLPBalance = await poolManager.balanceOf(user1.address, calculatedPoolID);
      
      console.log("📊 Final Results:");
      console.log("   - Pool Asset0:", finalAsset0.toString());
      console.log("   - Pool Asset1:", finalAsset1.toString());
      console.log("   - Total Liquidity:", finalTotalLiquidity.toString());
      console.log("   - User LP Balance:", userLPBalance.toString());
      
      // Check if anything changed
      if (finalTotalLiquidity > 0) {
        console.log("✅ SUCCESS: Liquidity was added!");
      } else {
        console.log("❌ FAILED: No liquidity was added");
        
        // Check if tokens were transferred
        const userBalanceA = await tokenA.balanceOf(user1.address);
        const userBalanceB = await tokenB.balanceOf(user1.address);
        console.log("   - User TokenA balance:", ethers.formatEther(userBalanceA));
        console.log("   - User TokenB balance:", ethers.formatEther(userBalanceB));
        
        if (userBalanceA < ethers.parseEther("100") || userBalanceB < ethers.parseEther("100")) {
          console.log("   - Tokens were transferred but liquidity/inventory not updated");
        } else {
          console.log("   - No tokens were transferred");
        }
      }
      
    } catch (error) {
      console.error("❌ Transaction failed:", error.message);
      
      if (error.message.includes("InsufficientLiquidityMinted")) {
        console.log("   - The liquidity calculation returned 0");
      }
    }
  });
});