const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC_STR = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH_STR = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const UNI_V2_USDC_WETH_STR = "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc";
const SUSHI_V2_USDC_WETH_STR = "0x397ff1542f962076d0bfe58ea045ffa2d347aca0";
const UNI_V3_USDC_WETH_005_STR = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

describe("Aggregator gas measurement (fork)", function () {
  if (!process.env.MAINNET_RPC) {
    it("skipped (MAINNET_RPC not set)", async function () { expect(true).to.equal(true); });
    return;
  }

  it("should report gas to fetch averaged spot/twap from 3 DEXes", async function () {
    const USDC = ethers.getAddress(USDC_STR);
    const WETH = ethers.getAddress(WETH_STR);
    const UNI_V2_USDC_WETH = ethers.getAddress(UNI_V2_USDC_WETH_STR);
    const SUSHI_V2_USDC_WETH = ethers.getAddress(SUSHI_V2_USDC_WETH_STR);
    const UNI_V3_USDC_WETH_005 = ethers.getAddress(UNI_V3_USDC_WETH_005_STR);

    const Aggregator = await ethers.getContractFactory("AlphaDataBridgeOnchainAggregator");
    const configA = { pool: UNI_V2_USDC_WETH, kind: 2, v3TwapWindow: 0 };
    const configB = { pool: SUSHI_V2_USDC_WETH, kind: 2, v3TwapWindow: 0 };
    const configC = { pool: UNI_V3_USDC_WETH_005, kind: 3, v3TwapWindow: 300 };
    const agg = await Aggregator.deploy(configA, configB, configC);
    await agg.waitForDeployment();

    const Measurer = await ethers.getContractFactory("AggregatorGasMeasurer");
    const measurer = await Measurer.deploy();
    await measurer.waitForDeployment();

    const params = {
      asset0: USDC,
      asset1: WETH,
      quoter: ethers.ZeroAddress,
      amount: 0,
      asset0Balance: 0,
      asset1Balance: 0,
      bucketID: 0,
      zeroForOne: true
    };

    const tx = await measurer.measure(await agg.getAddress(), params);
    const rc = await tx.wait();
    console.table([
      ["Metric", "Value"],
      ["Gas Used", rc.gasUsed.toString()],
      ["Spot (1e18)", (await measurer.lastSpot()).toString()],
      ["TWAP (1e18)", (await measurer.lastTwap()).toString()],
    ]);
    expect(rc.status).to.equal(1);
  });
});


