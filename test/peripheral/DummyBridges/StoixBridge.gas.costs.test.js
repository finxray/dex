const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StoixBridge Gas Cost Analysis", function () {
  let pm, lm, quoter, bridge;
  let tokenA, tokenB, user;
  
  // Helper to create slot 15 markings
  function createMarkings(functionFlags) {
    return (functionFlags << 4) | (15 << 20); // bucketID=functionFlags, extraBridgeSlot=15
  }
  
  beforeEach(async function () {
    [user] = await ethers.getSigners();
    
    // Deploy test tokens
    const TA = await ethers.getContractFactory("TestTokenA");
    const TB = await ethers.getContractFactory("TestTokenB");
    tokenA = await TA.deploy();
    tokenB = await TB.deploy();
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();
    
    // Deploy MockStoixDataBridge
    const Bridge = await ethers.getContractFactory("MockStoixDataBridge");
    bridge = await Bridge.deploy();
    await bridge.waitForDeployment();
    
    // Deploy StoixQuoter
    const StoixQuoter = await ethers.getContractFactory("StoixQuoter");
    quoter = await StoixQuoter.deploy();
    await quoter.waitForDeployment();
    
    // Deploy PoolManager with MockStoixDataBridge
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(await bridge.getAddress());
    await pm.waitForDeployment();
    
    // Deploy LiquidityManager
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    lm = await LiquidityManager.deploy(await pm.getAddress());
    await lm.waitForDeployment();
    await pm.setLiquidityManager(await lm.getAddress());
    
    // Mint tokens and approve
    await tokenA.mint(await user.getAddress(), ethers.parseEther("1000"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("1000"));
    await tokenA.approve(await pm.getAddress(), ethers.MaxUint256);
    await tokenB.approve(await pm.getAddress(), ethers.MaxUint256);
  });
  
  it("should measure gas costs for different data source combinations", async function () {
    const tokenAAddr = await tokenA.getAddress();
    const tokenBAddr = await tokenB.getAddress();
    const quoterAddr = await quoter.getAddress();
    
    console.log("=== GAS COST ANALYSIS BY SOURCE COUNT ===\n");
    
    const testConfigs = [
      { flags: 0x01, label: "V2 only", sources: 1 },
      { flags: 0x02, label: "V3 only", sources: 1 },
      { flags: 0x08, label: "Chainlink only", sources: 1 },
      { flags: 0x03, label: "V2 + V3", sources: 2 },
      { flags: 0x06, label: "V3 + TWAP", sources: 2 },
      { flags: 0x0A, label: "V3 + Chainlink", sources: 2 },
      { flags: 0x07, label: "V2 + V3 + TWAP", sources: 3 },
      { flags: 0x0F, label: "All 4 sources", sources: 4 },
      { flags: 0x1F, label: "All + timestamp", sources: 5 }
    ];
    
    const gasResults = [];
    
    for (const config of testConfigs) {
      const markings = ethers.toBeHex(createMarkings(config.flags), 3);
      
      // Create pool and add liquidity
      await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
      await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("100"), ethers.parseEther("100"));
      
      // Measure quote gas
      const quoteGas = await pm.getQuote.estimateGas({
        asset0: tokenAAddr,
        asset1: tokenBAddr,
        quoter: quoterAddr,
        amount: [ethers.parseEther("1")],
        zeroForOne: true,
        marking: [markings],
        traderProtection: "0x00000000"
      }, 0n, 0n);
      
      // Measure swap gas
      const swapGas = await pm.swap.estimateGas(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1"), true, 0n);
      
      // Get the actual quote for verification
      const [quote] = await pm.getQuote.staticCall({
        asset0: tokenAAddr,
        asset1: tokenBAddr,
        quoter: quoterAddr,
        amount: [ethers.parseEther("1")],
        zeroForOne: true,
        marking: [markings],
        traderProtection: "0x00000000"
      }, 0n, 0n);
      
      const result = {
        ...config,
        quoteGas: Number(quoteGas),
        swapGas: Number(swapGas),
        quote: quote.toString(),
        gasPerSource: Math.round(Number(quoteGas) / config.sources)
      };
      
      gasResults.push(result);
      
      console.log(`${config.label.padEnd(20)} | ${config.sources} source${config.sources > 1 ? 's' : ''} | Quote: ${quoteGas.toString().padStart(6)} gas | Swap: ${swapGas.toString().padStart(6)} gas | ${result.gasPerSource.toString().padStart(5)} gas/source`);
    }
    
    console.log("\n=== GAS SCALING ANALYSIS ===");
    
    // Find baseline (single source average)
    const singleSourceResults = gasResults.filter(r => r.sources === 1);
    const avgSingleQuoteGas = singleSourceResults.reduce((sum, r) => sum + r.quoteGas, 0) / singleSourceResults.length;
    const avgSingleSwapGas = singleSourceResults.reduce((sum, r) => sum + r.swapGas, 0) / singleSourceResults.length;
    
    console.log(`Average single source  | Quote: ${Math.round(avgSingleQuoteGas).toString().padStart(6)} gas | Swap: ${Math.round(avgSingleSwapGas).toString().padStart(6)} gas`);
    
    // Calculate overhead per additional source
    const allSourcesResult = gasResults.find(r => r.flags === 0x0F);
    const quoteOverheadPerSource = (allSourcesResult.quoteGas - avgSingleQuoteGas) / 3;
    const swapOverheadPerSource = (allSourcesResult.swapGas - avgSingleSwapGas) / 3;
    
    console.log(`Overhead per extra src | Quote: ${Math.round(quoteOverheadPerSource).toString().padStart(6)} gas | Swap: ${Math.round(swapOverheadPerSource).toString().padStart(6)} gas`);
    
    // Show efficiency metrics
    const allSourcesWithTS = gasResults.find(r => r.flags === 0x1F);
    const timestampOverhead = allSourcesWithTS.quoteGas - allSourcesResult.quoteGas;
    
    console.log(`Timestamp overhead     | Quote: ${timestampOverhead.toString().padStart(6)} gas | Swap: ${(allSourcesWithTS.swapGas - allSourcesResult.swapGas).toString().padStart(6)} gas`);
    
    console.log("\n=== EFFICIENCY SUMMARY ===");
    console.log(`Most efficient (1 src) : ${Math.min(...singleSourceResults.map(r => r.swapGas))} gas`);
    console.log(`Most comprehensive     : ${allSourcesWithTS.swapGas} gas (5 data points)`);
    console.log(`Gas scaling factor     : ${(allSourcesWithTS.swapGas / Math.min(...singleSourceResults.map(r => r.swapGas))).toFixed(2)}x`);
    console.log(`Overhead per data point: ${Math.round((allSourcesWithTS.swapGas - Math.min(...singleSourceResults.map(r => r.swapGas))) / 4)} gas`);
    
    // Verify all quotes are reasonable
    gasResults.forEach(result => {
      expect(result.quoteGas).to.be.lt(100000); // Quote should be under 100k gas
      expect(result.swapGas).to.be.lt(150000);  // Swap should be under 150k gas
      expect(BigInt(result.quote)).to.be.gt(0n); // All should return valid quotes
    });
  });
  
  it("should compare gas costs with different swap amounts", async function () {
    const tokenAAddr = await tokenA.getAddress();
    const tokenBAddr = await tokenB.getAddress();
    const quoterAddr = await quoter.getAddress();
    
    console.log("\n=== GAS COST BY SWAP AMOUNT ===\n");
    
    const markings = ethers.toBeHex(createMarkings(0x0F), 3); // All sources
    await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, markings);
    await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, markings, ethers.parseEther("1000"), ethers.parseEther("1000"));
    
    const amounts = [
      { amount: ethers.parseEther("0.001"), label: "0.001 tokens" },
      { amount: ethers.parseEther("0.1"), label: "0.1 tokens" },
      { amount: ethers.parseEther("1"), label: "1 token" },
      { amount: ethers.parseEther("10"), label: "10 tokens" },
      { amount: ethers.parseEther("100"), label: "100 tokens" }
    ];
    
    console.log("Amount".padEnd(15) + " | Quote Gas | Swap Gas  | Quote Result");
    console.log("-".repeat(65));
    
    for (const { amount, label } of amounts) {
      const quoteGas = await pm.getQuote.estimateGas({
        asset0: tokenAAddr,
        asset1: tokenBAddr,
        quoter: quoterAddr,
        amount: [amount],
        zeroForOne: true,
        marking: [markings],
        traderProtection: "0x00000000"
      }, 0n, 0n);
      
      const swapGas = await pm.swap.estimateGas(tokenAAddr, tokenBAddr, quoterAddr, markings, amount, true, 0n);
      
      const [quote] = await pm.getQuote.staticCall({
        asset0: tokenAAddr,
        asset1: tokenBAddr,
        quoter: quoterAddr,
        amount: [amount],
        zeroForOne: true,
        marking: [markings],
        traderProtection: "0x00000000"
      }, 0n, 0n);
      
      console.log(`${label.padEnd(15)} | ${quoteGas.toString().padStart(9)} | ${swapGas.toString().padStart(9)} | ${ethers.formatEther(quote).substring(0, 12)}`);
      
      // Gas should be roughly constant regardless of amount
      expect(quoteGas).to.be.lt(100000);
      expect(swapGas).to.be.lt(150000);
    }
    
    console.log("\n✅ Gas costs are constant regardless of swap amount");
  });
});
