const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Quoter Comparison - Working vs DummyRealData", function () {
  let deployer, lp, trader;
  let weth, usdc;
  let pm;
  let mockV3TWAPBridge, mockChainlinkBridge, mockV3DataBridge, mockRedstoneBridge;
  let mockUniV2Bridge, mockSushiV2Bridge;
  let v3twapChainlinkQuoter, v3dataRedstoneQuoter, v2v3twapQuoter;
  let dummyQuoter; // Working baseline quoter

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

    // Deploy mock data bridges
    await deployMockBridges();
    
    // Deploy quoters
    await deployQuoters();
  });

  async function deployMockBridges() {
    const MockV3TWAPBridge = await ethers.getContractFactory("MockV3TWAPBridge");
    mockV3TWAPBridge = await MockV3TWAPBridge.deploy();

    const MockChainlinkBridge = await ethers.getContractFactory("MockChainlinkBridge");
    mockChainlinkBridge = await MockChainlinkBridge.deploy();

    const MockV3DataBridge = await ethers.getContractFactory("MockV3DataBridge");
    mockV3DataBridge = await MockV3DataBridge.deploy();

    const MockRedstoneBridge = await ethers.getContractFactory("MockRedstoneBridge");
    mockRedstoneBridge = await MockRedstoneBridge.deploy();

    const MockUniV2Bridge = await ethers.getContractFactory("MockUniV2Bridge");
    mockUniV2Bridge = await MockUniV2Bridge.deploy();

    const MockSushiV2Bridge = await ethers.getContractFactory("MockSushiV2Bridge");
    mockSushiV2Bridge = await MockSushiV2Bridge.deploy();
  }

  async function deployQuoters() {
    // Deploy working baseline quoter
    const DummyQuoter = await ethers.getContractFactory("Quoter0000");
    dummyQuoter = await DummyQuoter.deploy();
    await dummyQuoter.waitForDeployment();

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
    console.log(`   Baseline (Dummy): ${await dummyQuoter.getAddress()}`);
    console.log(`   V3TWAP+Chainlink: ${await v3twapChainlinkQuoter.getAddress()}`);
    console.log(`   V3Data+RedStone:  ${await v3dataRedstoneQuoter.getAddress()}`);
    console.log(`   V2+V3TWAP:        ${await v2v3twapQuoter.getAddress()}`);
  }

  async function setupPoolAndSwap(quoter, quoterName, marking) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📈 Testing ${quoterName}`);
    console.log(`${'='.repeat(60)}`);

    // Create pool
    await pm.connect(lp).createPool(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking
    );

    // Add liquidity
    await pm.connect(lp).addLiquidity(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      WETH_AMOUNT,
      USDC_AMOUNT
    );

    console.log(`   ✅ Pool Created and Liquidity Added`);
    console.log(`   💰 Pool: ${ethers.formatEther(WETH_AMOUNT)} WETH + ${ethers.formatUnits(USDC_AMOUNT, 6)} USDC`);

    // Execute swap and measure gas
    console.log(`\n💱 Executing Swap:`);
    console.log(`   Swapping: ${ethers.formatEther(SWAP_AMOUNT)} WETH → USDC`);
    
    const balanceWethBefore = await weth.balanceOf(trader.address);
    const balanceUsdcBefore = await usdc.balanceOf(trader.address);
    
    const tx = await pm.connect(trader).swap(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      SWAP_AMOUNT,
      true, // zeroForOne (WETH → USDC)
      0 // minAmountOut
    );

    const receipt = await tx.wait();
    
    const balanceWethAfter = await weth.balanceOf(trader.address);
    const balanceUsdcAfter = await usdc.balanceOf(trader.address);
    
    const wethSpent = balanceWethBefore - balanceWethAfter;
    const usdcReceived = balanceUsdcAfter - balanceUsdcBefore;
    const exchangeRate = Number(ethers.formatUnits(usdcReceived, 6)) / Number(ethers.formatEther(wethSpent));

    console.log(`\n✅ Swap Completed:`);
    console.log(`   WETH Spent: ${ethers.formatEther(wethSpent)} WETH`);
    console.log(`   USDC Received: ${ethers.formatUnits(usdcReceived, 6)} USDC`);
    console.log(`   Exchange Rate: 1 WETH = ${exchangeRate.toFixed(2)} USDC`);
    console.log(`   Gas Used: ${receipt.gasUsed.toLocaleString()}`);

    return {
      quoter: quoterName,
      wethSpent: ethers.formatEther(wethSpent),
      usdcReceived: ethers.formatUnits(usdcReceived, 6),
      exchangeRate: exchangeRate.toFixed(2),
      gasUsed: receipt.gasUsed.toString()
    };
  }

  it("should compare baseline quoter with DummyRealData quoters", async function () {
    console.log(`\n🚀 Quoter Comparison: Baseline vs DummyRealData`);
    
    const results = [];

    // Test baseline quoter first (we know this works)
    console.log(`\n🎯 Testing Baseline Quoter (Known Working)`);
    try {
      const result = await setupPoolAndSwap(dummyQuoter, "Baseline (Dummy)", "0x000000");
      results.push(result);
    } catch (error) {
      console.log(`\n❌ Baseline quoter failed: ${error.message}`);
      results.push({
        quoter: "Baseline (Dummy)",
        wethSpent: "ERROR",
        usdcReceived: "ERROR", 
        exchangeRate: "ERROR",
        gasUsed: "ERROR"
      });
    }

    // Now test our DummyRealData quoters
    const quoters = [
      { contract: v3twapChainlinkQuoter, name: "V3TWAP+Chainlink", marking: "0x000003" },
      { contract: v3dataRedstoneQuoter, name: "V3Data+RedStone", marking: "0x000009" },
      { contract: v2v3twapQuoter, name: "V2+V3TWAP", marking: "0x00000E" }
    ];

    for (const { contract, name, marking } of quoters) {
      try {
        const result = await setupPoolAndSwap(contract, name, marking);
        results.push(result);
      } catch (error) {
        console.log(`\n❌ Error testing ${name}:`);
        console.log(`   ${error.message}`);
        
        results.push({
          quoter: name,
          wethSpent: "ERROR",
          usdcReceived: "ERROR", 
          exchangeRate: "ERROR",
          gasUsed: "ERROR"
        });
      }
    }

    // Summary table
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 COMPARISON RESULTS`);
    console.log(`${'='.repeat(80)}`);
    console.table(results);

    expect(results.length).to.equal(4);
    
    // Check that baseline quoter worked
    const baselineResult = results.find(r => r.quoter.includes("Baseline"));
    expect(baselineResult.gasUsed).to.not.equal("ERROR", "Baseline quoter should work");
  });
});
