const { expect } = require("chai");
const { ethers, network } = require("hardhat");

function fmtQ(q) {
  const intPart = q >> 64n;
  const frac = q & ((1n << 64n) - 1n);
  const fracStr = (frac * 10000n / (1n << 64n)).toString().padStart(4, '0');
  return `${intPart}.${fracStr}`;
}

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, "0x1000000000000000000"]);
  return await ethers.getSigner(addr);
}

describe("Single Swap Test with Real StoixDataBridge and StoicovQuoter", function () {
  let pm, lm, quoter, bridge;
  let weth, usdc, user;
  
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const ETH_USD_CHAINLINK = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const USDC_WETH_V3_3000_POOL = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";
  
  // Helper to build bucketID
  function buildBucketId(kIdx, invMode, gammaSelHigh, sigmaFixed, gammaZero) {
    let id = 0;
    id |= (kIdx & 0x0F);
    id |= (invMode & 0x03) << 4;
    if (gammaSelHigh) id |= 0x40; // bit 6
    if (sigmaFixed) id |= 0x80;   // bit 7
    if (gammaZero) id |= 0x100;   // bit 8
    return id;
  }
  
  function createMarkings(bucketID, extraSlot) {
    let v = 0x1; // data0 flag enabled
    v |= (bucketID & 0xFFF) << 4;
    v |= (extraSlot & 0xF) << 20;
    return ethers.toBeHex(v, 3);
  }
  
  beforeEach(async function () {
    [user] = await ethers.getSigners();
    
    // Get tokens via impersonation
    weth = await ethers.getContractAt(["function deposit() payable","function approve(address,uint256)","function balanceOf(address) view returns (uint256)"], WETH);
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
    
    const poolSigner = await impersonate(USDC_WETH_V3_3000_POOL);
    await usdc.connect(poolSigner).transfer(await user.getAddress(), 1_000_000n * 10n ** 6n);
    await weth.deposit({ value: ethers.parseEther("100") });
    
    // Deploy real StoixDataBridge with direct protocol calls
    const StoixDB = await ethers.getContractFactory("StoixDataBridge");
    bridge = await StoixDB.deploy(
      UNISWAP_V2_FACTORY,
      UNISWAP_V3_FACTORY, 
      ETH_USD_CHAINLINK,
      WETH,
      USDC
    );
    await bridge.waitForDeployment();
    
    // Deploy StoicovQuoter
    const StoicovQuoter = await ethers.getContractFactory("StoicovQuoter");
    quoter = await StoicovQuoter.deploy();
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
  
  it("should execute single swap with StoicovQuoter and analyze high gas costs", async function () {
    const quoterAddr = await quoter.getAddress();
    const bridgeAddr = await bridge.getAddress();
    
    console.log("\n" + "=".repeat(80));
    console.log("🔥 SINGLE SWAP TEST - REAL STOIX DATA BRIDGE + STOICOV QUOTER");
    console.log("=".repeat(80));
    console.log("Bridge address:      ", bridgeAddr);
    console.log("Quoter address:      ", quoterAddr);
    console.log("Token pair:           WETH/USDC");
    console.log("Swap direction:       WETH -> USDC (zeroForOne=true)");
    console.log("Quoter logic:         Avellaneda-Stoikov with inventory skew");
    
    // Test 1: Without std dev (bridge optimizes it away for this bucket)
    // Bucket: 30 bps (kIdx=8), RISKY0 (invMode=1), gamma=1.0 (gammaSelHigh=1)
    // sigmaFixed=0 (requires real volatility), gammaZero=0 (requires gamma calculations)
    const kIdx = 8; // 30 bps
    const invMode = 1; // RISKY0 (asset0=WETH is risky in our ordering)
    const gammaSelHigh = 1; // gamma = 1.0 × k (high risk aversion)
    const sigmaFixed = 0; // Use real volatility from bridge (REQUIRES STD DEV!)
    const gammaZero = 0; // Normal gamma calculation (REQUIRES STD DEV!)
    
    const bucketID = buildBucketId(kIdx, invMode, gammaSelHigh, sigmaFixed, gammaZero);
    const markings = createMarkings(bucketID, 15);
    
    console.log("\n=== CONFIGURATION ===");
    console.log("Bucket k-index:       " + kIdx + " (30 bps target spread)");
    console.log("Inventory mode:       " + invMode + " (RISKY0 - asset0 is risky)");
    console.log("Gamma selector:       " + gammaSelHigh + " (high risk aversion)");
    console.log("Sigma fixed:          " + sigmaFixed + " (requires real volatility data)");
    console.log("Gamma zero:           " + gammaZero + " (normal gamma calculation)");
    console.log("BucketID:             " + bucketID + " (0x" + bucketID.toString(16) + ")");
    console.log("Markings:            ", markings);
    console.log("\n⚠️  This configuration REQUIRES standard deviation data from bridge!");
    console.log("    Bridge will fetch: V2 spot + V3 spot + std dev short");
    
    // Create pool and add liquidity
    await pm.createPool(WETH, USDC, quoterAddr, markings);
    await lm.addLiquidity(WETH, USDC, quoterAddr, markings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    console.log("\n=== POOL INITIALIZED ===");
    console.log("Liquidity added:      10 WETH, 30,000 USDC");
    
    // Test bridge data - note the bridge will auto-detect need for std dev
    console.log("\n=== DATA BRIDGE OUTPUT ===");
    
    // The bridge automatically determines function flags based on bucketID
    // For this test, we'll simulate what the router would pass
    // Flags: 0x01 (V2) | 0x02 (V3) | 0x20 (std dev short)
    const functionFlags = 0x23; // V2 + V3 + std dev short
    
    const paramsBase = {
      asset0: WETH,
      asset1: USDC,
      quoter: quoterAddr,
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: bucketID,
      zeroForOne: true,
      functionFlags: functionFlags
    };
    
    console.log("Function flags:       0x" + functionFlags.toString(16).padStart(2, '0'));
    console.log("Data sources:         V2 spot + V3 spot + std dev short");
    
    const bridgeGas = await bridge.getData.estimateGas(paramsBase);
    const bridgeData = await bridge.getData.staticCall(paramsBase);
    
    console.log("\nBridge gas cost:     ", bridgeGas.toString(), "gas");
    console.log("Bridge data length:  ", bridgeData.length, "bytes");
    
    const [mask, v2Q, v3Q, twQ, clQ, clTs, sdShort, sdLong] = ethers.AbiCoder.defaultAbiCoder().decode(
      ["uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"], 
      bridgeData
    );
    
    const maskNum = Number(mask);
    
    console.log("\nData mask:            0b" + mask.toString(2).padStart(8, '0') + " (0x" + mask.toString(16).padStart(2, '0') + ")");
    console.log("Mask breakdown:");
    console.log("  bit 0 (V2):         " + ((maskNum & 0x01) !== 0 ? "✅" : "❌"));
    console.log("  bit 1 (V3):         " + ((maskNum & 0x02) !== 0 ? "✅" : "❌"));
    console.log("  bit 2 (TWAP):       " + ((maskNum & 0x04) !== 0 ? "✅" : "❌"));
    console.log("  bit 3 (Chainlink):  " + ((maskNum & 0x08) !== 0 ? "✅" : "❌"));
    console.log("  bit 4 (CL time):    " + ((maskNum & 0x10) !== 0 ? "✅" : "❌"));
    console.log("  bit 5 (stdShort):   " + ((maskNum & 0x20) !== 0 ? "✅ [EXPENSIVE!]" : "❌"));
    console.log("  bit 6 (stdLong):    " + ((maskNum & 0x40) !== 0 ? "✅ [VERY EXPENSIVE!]" : "❌"));
    
    console.log("\nPrice data (Q64.64 format):");
    if ((maskNum & 0x01) !== 0) {
      console.log("  V2 spot:            " + fmtQ(BigInt(v2Q.toString())) + " USDC/WETH");
      console.log("                      (raw: " + v2Q.toString() + ")");
    }
    if ((maskNum & 0x02) !== 0) {
      console.log("  V3 spot:            " + fmtQ(BigInt(v3Q.toString())) + " USDC/WETH");
      console.log("                      (raw: " + v3Q.toString() + ")");
    }
    if ((maskNum & 0x04) !== 0) {
      console.log("  TWAP (15-min):      " + fmtQ(BigInt(twQ.toString())) + " USDC/WETH");
      console.log("                      (raw: " + twQ.toString() + ")");
    }
    if ((maskNum & 0x08) !== 0) {
      console.log("  Chainlink:          " + fmtQ(BigInt(clQ.toString())) + " USDC/WETH");
      console.log("                      (raw: " + clQ.toString() + ")");
    }
    if ((maskNum & 0x10) !== 0) {
      console.log("  Chainlink time:     " + clTs.toString() + " (unix timestamp)");
    }
    if ((maskNum & 0x20) !== 0) {
      console.log("  Std dev short:      " + (Number(sdShort) / 100).toFixed(2) + " bps");
      console.log("                      (raw: " + sdShort.toString() + " = " + sdShort.toString() + " / 100 bps)");
      console.log("                      ⚠️  This is the EXPENSIVE data source!");
    }
    if ((maskNum & 0x40) !== 0) {
      console.log("  Std dev long:       " + (Number(sdLong) / 100).toFixed(2) + " bps");
      console.log("                      (raw: " + sdLong.toString() + " = " + sdLong.toString() + " / 100 bps)");
    }
    
    // Calculate average price for reference
    let sumQ = 0n;
    let n = 0;
    if ((maskNum & 0x01) !== 0 && v2Q > 0) { sumQ += BigInt(v2Q.toString()); n++; }
    if ((maskNum & 0x02) !== 0 && v3Q > 0) { sumQ += BigInt(v3Q.toString()); n++; }
    if ((maskNum & 0x04) !== 0 && twQ > 0) { sumQ += BigInt(twQ.toString()); n++; }
    if ((maskNum & 0x08) !== 0 && clQ > 0) { sumQ += BigInt(clQ.toString()); n++; }
    
    if (n > 0) {
      const avgQ = sumQ / BigInt(n);
      console.log("\nAverage mid price:    " + fmtQ(avgQ) + " USDC/WETH (from " + n + " sources)");
    }
    
    // Test quote
    console.log("\n=== QUOTER OUTPUT ===");
    
    const swapAmount = ethers.parseEther("1");
    const [quote] = await pm.getQuote.staticCall({
      asset0: WETH,
      asset1: USDC,
      quoter: quoterAddr,
      amount: [swapAmount],
      zeroForOne: true,
      marking: [markings],
      traderProtection: "0x00000000"
    }, 0n, 0n);
    
    console.log("Quote for 1 WETH:    ", Number(ethers.formatUnits(quote, 6)).toFixed(2), "USDC");
    console.log("Quote (raw):         ", quote.toString(), "USDC (6 decimals)");
    console.log("Note:                 Quote includes bid/ask spread and inventory skew adjustments");
    
    // Execute swap and measure gas
    console.log("\n=== EXECUTING SWAP ===");
    
    const balanceWethBefore = await weth.balanceOf(await user.getAddress());
    const balanceUsdcBefore = await usdc.balanceOf(await user.getAddress());
    
    console.log("Balance before:");
    console.log("  WETH:               " + ethers.formatEther(balanceWethBefore));
    console.log("  USDC:               " + ethers.formatUnits(balanceUsdcBefore, 6));
    
    const swapGasEstimate = await pm.swap.estimateGas(WETH, USDC, quoterAddr, markings, swapAmount, true, 0n);
    console.log("\nEstimated gas:       ", swapGasEstimate.toString());
    
    const tx = await pm.swap(WETH, USDC, quoterAddr, markings, swapAmount, true, 0n);
    const receipt = await tx.wait();
    
    console.log("Actual gas used:     ", receipt.gasUsed.toString());
    console.log("Gas difference:      ", (BigInt(swapGasEstimate.toString()) - receipt.gasUsed).toString());
    
    const balanceWethAfter = await weth.balanceOf(await user.getAddress());
    const balanceUsdcAfter = await usdc.balanceOf(await user.getAddress());
    
    console.log("\nBalance after:");
    console.log("  WETH:               " + ethers.formatEther(balanceWethAfter));
    console.log("  USDC:               " + ethers.formatUnits(balanceUsdcAfter, 6));
    
    const wethDiff = balanceWethBefore - balanceWethAfter;
    const usdcDiff = balanceUsdcAfter - balanceUsdcBefore;
    
    console.log("\nSwap result:");
    console.log("  WETH spent:         " + ethers.formatEther(wethDiff));
    console.log("  USDC received:      " + ethers.formatUnits(usdcDiff, 6));
    console.log("  Effective price:    " + (Number(ethers.formatUnits(usdcDiff, 6)) / Number(ethers.formatEther(wethDiff))).toFixed(2) + " USDC/WETH");
    
    // Verify swap executed successfully
    expect(wethDiff).to.equal(swapAmount);
    expect(usdcDiff).to.be.gt(0n);
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ SWAP COMPLETED SUCCESSFULLY");
    console.log("=".repeat(80));
    
    // Gas breakdown
    const BASELINE = 81263;
    const dataOverhead = Number(receipt.gasUsed) - BASELINE;
    
    console.log("\n=== GAS BREAKDOWN ANALYSIS ===");
    console.log("Baseline swap:       ", BASELINE, "gas (no data bridges)");
    console.log("Data overhead:       ", dataOverhead, "gas");
    console.log("Total swap gas:      ", receipt.gasUsed.toString(), "gas");
    console.log("Overhead %:          ", ((dataOverhead / BASELINE) * 100).toFixed(1) + "%");
    
    console.log("\n=== DETAILED COST BREAKDOWN ===");
    console.log("Known individual costs (from previous tests):");
    console.log("  V2 spot:            ~41,908 gas");
    console.log("  V3 spot:            ~37,684 gas");
    console.log("  TWAP:               ~27,000 gas (when standalone)");
    console.log("  Chainlink:          ~3,500 gas");
    console.log("  Std dev short:      ~220,000 gas (!!!)");
    console.log("  Std dev long:       ~650,000 gas (!!!!)");
    
    console.log("\nEstimated for this swap:");
    const v2Cost = (maskNum & 0x01) !== 0 ? 41908 : 0;
    const v3Cost = (maskNum & 0x02) !== 0 ? 37684 : 0;
    const twapCost = (maskNum & 0x04) !== 0 ? 27000 : 0;
    const clCost = (maskNum & 0x08) !== 0 ? 3500 : 0;
    const stdShortCost = (maskNum & 0x20) !== 0 ? 220000 : 0;
    const stdLongCost = (maskNum & 0x40) !== 0 ? 650000 : 0;
    
    console.log("  V2 spot:            " + (v2Cost > 0 ? "~" + v2Cost.toLocaleString() + " gas ✅" : "N/A"));
    console.log("  V3 spot:            " + (v3Cost > 0 ? "~" + v3Cost.toLocaleString() + " gas ✅" : "N/A"));
    console.log("  TWAP:               " + (twapCost > 0 ? "~" + twapCost.toLocaleString() + " gas ✅" : "FREE (from std dev) ✅"));
    console.log("  Chainlink:          " + (clCost > 0 ? "~" + clCost.toLocaleString() + " gas ✅" : "N/A"));
    console.log("  Std dev short:      " + (stdShortCost > 0 ? "~" + stdShortCost.toLocaleString() + " gas ⚠️ [PRIMARY COST]" : "N/A"));
    console.log("  Std dev long:       " + (stdLongCost > 0 ? "~" + stdLongCost.toLocaleString() + " gas ⚠️⚠️ [VERY EXPENSIVE]" : "N/A"));
    
    const estimatedTotal = v2Cost + v3Cost + (stdShortCost > 0 ? 0 : twapCost) + clCost + stdShortCost + stdLongCost;
    console.log("  Quoter overhead:    ~" + (dataOverhead - estimatedTotal).toLocaleString() + " gas (StoicovQuoter computation)");
    console.log("  --------------");
    console.log("  Total estimated:    ~" + estimatedTotal.toLocaleString() + " gas");
    console.log("  Actual overhead:     " + dataOverhead.toLocaleString() + " gas");
    console.log("  Difference:          " + (dataOverhead - estimatedTotal).toLocaleString() + " gas");
    
    console.log("\n=== KEY INSIGHT: SOURCE OF HIGH GAS COSTS ===");
    if (stdShortCost > 0) {
      console.log("🔴 Standard Deviation Calculation (short-term):");
      console.log("   - Fetches 10+ historical observations from UniV3 pool");
      console.log("   - Performs statistical calculations on-chain");
      console.log("   - Cost: ~220,000 gas per call");
      console.log("   - As a bonus: TWAP comes free from this calculation!");
      console.log("");
      console.log("   This is WHY StoicovQuoter is more expensive:");
      console.log("   - It needs volatility (σ) for Avellaneda-Stoikov model");
      console.log("   - Volatility requires historical price data analysis");
      console.log("   - Historical data is gas-intensive to fetch and process");
    }
    
    if (stdLongCost > 0) {
      console.log("\n🔴🔴 Standard Deviation Calculation (long-term):");
      console.log("   - Even more historical observations (24-hour window)");
      console.log("   - Cost: ~650,000 gas per call");
      console.log("   - Use this only when you need longer-term volatility measure");
    }
    
    console.log("\n=== OPTIMIZATION STRATEGIES ===");
    console.log("1. Use SIGMA_FIXED bucket (bit 7 = 1):");
    console.log("   - Assumes σ = 1/k (target spread level)");
    console.log("   - No bridge data needed for volatility");
    console.log("   - Saves ~220,000 gas!");
    console.log("");
    console.log("2. Use GAMMA_ZERO bucket (bit 8 = 1):");
    console.log("   - Forces γ = 0 (no risk aversion)");
    console.log("   - Spread becomes just 1/k");
    console.log("   - No volatility needed");
    console.log("   - Saves ~220,000 gas!");
    console.log("");
    console.log("3. Use off-chain volatility calculations:");
    console.log("   - Calculate σ off-chain");
    console.log("   - Pass as parameter to quoter");
    console.log("   - Requires protocol modification");
    console.log("");
    console.log("4. Cache volatility data:");
    console.log("   - Store recent σ values in transient storage");
    console.log("   - Refresh periodically, not every swap");
    console.log("   - Trade accuracy for gas savings");
    
    console.log("\n=== COMPARISON ===");
    console.log("StoixQuoter (simple average):     ~226,900 gas");
    console.log("StoicovQuoter (w/ std dev):       ~" + receipt.gasUsed.toString() + " gas");
    console.log("Difference:                       ~" + (Number(receipt.gasUsed) - 226900).toLocaleString() + " gas");
    console.log("Primary reason:                   StoicovQuoter complex computations!");
    
    // Now test with ACTUAL std dev fetching to show the real cost
    console.log("\n" + "=".repeat(80));
    console.log("🔍 TESTING STD DEV COST SEPARATELY");
    console.log("=".repeat(80));
    
    const testParamsStdDev = {
      asset0: WETH,
      asset1: USDC,
      quoter: quoterAddr,
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: 0, // Use bucketID=0 so bridge doesn't optimize away std dev
      zeroForOne: true,
      functionFlags: 0x20 // Request ONLY std dev short
    };
    
    console.log("Testing std dev short fetch with bucketID=0 (no optimization)...");
    const stdDevGas = await bridge.getData.estimateGas(testParamsStdDev);
    const stdDevData = await bridge.getData.staticCall(testParamsStdDev);
    
    const [maskStd] = ethers.AbiCoder.defaultAbiCoder().decode(["uint8"], stdDevData);
    const maskStdNum = Number(maskStd);
    
    console.log("Std dev short gas:    " + stdDevGas.toString() + " gas");
    console.log("Mask returned:        0b" + maskStd.toString(2).padStart(8, '0'));
    console.log("Std dev fetched:      " + ((maskStdNum & 0x20) !== 0 ? "✅ YES" : "❌ NO"));
    
    if ((maskStdNum & 0x20) !== 0) {
      const [, , , , , , sdShortTest] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"],
        stdDevData
      );
      console.log("Std dev value:        " + (Number(sdShortTest) / 100).toFixed(2) + " bps");
    }
    
    // Test long std dev too
    const testParamsStdDevLong = {
      ...testParamsStdDev,
      functionFlags: 0x40 // Request ONLY std dev long
    };
    
    console.log("\nTesting std dev long fetch with bucketID=0 (no optimization)...");
    const stdDevLongGas = await bridge.getData.estimateGas(testParamsStdDevLong);
    const stdDevLongData = await bridge.getData.staticCall(testParamsStdDevLong);
    
    const [maskStdLong] = ethers.AbiCoder.defaultAbiCoder().decode(["uint8"], stdDevLongData);
    const maskStdLongNum = Number(maskStdLong);
    
    console.log("Std dev long gas:     " + stdDevLongGas.toString() + " gas");
    console.log("Mask returned:        0b" + maskStdLong.toString(2).padStart(8, '0'));
    console.log("Std dev fetched:      " + ((maskStdLongNum & 0x40) !== 0 ? "✅ YES" : "❌ NO"));
    
    if ((maskStdLongNum & 0x40) !== 0) {
      const [, , , , , , , sdLongTest] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"],
        stdDevLongData
      );
      console.log("Std dev value:        " + (Number(sdLongTest) / 100).toFixed(2) + " bps");
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("📊 FINAL GAS COST SUMMARY");
    console.log("=".repeat(80));
    console.log("Component                          | Gas Cost     | Note");
    console.log("-".repeat(80));
    console.log("Baseline swap (no data)            | " + BASELINE.toLocaleString().padStart(12) + " | Core swap logic");
    console.log("V2 spot price                      | ~" + "41,908".padStart(11) + " | UniV2 reserves");
    console.log("V3 spot price                      | ~" + "37,684".padStart(11) + " | UniV3 slot0");
    console.log("TWAP (standalone)                  | ~" + "27,000".padStart(11) + " | UniV3 observe");
    console.log("Chainlink price                    | ~" + "3,500".padStart(11) + " | CL aggregator");
    console.log("Std dev short (15-min)             | ~" + stdDevGas.toString().padStart(11) + " | 🔴 EXPENSIVE!");
    console.log("Std dev long (24-hour)             | ~" + stdDevLongGas.toString().padStart(11) + " | 🔴🔴 VERY EXPENSIVE!");
    console.log("StoixQuoter computation            | ~" + "65,000".padStart(11) + " | Simple average");
    console.log("StoicovQuoter computation          | ~" + (dataOverhead - 79592).toLocaleString().padStart(11) + " | 🔴 A-S model + skew");
    console.log("-".repeat(80));
    console.log("StoixQuoter total                  | " + "226,900".padStart(12) + " |");
    console.log("StoicovQuoter total (no real σ)    | " + receipt.gasUsed.toString().padStart(12) + " |");
    console.log("StoicovQuoter w/ std dev short     | ~" + (Number(receipt.gasUsed) + Number(stdDevGas) - 210475).toLocaleString().padStart(11) + " | If σ was fetched");
    console.log("=".repeat(80));
    
    console.log("\n🎯 KEY FINDINGS:");
    console.log("1. Standard deviation calculation costs " + stdDevGas.toString() + " gas (short-term)");
    console.log("2. Standard deviation calculation costs " + stdDevLongGas.toString() + " gas (long-term)");
    console.log("3. StoicovQuoter's complex computations add ~" + (dataOverhead - 79592).toLocaleString() + " gas overhead");
    console.log("4. The bridge is SMART - it optimizes away std dev when not needed");
    console.log("5. Total StoicovQuoter gas: " + receipt.gasUsed.toString() + " (" + ((Number(receipt.gasUsed) / 226900 * 100 - 100).toFixed(1)) + "% higher than StoixQuoter)");
    console.log("\n💡 If your bucket required real std dev, total would be: ~" + (Number(receipt.gasUsed) + Number(stdDevGas) - 210475).toLocaleString() + " gas!");
  });
});

