const { expect } = require("chai");
const { ethers, network } = require("hardhat");

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, "0x1000000000000000000"]);
  return await ethers.getSigner(addr);
}

describe("StoicovQuoter Gas Investigation - Find the Missing Gas", function () {
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
    let v = 0x1;
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
  
  it("🔍 Investigation: Bridge gas with different flag combinations", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("🔍 BRIDGE GAS INVESTIGATION");
    console.log("=".repeat(80));
    console.log("Testing what flags are ACTUALLY being passed and processed");
    
    const bucketID = buildBucketId(8, 1, 1, 0, 0); // Regular bucket
    
    const testCases = [
      { flags: 0x00, label: "No data" },
      { flags: 0x01, label: "V2 only" },
      { flags: 0x02, label: "V3 only" },
      { flags: 0x03, label: "V2 + V3" },
      { flags: 0x0F, label: "V2 + V3 + TWAP + CL" },
      { flags: 0x20, label: "Std dev short only" },
      { flags: 0x23, label: "V2 + V3 + std dev short" },
      { flags: 0x2F, label: "All except long std dev" }
    ];
    
    console.log("\nFlags | Label                      | Bridge Gas | Mask | Actual Sources");
    console.log("-".repeat(85));
    
    for (const testCase of testCases) {
      const params = {
        asset0: WETH,
        asset1: USDC,
        quoter: await stoicovQuoter.getAddress(),
        amount: ethers.parseEther("1"),
        asset0Balance: 0n,
        asset1Balance: 0n,
        bucketID: bucketID,
        zeroForOne: true,
        functionFlags: testCase.flags
      };
      
      try {
        const gas = await bridge.getData.estimateGas(params);
        const data = await bridge.getData.staticCall(params);
        const [mask] = ethers.AbiCoder.defaultAbiCoder().decode(["uint8"], data);
        const maskNum = Number(mask);
        
        const sources = [];
        if (maskNum & 0x01) sources.push("V2");
        if (maskNum & 0x02) sources.push("V3");
        if (maskNum & 0x04) sources.push("TWAP");
        if (maskNum & 0x08) sources.push("CL");
        if (maskNum & 0x20) sources.push("stdShort");
        if (maskNum & 0x40) sources.push("stdLong");
        
        console.log(
          "0x" + testCase.flags.toString(16).padStart(2, '0') + " | " +
          testCase.label.padEnd(25) + " | " +
          gas.toString().padStart(10) + " | " +
          ("0x" + maskNum.toString(16).padStart(2, '0')).padEnd(4) + " | " +
          (sources.length > 0 ? sources.join("+") : "none")
        );
        
        // Check for anomaly: high gas but low mask
        if (Number(gas) > 100000 && sources.length <= 2) {
          console.log("      ⚠️  HIGH GAS BUT FEW SOURCES - std dev attempted but returned 0?");
        }
      } catch (error) {
        console.log("0x" + testCase.flags.toString(16).padStart(2, '0') + " | " + testCase.label.padEnd(25) + " | ERROR");
      }
    }
    
    console.log("\n🎯 KEY OBSERVATION:");
    console.log("If flags 0x23 shows high gas (~200k) but mask is only 0x03,");
    console.log("it means std dev was ATTEMPTED but returned 0 (costing gas anyway!)");
  });
  
  it("✅ CORRECTED TEST: StoicovQuoter swap WITHOUT std dev request", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("✅ CORRECTED: STOICOV WITHOUT STD DEV REQUEST");
    console.log("=".repeat(80));
    console.log("Using flags that DON'T request std dev at all");
    
    // Use bucket that won't trigger std dev
    const bucketID = buildBucketId(8, 1, 1, 0, 0);
    const markings = createMarkings(bucketID, 15);
    
    await pm.createPool(WETH, USDC, await stoicovQuoter.getAddress(), markings);
    await lm.addLiquidity(WETH, USDC, await stoicovQuoter.getAddress(), markings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    // Test bridge with ONLY V2+V3 (no std dev flag)
    const testParams = {
      asset0: WETH,
      asset1: USDC,
      quoter: await stoicovQuoter.getAddress(),
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: bucketID,
      zeroForOne: true,
      functionFlags: 0x03 // ONLY V2 + V3, NO STD DEV
    };
    
    const bridgeGas = await bridge.getData.estimateGas(testParams);
    const bridgeData = await bridge.getData.staticCall(testParams);
    const [mask] = ethers.AbiCoder.defaultAbiCoder().decode(["uint8"], bridgeData);
    
    console.log("Bridge flags:         0x03 (V2 + V3 only)");
    console.log("Bridge gas:           " + bridgeGas.toString());
    console.log("Mask returned:        0x" + Number(mask).toString(16));
    
    // Now do the full swap
    const tx = await pm.swap(WETH, USDC, await stoicovQuoter.getAddress(), markings, ethers.parseEther("1"), true, 0n);
    const receipt = await tx.wait();
    
    console.log("\n=== SWAP RESULTS ===");
    console.log("Total gas:            " + receipt.gasUsed.toString());
    
    const BASELINE = 81263;
    const overhead = Number(receipt.gasUsed) - BASELINE;
    
    console.log("Baseline:             " + BASELINE);
    console.log("Overhead:             " + overhead.toLocaleString());
    
    console.log("\n=== EXPECTED BREAKDOWN ===");
    console.log("Baseline:             ~81,263 gas");
    console.log("V2 + V3 fetch:        ~30,000 gas");
    console.log("StoicovQuoter:        ~6,000 gas");
    console.log("PoolManager overhead: ~" + (overhead - 30000 - 6000).toLocaleString() + " gas");
    console.log("Total expected:       ~" + (81263 + 30000 + 6000 + (overhead - 36000)).toLocaleString() + " gas");
    console.log("Actual:               " + receipt.gasUsed.toString() + " gas");
  });
  
  it("📊 COMPLETE BREAKDOWN: Track each component separately", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("📊 COMPLETE COMPONENT-BY-COMPONENT BREAKDOWN");
    console.log("=".repeat(80));
    
    // Step 1: Measure StoixQuoter swap (baseline)
    console.log("\n--- Step 1: StoixQuoter Swap (Baseline) ---");
    const simpleMarkings = ethers.toBeHex((0x03 << 4) | (15 << 20) | 0x1, 3); // V2+V3 only
    await pm.createPool(WETH, USDC, await stoixQuoter.getAddress(), simpleMarkings);
    await lm.addLiquidity(WETH, USDC, await stoixQuoter.getAddress(), simpleMarkings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    const txStoix = await pm.swap(WETH, USDC, await stoixQuoter.getAddress(), simpleMarkings, ethers.parseEther("1"), true, 0n);
    const receiptStoix = await txStoix.wait();
    console.log("StoixQuoter swap:     " + receiptStoix.gasUsed.toString() + " gas");
    
    // Step 2: Measure StoicovQuoter swap (no std dev)
    console.log("\n--- Step 2: StoicovQuoter Swap (V2+V3 only) ---");
    const bucketID = buildBucketId(8, 1, 1, 0, 0);
    const complexMarkings = createMarkings(bucketID, 15);
    await pm.createPool(WETH, USDC, await stoicovQuoter.getAddress(), complexMarkings);
    await lm.addLiquidity(WETH, USDC, await stoicovQuoter.getAddress(), complexMarkings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    const txStoicov = await pm.swap(WETH, USDC, await stoicovQuoter.getAddress(), complexMarkings, ethers.parseEther("1"), true, 0n);
    const receiptStoicov = await txStoicov.wait();
    console.log("StoicovQuoter swap:   " + receiptStoicov.gasUsed.toString() + " gas");
    
    // Step 3: Calculate differences
    const quoterDiff = Number(receiptStoicov.gasUsed) - Number(receiptStoix.gasUsed);
    
    console.log("\n=== ANALYSIS ===");
    console.log("Difference:           " + quoterDiff.toLocaleString() + " gas");
    console.log("");
    console.log("This difference includes:");
    console.log("  1. StoicovQuoter computation overhead: ~6,000 gas (measured in isolated test)");
    console.log("  2. PoolManager additional overhead:    ~" + (quoterDiff - 6000).toLocaleString() + " gas");
    console.log("");
    console.log("🎯 THE MYSTERY: Why does PoolManager have " + (quoterDiff - 6000).toLocaleString() + " gas overhead");
    console.log("   when using StoicovQuoter vs StoixQuoter?");
    console.log("");
    console.log("Possible reasons:");
    console.log("  - PoolManager calls quoter multiple times");
    console.log("  - Additional validation/checks for complex quoters");
    console.log("  - Memory expansion from larger quote data");
    console.log("  - Different code paths in swap logic");
    
    // Step 4: User's expected calculation
    console.log("\n=== USER'S EXPECTED CALCULATION ===");
    console.log("StoicovQuoter computation:    ~6,000 gas");
    console.log("Swap with data (no std dev):  ~250,000 gas (from StoixQuoter)");
    console.log("Expected StoicovQuoter swap:  ~256,000 gas");
    console.log("Actual StoicovQuoter swap:     " + receiptStoicov.gasUsed.toString() + " gas");
    console.log("Unexplained overhead:          " + (Number(receiptStoicov.gasUsed) - 256000).toLocaleString() + " gas 🔴");
  });
});

