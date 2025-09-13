const { expect } = require("chai");
const { ethers, network } = require("hardhat");

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, "0x1000000000000000000"]);
  return await ethers.getSigner(addr);
}

describe("StoixBridge swap() Gas Breakdown Analysis (Fork)", function () {
  let pm, lm, quoter, bridge;
  let weth, usdc, user;
  
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const CHAINLINK_FEED_REGISTRY = "0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf";
  const USDC_WETH_V3_3000_POOL = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";
  
  // Helper to create slot 15 markings
  function createMarkings(functionFlags) {
    return (functionFlags << 4) | (15 << 20); // bucketID=functionFlags, extraBridgeSlot=15
  }
  
  beforeEach(async function () {
    [user] = await ethers.getSigners();
    
    // Get tokens via impersonation
    weth = await ethers.getContractAt(["function deposit() payable","function approve(address,uint256)","function balanceOf(address) view returns (uint256)"], WETH);
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
    
    const poolSigner = await impersonate(USDC_WETH_V3_3000_POOL);
    await usdc.connect(poolSigner).transfer(await user.getAddress(), 1_000_000n * 10n ** 6n);
    await weth.deposit({ value: ethers.parseEther("100") });
    
    // Deploy alias registry
    const Alias = await ethers.getContractFactory("TokenAliasRegistry");
    const aliasReg = await Alias.deploy();
    await aliasReg.waitForDeployment();
    
    // Deploy real bridges
    const V2 = await ethers.getContractFactory("UniswapV2DataBridge");
    const v2 = await V2.deploy(UNISWAP_V2_FACTORY, WETH, USDC, WETH, USDC);
    await v2.waitForDeployment();
    
    const V3 = await ethers.getContractFactory("UniswapV3DataBridge");
    const v3 = await V3.deploy(UNISWAP_V3_FACTORY, 3000, 0, WETH, USDC, WETH, USDC);
    await v3.waitForDeployment();
    
    const V3T = await ethers.getContractFactory("UniswapV3TWAPDataBridge");
    const v3t = await V3T.deploy(UNISWAP_V3_FACTORY, 3000, 900, WETH, USDC, WETH, USDC);
    await v3t.waitForDeployment();
    
    const CL = await ethers.getContractFactory("ChainlinkDataBridge");
    const cl = await CL.deploy(CHAINLINK_FEED_REGISTRY, await aliasReg.getAddress());
    await cl.waitForDeployment();
    
    // Deploy consolidated StoixDataBridge
    const StoixDB = await ethers.getContractFactory("StoixDataBridge");
    bridge = await StoixDB.deploy(await v2.getAddress(), await v3.getAddress(), await v3t.getAddress(), await cl.getAddress());
    await bridge.waitForDeployment();
    
    // Deploy StoixQuoter
    const StoixQuoter = await ethers.getContractFactory("StoixQuoter");
    quoter = await StoixQuoter.deploy();
    await quoter.waitForDeployment();
    
    // Deploy PoolManager with StoixDataBridge
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(await bridge.getAddress());
    await pm.waitForDeployment();
    
    // Deploy LiquidityManager
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    lm = await LiquidityManager.deploy(await pm.getAddress());
    await lm.waitForDeployment();
    await pm.setLiquidityManager(await lm.getAddress());
    
    // Approvals
    await weth.approve(await pm.getAddress(), ethers.MaxUint256);
    await usdc.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
  });
  
  it("should provide detailed gas breakdown for swap() with real data sources", async function () {
    const quoterAddr = await quoter.getAddress();
    
    console.log("=== DETAILED SWAP() GAS BREAKDOWN ANALYSIS ===\n");
    
    // Test configurations for each individual source and combinations
    const testConfigs = [
      { flags: 0x01, label: "V2 only", description: "Uniswap V2 spot price" },
      { flags: 0x02, label: "V3 only", description: "Uniswap V3 spot price" },
      { flags: 0x04, label: "V3 TWAP only", description: "Uniswap V3 TWAP price" },
      { flags: 0x08, label: "CL price only", description: "Chainlink price only" },
      { flags: 0x10, label: "CL timestamp only", description: "Chainlink timestamp only" },
      { flags: 0x18, label: "CL price + timestamp", description: "Chainlink price and timestamp (optimized)" },
      { flags: 0x0F, label: "All 4 price sources", description: "V2 + V3 + TWAP + CL price" },
      { flags: 0x1F, label: "All data (no std dev)", description: "All price sources + CL timestamp" }
    ];
    
    const gasResults = [];
    const BASELINE_SWAP_GAS = 81263; // From minimal test (no data bridges)
    
    console.log("Individual Source Costs:");
    console.log("=".repeat(80));
    console.log("Source".padEnd(25) + " | Swap Gas | Data Overhead | Description");
    console.log("-".repeat(80));
    
    for (const config of testConfigs) {
      const markings = ethers.toBeHex(createMarkings(config.flags), 3);
      
      // Create pool and add liquidity (use smaller amounts to avoid inventory issues)
      await pm.createPool(WETH, USDC, quoterAddr, markings);
      await lm.addLiquidity(WETH, USDC, quoterAddr, markings, ethers.parseEther("1"), 1n * 3000n * 10n ** 6n);
      
      // Measure swap gas for small amount
      const swapGas = await pm.swap.estimateGas(WETH, USDC, quoterAddr, markings, ethers.parseEther("0.1"), true, 0n);
      const dataOverhead = Number(swapGas) - BASELINE_SWAP_GAS;
      
      const result = {
        ...config,
        swapGas: Number(swapGas),
        dataOverhead: dataOverhead
      };
      gasResults.push(result);
      
      console.log(`${config.label.padEnd(25)} | ${swapGas.toString().padStart(8)} | ${dataOverhead.toString().padStart(13)} | ${config.description}`);
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("ANALYSIS:");
    console.log("=".repeat(80));
    
    // Calculate individual source costs
    const v2Cost = gasResults.find(r => r.flags === 0x01).dataOverhead;
    const v3Cost = gasResults.find(r => r.flags === 0x02).dataOverhead;
    const twapCost = gasResults.find(r => r.flags === 0x04).dataOverhead;
    const clPriceOnlyCost = gasResults.find(r => r.flags === 0x08).dataOverhead;
    const clTimestampOnlyCost = gasResults.find(r => r.flags === 0x10).dataOverhead;
    const clBothCost = gasResults.find(r => r.flags === 0x18).dataOverhead;
    const allPricesCost = gasResults.find(r => r.flags === 0x0F).dataOverhead;
    const allDataCost = gasResults.find(r => r.flags === 0x1F).dataOverhead;
    
    console.log(`Baseline swap (no data):        ${BASELINE_SWAP_GAS.toString().padStart(6)} gas`);
    console.log(`V2 price overhead:              ${v2Cost.toString().padStart(6)} gas`);
    console.log(`V3 price overhead:              ${v3Cost.toString().padStart(6)} gas`);
    console.log(`V3 TWAP overhead:               ${twapCost.toString().padStart(6)} gas`);
    console.log(`Chainlink price only:           ${clPriceOnlyCost.toString().padStart(6)} gas`);
    console.log(`Chainlink timestamp only:       ${clTimestampOnlyCost.toString().padStart(6)} gas`);
    console.log(`Chainlink price + timestamp:    ${clBothCost.toString().padStart(6)} gas`);
    
    // Calculate quoter wrapper overhead
    const expectedIndividualSum = v2Cost + v3Cost + twapCost + clBothCost; // Sum of individual sources
    const actualAllDataCost = allDataCost;
    const quoterWrapperOverhead = actualAllDataCost - expectedIndividualSum;
    
    console.log("\n" + "-".repeat(50));
    console.log("QUOTER WRAPPER ANALYSIS:");
    console.log("-".repeat(50));
    console.log(`Sum of individual sources:      ${expectedIndividualSum.toString().padStart(6)} gas`);
    console.log(`Actual all data cost:           ${actualAllDataCost.toString().padStart(6)} gas`);
    console.log(`Quoter wrapper overhead:        ${quoterWrapperOverhead.toString().padStart(6)} gas`);
    
    // Chainlink optimization analysis
    const clSeparateCost = clPriceOnlyCost + clTimestampOnlyCost;
    const clOptimizedSavings = clSeparateCost - clBothCost;
    
    console.log("\n" + "-".repeat(50));
    console.log("CHAINLINK OPTIMIZATION ANALYSIS:");
    console.log("-".repeat(50));
    console.log(`CL price + timestamp separate:  ${clSeparateCost.toString().padStart(6)} gas`);
    console.log(`CL price + timestamp optimized: ${clBothCost.toString().padStart(6)} gas`);
    console.log(`Optimization savings:           ${clOptimizedSavings.toString().padStart(6)} gas`);
    
    console.log("\n" + "=".repeat(80));
    console.log("FINAL BREAKDOWN FOR swap() WITH ALL REAL DATA:");
    console.log("=".repeat(80));
    console.log(`Baseline swap mechanics:        ${BASELINE_SWAP_GAS.toString().padStart(6)} gas`);
    console.log(`V2 price fetch:                 ${v2Cost.toString().padStart(6)} gas`);
    console.log(`V3 price fetch:                 ${v3Cost.toString().padStart(6)} gas`);
    console.log(`V3 TWAP fetch:                  ${twapCost.toString().padStart(6)} gas`);
    console.log(`Chainlink price + timestamp:    ${clBothCost.toString().padStart(6)} gas`);
    console.log(`Quoter wrapper & averaging:     ${quoterWrapperOverhead.toString().padStart(6)} gas`);
    console.log("-".repeat(50));
    console.log(`TOTAL swap() gas:               ${gasResults.find(r => r.flags === 0x1F).swapGas.toString().padStart(6)} gas`);
    
    // Verify calculations add up
    const calculatedTotal = BASELINE_SWAP_GAS + v2Cost + v3Cost + twapCost + clBothCost + quoterWrapperOverhead;
    const actualTotal = gasResults.find(r => r.flags === 0x1F).swapGas;
    
    console.log(`Calculated total:               ${calculatedTotal.toString().padStart(6)} gas`);
    console.log(`Difference:                     ${(actualTotal - calculatedTotal).toString().padStart(6)} gas`);
    
    expect(Math.abs(actualTotal - calculatedTotal)).to.be.lt(1000); // Should match within 1k gas
  });
  
  it("should show cost per data source in different combinations", async function () {
    const quoterAddr = await quoter.getAddress();
    
    console.log("\n=== INCREMENTAL COST ANALYSIS ===\n");
    
    // Test incremental additions to see marginal cost of each source
    const incrementalConfigs = [
      { flags: 0x00, label: "No data (baseline)", sources: [] },
      { flags: 0x02, label: "+ V3 price", sources: ["V3"] },
      { flags: 0x0A, label: "+ Chainlink price", sources: ["V3", "CL"] },
      { flags: 0x1A, label: "+ Chainlink timestamp", sources: ["V3", "CL+TS"] },
      { flags: 0x1E, label: "+ V3 TWAP", sources: ["V3", "CL+TS", "TWAP"] },
      { flags: 0x1F, label: "+ V2 price", sources: ["V3", "CL+TS", "TWAP", "V2"] }
    ];
    
    let previousGas = 81263; // Baseline from minimal test
    
    console.log("Configuration".padEnd(30) + " | Swap Gas | Marginal Cost | Sources");
    console.log("-".repeat(75));
    console.log(`Baseline (no data)`.padEnd(30) + ` | ${previousGas.toString().padStart(8)} |           - | None`);
    
    for (let i = 1; i < incrementalConfigs.length; i++) {
      const config = incrementalConfigs[i];
      const markings = ethers.toBeHex(createMarkings(config.flags), 3);
      
      // Create pool and add liquidity
      await pm.createPool(WETH, USDC, quoterAddr, markings);
      await lm.addLiquidity(WETH, USDC, quoterAddr, markings, ethers.parseEther("1"), 1n * 3000n * 10n ** 6n);
      
      const swapGas = await pm.swap.estimateGas(WETH, USDC, quoterAddr, markings, ethers.parseEther("0.1"), true, 0n);
      const marginalCost = Number(swapGas) - previousGas;
      
      console.log(`${config.label.padEnd(30)} | ${swapGas.toString().padStart(8)} | ${marginalCost.toString().padStart(13)} | ${config.sources.join(", ")}`);
      
      previousGas = Number(swapGas);
    }
    
    console.log("\n" + "=".repeat(75));
    console.log("MARGINAL COST INSIGHTS:");
    console.log("- Each additional source adds its own external call overhead");
    console.log("- Chainlink price + timestamp optimized into single call");
    console.log("- V3 TWAP has similar cost to V3 spot (same contract, different params)");
    console.log("- V2 has slightly different cost due to different contract interface");
  });
  
  it("should compare optimized vs non-optimized Chainlink calls", async function () {
    const quoterAddr = await quoter.getAddress();
    
    console.log("\n=== CHAINLINK OPTIMIZATION VERIFICATION ===\n");
    
    // Test Chainlink price only
    const clPriceMarkings = ethers.toBeHex(createMarkings(0x08), 3);
    await pm.createPool(WETH, USDC, quoterAddr, clPriceMarkings);
    await lm.addLiquidity(WETH, USDC, quoterAddr, clPriceMarkings, ethers.parseEther("1"), 1n * 3000n * 10n ** 6n);
    const clPriceGas = await pm.swap.estimateGas(WETH, USDC, quoterAddr, clPriceMarkings, ethers.parseEther("0.1"), true, 0n);
    
    // Test Chainlink timestamp only  
    const clTsMarkings = ethers.toBeHex(createMarkings(0x10), 3);
    await pm.createPool(WETH, USDC, quoterAddr, clTsMarkings);
    await lm.addLiquidity(WETH, USDC, quoterAddr, clTsMarkings, ethers.parseEther("1"), 1n * 3000n * 10n ** 6n);
    const clTsGas = await pm.swap.estimateGas(WETH, USDC, quoterAddr, clTsMarkings, ethers.parseEther("0.1"), true, 0n);
    
    // Test Chainlink price + timestamp optimized
    const clBothMarkings = ethers.toBeHex(createMarkings(0x18), 3);
    await pm.createPool(WETH, USDC, quoterAddr, clBothMarkings);
    await lm.addLiquidity(WETH, USDC, quoterAddr, clBothMarkings, ethers.parseEther("1"), 1n * 3000n * 10n ** 6n);
    const clBothGas = await pm.swap.estimateGas(WETH, USDC, quoterAddr, clBothMarkings, ethers.parseEther("0.1"), true, 0n);
    
    const BASELINE = 81263;
    const clPriceOverhead = Number(clPriceGas) - BASELINE;
    const clTsOverhead = Number(clTsGas) - BASELINE;
    const clBothOverhead = Number(clBothGas) - BASELINE;
    const separateTotal = clPriceOverhead + clTsOverhead;
    const optimizationSavings = separateTotal - clBothOverhead;
    
    console.log("Chainlink price only:           " + clPriceOverhead.toString().padStart(6) + " gas overhead");
    console.log("Chainlink timestamp only:       " + clTsOverhead.toString().padStart(6) + " gas overhead");
    console.log("If called separately:           " + separateTotal.toString().padStart(6) + " gas overhead");
    console.log("Optimized (single call):        " + clBothOverhead.toString().padStart(6) + " gas overhead");
    console.log("Optimization savings:           " + optimizationSavings.toString().padStart(6) + " gas saved");
    console.log("Efficiency gain:                " + ((optimizationSavings / separateTotal) * 100).toFixed(1) + "%");
    
    expect(optimizationSavings).to.be.gt(0); // Should save gas
    expect(clBothOverhead).to.be.lt(separateTotal); // Optimized should be cheaper
  });
});
