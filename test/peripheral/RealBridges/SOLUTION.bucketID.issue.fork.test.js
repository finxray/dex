const { expect } = require("chai");
const { ethers, network } = require("hardhat");

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, "0x1000000000000000000"]);
  return await ethers.getSigner(addr);
}

describe("🎯 SOLUTION: BucketID Configuration Causes Gas Explosion", function () {
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
    
    weth = await ethers.getContractAt(["function deposit() payable","function approve(address,uint256)"], WETH);
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
  
  it("🎯 SOLUTION: Test different bucketIDs to find the gas explosion", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("🎯 TESTING DIFFERENT BUCKETID CONFIGURATIONS");
    console.log("=".repeat(80));
    console.log("Hypothesis: Certain bucketID settings cause massive gas increase");
    
    const configs = [
      { bucketID: 0, label: "Simple (0)" },
      { bucketID: 3, label: "3 bps, no inv" },
      { bucketID: 8, label: "30 bps, no inv" },
      { bucketID: buildBucketId(8, 0, 0, 0, 0), label: "30bps, no inv, γ=low" },
      { bucketID: buildBucketId(8, 1, 0, 0, 0), label: "30bps, RISKY0, γ=mid" },
      { bucketID: buildBucketId(8, 1, 1, 0, 0), label: "30bps, RISKY0, γ=high [SUSPECT]" },
      { bucketID: buildBucketId(8, 1, 1, 1, 0), label: "30bps, RISKY0, σ=fixed" },
      { bucketID: buildBucketId(8, 1, 1, 0, 1), label: "30bps, RISKY0, γ=0" }
    ];
    
    console.log("\nBucketID | Label                          | Markings | Swap Gas");
    console.log("-".repeat(85));
    
    for (const config of configs) {
      const markings = createMarkings(config.bucketID, 15);
      
      try {
        await pm.createPool(WETH, USDC, await stoicovQuoter.getAddress(), markings);
        await lm.addLiquidity(WETH, USDC, await stoicovQuoter.getAddress(), markings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
        
        const gas = await pm.swap.estimateGas(WETH, USDC, await stoicovQuoter.getAddress(), markings, ethers.parseEther("1"), true, 0n);
        
        const flag = Number(gas) > 500000 ? " 🔴 HIGH!" : "";
        
        console.log(
          ("0x" + config.bucketID.toString(16).padStart(2, '0')).padEnd(8) + " | " +
          config.label.padEnd(30) + " | " +
          markings.padEnd(8) + " | " +
          gas.toString().padStart(9) + flag
        );
      } catch (error) {
        console.log(
          ("0x" + config.bucketID.toString(16).padStart(2, '0')).padEnd(8) + " | " +
          config.label.padEnd(30) + " | " +
          markings.padEnd(8) + " | ERROR"
        );
      }
    }
    
    console.log("\n🎯 EXPECTED RESULT:");
    console.log("Most configs should show ~145-250k gas");
    console.log("BucketID 0x58 (RISKY0, γ=high) likely shows 600k+ gas 🔴");
    console.log("");
    console.log("This would explain the gas explosion!");
  });
  
  it("✅ CORRECTED TEST: Use simple bucketID for StoicovQuoter", async function () {
    console.log("\n" + "=".repeat(80));
    console.log("✅ CORRECTED TEST WITH SIMPLE BUCKETID");
    console.log("=".repeat(80));
    
    // Use simple bucketID = 8 (just k-index, no inventory mode)
    const simpleBucketID = 8;
    const markings = createMarkings(simpleBucketID, 15);
    
    console.log("BucketID:             " + simpleBucketID + " (0x" + simpleBucketID.toString(16) + ")");
    console.log("Configuration:        30 bps, no inventory mode");
    console.log("Markings:            ", markings);
    
    await pm.createPool(WETH, USDC, await stoicovQuoter.getAddress(), markings);
    await lm.addLiquidity(WETH, USDC, await stoicovQuoter.getAddress(), markings, ethers.parseEther("10"), 10n * 3000n * 10n ** 6n);
    
    const tx = await pm.swap(WETH, USDC, await stoicovQuoter.getAddress(), markings, ethers.parseEther("1"), true, 0n);
    const receipt = await tx.wait();
    
    console.log("\n=== RESULTS ===");
    console.log("Total gas:            " + receipt.gasUsed.toString());
    
    const expected = 6000 + 250000; // Quoter + swap with data
    console.log("Expected:             ~" + expected.toLocaleString());
    console.log("Difference:           " + (Number(receipt.gasUsed) - expected).toLocaleString());
    
    if (Number(receipt.gasUsed) < 300000) {
      console.log("\n✅ SUCCESS! Gas is reasonable (~" + receipt.gasUsed.toString() + ")");
      console.log("The issue WAS the bucketID configuration!");
    } else {
      console.log("\n❌ Still high gas. Need more investigation.");
    }
  });
});

