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

describe("Single Swap Test with Real StoixDataBridge and StoixQuoter", function () {
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
  
  it("should execute single swap with StoixDataBridge and display data and gas usage", async function () {
    const quoterAddr = await quoter.getAddress();
    const bridgeAddr = await bridge.getAddress();
    
    console.log("\n" + "=".repeat(80));
    console.log("🔥 SINGLE SWAP TEST - REAL STOIX DATA BRIDGE + STOIX QUOTER");
    console.log("=".repeat(80));
    console.log("Bridge address:      ", bridgeAddr);
    console.log("Quoter address:      ", quoterAddr);
    console.log("Token pair:           WETH/USDC");
    console.log("Swap direction:       WETH -> USDC (zeroForOne=true)");
    console.log("Quoter logic:         Simple average of available prices");
    
    // Use flags for V2, V3, TWAP, and Chainlink (no std dev)
    // Flags: 0x01 (V2) | 0x02 (V3) | 0x04 (TWAP) | 0x08 (Chainlink)
    const functionFlags = 0x0F;
    const markings = ethers.toBeHex(createMarkings(functionFlags), 3);
    
    console.log("\n=== CONFIGURATION ===");
    console.log("Function flags:       0x" + functionFlags.toString(16).padStart(2, '0'));
    console.log("Data sources:         V2 spot + V3 spot + TWAP + Chainlink");
    console.log("Markings:            ", markings);
    
    // Create pool and add liquidity
    await pm.createPool(WETH, USDC, quoterAddr, markings);
    await lm.addLiquidity(WETH, USDC, quoterAddr, markings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    console.log("\n=== POOL INITIALIZED ===");
    console.log("Liquidity added:      10 WETH, 30,000 USDC");
    
    // Test bridge data
    console.log("\n=== DATA BRIDGE OUTPUT ===");
    
    const paramsBase = {
      asset0: WETH,
      asset1: USDC,
      quoter: quoterAddr,
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: 0n,
      zeroForOne: true,
      functionFlags: functionFlags
    };
    
    const bridgeGas = await bridge.getData.estimateGas(paramsBase);
    const bridgeData = await bridge.getData.staticCall(paramsBase);
    
    console.log("Bridge gas cost:     ", bridgeGas.toString(), "gas");
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
    console.log("  bit 5 (stdShort):   " + ((maskNum & 0x20) !== 0 ? "✅" : "❌"));
    console.log("  bit 6 (stdLong):    " + ((maskNum & 0x40) !== 0 ? "✅" : "❌"));
    
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
      console.log("  Std dev short:      " + (Number(sdShort) / 100).toFixed(2) + " bp");
    }
    if ((maskNum & 0x40) !== 0) {
      console.log("  Std dev long:       " + (Number(sdLong) / 100).toFixed(2) + " bp");
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
      console.log("\nAverage price:        " + fmtQ(avgQ) + " USDC/WETH (from " + n + " sources)");
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
    
    console.log("\n=== GAS BREAKDOWN ===");
    console.log("Baseline swap:       ", BASELINE, "gas (no data bridges)");
    console.log("Data overhead:       ", dataOverhead, "gas");
    console.log("Total swap gas:      ", receipt.gasUsed.toString(), "gas");
    console.log("Overhead %:          ", ((dataOverhead / BASELINE) * 100).toFixed(1) + "%");
    
    console.log("\nData sources cost breakdown (approximate):");
    console.log("  V2 spot:            ~41,908 gas");
    console.log("  V3 spot:            ~37,684 gas");
    console.log("  TWAP:               ~27,000 gas");
    console.log("  Chainlink:          ~3,500 gas");
    console.log("  Total estimated:    ~110,092 gas");
    console.log("  Actual overhead:    " + dataOverhead + " gas");
  });
});

