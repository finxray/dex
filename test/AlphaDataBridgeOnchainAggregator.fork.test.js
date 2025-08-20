const { expect } = require("chai");
const { ethers } = require("hardhat");

// Mainnet addresses (USDC/WETH) - will normalize to EIP-55 checksum at runtime
const USDC_STR = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH_STR = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const UNI_V2_USDC_WETH_STR = "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc";
const SUSHI_V2_USDC_WETH_STR = "0x397ff1542f962076d0bfe58ea045ffa2d347aca0";
const UNI_V3_USDC_WETH_005_STR = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"; // 0.05%

describe("AlphaDataBridgeOnchainAggregator (fork)", function () {
  if (!process.env.MAINNET_RPC) {
    it("skipped (MAINNET_RPC not set)", async function () {
      expect(true).to.equal(true);
    });
    return;
  }

  it("should fetch spot and twap from 3 DEX pools and average them", async function () {
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

    // Build QuoteParams: we only need asset addresses and zeroForOne direction
    // Pass struct fields as an object; ABI encodes it as a tuple
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

    // Call getData (returns (uint256[] spots, uint256[] twaps))
    const data = await agg.getData(params);
    const [spots, twaps] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256[]","uint256[]"], data);
    const spot = (spots[0] + spots[1] + spots[2]) / 3n;
    const twap = (twaps[0] + twaps[1] + twaps[2]) / 3n;

    expect(spot).to.be.gt(0n);
    expect(twap).to.be.gt(0n);

    // Spot and TWAP should be within a reasonable multiple (to guard against mis-wiring)
    const ratio = spot > twap ? spot * 1000n / twap : twap * 1000n / spot;
    expect(ratio).to.be.lt(2000n); // within 2x
  });
});


