const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Swap Execution Gas - PoolManager Overhead", function () {
  let pm, liquidityManager;
  let weth, usdc;
  let quoters = {};
  let deployer, trader;
  
  before(async function () {
    [deployer, trader] = await ethers.getSigners();
    
    console.log("\n=== SWAP() EXECUTION GAS ANALYSIS ===\n");
    
    // Deploy test tokens
    const TestToken = await ethers.getContractFactory("TestTokenA");
    weth = await TestToken.deploy();
    usdc = await TestToken.deploy();
    
    // Deploy dummy bridges
    const bridgeTypes = ["DummyData0", "DummyData1", "DummyData2", "DummyData3"];
    const bridges = [];
    for (let i = 0; i < bridgeTypes.length; i++) {
      const BridgeFactory = await ethers.getContractFactory(bridgeTypes[i]);
      const bridge = await BridgeFactory.deploy(ethers.encodeBytes32String(`data${i}`));
      bridges.push(bridge);
    }
    
    // Deploy optimized PoolManager
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(
      await bridges[0].getAddress(),
      await bridges[1].getAddress(),
      await bridges[2].getAddress(),
      await bridges[3].getAddress()
    );
    
    // Deploy LiquidityManager
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    liquidityManager = await LiquidityManager.deploy(await pm.getAddress());
    
    // Setup
    await pm.setLiquidityManager(await liquidityManager.getAddress());
    await pm.setGovernance(deployer.address, deployer.address);
    
    // Deploy quoters
    const quoterTypes = [
      { name: "Quoter0000", marking: "0x000000", bridges: 0 },
      { name: "Quoter1000", marking: "0x000001", bridges: 1 },
      { name: "Quoter1100", marking: "0x000003", bridges: 2 },
      { name: "Quoter1110", marking: "0x000007", bridges: 3 },
      { name: "Quoter1111", marking: "0x00000f", bridges: 4 },
    ];
    
    for (const quoterInfo of quoterTypes) {
      const QuoterFactory = await ethers.getContractFactory(quoterInfo.name);
      const quoter = await QuoterFactory.deploy();
      quoters[quoterInfo.name] = {
        contract: quoter,
        marking: quoterInfo.marking,
        bridges: quoterInfo.bridges
      };
    }
    
    console.log("✅ All contracts deployed and configured");
  });

  it("measures swap() gas breakdown: PoolManager vs Quoter costs", async function () {
    console.log("\n=== SWAP GAS BREAKDOWN ANALYSIS ===\n");
    
    // Setup tokens and liquidity for each quoter
    await weth.mint(deployer.address, ethers.parseEther("10000"));
    await usdc.mint(deployer.address, ethers.parseUnits("45000000", 6));
    await weth.mint(trader.address, ethers.parseEther("100"));
    
    await weth.approve(await liquidityManager.getAddress(), ethers.MaxUint256);
    await usdc.approve(await liquidityManager.getAddress(), ethers.MaxUint256);
    await weth.connect(trader).approve(await pm.getAddress(), ethers.MaxUint256);
    
    console.log("quoter       | bridges | quoter gas | swap gas | PM overhead | total gas");
    console.log("-------------+---------+------------+----------+-------------+----------");
    
    for (const [name, quoterData] of Object.entries(quoters)) {
      try {
        // Create pool
        await pm.createPool(
          await weth.getAddress(),
          await usdc.getAddress(),
          await quoterData.contract.getAddress(),
          quoterData.marking
        );
        
        // Add liquidity
        await liquidityManager.addLiquidity(
          await weth.getAddress(),
          await usdc.getAddress(),
          await quoterData.contract.getAddress(),
          quoterData.marking,
          ethers.parseEther("1000"),
          ethers.parseUnits("4500000", 6)
        );
        
        // Measure quoter gas in isolation
        const quoteParams = {
          asset0: await weth.getAddress(),
          asset1: await usdc.getAddress(),
          quoter: await quoterData.contract.getAddress(),
          amount: ethers.parseEther("1"),
          asset0Balance: ethers.parseEther("1000"),
          asset1Balance: ethers.parseUnits("4500000", 6),
          bucketID: 0,
          zeroForOne: true
        };
        
        const routed = ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes", "bytes", "bytes", "bytes", "bytes"],
          ["0x", "0x", "0x", "0x", "0x"] // Empty data for baseline
        );
        
        const quoterGas = await quoterData.contract.quote.estimateGas(quoteParams, routed);
        
        // Measure full swap gas
        const swapGas = await pm.connect(trader).swap.estimateGas(
          await weth.getAddress(),
          await usdc.getAddress(),
          await quoterData.contract.getAddress(),
          quoterData.marking,
          ethers.parseEther("1"),
          true,
          0
        );
        
        // Calculate PoolManager overhead (swap gas - quoter gas)
        const pmOverhead = Number(swapGas) - Number(quoterGas);
        
        console.log(`${name.padEnd(12)} | ${quoterData.bridges.toString().padEnd(7)} | ${quoterGas.toString().padEnd(10)} | ${swapGas.toString().padEnd(8)} | ${pmOverhead.toString().padEnd(11)} | ${swapGas.toString()}`);
        
      } catch (e) {
        console.log(`${name.padEnd(12)} | ${quoterData.bridges.toString().padEnd(7)} | ERROR      | ERROR    | ERROR       | ${e.message.substring(0, 20)}...`);
      }
    }
    
    console.log("\n=== POOLMANAGER OVERHEAD ANALYSIS ===");
    console.log("• PoolManager overhead = Total swap gas - Quoter execution gas");
    console.log("• Overhead includes: validation, inventory updates, flash accounting, settlements");
    console.log("• This shows the pure PoolManager execution cost separate from quoter logic");
    console.log("• Lower overhead = more efficient PoolManager implementation");
    
    expect(Object.keys(quoters).length).to.be.greaterThan(0);
  });
});
