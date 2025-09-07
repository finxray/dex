const { expect } = require("chai");
const { ethers } = require("hardhat");

function fmtThousands(n) {
  if (n === undefined || n === null) return 'N/A';
  const s = n.toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

describe("Dummy Data Bridge Gas Test", function () {
  it("prints swap() gas cost with dummy data bridge", async function () {
    const [deployer] = await ethers.getSigners();

    // Deploy test tokens
    const TestTokenA = await ethers.getContractFactory("TestTokenA");
    const TestTokenB = await ethers.getContractFactory("TestTokenB");
    const tokenA = await TestTokenA.deploy();
    const tokenB = await TestTokenB.deploy();
    const WETH = await tokenA.getAddress();
    const USDC = await tokenB.getAddress();

    // Mint tokens to deployer
    await tokenA.mint(deployer.address, ethers.parseEther("1000"));
    await tokenB.mint(deployer.address, ethers.parseEther("4300000")); // 4.3M tokens

    // Deploy dummy bridge that returns mock data
    const mockPrice = 4300n * 10n**18n; // 4300 USDC per WETH
    const mockTimestamp = Math.floor(Date.now() / 1000);
    const mockData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [mockPrice, mockTimestamp]);
    const DummyData0 = await ethers.getContractFactory("DummyData0");
    const dummyBridge = await DummyData0.deploy(mockData);

    // Core infra with dummy bridge at slot 0
    const PoolManager = await ethers.getContractFactory("PoolManager");
    const pm = await PoolManager.deploy(await dummyBridge.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);
    await pm.setGovernance(deployer.address, deployer.address);
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    const lm = await LiquidityManager.deploy(await pm.getAddress());
    await pm.setLiquidityManager(await lm.getAddress());

    const StoixQuoter = await ethers.getContractFactory("StoixQuoter");
    const stoix = await StoixQuoter.deploy();

    // Helper to build markings
    function mk({ d0 = 0, d1 = 0, d2 = 0, d3 = 0, dx = 0 }) {
      const flags = (d0 ? 1 : 0) | (d1 ? 2 : 0) | (d2 ? 4 : 0) | (d3 ? 8 : 0);
      const extra = dx ? (dx << 20) : 0;
      return "0x" + (extra | flags).toString(16).padStart(6, "0");
    }
    const markings = mk({ d0: 1 }); // Enable only d0 bridge

    // Approvals
    await tokenA.approve(await pm.getAddress(), ethers.MaxUint256);
    await tokenB.approve(await pm.getAddress(), ethers.MaxUint256);

    // Create pool and add liquidity
    const wethLiq = ethers.parseEther("20");
    const usdcLiq = ethers.parseEther("85000");
    await pm.createPool(WETH, USDC, await stoix.getAddress(), markings);
    await lm.addLiquidity(WETH, USDC, await stoix.getAddress(), markings, wethLiq, usdcLiq);

    // Measure swap gas (WETH->USDC)
    const amtWarm = ethers.parseEther("0.0005");  // 0.0005 WETH warmup
    const amt = ethers.parseEther("0.001");       // 0.001 WETH swap

    console.log("\n=== swap() gas with dummy data bridge ===");
    console.log(`[measure] using flashSession: false (DummyData0)`);
    
    try {
      await pm.swap(WETH, USDC, await stoix.getAddress(), markings, amtWarm, true, 0);
      const tx = await pm.swap(WETH, USDC, await stoix.getAddress(), markings, amt, true, 0);
      const rc = await tx.wait();
      
      // For dummy test, just show gas without trying to get quote (which fails with test setup)
      console.log(`DummyData0 swap gas: ${fmtThousands(rc.gasUsed)}`);
      expect(rc.gasUsed).to.be.gt(0n);
    } catch (e) {
      console.log(`DummyData0 measurement failed: ${e?.message || e}`);
      throw e;
    }
  });
});
