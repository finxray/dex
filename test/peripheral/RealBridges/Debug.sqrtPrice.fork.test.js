const { ethers, network } = require("hardhat");

describe("Debug sqrtPriceX96 conversion", function () {
  const USDC_WETH_V3_3000_POOL = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";
  
  it("reads actual sqrtPriceX96 and converts manually", async function () {
    const pool = await ethers.getContractAt(
      ["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)", "function token0() view returns (address)", "function token1() view returns (address)"],
      USDC_WETH_V3_3000_POOL
    );
    
    const [sqrtPriceX96, tick] = await pool.slot0();
    const token0 = await pool.token0();
    const token1 = await pool.token1();
    
    console.log("\n=== UNISWAP V3 POOL (USDC/WETH 0.3%) ===");
    console.log("Pool:                  " + USDC_WETH_V3_3000_POOL);
    console.log("Token0:                " + token0 + " (USDC)");
    console.log("Token1:                " + token1 + " (WETH)");
    console.log("sqrtPriceX96:          " + sqrtPriceX96.toString());
    console.log("Current tick:          " + tick.toString());
    
    // Manual conversion: price = (sqrtPriceX96 / 2^96)^2
    // This gives token1/token0 = WETH/USDC
    const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96);
    const priceToken1PerToken0 = sqrtPrice * sqrtPrice;
    
    console.log("\n=== MANUAL CONVERSION ===");
    console.log("sqrtPrice (decimal):   " + sqrtPrice.toExponential(6));
    console.log("Price (token1/token0): " + priceToken1PerToken0.toExponential(6) + " (WETH per USDC)");
    console.log("Inverted (token0/token1): " + (1/priceToken1PerToken0).toFixed(2) + " (USDC per WETH)");
    
    // Using BigInt for precision
    const numerator = BigInt(sqrtPriceX96.toString()) * BigInt(sqrtPriceX96.toString());
    const denominator = 2n ** 192n;
    
    console.log("\n=== BIGINT PRECISION ===");
    console.log("numerator (sqrtP^2):   " + numerator.toString().substring(0, 50) + "...");
    console.log("denominator (2^192):   " + denominator.toString().substring(0, 50) + "...");
    
    // To get 1e18 format: (numerator * 1e18) / denominator
    // But this overflows, so break it down
    const priceX64 = numerator / (2n ** 128n); // Price * 2^64
    const price1e18 = (priceX64 * BigInt(1e18)) / (2n ** 64n);
    
    console.log("Price (1e18):          " + price1e18.toString());
    console.log("Price (decimal):       " + Number(price1e18) / 1e18);
    console.log("Inverted:              " + (1e18 * 1e18 / Number(price1e18)).toFixed(2));
    
    console.log("\n🎯 EXPECTED:");
    console.log("WETH per USDC: ~0.0004 (since ETH is ~$2500)");
    console.log("USDC per WETH: ~2500");
  });
});

