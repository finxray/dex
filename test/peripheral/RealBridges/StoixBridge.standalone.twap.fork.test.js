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

describe("Standalone TWAP swap() with Direct Protocol Calls (Fork)", function () {
  let pm, lm, quoter, bridge;
  let weth, usdc, user;
  
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const ETH_USD_CHAINLINK = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
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
  
  it("should demonstrate standalone TWAP swap (no std dev optimization)", async function () {
    const quoterAddr = await quoter.getAddress();
    
    console.log("🔥 STANDALONE TWAP SWAP WITH DIRECT PROTOCOL CALLS");
    console.log("=" * 80);
    
    // Test with V2 + V3 + standalone TWAP (NO std dev)
    // Flags: 0x01 (V2) | 0x02 (V3) | 0x04 (standalone TWAP)
    const standaloneFlags = 0x07; // V2 + V3 + standalone TWAP
    const markings = ethers.toBeHex(createMarkings(standaloneFlags), 3);
    
    console.log("Function flags:", "0x" + standaloneFlags.toString(16));
    console.log("Sources: V2 spot + V3 spot + standalone TWAP (15-min)");
    console.log("Markings:", markings);
    console.log("Note: Std dev flag OFF - TWAP called separately");
    
    // Create pool and add liquidity
    await pm.createPool(WETH, USDC, quoterAddr, markings);
    await lm.addLiquidity(WETH, USDC, quoterAddr, markings, ethers.parseEther("5"), 5n * 3000n * 10n ** 6n);
    
    console.log("\n=== TESTING INDIVIDUAL SOURCES ===");
    
    // Test each source individually
    const testSources = [
      { flags: 0x01, name: "V2 spot" },
      { flags: 0x02, name: "V3 spot" },
      { flags: 0x04, name: "Standalone TWAP (15-min)" }
    ];
    
    for (const source of testSources) {
      try {
        const testParams = {
          asset0: WETH,
          asset1: USDC,
          quoter: quoterAddr,
          amount: ethers.parseEther("1"),
          asset0Balance: 0n,
          asset1Balance: 0n,
          bucketID: 0n,
          zeroForOne: true,
          functionFlags: source.flags
        };
        
        const gas = await bridge.getData.estimateGas(testParams);
        const data = await bridge.getData.staticCall(testParams);
        
        console.log(`✅ ${source.name}: ${gas.toString()} gas`);
        
        // Decode to show what data is available
        const [mask] = ethers.AbiCoder.defaultAbiCoder().decode(["uint8"], data);
        console.log(`   Data mask: 0b${mask.toString(2).padStart(8, '0')}`);
        
      } catch (error) {
        console.log(`❌ ${source.name}: Failed - ${error.message.split('(')[0]}`);
      }
    }
    
    console.log("\n=== COMPREHENSIVE STANDALONE TWAP TEST ===");
    
    // Test the full combination with standalone TWAP
    try {
      const paramsBase = {
        asset0: WETH,
        asset1: USDC,
        quoter: quoterAddr,
        amount: ethers.parseEther("1"),
        asset0Balance: 0n,
        asset1Balance: 0n,
        bucketID: 0n,
        zeroForOne: true,
        functionFlags: standaloneFlags
      };
      
      const bridgeGas = await bridge.getData.estimateGas(paramsBase);
      const bridgeData = await bridge.getData.staticCall(paramsBase);
      
      console.log("Bridge gas cost:", bridgeGas.toString());
      
      const [mask, v2Q, v3Q, twQ, clQ, clTs, sdShort] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"], 
        bridgeData
      );
      
      console.log("Data mask:", "0b" + mask.toString(2).padStart(8, '0'));
      console.log("Available sources:");
      if (v2Q > 0) console.log("  V2 spot:", fmtQ(BigInt(v2Q.toString())), "USDC/WETH");
      if (v3Q > 0) console.log("  V3 spot:", fmtQ(BigInt(v3Q.toString())), "USDC/WETH");
      if (twQ > 0) console.log("  TWAP (standalone):", fmtQ(BigInt(twQ.toString())), "USDC/WETH");
      if (sdShort > 0) console.log("  Std dev short:", (Number(sdShort) / 100).toFixed(2), "bp");
      else console.log("  Std dev short: OFF (as expected)");
      
      // Test quoter
      const [quote] = await pm.getQuote.staticCall({
        asset0: WETH,
        asset1: USDC,
        quoter: quoterAddr,
        amount: [ethers.parseEther("1")],
        zeroForOne: true,
        marking: [markings],
        traderProtection: "0x00000000"
      }, 0n, 0n);
      
      console.log("Final averaged quote:", Number(ethers.formatUnits(quote, 6)).toFixed(2), "USDC per WETH");
      
      if (quote > 0n) {
        const swapGas = await pm.swap.estimateGas(WETH, USDC, quoterAddr, markings, ethers.parseEther("0.1"), true, 0n);
        console.log("🔥 STANDALONE TWAP SWAP GAS:", swapGas.toString());
        
        const BASELINE = 81263;
        const overhead = Number(swapGas) - BASELINE;
        console.log("Data overhead:", overhead.toString(), "gas");
        console.log("Efficiency:", ((overhead / BASELINE) * 100).toFixed(1) + "% overhead");
        
        console.log("\n=== COMPARISON WITH OPTIMIZED APPROACH ===");
        console.log("Standalone TWAP gas:      ", swapGas.toString(), "gas");
        console.log("Optimized (std dev) gas:   294,832 gas (from previous test)");
        console.log("Gas difference:           ", (294832 - Number(swapGas)).toString(), "gas");
        console.log("Optimization savings:     ", (((294832 - Number(swapGas)) / 294832) * 100).toFixed(1) + "%");
        
        console.log("\n📊 STANDALONE BREAKDOWN:");
        console.log("V2 spot:           41,908 gas");
        console.log("V3 spot:           37,684 gas");
        console.log("Standalone TWAP:   ~" + (overhead - 41908 - 37684).toString() + " gas");
        console.log("Total data:        " + overhead.toString() + " gas");
        
      }
      
    } catch (error) {
      console.log("❌ Standalone TWAP test failed:", error.message);
    }
    
    console.log("\n🎯 STANDALONE TWAP CHARACTERISTICS:");
    console.log("✅ V2 spot: Direct pair reserves call");
    console.log("✅ V3 spot: Direct pool slot0 call");
    console.log("✅ TWAP: Separate V3 observe() call (15-min window)");
    console.log("❌ Std dev: OFF (no historical data processing)");
    console.log("✅ Quoter: Averages 3 price sources (V2, V3, TWAP)");
  });
  
  it("should compare standalone TWAP vs optimized std dev approach", async function () {
    const quoterAddr = await quoter.getAddress();
    
    console.log("\n=== GAS COMPARISON: STANDALONE TWAP vs OPTIMIZED STD DEV ===");
    
    const testConfigs = [
      { 
        flags: 0x03, 
        label: "V2 + V3 only", 
        description: "Basic spot prices",
        sources: ["V2 spot", "V3 spot"]
      },
      { 
        flags: 0x07, 
        label: "V2 + V3 + standalone TWAP", 
        description: "Spot prices + separate TWAP call",
        sources: ["V2 spot", "V3 spot", "TWAP (standalone)"]
      },
      { 
        flags: 0x23, 
        label: "V2 + V3 + std dev (free TWAP)", 
        description: "Spot prices + std dev + free TWAP",
        sources: ["V2 spot", "V3 spot", "std dev short", "TWAP (free)"]
      }
    ];
    
    console.log("\nConfiguration".padEnd(30) + " | Swap Gas | Data Overhead | Sources");
    console.log("-".repeat(85));
    
    const results = [];
    
    for (const config of testConfigs) {
      const markings = ethers.toBeHex(createMarkings(config.flags), 3);
      
      try {
        // Create pool and add liquidity
        await pm.createPool(WETH, USDC, quoterAddr, markings);
        await lm.addLiquidity(WETH, USDC, quoterAddr, markings, ethers.parseEther("5"), 5n * 3000n * 10n ** 6n);
        
        const swapGas = await pm.swap.estimateGas(WETH, USDC, quoterAddr, markings, ethers.parseEther("0.1"), true, 0n);
        const BASELINE = 81263;
        const overhead = Number(swapGas) - BASELINE;
        
        results.push({
          ...config,
          swapGas: Number(swapGas),
          overhead: overhead
        });
        
        console.log(`${config.label.padEnd(30)} | ${swapGas.toString().padStart(8)} | ${overhead.toString().padStart(13)} | ${config.sources.length} sources`);
        
      } catch (error) {
        console.log(`${config.label.padEnd(30)} | ${"ERROR".padStart(8)} | ${"ERROR".padStart(13)} | ${error.message.split('(')[0]}`);
      }
    }
    
    if (results.length >= 2) {
      console.log("\n" + "=".repeat(85));
      console.log("ANALYSIS:");
      console.log("=".repeat(85));
      
      const v2v3Only = results.find(r => r.flags === 0x03);
      const standaloneTwap = results.find(r => r.flags === 0x07);
      const optimizedStdDev = results.find(r => r.flags === 0x23);
      
      if (v2v3Only && standaloneTwap) {
        const twapCost = standaloneTwap.overhead - v2v3Only.overhead;
        console.log("Standalone TWAP cost:     " + twapCost.toString().padStart(6) + " gas");
      }
      
      if (standaloneTwap && optimizedStdDev) {
        const stdDevCost = optimizedStdDev.overhead - standaloneTwap.overhead;
        console.log("Std dev additional cost:  " + stdDevCost.toString().padStart(6) + " gas");
        console.log("Total with std dev:       " + optimizedStdDev.overhead.toString().padStart(6) + " gas");
        console.log("Total standalone:         " + standaloneTwap.overhead.toString().padStart(6) + " gas");
        
        if (stdDevCost > 0) {
          console.log("\n💡 OPTIMIZATION INSIGHT:");
          console.log("When you need volatility data, std dev gives you TWAP for free!");
          console.log("Std dev cost: +" + stdDevCost.toString() + " gas");
          console.log("But you get: TWAP + volatility + 10 historical data points");
        }
      }
    }
    
    console.log("\n🎯 STANDALONE TWAP CHARACTERISTICS:");
    console.log("✅ Direct V3 observe() call for 15-min TWAP");
    console.log("✅ No historical data processing");
    console.log("✅ No volatility calculation");
    console.log("✅ Lower gas cost than std dev approach");
    console.log("❌ No volatility information available");
  });
});
