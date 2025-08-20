const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Basic PoolManager Tests", function () {
  let owner, user1;
  let tokenA, tokenB;
  let poolManager;
  let simpleQuoter;
  let mockAlphaDataBridge;
  
  // Simple marking for SimpleQuoter: 0x00000C
  const SIMPLE_MARKING = "0x00000C";
  
  // Mock price data
  const ALPHA_SPOT_PRICE = ethers.parseEther("1.3");
  const ALPHA_TWAP_PRICE = ethers.parseEther("1.28");

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();
    
    console.log("🚀 Starting basic deployment...");
    
    // Deploy test tokens
    const TestTokenA = await ethers.getContractFactory("TestTokenA");
    tokenA = await TestTokenA.deploy();
    await tokenA.waitForDeployment();
    
    const TestTokenB = await ethers.getContractFactory("TestTokenB");
    tokenB = await TestTokenB.deploy();
    await tokenB.waitForDeployment();
    
    // Deploy MockAlphaDataBridge
    const MockAlphaDataBridge = await ethers.getContractFactory("MockAlphaDataBridge");
    mockAlphaDataBridge = await MockAlphaDataBridge.deploy(ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE);
    await mockAlphaDataBridge.waitForDeployment();
    
    // Deploy SimpleQuoter
    const SimpleQuoter = await ethers.getContractFactory("SimpleQuoter");
    simpleQuoter = await SimpleQuoter.deploy();
    await simpleQuoter.waitForDeployment();
    
    // Deploy PoolManager with correct addresses
    const PoolManager = await ethers.getContractFactory("PoolManager");
    poolManager = await PoolManager.deploy(
      await mockAlphaDataBridge.getAddress(), // defaultAlpha
      await simpleQuoter.getAddress()         // defaultBeta
    );
    await poolManager.waitForDeployment();
    
    console.log("✅ Basic deployment complete!");
    console.log("   - TokenA:", await tokenA.getAddress());
    console.log("   - TokenB:", await tokenB.getAddress());
    console.log("   - PoolManager:", await poolManager.getAddress());
    console.log("   - SimpleQuoter:", await simpleQuoter.getAddress());
    
    // Mint some tokens to user1
    await tokenA.mint(user1.address, ethers.parseEther("10000"));
    await tokenB.mint(user1.address, ethers.parseEther("10000"));
    
    // Approve tokens
    await tokenA.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
    await tokenB.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
  });

  describe("Basic Functionality", function () {
    it("Should verify PoolManager constructor addresses", async function () {
      const defaultAlpha = await poolManager.defaultAlpha();
      const defaultBeta = await poolManager.defaultBeta();
      
      expect(defaultAlpha).to.equal(await mockAlphaDataBridge.getAddress());
      expect(defaultBeta).to.equal(await simpleQuoter.getAddress());
      
      console.log("✅ PoolManager addresses correct:");
      console.log("   - defaultAlpha:", defaultAlpha);
      console.log("   - defaultBeta:", defaultBeta);
    });
    
    it("Should create a pool successfully", async function () {
      const tx = await poolManager.connect(user1).createPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await simpleQuoter.getAddress(),
        SIMPLE_MARKING
      );
      
      const receipt = await tx.wait();
      console.log("⛽ Pool creation gas:", receipt.gasUsed.toString());
      
      // Check for PoolCreated event
      const events = receipt.logs.filter(log => {
        try {
          const decoded = poolManager.interface.parseLog(log);
          return decoded && decoded.name === 'PoolCreated';
        } catch (e) {
          return false;
        }
      });
      
      expect(events.length).to.be.greaterThan(0);
      console.log("✅ Pool created successfully!");
    });
    
    it("Should test SimpleQuoter directly", async function () {
      const quoteParams = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await simpleQuoter.getAddress(),
        amount: ethers.parseEther("10"),
        asset0Balance: ethers.parseEther("1000"),
        asset1Balance: ethers.parseEther("1300"),
        bucketID: 0,
        zeroForOne: true
      };
      
      const quote = await simpleQuoter.quote(quoteParams, "0x");
      console.log("💰 SimpleQuoter quote:", ethers.formatEther(quote));
      
      expect(quote).to.be.greaterThan(0);
      console.log("✅ SimpleQuoter working correctly!");
    });
    
    it("Should test MockAlphaDataBridge directly", async function () {
      const mockParams = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await simpleQuoter.getAddress(),
        amount: ethers.parseEther("10"),
        asset0Balance: ethers.parseEther("1000"),
        asset1Balance: ethers.parseEther("1300"),
        bucketID: 0,
        zeroForOne: true
      };
      
      const data = await mockAlphaDataBridge.getData(mockParams);
      const [spotPrice, twapPrice] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], data);
      
      console.log("📊 Alpha data:");
      console.log("   - Spot price:", ethers.formatEther(spotPrice));
      console.log("   - TWAP price:", ethers.formatEther(twapPrice));
      
      expect(spotPrice).to.equal(ALPHA_SPOT_PRICE);
      expect(twapPrice).to.equal(ALPHA_TWAP_PRICE);
      console.log("✅ MockAlphaDataBridge working correctly!");
    });
    
    it("Should add minimal liquidity without running out of gas", async function () {
      // Create pool first
      await poolManager.connect(user1).createPool(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await simpleQuoter.getAddress(),
        SIMPLE_MARKING
      );
      
      // Try with smaller amounts to avoid gas issues
      const smallAmount0 = ethers.parseEther("10");   // 10 tokens
      const smallAmount1 = ethers.parseEther("13");   // 13 tokens
      
      console.log("💧 Adding liquidity...");
      console.log("   - Amount0:", ethers.formatEther(smallAmount0));
      console.log("   - Amount1:", ethers.formatEther(smallAmount1));
      
      const tx = await poolManager.connect(user1).addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await simpleQuoter.getAddress(),
        SIMPLE_MARKING,
        smallAmount0,
        smallAmount1,
        { gasLimit: 500000 } // Explicit gas limit
      );
      
      const receipt = await tx.wait();
      console.log("⛽ Add liquidity gas:", receipt.gasUsed.toString());
      
      // Check that liquidity was added
      const poolID = await calculatePoolID(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        await simpleQuoter.getAddress(),
        SIMPLE_MARKING
      );
      
      const totalLiquidity = await poolManager.totalLiquidity(poolID);
      expect(totalLiquidity).to.be.greaterThan(0);
      
      console.log("✅ Liquidity added successfully!");
      console.log("   - Total liquidity:", ethers.formatEther(totalLiquidity));
    });
  });

  // Helper function to calculate pool ID
  async function calculatePoolID(asset0, asset1, quoter, marking) {
    const a0 = asset0.toLowerCase();
    const a1 = asset1.toLowerCase();
    const [x0, x1] = a0 < a1 ? [asset0, asset1] : [asset1, asset0];
    return ethers.solidityPackedKeccak256(
      ["address", "address", "address", "bytes3"],
      [x0, x1, quoter, marking]
    );
  }
});