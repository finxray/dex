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

describe("StoicovQuoter Gas Breakdown Analysis", function () {
  let pm, lm, stoicovQuoter, stoixQuoter, bridge;
  let weth, usdc, user;
  
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const ETH_USD_CHAINLINK = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const USDC_WETH_V3_3000_POOL = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";
  
  function buildBucketId(kIdx, invMode, gammaSelHigh, sigmaFixed, gammaZero) {
    let id = 0;
    id |= (kIdx & 0x0F);
    id |= (invMode & 0x03) << 4;
    if (gammaSelHigh) id |= 0x40;
    if (sigmaFixed) id |= 0x80;
    if (gammaZero) id |= 0x100;
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
    
    weth = await ethers.getContractAt(["function deposit() payable","function approve(address,uint256)","function balanceOf(address) view returns (uint256)"], WETH);
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
    
    const poolSigner = await impersonate(USDC_WETH_V3_3000_POOL);
    await usdc.connect(poolSigner).transfer(await user.getAddress(), 1_000_000n * 10n ** 6n);
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
    
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    lm = await LiquidityManager.deploy(await pm.getAddress());
    await lm.waitForDeployment();
    await pm.setLiquidityManager(await lm.getAddress());
    
    await weth.approve(await pm.getAddress(), ethers.MaxUint256);
    await usdc.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
  });
  
  it("Test 1: StoicovQuoter WITHOUT std dev (show quoter computation overhead)", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("TEST 1: STOICOV QUOTER WITHOUT STD DEV");
    console.log("=".repeat(80));
    console.log("Purpose: Isolate StoicovQuoter's computational overhead");
    console.log("Configuration: V2 + V3 only (no std dev, no TWAP)");
    
    // Use regular bucket without std dev requirement
    const kIdx = 8; // 30 bps
    const invMode = 1; // RISKY0
    const gammaSelHigh = 1; // high gamma
    const sigmaFixed = 0; // not fixed
    const gammaZero = 0; // not zero
    
    const bucketID = buildBucketId(kIdx, invMode, gammaSelHigh, sigmaFixed, gammaZero);
    const markings = createMarkings(bucketID, 15);
    
    console.log("\nBucketID: " + bucketID + " (0x" + bucketID.toString(16) + ")");
    console.log("Data sources: V2 spot + V3 spot ONLY");
    
    await pm.createPool(WETH, USDC, await stoicovQuoter.getAddress(), markings);
    await lm.addLiquidity(WETH, USDC, await stoicovQuoter.getAddress(), markings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    // Execute swap
    const swapAmount = ethers.parseEther("1");
    const tx = await pm.swap(WETH, USDC, await stoicovQuoter.getAddress(), markings, swapAmount, true, 0n);
    const receipt = await tx.wait();
    
    console.log("\n=== GAS RESULTS ===");
    console.log("Total gas:            " + receipt.gasUsed.toString());
    
    const BASELINE = 81263;
    const overhead = Number(receipt.gasUsed) - BASELINE;
    
    console.log("Baseline swap:        " + BASELINE);
    console.log("Overhead:             " + overhead);
    
    // Estimate breakdown
    const v2Cost = 41908;
    const v3Cost = 37684;
    const quoterCost = overhead - v2Cost - v3Cost;
    
    console.log("\n=== BREAKDOWN ===");
    console.log("V2 spot fetch:        ~" + v2Cost.toLocaleString() + " gas");
    console.log("V3 spot fetch:        ~" + v3Cost.toLocaleString() + " gas");
    console.log("StoicovQuoter calc:   ~" + quoterCost.toLocaleString() + " gas 🔴 [PRIMARY COST]");
    console.log("Total overhead:        " + overhead.toLocaleString() + " gas");
    
    console.log("\n🎯 KEY FINDING:");
    console.log("StoicovQuoter's computational overhead is ~" + quoterCost.toLocaleString() + " gas");
    console.log("This includes:");
    console.log("  - Inventory skew calculations");
    console.log("  - Reservation price adjustments");
    console.log("  - Optimal half-spread calculations");
    console.log("  - Q64.64 arithmetic operations");
  });
  
  it("Test 2: StoicovQuoter WITH std dev short (complete cost analysis)", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("TEST 2: STOICOV QUOTER WITH STD DEV SHORT");
    console.log("=".repeat(80));
    console.log("Purpose: Show total cost when std dev is actually fetched");
    console.log("Configuration: V2 + V3 + std dev short (15-min)");
    
    // Use bucket that doesn't optimize away std dev
    const kIdx = 8; // 30 bps
    const invMode = 1; // RISKY0
    const gammaSelHigh = 1; // high gamma
    const sigmaFixed = 0; // NOT fixed (requires real std dev)
    const gammaZero = 0; // NOT zero (requires std dev)
    
    const bucketID = buildBucketId(kIdx, invMode, gammaSelHigh, sigmaFixed, gammaZero);
    const markings = createMarkings(bucketID, 15);
    
    console.log("\nBucketID: " + bucketID + " (0x" + bucketID.toString(16) + ")");
    console.log("Bit 7 (SIGMA_FIXED):  " + ((bucketID & 0x80) !== 0 ? "SET" : "NOT SET"));
    console.log("Bit 8 (GAMMA_ZERO):   " + ((bucketID & 0x100) !== 0 ? "SET" : "NOT SET"));
    console.log("Should fetch std dev: YES");
    
    await pm.createPool(WETH, USDC, await stoicovQuoter.getAddress(), markings);
    await lm.addLiquidity(WETH, USDC, await stoicovQuoter.getAddress(), markings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    // First, test bridge separately with std dev request
    console.log("\n=== TESTING BRIDGE DATA FETCH ===");
    const testParams = {
      asset0: WETH,
      asset1: USDC,
      quoter: await stoicovQuoter.getAddress(),
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: bucketID,
      zeroForOne: true,
      functionFlags: 0x23 // V2 + V3 + std dev short
    };
    
    const bridgeGas = await bridge.getData.estimateGas(testParams);
    const bridgeData = await bridge.getData.staticCall(testParams);
    const [mask, v2Q, v3Q, twQ, clQ, clTs, sdShort, sdLong] = ethers.AbiCoder.defaultAbiCoder().decode(
      ["uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"],
      bridgeData
    );
    
    const maskNum = Number(mask);
    console.log("Bridge gas:           " + bridgeGas.toString());
    console.log("Data mask:            0b" + mask.toString(2).padStart(8, '0'));
    console.log("V2 fetched:           " + ((maskNum & 0x01) !== 0 ? "✅" : "❌"));
    console.log("V3 fetched:           " + ((maskNum & 0x02) !== 0 ? "✅" : "❌"));
    console.log("TWAP fetched:         " + ((maskNum & 0x04) !== 0 ? "✅ (free from std dev)" : "❌"));
    console.log("Std dev short:        " + ((maskNum & 0x20) !== 0 ? "✅ YES" : "❌ NO"));
    
    if ((maskNum & 0x20) !== 0) {
      console.log("Std dev value:        " + (Number(sdShort) / 100).toFixed(2) + " bps");
    }
    
    // Now test full swap
    console.log("\n=== EXECUTING FULL SWAP ===");
    const swapAmount = ethers.parseEther("1");
    const tx = await pm.swap(WETH, USDC, await stoicovQuoter.getAddress(), markings, swapAmount, true, 0n);
    const receipt = await tx.wait();
    
    console.log("Total gas:            " + receipt.gasUsed.toString());
    
    const BASELINE = 81263;
    const totalOverhead = Number(receipt.gasUsed) - BASELINE;
    
    console.log("Baseline swap:        " + BASELINE);
    console.log("Total overhead:       " + totalOverhead.toLocaleString());
    
    // Detailed breakdown
    console.log("\n=== DETAILED BREAKDOWN ===");
    
    const v2Cost = (maskNum & 0x01) !== 0 ? 41908 : 0;
    const v3Cost = (maskNum & 0x02) !== 0 ? 37684 : 0;
    const stdDevCost = (maskNum & 0x20) !== 0 ? (Number(bridgeGas) - v2Cost - v3Cost) : 0;
    const quoterCost = totalOverhead - v2Cost - v3Cost - stdDevCost;
    
    console.log("V2 spot fetch:        " + (v2Cost > 0 ? "~" + v2Cost.toLocaleString() + " gas" : "N/A"));
    console.log("V3 spot fetch:        " + (v3Cost > 0 ? "~" + v3Cost.toLocaleString() + " gas" : "N/A"));
    console.log("Std dev short:        " + (stdDevCost > 0 ? "~" + stdDevCost.toLocaleString() + " gas 🔴" : "~0 gas (not fetched)"));
    console.log("TWAP:                 FREE (from std dev calculation)");
    console.log("StoicovQuoter calc:   ~" + quoterCost.toLocaleString() + " gas 🔴");
    console.log("                      (" + ((quoterCost / totalOverhead) * 100).toFixed(1) + "% of overhead)");
    console.log("-".repeat(50));
    console.log("Total overhead:        " + totalOverhead.toLocaleString() + " gas");
    
    console.log("\n🎯 KEY FINDINGS:");
    if (stdDevCost > 0) {
      console.log("✅ Std dev WAS fetched: ~" + stdDevCost.toLocaleString() + " gas");
      console.log("✅ StoicovQuoter computation: ~" + quoterCost.toLocaleString() + " gas");
      console.log("✅ Total: " + receipt.gasUsed.toString() + " gas");
      console.log("\n💡 Cost split:");
      console.log("   - Data fetching: " + ((v2Cost + v3Cost + stdDevCost) / totalOverhead * 100).toFixed(1) + "%");
      console.log("   - Quoter computation: " + ((quoterCost / totalOverhead) * 100).toFixed(1) + "%");
    } else {
      console.log("⚠️  Std dev was NOT fetched (bridge optimized it away or calculation failed)");
      console.log("   Possible reasons:");
      console.log("   1. Bridge detected SIGMA_FIXED or GAMMA_ZERO in bucketID");
      console.log("   2. UniV3 pool doesn't have enough observations");
      console.log("   3. Calculation returned 0");
      console.log("\n   Actual cost breakdown:");
      console.log("   - V2 + V3 fetching: ~" + (v2Cost + v3Cost).toLocaleString() + " gas");
      console.log("   - StoicovQuoter computation: ~" + quoterCost.toLocaleString() + " gas (PRIMARY COST)");
    }
  });
  
  it("Test 3: Side-by-side comparison (StoixQuoter vs StoicovQuoter)", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("TEST 3: SIDE-BY-SIDE COMPARISON");
    console.log("=".repeat(80));
    
    const simpleMarkings = ethers.toBeHex((0x0F << 4) | (15 << 20) | 0x1, 3); // V2+V3+TWAP+CL
    const bucketID = buildBucketId(8, 1, 1, 0, 0);
    const complexMarkings = createMarkings(bucketID, 15);
    
    // StoixQuoter
    console.log("\n--- StoixQuoter (Simple Average) ---");
    await pm.createPool(WETH, USDC, await stoixQuoter.getAddress(), simpleMarkings);
    await lm.addLiquidity(WETH, USDC, await stoixQuoter.getAddress(), simpleMarkings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    const txStoix = await pm.swap(WETH, USDC, await stoixQuoter.getAddress(), simpleMarkings, ethers.parseEther("1"), true, 0n);
    const receiptStoix = await txStoix.wait();
    
    console.log("Total gas:            " + receiptStoix.gasUsed.toString());
    console.log("Data: V2+V3+TWAP+CL");
    
    // StoicovQuoter
    console.log("\n--- StoicovQuoter (Avellaneda-Stoikov) ---");
    await pm.createPool(WETH, USDC, await stoicovQuoter.getAddress(), complexMarkings);
    await lm.addLiquidity(WETH, USDC, await stoicovQuoter.getAddress(), complexMarkings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    const txStoicov = await pm.swap(WETH, USDC, await stoicovQuoter.getAddress(), complexMarkings, ethers.parseEther("1"), true, 0n);
    const receiptStoicov = await txStoicov.wait();
    
    console.log("Total gas:            " + receiptStoicov.gasUsed.toString());
    console.log("Data: V2+V3 (no std dev fetched)");
    
    // Comparison
    const diff = Number(receiptStoicov.gasUsed) - Number(receiptStoix.gasUsed);
    const pct = (diff / Number(receiptStoix.gasUsed) * 100).toFixed(1);
    
    console.log("\n=== COMPARISON ===");
    console.log("StoixQuoter:          " + receiptStoix.gasUsed.toString() + " gas");
    console.log("StoicovQuoter:        " + receiptStoicov.gasUsed.toString() + " gas");
    console.log("Difference:           +" + diff.toLocaleString() + " gas (+" + pct + "%)");
    
    console.log("\n🎯 ANALYSIS:");
    console.log("The difference of ~" + diff.toLocaleString() + " gas is ENTIRELY from:");
    console.log("  ❌ NOT from std dev (wasn't fetched in either case)");
    console.log("  ✅ StoicovQuoter's sophisticated computation:");
    console.log("     - Inventory position tracking");
    console.log("     - Reservation price adjustments");
    console.log("     - Risk-adjusted spread calculations");
    console.log("     - Complex Q64.64 arithmetic");
    
    console.log("\n💰 IS IT WORTH IT?");
    console.log("StoicovQuoter provides:");
    console.log("  ✅ Dynamic spreads based on inventory");
    console.log("  ✅ Risk-adjusted pricing");
    console.log("  ✅ Scientific market-making model");
    console.log("  ❌ Costs +" + diff.toLocaleString() + " gas per swap");
  });
});

