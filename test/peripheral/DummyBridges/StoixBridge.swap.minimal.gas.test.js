const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Minimal swap() Gas Cost - No Data Bridges", function () {
  let pm, lm, dummyQuoter;
  let tokenA, tokenB, user;
  
  beforeEach(async function () {
    [user] = await ethers.getSigners();
    
    // Deploy test tokens
    const TA = await ethers.getContractFactory("TestTokenA");
    const TB = await ethers.getContractFactory("TestTokenB");
    tokenA = await TA.deploy();
    tokenB = await TB.deploy();
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();
    
    // Deploy the minimal quoter (no data bridge calls)
    const MinimalQuoter = await ethers.getContractFactory("MinimalDummyQuoter");
    dummyQuoter = await MinimalQuoter.deploy();
    await dummyQuoter.waitForDeployment();
    
    // Deploy PoolManager with no default bridge (address(0))
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(ethers.ZeroAddress);
    await pm.waitForDeployment();
    
    // Deploy LiquidityManager
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    lm = await LiquidityManager.deploy(await pm.getAddress());
    await lm.waitForDeployment();
    await pm.setLiquidityManager(await lm.getAddress());
    
    // Mint tokens and approve (need more for liquidity)
    await tokenA.mint(await user.getAddress(), ethers.parseEther("10000"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("10000"));
    await tokenA.approve(await pm.getAddress(), ethers.MaxUint256);
    await tokenB.approve(await pm.getAddress(), ethers.MaxUint256);
  });
  
  it("should measure minimal swap() gas cost with no data bridges", async function () {
    const tokenAAddr = await tokenA.getAddress();
    const tokenBAddr = await tokenB.getAddress();
    const quoterAddr = await dummyQuoter.getAddress();
    
    console.log("=== MINIMAL SWAP GAS COST ANALYSIS ===");
    console.log("Using: MinimalDummyQuoter (no data bridge calls)");
    console.log("Quoter address:", quoterAddr);
    console.log("PoolManager defaultData0Bridge:", await pm.defaultData0Bridge());
    
    // Use markings that won't trigger any data bridge calls
    // extraBridgeSlot = 0 (no extra bridges), data0 = false (no default bridge)
    const minimalMarkings = ethers.toBeHex(0x000000, 3); // All bits 0
    console.log("Markings:", minimalMarkings, "(no data bridges)");
    
    // Create pool and add liquidity (need more TokenB since 1:1000 ratio)
    await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, minimalMarkings);
    await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, minimalMarkings, ethers.parseEther("1"), ethers.parseEther("2000")); // 1 TokenA : 2000 TokenB
    
    console.log("\n=== TESTING MINIMAL QUOTER DIRECTLY ===");
    
    // Test the quoter directly
    const directParams = {
      asset0: tokenAAddr,
      asset1: tokenBAddr,
      quoter: quoterAddr,
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: 0n,
      zeroForOne: true,
      functionFlags: 0
    };
    
    const directQuote = await dummyQuoter.quote.staticCall(directParams, "0x");
    console.log("Direct quoter result:", ethers.formatEther(directQuote), "TokenB for 1 TokenA");
    console.log("Direct quoter result (wei):", directQuote.toString());
    
    console.log("\n=== TESTING THROUGH POOLMANAGER ===");
    
    // Test through PoolManager
    const swapParams = {
      asset0: tokenAAddr,
      asset1: tokenBAddr,
      quoter: quoterAddr,
      amount: [ethers.parseEther("1")],
      zeroForOne: true,
      marking: [minimalMarkings],
      traderProtection: "0x00000000"
    };
    
    // Measure quote gas
    const quoteGas = await pm.getQuote.estimateGas(swapParams, 0n, 0n);
    const [pmQuote] = await pm.getQuote.staticCall(swapParams, 0n, 0n);
    
    console.log("PoolManager quote gas:", quoteGas.toString());
    console.log("PoolManager quote result:", ethers.formatEther(pmQuote), "TokenB");
    console.log("PoolManager quote (wei):", pmQuote.toString());
    
    console.log("\n=== MINIMAL SWAP EXECUTION ===");
    
    // Get balances before
    const tokenABefore = await tokenA.balanceOf(await user.getAddress());
    const tokenBBefore = await tokenB.balanceOf(await user.getAddress());
    
    console.log("TokenA balance before:", ethers.formatEther(tokenABefore));
    console.log("TokenB balance before:", ethers.formatEther(tokenBBefore));
    
    // Measure swap gas and execute (use smaller amount to avoid inventory issues)
    const swapAmount = ethers.parseEther("0.001"); // Much smaller swap
    const swapGas = await pm.swap.estimateGas(tokenAAddr, tokenBAddr, quoterAddr, minimalMarkings, swapAmount, true, 0n);
    console.log("🔥 MINIMAL SWAP GAS:", swapGas.toString());
    
    const tx = await pm.swap(tokenAAddr, tokenBAddr, quoterAddr, minimalMarkings, swapAmount, true, 0n);
    const receipt = await tx.wait();
    
    // Get balances after
    const tokenAAfter = await tokenA.balanceOf(await user.getAddress());
    const tokenBAfter = await tokenB.balanceOf(await user.getAddress());
    
    console.log("TokenA balance after:", ethers.formatEther(tokenAAfter));
    console.log("TokenB balance after:", ethers.formatEther(tokenBAfter));
    
    const tokenASpent = tokenABefore - tokenAAfter;
    const tokenBReceived = tokenBAfter - tokenBBefore;
    
    console.log("\n=== SWAP RESULTS ===");
    console.log("TokenA spent:", ethers.formatEther(tokenASpent));
    console.log("TokenB received:", ethers.formatEther(tokenBReceived));
    console.log("Actual gas used:", receipt.gasUsed.toString());
    console.log("Gas estimate accuracy:", ((Number(receipt.gasUsed) / Number(swapGas)) * 100).toFixed(1) + "%");
    
    console.log("\n=== GAS BREAKDOWN ===");
    console.log("Quote overhead:", quoteGas.toString(), "gas");
    console.log("Swap overhead:", (Number(receipt.gasUsed) - Number(quoteGas)).toString(), "gas");
    console.log("Total swap cost:", receipt.gasUsed.toString(), "gas");
    
    // Verify the swap worked correctly
    expect(tokenASpent).to.equal(swapAmount);
    expect(tokenBReceived).to.equal(swapAmount * 1000n); // 1:1000 ratio from quoter
    expect(directQuote).to.equal(pmQuote); // Should be identical
    expect(pmQuote).to.equal(tokenBReceived); // Quote should match actual received
    
    // This is the absolute minimum gas cost for swap()
    console.log("\n🎯 ABSOLUTE MINIMUM SWAP GAS COST:", receipt.gasUsed.toString());
  });
  
  it("should compare minimal vs data bridge gas costs", async function () {
    const tokenAAddr = await tokenA.getAddress();
    const tokenBAddr = await tokenB.getAddress();
    const quoterAddr = await dummyQuoter.getAddress();
    
    console.log("\n=== COMPARING MINIMAL VS DATA BRIDGE COSTS ===");
    
    // Test minimal (no data bridges)
    const minimalMarkings = ethers.toBeHex(0x000000, 3);
    await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, minimalMarkings);
    await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, minimalMarkings, ethers.parseEther("100"), ethers.parseEther("100"));
    
    const minimalSwapGas = await pm.swap.estimateGas(tokenAAddr, tokenBAddr, quoterAddr, minimalMarkings, ethers.parseEther("1"), true, 0n);
    
    console.log("Minimal swap (no bridges):", minimalSwapGas.toString(), "gas");
    
    // For comparison, let's also test what happens with data0 = true but no actual bridge
    const data0Markings = ethers.toBeHex(0x000001, 3); // data0 = true
    await pm.createPool(tokenAAddr, tokenBAddr, quoterAddr, data0Markings);
    await lm.addLiquidity(tokenAAddr, tokenBAddr, quoterAddr, data0Markings, ethers.parseEther("100"), ethers.parseEther("100"));
    
    try {
      const data0SwapGas = await pm.swap.estimateGas(tokenAAddr, tokenBAddr, quoterAddr, data0Markings, ethers.parseEther("1"), true, 0n);
      console.log("With data0=true (no bridge):", data0SwapGas.toString(), "gas");
      console.log("Data bridge overhead:", (Number(data0SwapGas) - Number(minimalSwapGas)).toString(), "gas");
    } catch (error) {
      console.log("With data0=true: Failed -", error.message.split('(')[0]);
      console.log("(Expected since defaultData0Bridge is address(0))");
    }
    
    console.log("\n🏆 BASELINE SWAP COST (no data processing):", minimalSwapGas.toString(), "gas");
    
    expect(minimalSwapGas).to.be.lt(100000n); // Should be very efficient
  });
});
