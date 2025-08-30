const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Quoter Demo - WETH/USDC", function () {
  let deployer, lp, trader;
  let weth, usdc;
  let pm;
  let mockV3TWAPBridge, mockChainlinkBridge, mockV3DataBridge, mockRedstoneBridge;
  let mockUniV2Bridge, mockSushiV2Bridge;
  let v3twapChainlinkQuoter, v3dataRedstoneQuoter, v2v3twapQuoter;

  const WETH_AMOUNT = ethers.parseEther("100"); // 100 WETH
  const USDC_AMOUNT = ethers.parseUnits("130000", 6); // 130,000 USDC (1 ETH = ~1300 USDC)
  const SWAP_AMOUNT = ethers.parseEther("1"); // 1 WETH

  before(async function () {
    [deployer, lp, trader] = await ethers.getSigners();

    // Deploy WETH and USDC mock tokens
    const MockWETH = await ethers.getContractFactory("TestTokenA");
    const MockUSDC = await ethers.getContractFactory("TestTokenB");
    weth = await MockWETH.deploy();
    usdc = await MockUSDC.deploy();
    await weth.waitForDeployment();
    await usdc.waitForDeployment();

    console.log(`\n📍 Token Addresses:`);
    console.log(`   WETH: ${await weth.getAddress()}`);
    console.log(`   USDC: ${await usdc.getAddress()}`);

    // Deploy dummy data bridges for PoolManager
    const D0 = await ethers.getContractFactory("DummyData0");
    const D1 = await ethers.getContractFactory("DummyData1");
    const D2 = await ethers.getContractFactory("DummyData2");
    const D3 = await ethers.getContractFactory("DummyData3");
    const d0 = await D0.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d1 = await D1.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d2 = await D2.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d3 = await D3.deploy(ethers.hexlify(ethers.randomBytes(8)));

    // Deploy PoolManager
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(
      await d0.getAddress(),
      await d1.getAddress(),
      await d2.getAddress(),
      await d3.getAddress()
    );
    await pm.waitForDeployment();

    console.log(`\n🏭 PoolManager: ${await pm.getAddress()}`);

    // Mint and approve tokens
    for (const u of [lp, trader]) {
      await weth.mint(u.address, ethers.parseEther("10000"));
      await usdc.mint(u.address, ethers.parseUnits("13000000", 6)); // 13M USDC
      await weth.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
      await usdc.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
    }

    // Deploy mock data bridges with realistic WETH/USDC prices
    await deployMockBridges();
    
    // Deploy quoters
    await deployQuoters();
  });

  async function deployMockBridges() {
    // Mock V3TWAP Bridge - returns (spot, twap) in 1e18 format
    const MockV3TWAPBridge = await ethers.getContractFactory("MockV3TWAPBridge");
    mockV3TWAPBridge = await MockV3TWAPBridge.deploy();

    // Mock Chainlink Bridge - returns (spot, updatedAt) in 1e18 format
    const MockChainlinkBridge = await ethers.getContractFactory("MockChainlinkBridge");
    mockChainlinkBridge = await MockChainlinkBridge.deploy();

    // Mock V3Data Bridge - returns (spot, spot) in 1e18 format
    const MockV3DataBridge = await ethers.getContractFactory("MockV3DataBridge");
    mockV3DataBridge = await MockV3DataBridge.deploy();

    // Mock Redstone Bridge - returns (spot, updatedAt) in 1e18 format
    const MockRedstoneBridge = await ethers.getContractFactory("MockRedstoneBridge");
    mockRedstoneBridge = await MockRedstoneBridge.deploy();

    // Mock UniV2 Bridge - returns (spot, twap) in 1e18 format
    const MockUniV2Bridge = await ethers.getContractFactory("MockUniV2Bridge");
    mockUniV2Bridge = await MockUniV2Bridge.deploy();

    // Mock SushiV2 Bridge - returns (spot, spot) in 1e18 format
    const MockSushiV2Bridge = await ethers.getContractFactory("MockSushiV2Bridge");
    mockSushiV2Bridge = await MockSushiV2Bridge.deploy();
  }

  async function deployQuoters() {
    // Deploy V3TWAP + Chainlink Quoter
    const V3TWAPChainlinkQuoter = await ethers.getContractFactory("V3TWAPChainlinkQuoterFixed");
    v3twapChainlinkQuoter = await V3TWAPChainlinkQuoter.deploy(
      await mockV3TWAPBridge.getAddress(),
      await mockChainlinkBridge.getAddress()
    );
    await v3twapChainlinkQuoter.waitForDeployment();

    // Deploy V3Data + RedStone Quoter
    const V3DataRedStoneQuoter = await ethers.getContractFactory("V3DataRedStoneQuoterFixed");
    v3dataRedstoneQuoter = await V3DataRedStoneQuoter.deploy(
      await mockV3DataBridge.getAddress(),
      await mockRedstoneBridge.getAddress()
    );
    await v3dataRedstoneQuoter.waitForDeployment();

    // Deploy V2 + V3TWAP Quoter
    const V2V3TWAPQuoter = await ethers.getContractFactory("V2V3TWAPQuoterFixed");
    v2v3twapQuoter = await V2V3TWAPQuoter.deploy(
      await mockUniV2Bridge.getAddress(),
      await mockSushiV2Bridge.getAddress(),
      await mockV3TWAPBridge.getAddress()
    );
    await v2v3twapQuoter.waitForDeployment();

    console.log(`\n🔧 Quoter Addresses:`);
    console.log(`   V3TWAP+Chainlink: ${await v3twapChainlinkQuoter.getAddress()}`);
    console.log(`   V3Data+RedStone:  ${await v3dataRedstoneQuoter.getAddress()}`);
    console.log(`   V2+V3TWAP:        ${await v2v3twapQuoter.getAddress()}`);
  }

  async function setupPool(quoter, quoterName, marking) {
    console.log(`\n🏊 Creating Pool for ${quoterName}:`);
    console.log(`   Quoter: ${await quoter.getAddress()}`);
    console.log(`   Marking: ${marking}`);
    console.log(`   WETH Amount: ${ethers.formatEther(WETH_AMOUNT)} WETH`);
    console.log(`   USDC Amount: ${ethers.formatUnits(USDC_AMOUNT, 6)} USDC`);

    const createPoolTx = await pm.connect(lp).createPool(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking
    );
    const createPoolReceipt = await createPoolTx.wait();
    
    // Calculate poolID using the same logic as the contract
    const wethAddr = await weth.getAddress();
    const usdcAddr = await usdc.getAddress();
    const quoterAddr = await quoter.getAddress();
    
    // Canonicalize asset order: asset0 < asset1
    const [a0, a1] = wethAddr < usdcAddr ? [wethAddr, usdcAddr] : [usdcAddr, wethAddr];
    const poolID = ethers.keccak256(ethers.solidityPacked(
      ["address", "address", "address", "bytes3"],
      [a0, a1, quoterAddr, marking]
    ));

    await pm.connect(lp).addLiquidity(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      WETH_AMOUNT,
      USDC_AMOUNT
    );

    // Get pool info
    const poolInfo = await pm.getPoolInfo(poolID);
    const inventory = await pm.getInventory(poolID);
    
    console.log(`   ✅ Pool Created - ID: ${poolID}`);
    console.log(`   📊 Pool Info:`);
    console.log(`      Asset0: ${poolInfo[0]}`);
    console.log(`      Asset1: ${poolInfo[1]}`);
    console.log(`      Quoter: ${poolInfo[2]}`);
    console.log(`      Inventory: ${ethers.formatEther(inventory[0])} WETH, ${ethers.formatUnits(inventory[1], 6)} USDC`);
    
    return poolID;
  }

  it("should demonstrate quoter functionality with WETH/USDC", async function () {
    const quoters = [
      { contract: v3twapChainlinkQuoter, name: "V3TWAP+Chainlink", marking: "0x000003" },
      { contract: v3dataRedstoneQuoter, name: "V3Data+RedStone", marking: "0x000009" },
      { contract: v2v3twapQuoter, name: "V2+V3TWAP", marking: "0x00000E" }
    ];

    console.log(`\n🚀 WETH/USDC Quoter Demonstration`);
    console.log(`   Swap Amount: ${ethers.formatEther(SWAP_AMOUNT)} WETH → USDC`);

    const results = [];

    for (const { contract, name, marking } of quoters) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📈 Testing ${name}`);
      console.log(`${'='.repeat(60)}`);

      // Setup pool
      const poolID = await setupPool(contract, name, marking);

      // Get actual inventory from the pool
      const actualInventory = await pm.getInventory(poolID);
      
      // Get quote directly from quoter
      const quoteParams = {
        asset0: await weth.getAddress(),
        asset1: await usdc.getAddress(),
        quoter: await contract.getAddress(),
        amount: SWAP_AMOUNT,
        asset0Balance: actualInventory[0], // Use actual inventory
        asset1Balance: actualInventory[1], // Use actual inventory
        bucketID: 0,
        zeroForOne: true
      };

      console.log(`\n🔍 Pool Inventory Check:`);
      console.log(`   Asset0 Balance: ${ethers.formatEther(actualInventory[0])} WETH`);
      console.log(`   Asset1 Balance: ${ethers.formatUnits(actualInventory[1], 6)} USDC`);

      try {
        const quote = await contract.quote.staticCall(quoteParams, "0x");
        const quoteFormatted = quote ? ethers.formatUnits(quote, 6) : "0"; // USDC has 6 decimals
        
        console.log(`\n💰 Quote Result:`);
        console.log(`   Input:  ${ethers.formatEther(SWAP_AMOUNT)} WETH`);
        console.log(`   Output: ${quoteFormatted} USDC`);
        console.log(`   Rate:   1 WETH = ${quoteFormatted} USDC`);

        // Execute swap and measure gas
        const balanceBefore = await usdc.balanceOf(trader.address);
        
        const tx = await pm.connect(trader).swap(
          await weth.getAddress(),
          await usdc.getAddress(),
          await contract.getAddress(),
          marking,
          SWAP_AMOUNT,
          true, // zeroForOne
          0 // minAmountOut
        );

        const receipt = await tx.wait();
        const balanceAfter = await usdc.balanceOf(trader.address);
        const actualOutput = balanceAfter - balanceBefore;

        console.log(`\n⛽ Gas Usage:`);
        console.log(`   Gas Used: ${receipt.gasUsed.toLocaleString()}`);
        console.log(`   Gas Price: ${ethers.formatUnits(receipt.gasPrice || 0, "gwei")} gwei`);

        console.log(`\n✅ Swap Executed:`);
        console.log(`   Actual Output: ${ethers.formatUnits(actualOutput, 6)} USDC`);
        console.log(`   Quote Accuracy: ${((Number(ethers.formatUnits(actualOutput, 6)) / Number(quoteFormatted)) * 100).toFixed(2)}%`);

        results.push({
          quoter: name,
          quote: quoteFormatted,
          actualOutput: ethers.formatUnits(actualOutput, 6),
          gasUsed: receipt.gasUsed.toString(),
          rate: quoteFormatted
        });

      } catch (error) {
        console.log(`\n❌ Error testing ${name}:`);
        console.log(`   ${error.message}`);
        
        results.push({
          quoter: name,
          quote: "ERROR",
          actualOutput: "ERROR",
          gasUsed: "ERROR",
          rate: "ERROR"
        });
      }
    }

    // Summary table
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 SUMMARY - WETH/USDC Quoter Performance`);
    console.log(`${'='.repeat(80)}`);
    console.table(results);

    expect(results.length).to.equal(3);
  });

  it("should test batch quotes", async function () {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Batch Quote Testing`);
    console.log(`${'='.repeat(60)}`);

    const amounts = [
      ethers.parseEther("0.5"),  // 0.5 WETH
      ethers.parseEther("1.0"),  // 1.0 WETH  
      ethers.parseEther("2.0")   // 2.0 WETH
    ];

    const batchParams = {
      asset0: await weth.getAddress(),
      asset1: await usdc.getAddress(),
      quoter: await v3twapChainlinkQuoter.getAddress(),
      amount: amounts,
      asset0Balances: [WETH_AMOUNT, WETH_AMOUNT - ethers.parseEther("0.5"), WETH_AMOUNT - ethers.parseEther("1.5")],
      asset1Balances: [USDC_AMOUNT, USDC_AMOUNT + ethers.parseUnits("650", 6), USDC_AMOUNT + ethers.parseUnits("1300", 6)],
      bucketID: [0, 1, 2],
      zeroForOne: true
    };

    try {
      const quotes = await v3twapChainlinkQuoter.quoteBatch.staticCall(batchParams, "0x");
      
      console.log(`\n💰 Batch Quote Results:`);
      for (let i = 0; i < amounts.length; i++) {
        const inputWeth = ethers.formatEther(amounts[i]);
        const outputUsdc = quotes[i] ? ethers.formatUnits(quotes[i], 6) : "0";
        const rate = (Number(outputUsdc) / Number(inputWeth)).toFixed(2);
        
        console.log(`   ${inputWeth} WETH → ${outputUsdc} USDC (Rate: ${rate} USDC/WETH)`);
      }

      expect(quotes.length).to.equal(3);
      expect(quotes[0]).to.be.gt(0);
      expect(quotes[1]).to.be.gt(0);
      expect(quotes[2]).to.be.gt(0);

    } catch (error) {
      console.log(`\n❌ Batch quote error: ${error.message}`);
      throw error;
    }
  });
});
