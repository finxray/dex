const { expect } = require("chai");
const { ethers } = require("hardhat");

function fmtUnits18(v) {
  return Number(ethers.formatUnits(v, 18)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function fmtBoth(spot1e18, sym0, sym1) {
  const s = BigInt(spot1e18);
  if (s === 0n) return `invalid price`;
  const direct = fmtUnits18(s);
  const inv = fmtUnits18((10n ** 36n) / s);
  return `1 ${sym0} = ${direct} ${sym1} | 1 ${sym1} = ${inv} ${sym0}`;
}



function fmtUSDFrom1e18(spot1e18) {
  const s = BigInt(spot1e18);
  let val = Number(ethers.formatUnits(s, 18));
  if (Number.isFinite(val) && val > 1e6) {
    val = val / 1e8; // heuristic for RedStone feeds with extra 1e8 factor
  }
  return "$" + (Number.isFinite(val) ? val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "n/a");
}

async function estimateAndDecode(meas, bridge, p, signer) {
  const func = meas.getFunction("measure");
  const txReq = await func.populateTransaction(await bridge.getAddress(), p);
  txReq.from = signer.address;
  const gas = await ethers.provider.estimateGas(txReq);
  const ret = await func.staticCall(await bridge.getAddress(), p);
  const [spot, twap] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], ret);
  const execGas = gas > 21000n ? gas - 21000n : 0n;
  return { execGas, spot, twap };
}

