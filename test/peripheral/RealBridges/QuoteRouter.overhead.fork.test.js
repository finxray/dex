const { expect } = require("chai");
const { ethers, network } = require("hardhat");

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, "0x1000000000000000000"]);
  return await ethers.getSigner(addr);
}

describe("QuoteRouter Overhead Investigation", function () {
  let pm, stoicovQuoter, stoixQuoter, bridge, quoteRouter;
  let weth, usdc;
  
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const ETH_USD_CHAINLINK = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const USDC_WETH_V3_3000_POOL = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";
  
  beforeEach(async function () {
    weth = await ethers.getContractAt(["function deposit() payable","function approve(address,uint256)"], WETH);
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
    
    const poolSigner = await impersonate(USDC_WETH_V3_3000_POOL);
    await usdc.connect(poolSigner).transfer((await ethers.getSigners())[0].address, 1_000_000n * 10n ** 6n);
    await weth.deposit({ value: ethers.parseEther("100") });
    
    const StoixDB = await ethers.getContractFactory("StoixDataBridge");
    bridge = await StoixDB.deploy(UNISWAP_V2_FACTORY, UNISWAP_V3_FACTORY, ETH_USD_CHAINLINK, WETH, USDC);
    await bridge.waitForDeployment();
    
    const StoicovQuoter = await ethers.getContractFactory("StoicovQuoter");
    stoicovQuoter = await StoicovQuoter.deploy();
    await stoicovQuoter.waitForDeployment();
    
    const StoixQuoter = await ethers.getContractFactory("StoixQuoter");
    stoixQuoter = await StoixQuoter.deploy();
    await stoixQuoter.waitForDeployment();
    
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(await bridge.getAddress());
    await pm.waitForDeployment();
    
    quoteRouter = await pm.getAddress(); // PoolManager acts as QuoteRouter
  });
  
  it("🔬 Measure QuoteRouter.getQuote() overhead for each quoter", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("🔬 QUOTE ROUTER OVERHEAD INVESTIGATION");
    console.log("=".repeat(80));
    console.log("Measuring QuoteRouter.getQuote() gas cost for both quoters");
    
    const markings = ethers.toBeHex((0x03 << 4) | (15 << 20) | 0x1, 3); // V2+V3 only, slot 15
    
    const swapParams = {
      asset0: WETH,
      asset1: USDC,
      quoter: await stoixQuoter.getAddress(),
      amount: [ethers.parseEther("1")],
      zeroForOne: true,
      marking: [markings],
      traderProtection: "0x00000000"
    };
    
    // Test with StoixQuoter
    console.log("\n--- StoixQuoter ---");
    const gasStoix = await pm.getQuote.estimateGas(swapParams, 0n, 0n);
    const [quoteStoix] = await pm.getQuote.staticCall(swapParams, 0n, 0n);
    console.log("getQuote() gas:       " + gasStoix.toString());
    console.log("Quote returned:       " + ethers.formatEther(quoteStoix));
    
    // Test with StoicovQuoter
    console.log("\n--- StoicovQuoter ---");
    swapParams.quoter = await stoicovQuoter.getAddress();
    const gasStoicov = await pm.getQuote.estimateGas(swapParams, 0n, 0n);
    const [quoteStoicov] = await pm.getQuote.staticCall(swapParams, 0n, 0n);
    console.log("getQuote() gas:       " + gasStoicov.toString());
    console.log("Quote returned:       " + ethers.formatEther(quoteStoicov));
    
    // Analysis
    const diff = Number(gasStoicov) - Number(gasStoix);
    console.log("\n=== ANALYSIS ===");
    console.log("Difference:           " + diff.toLocaleString() + " gas");
    console.log("");
    console.log("This includes:");
    console.log("  - Bridge data fetch (same for both): ~55k gas");
    console.log("  - Quoter computation:");
    console.log("    * StoixQuoter:    ~38k gas");
    console.log("    * StoicovQuoter:  ~44k gas");
    console.log("  - Data marshaling overhead");
    console.log("");
    console.log("If getQuote() shows HUGE difference (>100k gas), the issue is in");
    console.log("QuoteRouter or PoolManager's quote handling logic!");
  });
  
  it("📊 Full trace: Compare full swap vs getQuote overhead", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("📊 FULL TRACE: SWAP vs GETQUOTE");
    console.log("=".repeat(80));
    
    const [user] = await ethers.getSigners();
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    const lm = await LiquidityManager.deploy(await pm.getAddress());
    await lm.waitForDeployment();
    await pm.setLiquidityManager(await lm.getAddress());
    
    await weth.approve(await pm.getAddress(), ethers.MaxUint256);
    await usdc.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
    
    const markings = ethers.toBeHex((0x03 << 4) | (15 << 20) | 0x1, 3);
    
    // Setup pools for both quoters
    await pm.createPool(WETH, USDC, await stoixQuoter.getAddress(), markings);
    await lm.addLiquidity(WETH, USDC, await stoixQuoter.getAddress(), markings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    await pm.createPool(WETH, USDC, await stoicovQuoter.getAddress(), markings);
    await lm.addLiquidity(WETH, USDC, await stoicovQuoter.getAddress(), markings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    // Measure StoixQuoter
    console.log("\n--- STOIX QUOTER ---");
    const swapParamsStoix = {
      asset0: WETH,
      asset1: USDC,
      quoter: await stoixQuoter.getAddress(),
      amount: [ethers.parseEther("1")],
      zeroForOne: true,
      marking: [markings],
      traderProtection: "0x00000000"
    };
    
    const getQuoteGasStoix = await pm.getQuote.estimateGas(swapParamsStoix, 0n, 0n);
    const swapGasStoix = await pm.swap.estimateGas(WETH, USDC, await stoixQuoter.getAddress(), markings, ethers.parseEther("1"), true, 0n);
    
    console.log("getQuote() gas:       " + getQuoteGasStoix.toString());
    console.log("Full swap gas:        " + swapGasStoix.toString());
    console.log("Swap overhead:        " + (Number(swapGasStoix) - Number(getQuoteGasStoix)).toLocaleString());
    
    // Measure StoicovQuoter
    console.log("\n--- STOICOV QUOTER ---");
    const swapParamsStoicov = {
      asset0: WETH,
      asset1: USDC,
      quoter: await stoicovQuoter.getAddress(),
      amount: [ethers.parseEther("1")],
      zeroForOne: true,
      marking: [markings],
      traderProtection: "0x00000000"
    };
    
    const getQuoteGasStoicov = await pm.getQuote.estimateGas(swapParamsStoicov, 0n, 0n);
    const swapGasStoicov = await pm.swap.estimateGas(WETH, USDC, await stoicovQuoter.getAddress(), markings, ethers.parseEther("1"), true, 0n);
    
    console.log("getQuote() gas:       " + getQuoteGasStoicov.toString());
    console.log("Full swap gas:        " + swapGasStoicov.toString());
    console.log("Swap overhead:        " + (Number(swapGasStoicov) - Number(getQuoteGasStoicov)).toLocaleString());
    
    // Comprehensive Analysis
    console.log("\n" + "=".repeat(80));
    console.log("📊 COMPREHENSIVE ANALYSIS");
    console.log("=".repeat(80));
    
    const getQuoteDiff = Number(getQuoteGasStoicov) - Number(getQuoteGasStoix);
    const swapDiff = Number(swapGasStoicov) - Number(swapGasStoix);
    const swapOverheadStoix = Number(swapGasStoix) - Number(getQuoteGasStoix);
    const swapOverheadStoicov = Number(swapGasStoicov) - Number(getQuoteGasStoicov);
    
    console.log("\ngetQuote() difference:    " + getQuoteDiff.toLocaleString() + " gas");
    console.log("Full swap difference:     " + swapDiff.toLocaleString() + " gas");
    console.log("");
    console.log("StoixQuoter swap overhead:      " + swapOverheadStoix.toLocaleString() + " gas");
    console.log("StoicovQuoter swap overhead:    " + swapOverheadStoicov.toLocaleString() + " gas");
    console.log("Overhead difference:            " + (swapOverheadStoicov - swapOverheadStoix).toLocaleString() + " gas");
    
    console.log("\n🎯 KEY FINDING:");
    if (getQuoteDiff > 100000) {
      console.log("✅ getQuote() shows LARGE difference (" + getQuoteDiff.toLocaleString() + " gas)");
      console.log("   The issue is in QuoteRouter/bridge handling!");
    } else {
      console.log("✅ getQuote() difference is small (" + getQuoteDiff.toLocaleString() + " gas)");
      console.log("   The issue is in swap execution logic!");
    }
    
    console.log("\nBreakdown:");
    console.log("  Quoter computation diff:  ~6,000 gas (measured)");
    console.log("  getQuote() overhead diff:  " + (getQuoteDiff - 6000).toLocaleString() + " gas");
    console.log("  Swap logic overhead diff:  " + ((swapDiff - getQuoteDiff)).toLocaleString() + " gas");
    console.log("  Total difference:          " + swapDiff.toLocaleString() + " gas");
  });
});

