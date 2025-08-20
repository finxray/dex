const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC_STR = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH_STR = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const UNI_V2_USDC_WETH_STR = "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc";
const SUSHI_V2_USDC_WETH_STR = "0x397ff1542f962076d0bfe58ea045ffa2d347aca0";
const UNI_V3_USDC_WETH_005_STR = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

describe("Single swap using Alpha aggregator (fork)", function () {
  if (!process.env.MAINNET_RPC) {
    it("skipped (MAINNET_RPC not set)", async function () { expect(true).to.equal(true); });
    return;
  }

  it("should execute a single swap that uses the on-chain Alpha aggregator and report gas", async function () {
    const [deployer, user] = await ethers.getSigners();
    const USDC = ethers.getAddress(USDC_STR);
    const WETH = ethers.getAddress(WETH_STR);
    const UNI_V2_USDC_WETH = ethers.getAddress(UNI_V2_USDC_WETH_STR);
    const SUSHI_V2_USDC_WETH = ethers.getAddress(SUSHI_V2_USDC_WETH_STR);
    const UNI_V3_USDC_WETH_005 = ethers.getAddress(UNI_V3_USDC_WETH_005_STR);

    // Deploy aggregator
    const Aggregator = await ethers.getContractFactory("AlphaDataBridgeOnchainAggregator");
    const agg = await Aggregator.deploy(
      { pool: UNI_V2_USDC_WETH, kind: 2, v3TwapWindow: 0 },
      { pool: SUSHI_V2_USDC_WETH, kind: 2, v3TwapWindow: 0 },
      { pool: UNI_V3_USDC_WETH_005, kind: 3, v3TwapWindow: 300 },
    );
    await agg.waitForDeployment();

    // Deploy SimpleQuoter that uses alpha data
    const AlphaQuoter = await ethers.getContractFactory("AlphaDataQuoter");
    const alphaQuoter = await AlphaQuoter.deploy();
    await alphaQuoter.waitForDeployment();

    // PoolManager with defaultAlpha = adapter(agg), defaultBeta = dummy
    const Adapter = await ethers.getContractFactory("AlphaDataBridgeAdapter");
    const adapter = await Adapter.deploy(await agg.getAddress(), USDC, WETH);
    await adapter.waitForDeployment();

    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(await adapter.getAddress(), await alphaQuoter.getAddress());
    await poolManager.waitForDeployment();

    // Tokens and approvals
    const TokenA = await ethers.getContractFactory("TestTokenA");
    const tokenA = await TokenA.deploy();
    await tokenA.waitForDeployment();
    const TokenB = await ethers.getContractFactory("TestTokenB");
    const tokenB = await TokenB.deploy();
    await tokenB.waitForDeployment();
    await tokenA.mint(await user.getAddress(), ethers.parseEther("10000"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("10000"));
    await tokenA.connect(user).approve(await poolManager.getAddress(), ethers.MaxUint256);
    await tokenB.connect(user).approve(await poolManager.getAddress(), ethers.MaxUint256);

    // Create pool and add liquidity (local ERC20s, not USDC/WETH)
    const ALPHA_MARK = "0x00000E"; // alpha default
    await poolManager.createPool(await tokenA.getAddress(), await tokenB.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARK);
    await poolManager.connect(user).addLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARK,
      ethers.parseEther("5000"), ethers.parseEther("6500")
    );

    // Execute single swap that triggers AlphaDataQuoter → aggregator for market data
    const tx = await poolManager.connect(user).swap(
      await tokenA.getAddress(), await tokenB.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARK,
      1n, true, 1
    );
    const rc = await tx.wait();
    console.table([
      ["Metric", "Value"],
      ["Swap Gas Used", rc.gasUsed.toString()],
    ]);
    expect(rc.status).to.equal(1);
  });
});


