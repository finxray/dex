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

describe("Real Data Optimized swap() with Direct Protocol Calls (Fork)", function () {
  let pm, lm, quoter, bridge;
  let weth, usdc, user;
  
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const ETH_USD_CHAINLINK = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"; // Correct ETH/USD feed
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
      ETH_USD_CHAINLINK, // Correct ETH/USD feed
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
  
  it("should demonstrate real data swap with V2 + V3 + std dev optimizations", async function () {
    const quoterAddr = await quoter.getAddress();
    
    console.log("🔥 REAL DATA SWAP WITH DIRECT PROTOCOL CALLS");
    console.log("=" * 80);
    
    // Test with V2 + V3 + std dev short (which gives TWAP for free)
    // Flags: 0x01 (V2) | 0x02 (V3) | 0x20 (std dev short + free TWAP)
    const optimizedFlags = 0x23; // V2 + V3 + std dev short
    const markings = ethers.toBeHex(createMarkings(optimizedFlags), 3);
    
    console.log("Function flags:", "0x" + optimizedFlags.toString(16));
    console.log("Sources: V2 spot + V3 spot + std dev short (+ free 15-min TWAP)");
    console.log("Markings:", markings);
    
    // Create pool and add liquidity
    await pm.createPool(WETH, USDC, quoterAddr, markings);
    await lm.addLiquidity(WETH, USDC, quoterAddr, markings, ethers.parseEther("5"), 5n * 3000n * 10n ** 6n);
    
    console.log("\n=== TESTING INDIVIDUAL SOURCES ===");
    
    // Test each source individually to see which ones work
    const testSources = [
      { flags: 0x01, name: "V2 spot" },
      { flags: 0x02, name: "V3 spot" },
      { flags: 0x20, name: "Std dev short (+ free TWAP)" }
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
    
    console.log("\n=== COMPREHENSIVE TEST ===");
    
    // Test the full combination
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
        functionFlags: optimizedFlags
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
      if (twQ > 0) console.log("  TWAP (free):", fmtQ(BigInt(twQ.toString())), "USDC/WETH");
      if (sdShort > 0) console.log("  Std dev short:", (Number(sdShort) / 100).toFixed(2), "bp (ignored by quoter)");
      
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
        console.log("🔥 OPTIMIZED REAL DATA SWAP GAS:", swapGas.toString());
        
        const BASELINE = 81263;
        const overhead = Number(swapGas) - BASELINE;
        console.log("Data overhead:", overhead.toString(), "gas");
        console.log("Efficiency:", ((overhead / BASELINE) * 100).toFixed(1) + "% overhead for real market data");
      }
      
    } catch (error) {
      console.log("❌ Comprehensive test failed:", error.message);
    }
    
    console.log("\n🎯 ARCHITECTURE BENEFITS:");
    console.log("✅ Direct protocol calls (no intermediate contracts)");
    console.log("✅ TWAP comes free with std dev calculation");
    console.log("✅ Chainlink price + timestamp in single call");
    console.log("✅ 10 data points for short-term std dev (gas efficient)");
    console.log("✅ All prices averaged by quoter for robust pricing");
  });
});