describe("Real DataBridges - isolation (fork)", function () {
  if (!process.env.MAINNET_RPC) {
    it("skipped - MAINNET_RPC not set", function () { expect(true).to.equal(true); });
    return;
  }

  before(async () => {
    const bn = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(bn);
    const iso = new Date(Number(block.timestamp) * 1000).toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    console.log("Fork context:", `block ${bn} at ${iso}`);
  });

  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
  const UNI_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const SUSHI_V2_FACTORY = "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac";
  const UNI_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const UNI_V3_FEE = 3000; // 0.3%

  it("UniswapV2DataBridge spot", async function () {
    const [signer] = await ethers.getSigners();
    const Bridge = await ethers.getContractFactory("UniswapV2DataBridge");
    const bridge = await Bridge.deploy(UNI_V2_FACTORY, WBTC, USDC, WBTC, USDC);
    const Measurer = await ethers.getContractFactory("GasMeasurer");
    const meas = await Measurer.deploy();
    const p = { asset0: WBTC, asset1: USDC, quoter: ethers.ZeroAddress, amount: 0, asset0Balance: 0, asset1Balance: 0, bucketID: 0, zeroForOne: true };
    const { execGas, spot } = await estimateAndDecode(meas, bridge, p, signer);
    console.log("UniswapV2 execGas:", execGas.toString(), fmtBoth(spot, "WBTC", "USDC"));
    expect(execGas).to.be.gt(0n);
  });

  it("UniswapV3DataBridge spot", async function () {
    const [signer] = await ethers.getSigners();
    const Bridge = await ethers.getContractFactory("UniswapV3DataBridge");
    const bridge = await Bridge.deploy(UNI_V3_FACTORY, UNI_V3_FEE, 10800, WBTC, USDC, WBTC, USDC);
    const Measurer = await ethers.getContractFactory("GasMeasurer");
    const meas = await Measurer.deploy();
    const p = { asset0: WBTC, asset1: USDC, quoter: ethers.ZeroAddress, amount: 0, asset0Balance: 0, asset1Balance: 0, bucketID: 0, zeroForOne: true };
    const { execGas, spot } = await estimateAndDecode(meas, bridge, p, signer);
    console.log("UniswapV3 execGas:", execGas.toString(), fmtBoth(spot, "WBTC", "USDC"));
    expect(execGas).to.be.gt(0n);
  });

  it("SushiV2DataBridge spot", async function () {
    const [signer] = await ethers.getSigners();
    const Bridge = await ethers.getContractFactory("SushiV2DataBridge");
    const bridge = await Bridge.deploy(SUSHI_V2_FACTORY, WBTC, USDC);
    const Measurer = await ethers.getContractFactory("GasMeasurer");
    const meas = await Measurer.deploy();
    const p = { asset0: WBTC, asset1: USDC, quoter: ethers.ZeroAddress, amount: 0, asset0Balance: 0, asset1Balance: 0, bucketID: 0, zeroForOne: true };
    const { execGas, spot } = await estimateAndDecode(meas, bridge, p, signer);
    console.log("SushiV2 execGas:", execGas.toString(), fmtBoth(spot, "WBTC", "USDC"));
    expect(execGas).to.be.gt(0n);
  });

  it("UniswapV3TWAPDataBridge twap", async function () {
    const [signer] = await ethers.getSigners();
    const Bridge = await ethers.getContractFactory("UniswapV3TWAPDataBridge");
    const bridge = await Bridge.deploy(UNI_V3_FACTORY, UNI_V3_FEE, 10800, WBTC, USDC, WBTC, USDC);
    const Measurer = await ethers.getContractFactory("GasMeasurer");
    const meas = await Measurer.deploy();
    const p = { asset0: WBTC, asset1: USDC, quoter: ethers.ZeroAddress, amount: 0, asset0Balance: 0, asset1Balance: 0, bucketID: 0, zeroForOne: true };
    const { execGas, spot, twap } = await estimateAndDecode(meas, bridge, p, signer);
    console.log("UniswapV3TWAP execGas:", execGas.toString(), fmtBoth(spot, "WBTC", "USDC"), "| twap:", fmtBoth(twap, "WBTC", "USDC"));
    expect(execGas).to.be.gt(0n);
  });

  // removed temporary fixed/auto-fee v3 tests

  it("ChainlinkDataBridge spot/updatedAt (Feed Registry)", async function () {
    const registry = process.env.CHAINLINK_FEED_REGISTRY;
    if (!registry) {
      console.log("Skipping Chainlink Feed Registry test - set CHAINLINK_FEED_REGISTRY in env");
      return this.skip();
    }
    const [signer] = await ethers.getSigners();
    const Alias = await ethers.getContractFactory("TokenAliasRegistry");
    const aliasReg = await Alias.deploy();
    const Bridge = await ethers.getContractFactory("ChainlinkDataBridge");
    const bridge = await Bridge.deploy(registry, await aliasReg.getAddress());
    const Measurer = await ethers.getContractFactory("GasMeasurer");
    const meas = await Measurer.deploy();
    const p = { asset0: WBTC, asset1: USDC, quoter: ethers.ZeroAddress, amount: 0, asset0Balance: 0, asset1Balance: 0, bucketID: 0, zeroForOne: true };
    const func = meas.getFunction("measure");
    const txReq = await func.populateTransaction(await bridge.getAddress(), p);
    txReq.from = signer.address;
    const gas = await ethers.provider.estimateGas(txReq);
    const ret = await func.staticCall(await bridge.getAddress(), p);
    const [spot, updatedAt] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], ret);
    const execGas = gas > 21000n ? gas - 21000n : 0n;
    const iso = new Date(Number(updatedAt) * 1000).toISOString();
    const bn = await ethers.provider.getBlockNumber();
    const blk = await ethers.provider.getBlock(bn);
    const diffSec = Math.max(0, Number(blk.timestamp) - Number(updatedAt));
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffSec / 3600);
    console.log("Chainlink(Registry) execGas:", execGas.toString(), fmtBoth(spot, "WBTC", "USDC"), "updatedAt=", `${updatedAt} (${iso})`, "delta(s:m:h)=", `${diffSec}:${diffMin}:${diffHr}`);
    expect(execGas).to.be.gt(0n);
  });

  it.skip("RedstoneDataBridge spot/updatedAt (adapter live)", async function () {
    const adapter = process.env.REDSTONE_ADAPTER;
    const [signer] = await ethers.getSigners();
    const Alias = await ethers.getContractFactory("TokenAliasRegistry");
    const aliasReg = await Alias.deploy();
    const Bridge = await ethers.getContractFactory("RedstoneDataBridge");
    const bridge = await Bridge.deploy(adapter, await aliasReg.getAddress());
    const Measurer = await ethers.getContractFactory("GasMeasurer");
    const meas = await Measurer.deploy();
    const p = { asset0: WBTC, asset1: USDC, quoter: ethers.ZeroAddress, amount: 0, asset0Balance: 0, asset1Balance: 0, bucketID: 0, zeroForOne: true };
    const func = meas.getFunction("measure");
    const txReq = await func.populateTransaction(await bridge.getAddress(), p);
    txReq.from = signer.address;
    const gas = await ethers.provider.estimateGas(txReq);
    const ret = await func.staticCall(await bridge.getAddress(), p);
    const [spot, updatedAt] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], ret);
    const execGas = gas > 21000n ? gas - 21000n : 0n;
    console.log("Redstone(adapter) execGas:", execGas.toString(), fmtBoth(spot, "WBTC", "USDC"), "updatedAt=", updatedAt.toString());
    expect(execGas).to.be.gt(0n);
  });



  it("RedstoneOnDemandBridge live (primary-prod)", async function () {
    const { DataServiceWrapper } = require("@redstone-finance/evm-connector");

    const [signer] = await ethers.getSigners();
    const Alias = await ethers.getContractFactory("TokenAliasRegistry");
    const aliasReg = await Alias.deploy();
    const Bridge = await ethers.getContractFactory("RedstoneOnDemandBridgeImpl");
    const bridge = await Bridge.deploy(await aliasReg.getAddress());

    const dataFeeds = ["BTC", "USDC"]; // cross via USD to get WBTC/USDC
    console.log("DEBUG: Requesting RedStone feeds (prod):", dataFeeds);
    const authorised = [
      "0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774",
      "0xdEB22f54738d54976C4c0fe5ce6d408E40d88499",
      "0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202",
      "0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE",
      "0x9c5AE89C4Af6aA32cE58588DBaF90d18a855B6de",
    ];
    const dsWrapper = new DataServiceWrapper({
      dataServiceId: "redstone-primary-prod",
      dataPackagesIds: dataFeeds,
      authorizedSigners: authorised,
      uniqueSignersCount: 3,
      hideMetadata: false,
      maxTimestampDeviationMS: 60000,
      waitForAllGatewaysTimeMs: 1500,
    });
    const payload = await dsWrapper.getRedstonePayloadForManualUsage(bridge);

    const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
    const p = { asset0: WBTC, asset1: USDC, quoter: ethers.ZeroAddress, amount: 0, asset0Balance: 0, asset1Balance: 0, bucketID: 0, zeroForOne: true };

    const iface = bridge.interface;
    const data = iface.encodeFunctionData("getData", [p]) + payload.slice(2);
    const res = await ethers.provider.call({ to: await bridge.getAddress(), data });
    let [bytesResult] = iface.decodeFunctionResult("getData", res);
    // Manually decode the abi.encode(uint256, uint256) bytes
    let [spot, updatedAt] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], bytesResult);
    const ms = Number(updatedAt);
    const iso = Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : "n/a";
    console.log("Redstone(on-demand live) spot:", fmtBoth(spot, "WBTC", "USDC"), "updatedAt=", `${updatedAt} (${iso})`);
    expect(spot).to.be.gt(0n);
  });

  it("RedstoneOnDemandBridge live (primary-demo)", async function () {
    const { DataServiceWrapper } = require("@redstone-finance/evm-connector");

    const [signer] = await ethers.getSigners();
    const Alias = await ethers.getContractFactory("TokenAliasRegistry");
    const aliasReg = await Alias.deploy();
    const Bridge = await ethers.getContractFactory("RedstoneOnDemandBridgeImplDemo");
    const bridge = await Bridge.deploy(await aliasReg.getAddress());

    const dataFeeds = ["BTC", "USDC"]; // cross via USD to get WBTC/USDC
    console.log("DEBUG: Requesting RedStone feeds (demo):", dataFeeds);
    const demoSigners = [
      "0xdE13FdEE7a9B483129a81794d02FCB4021069f0C",
      "0xad05Ce43E0bCD11345f08a28995951DEc30D5226",
    ];
    const dsWrapper = new DataServiceWrapper({
      dataServiceId: "redstone-primary-demo",
      dataPackagesIds: dataFeeds,
      authorizedSigners: demoSigners,
      uniqueSignersCount: 1,
      hideMetadata: false,
      skipSignatureVerification: true,
      maxTimestampDeviationMS: 60000,
      waitForAllGatewaysTimeMs: 1500,
    });
    const payload = await dsWrapper.getRedstonePayloadForManualUsage(bridge);

    const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
    const p = { asset0: WBTC, asset1: USDC, quoter: ethers.ZeroAddress, amount: 0, asset0Balance: 0, asset1Balance: 0, bucketID: 0, zeroForOne: true };

    const iface = bridge.interface;
    const data = iface.encodeFunctionData("getData", [p]) + payload.slice(2);
    const res = await ethers.provider.call({ to: await bridge.getAddress(), data });
    let [bytesResult] = iface.decodeFunctionResult("getData", res);
    // Manually decode the abi.encode(uint256, uint256) bytes
    let [spot, updatedAt] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], bytesResult);
    const ms = Number(updatedAt);
    const iso = Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : "n/a";
    console.log("Redstone(on-demand demo) spot:", fmtBoth(spot, "WBTC", "USDC"), "updatedAt=", `${updatedAt} (${iso})`);
    expect(spot).to.be.gt(0n);
  });
});
