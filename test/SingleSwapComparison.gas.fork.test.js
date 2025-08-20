const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC_STR = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH_STR = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const UNI_V2_USDC_WETH_STR = "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc";
const SUSHI_V2_USDC_WETH_STR = "0x397ff1542f962076d0bfe58ea045ffa2d347aca0";
const UNI_V3_USDC_WETH_005_STR = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

describe("Single swap gas comparison (fork)", function () {
  if (!process.env.MAINNET_RPC) {
    it("skipped (MAINNET_RPC not set)", async function () { expect(true).to.equal(true); });
    return;
  }

  it("baseline vs aggregator variants", async function () {
    const [deployer, user] = await ethers.getSigners();
    const USDC = ethers.getAddress(USDC_STR);
    const WETH = ethers.getAddress(WETH_STR);
    const UNI_V2_USDC_WETH = ethers.getAddress(UNI_V2_USDC_WETH_STR);
    const SUSHI_V2_USDC_WETH = ethers.getAddress(SUSHI_V2_USDC_WETH_STR);
    const UNI_V3_USDC_WETH_005 = ethers.getAddress(UNI_V3_USDC_WETH_005_STR);

    // Common deploys: tokens, quoter, pool manager
    const AlphaQuoter = await ethers.getContractFactory("AlphaDataQuoter");
    const alphaQuoter = await AlphaQuoter.deploy();
    await alphaQuoter.waitForDeployment();

    const TokenA = await ethers.getContractFactory("TestTokenA");
    const TokenB = await ethers.getContractFactory("TestTokenB");
    const tokenA = await TokenA.deploy();
    await tokenA.waitForDeployment();
    const tokenB = await TokenB.deploy();
    await tokenB.waitForDeployment();
    await tokenA.mint(await user.getAddress(), ethers.parseEther("10000"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("10000"));

    const ALPHA_MARK = "0x00000E"; // alpha default

    async function setupPoolManager(defaultAlphaAddr) {
      const PoolManager = await ethers.getContractFactory("PoolManager");
      const pm = await PoolManager.deploy(defaultAlphaAddr, await alphaQuoter.getAddress());
      await pm.waitForDeployment();
      await tokenA.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
      await tokenB.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
      await pm.createPool(await tokenA.getAddress(), await tokenB.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARK);
      await pm.connect(user).addLiquidity(
        await tokenA.getAddress(), await tokenB.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARK,
        ethers.parseEther("1000"), ethers.parseEther("1300")
      );
      return pm;
    }

    // 1) Baseline: MockAlphaDataBridge
    const MockBridge = await ethers.getContractFactory("MockAlphaDataBridge");
    const mock = await MockBridge.deploy(ethers.parseEther("1.3"), ethers.parseEther("1.28"));
    await mock.waitForDeployment();
    const pmMock = await setupPoolManager(await mock.getAddress());
    const SWAP = 1000000000n; // bump to avoid zero-quote after slippage rounding
    const txMock = await pmMock.connect(user).swap(
      await tokenA.getAddress(), await tokenB.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARK, SWAP, true, 1
    );
    const rcMock = await txMock.wait();

    // 2) Aggregator: V2 + V3
    const Aggregator = await ethers.getContractFactory("AlphaDataBridgeOnchainAggregator");
    const aggCombined = await Aggregator.deploy(
      { pool: UNI_V2_USDC_WETH, kind: 2, v3TwapWindow: 0 },
      { pool: SUSHI_V2_USDC_WETH, kind: 2, v3TwapWindow: 0 },
      { pool: UNI_V3_USDC_WETH_005, kind: 3, v3TwapWindow: 300 },
    );
    await aggCombined.waitForDeployment();
    const Adapter = await ethers.getContractFactory("AlphaDataBridgeAdapter");
    const adapterCombined = await Adapter.deploy(await aggCombined.getAddress(), USDC, WETH);
    await adapterCombined.waitForDeployment();
    const pmAggCombined = await setupPoolManager(await adapterCombined.getAddress());
    const txAggCombined = await pmAggCombined.connect(user).swap(
      await tokenA.getAddress(), await tokenB.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARK, SWAP, true, 1
    );
    const rcAggCombined = await txAggCombined.wait();

    // 3) Aggregator: V2-only (duplicate one V2 for third slot)
    const aggV2 = await Aggregator.deploy(
      { pool: UNI_V2_USDC_WETH, kind: 2, v3TwapWindow: 0 },
      { pool: SUSHI_V2_USDC_WETH, kind: 2, v3TwapWindow: 0 },
      { pool: UNI_V2_USDC_WETH, kind: 2, v3TwapWindow: 0 },
    );
    await aggV2.waitForDeployment();
    const adapterV2 = await Adapter.deploy(await aggV2.getAddress(), USDC, WETH);
    await adapterV2.waitForDeployment();
    const pmAggV2 = await setupPoolManager(await adapterV2.getAddress());
    const txAggV2 = await pmAggV2.connect(user).swap(
      await tokenA.getAddress(), await tokenB.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARK, SWAP, true, 1
    );
    const rcAggV2 = await txAggV2.wait();

    // 4) Aggregator: V3-only (repeat same V3 pool thrice)
    const aggV3 = await Aggregator.deploy(
      { pool: UNI_V3_USDC_WETH_005, kind: 3, v3TwapWindow: 300 },
      { pool: UNI_V3_USDC_WETH_005, kind: 3, v3TwapWindow: 300 },
      { pool: UNI_V3_USDC_WETH_005, kind: 3, v3TwapWindow: 300 },
    );
    await aggV3.waitForDeployment();
    const adapterV3 = await Adapter.deploy(await aggV3.getAddress(), USDC, WETH);
    await adapterV3.waitForDeployment();
    const pmAggV3 = await setupPoolManager(await adapterV3.getAddress());
    const txAggV3 = await pmAggV3.connect(user).swap(
      await tokenA.getAddress(), await tokenB.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARK, SWAP, true, 1
    );
    const rcAggV3 = await txAggV3.wait();

    console.table([
      ["Scenario", "Gas Used"],
      ["MockAlphaDataBridge", rcMock.gasUsed.toString()],
      ["Aggregator (V2+V3)", rcAggCombined.gasUsed.toString()],
      ["Aggregator (V2-only)", rcAggV2.gasUsed.toString()],
      ["Aggregator (V3-only)", rcAggV3.gasUsed.toString()],
    ]);

    expect(rcMock.status).to.equal(1);
    expect(rcAggCombined.status).to.equal(1);
    expect(rcAggV2.status).to.equal(1);
    expect(rcAggV3.status).to.equal(1);
  });
});


