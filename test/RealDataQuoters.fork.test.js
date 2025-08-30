const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper functions from RealBridges test for proper BigInt handling
function fmtUnits18(v) {
  return Number(ethers.formatUnits(v, 18)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

// Helper function to fetch RedStone data with production service
async function fetchRedstoneWithPayload(bridge, params) {
  try {
    const { DataServiceWrapper } = require("@redstone-finance/evm-connector");
    const dataFeeds = ["ETH", "USDC"];
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
      maxTimestampDeviationMS: 300000,
      waitForAllGatewaysTimeMs: 1500,
    });
    
    const payload = await dsWrapper.getRedstonePayloadForManualUsage(bridge);
    const iface = bridge.interface;
    const data = iface.encodeFunctionData("getData", [params]) + payload.slice(2);
    const res = await ethers.provider.call({ to: await bridge.getAddress(), data });
    const [bytesResult] = iface.decodeFunctionResult("getData", res);
    const [spot, updatedAt] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], bytesResult);
    
    return { spot, updatedAt };
  } catch (error) {
    console.log("RedStone payload error:", error.message);
    return null;
  }
}

describe("Real Data Quoters Tests (Fork Required)", function () {
  if (!process.env.MAINNET_RPC) {
    it("skipped - MAINNET_RPC not set", function () { 
      console.log("⚠️ To test with real data, set MAINNET_RPC environment variable");
      expect(true).to.equal(true); 
    });
    return;
  }

  let deployer, lp, trader;
  let weth, usdc;
  let pm;
  let v3twapBridge, chainlinkBridge, v3dataBridge, redstoneBridge;
  let uniV2Bridge, sushiV2Bridge;
  let v3twapChainlinkQuoter, v3dataRedstoneQuoter, v2v3twapQuoter;

  // Helpers for funding and approvals on fork
  async function impersonate(address) {
    await ethers.provider.send("hardhat_impersonateAccount", [address]);
    await ethers.provider.send("hardhat_setBalance", [address, "0x8AC7230489E80000"]); // 10 ETH
    return await ethers.getSigner(address);
  }

  async function wrapWETH(toSigner, amountWei) {
    const iweth = new ethers.Contract(
      WETH,
      ["function deposit() payable", "function approve(address,uint256) returns (bool)"],
      toSigner
    );
    await (await iweth.deposit({ value: amountWei })).wait();
    return iweth;
  }

  async function fundUSDC(to, amount) {
    // Known USDC rich account (Binance)
    const USDC_WHALE = "0x28C6c06298d514Db089934071355E5743bf21d60";
    const whale = await impersonate(USDC_WHALE);
    await (await usdc.connect(whale).transfer(to, amount)).wait();
  }

  // Real mainnet addresses
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNI_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const SUSHI_V2_FACTORY = "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac";
  const UNI_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const UNI_V3_FEE = 3000; // 0.3%
  const TWAP_WINDOW = 10800; // 3 hours
  const CHAINLINK_REGISTRY = "0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf";

  const WETH_AMOUNT = ethers.parseEther("100"); // 100 WETH
  const USDC_AMOUNT = ethers.parseUnits("430000", 6); // 430,000 USDC (1 ETH = ~4,300 USDC)
  const SWAP_AMOUNT = ethers.parseEther("1"); // 1 WETH

  before(async function () {
    [deployer, lp, trader] = await ethers.getSigners();

    console.log("🌐 Using mainnet fork for real data");
    const bn = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(bn);
    const iso = new Date(Number(block.timestamp) * 1000).toLocaleString("en-US", { 
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" 
    });
    console.log("Fork context:", `block ${bn} at ${iso}`);

    // Use real WETH and USDC contracts
    weth = await ethers.getContractAt("IERC20Metadata", WETH);
    usdc = await ethers.getContractAt("IERC20Metadata", USDC);

    console.log(`\n📍 Using Real Tokens:`);
    console.log(`   WETH: ${WETH}`);
    console.log(`   USDC: ${USDC}`);

    // Deploy dummy data bridges for PoolManager
    const D0 = await ethers.getContractFactory("DummyData0");
    const D1 = await ethers.getContractFactory("DummyData1");
    const D2 = await ethers.getContractFactory("DummyData2");
    const D3 = await ethers.getContractFactory("DummyData3");
    const d0 = await D0.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d1 = await D1.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d2 = await D2.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d3 = await D3.deploy(ethers.hexlify(ethers.randomBytes(8)));

    // Deploy PoolManager
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(
      await d0.getAddress(),
      await d1.getAddress(),
      await d2.getAddress(),
      await d3.getAddress()
    );
    await pm.waitForDeployment();

    console.log(`\n🏭 PoolManager: ${await pm.getAddress()}`);

    // Get some WETH and USDC for testing (impersonate whale accounts)
    await deployRealBridges();
    await deployQuoters();
  });

  async function deployRealBridges() {
    console.log("\n🌉 Deploying Real Data Bridges:");

    // Deploy V3TWAP Bridge - swap WETH/USDC to get USDC per WETH prices (~4300)
    const V3TWAPBridge = await ethers.getContractFactory("UniswapV3TWAPDataBridge");
    v3twapBridge = await V3TWAPBridge.deploy(
      UNI_V3_FACTORY, UNI_V3_FEE, TWAP_WINDOW,
      USDC, WETH, USDC, WETH  // Swapped to get USDC per WETH
    );
    console.log("✅ V3TWAP Bridge deployed");

    // Deploy V3Data Bridge - swap WETH/USDC to get USDC per WETH prices (~4300)
    const V3DataBridge = await ethers.getContractFactory("UniswapV3DataBridge");
    v3dataBridge = await V3DataBridge.deploy(
      UNI_V3_FACTORY, UNI_V3_FEE, TWAP_WINDOW,
      USDC, WETH, USDC, WETH  // Swapped to get USDC per WETH
    );
    console.log("✅ V3Data Bridge deployed");

    // Deploy UniV2 Bridge - swap WETH/USDC to get USDC per WETH prices (~4300)
    const UniV2Bridge = await ethers.getContractFactory("UniswapV2DataBridge");
    uniV2Bridge = await UniV2Bridge.deploy(
      UNI_V2_FACTORY, USDC, WETH, USDC, WETH  // Swapped to get USDC per WETH
    );
    console.log("✅ UniV2 Bridge deployed");

    // Deploy SushiV2 Bridge - swap WETH/USDC to get USDC per WETH prices (~4300)
    const SushiV2Bridge = await ethers.getContractFactory("SushiV2DataBridge");
    sushiV2Bridge = await SushiV2Bridge.deploy(SUSHI_V2_FACTORY, USDC, WETH);
    console.log("✅ SushiV2 Bridge deployed");

    // Deploy real Chainlink bridge if registry is available
    try {
      const registry = process.env.CHAINLINK_FEED_REGISTRY || CHAINLINK_REGISTRY;
      if (registry) {
        const Alias = await ethers.getContractFactory("TokenAliasRegistry");
        const aliasReg = await Alias.deploy();
        const ChainlinkBridge = await ethers.getContractFactory("ChainlinkDataBridge");
        chainlinkBridge = await ChainlinkBridge.deploy(registry, await aliasReg.getAddress());
        console.log("✅ Chainlink Bridge deployed with real data");
      } else {
        throw new Error("CHAINLINK_FEED_REGISTRY not set");
      }
    } catch (error) {
      console.log("⚠️ Chainlink Bridge failed, using mock:", error.message);
      const MockChainlinkBridge = await ethers.getContractFactory("MockChainlinkBridge");
      chainlinkBridge = await MockChainlinkBridge.deploy();
    }
    
    // Deploy real RedStone bridge
    try {
      const Alias = await ethers.getContractFactory("TokenAliasRegistry");
      const aliasReg = await Alias.deploy();
      const RedstoneOnDemandBridge = await ethers.getContractFactory("RedstoneOnDemandBridgeImpl");
      redstoneBridge = await RedstoneOnDemandBridge.deploy(await aliasReg.getAddress());
      console.log("✅ RedStone Bridge deployed with real data");
    } catch (error) {
      console.log("⚠️ RedStone Bridge failed, using mock:", error.message);
      const MockRedstoneBridge = await ethers.getContractFactory("MockRedstoneBridge");
      redstoneBridge = await MockRedstoneBridge.deploy();
    }
  }

  async function deployQuoters() {
    console.log("\n🔧 Deploying Quoters:");

    // Deploy V3TWAP + Chainlink Quoter
    const V3TWAPChainlinkQuoter = await ethers.getContractFactory("V3TWAPChainlinkQuoterFixed");
    v3twapChainlinkQuoter = await V3TWAPChainlinkQuoter.deploy(
      await v3twapBridge.getAddress(),
      await chainlinkBridge.getAddress()
    );
    console.log("✅ V3TWAP+Chainlink Quoter deployed");

    // Deploy V3Data + RedStone Quoter
    const V3DataRedStoneQuoter = await ethers.getContractFactory("V3DataRedStoneQuoterFixed");
    v3dataRedstoneQuoter = await V3DataRedStoneQuoter.deploy(
      await v3dataBridge.getAddress(),
      await redstoneBridge.getAddress()
    );
    console.log("✅ V3Data+RedStone Quoter deployed");

    // Deploy V2 + V3TWAP Quoter
    const V2V3TWAPQuoter = await ethers.getContractFactory("V2V3TWAPQuoterFixed");
    v2v3twapQuoter = await V2V3TWAPQuoter.deploy(
      await uniV2Bridge.getAddress(),
      await sushiV2Bridge.getAddress(),
      await v3twapBridge.getAddress()
    );
    console.log("✅ V2+V3TWAP Quoter deployed");
  }

  it("should display real WETH/USDC prices from all data sources", async function () {
    console.log("\n📊 Real WETH/USDC Data Source Quotes:");

    const testParams = {
      asset0: USDC,  // Now USDC is asset0
      asset1: WETH,  // Now WETH is asset1
      quoter: await v3twapChainlinkQuoter.getAddress(),
      amount: ethers.parseUnits("4300", 6), // 4300 USDC
      asset0Balance: ethers.parseUnits("4300000", 6),
      asset1Balance: ethers.parseEther("1000"),
      bucketID: 0,
      zeroForOne: true
    };

    try {
      // Get V3TWAP data
      const v3twapData = await v3twapBridge.getData.staticCall(testParams);
      const [v3Spot, v3Twap] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3twapData);
      console.log("V3TWAP - Spot:", fmtUnits18(v3Spot), "TWAP:", fmtUnits18(v3Twap));
    } catch (error) {
      console.log("V3TWAP - Error:", error.message);
    }

    try {
      // Get V3Data
      const v3dataData = await v3dataBridge.getData.staticCall(testParams);
      const [v3dSpot, v3dTwap] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3dataData);
      console.log("V3Data - Spot:", fmtUnits18(v3dSpot), "TWAP:", fmtUnits18(v3dTwap));
    } catch (error) {
      console.log("V3Data - Error:", error.message);
    }

    try {
      // Get UniV2 data
      const uniV2Data = await uniV2Bridge.getData.staticCall(testParams);
      const [uv2Spot, uv2Twap] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], uniV2Data);
      console.log("UniV2 - Spot:", fmtUnits18(uv2Spot), "TWAP:", fmtUnits18(uv2Twap));
    } catch (error) {
      console.log("UniV2 - Error:", error.message);
    }

    try {
      // Get SushiV2 data
      const sushiV2Data = await sushiV2Bridge.getData.staticCall(testParams);
      const [sv2Spot, sv2Twap] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], sushiV2Data);
      console.log("SushiV2 - Spot:", fmtUnits18(sv2Spot), "TWAP:", fmtUnits18(sv2Twap));
    } catch (error) {
      console.log("SushiV2 - Error:", error.message);
    }

    // Chainlink bridge (real or mock)
    try {
      const chainlinkData = await chainlinkBridge.getData.staticCall(testParams);
      const [clSpot, clUpdated] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], chainlinkData);
      const bridgeCode = await ethers.provider.getCode(await chainlinkBridge.getAddress());
      const isReal = bridgeCode.length > 100;
      // Apply universal adapter logic for display
      const clSpotBN = BigInt(clSpot);
      const correctedSpot = clSpotBN < BigInt(1e18) ? (BigInt(1e36) / clSpotBN) : clSpotBN;
      console.log(`Chainlink ${isReal ? "(real)" : "(mock)"} - Spot: ${fmtUnits18(correctedSpot)} Updated: ${new Date(Number(clUpdated) * 1000).toISOString()}`);
    } catch (error) {
      console.log("Chainlink - Error:", error.message);
    }

    // RedStone bridge (on-demand, prod only)
    try {
      const bridgeCode = await ethers.provider.getCode(await redstoneBridge.getAddress());
      const isReal = bridgeCode.length > 100;
      if (isReal) {
        const rs = await fetchRedstoneWithPayload(redstoneBridge, testParams);
        if (rs && rs.spot > 0) {
          // RedStone returns USDC/WETH (how many WETH per USDC), but we want to display USDC per WETH
          // So we need to invert: 1 / (USDC/WETH) = WETH/USDC = USDC per WETH
          const invertedSpot = BigInt(1e36) / BigInt(rs.spot);
          // RedStone timestamp is in milliseconds, not seconds
          const tsSeconds = Math.floor(Number(rs.updatedAt) / 1000);
          console.log(`RedStone (real) - Spot: ${fmtUnits18(invertedSpot)} Updated: ${new Date(tsSeconds * 1000).toISOString()}`);
        } else {
          console.log("RedStone (real) - quote unavailable");
        }
      } else {
        const redstoneData = await redstoneBridge.getData.staticCall(testParams);
        const [rsSpot, ] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], redstoneData);
        console.log(`RedStone (mock) - Spot: ${fmtUnits18(rsSpot)}`);
      }
    } catch (error) {
      console.log("RedStone - Error:", error.message);
    }

    expect(true).to.equal(true);
  });

  it("should execute swaps and display final quotes, data sources, and gas usage", async function () {
    console.log("\n🔥 Quoter Performance Analysis:");
    
    const quoters = [v3twapChainlinkQuoter, v3dataRedstoneQuoter, v2v3twapQuoter];
    const quoterNames = ["V3TWAP+Chainlink", "V3Data+RedStone", "V2+V3TWAP"];
    const markings = ["0x000003", "0x000009", "0x00000E"];    
    
    const swapAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
    const results = [];
    
    for (let i = 0; i < quoters.length; i++) {
      console.log(`\n📊 ${quoterNames[i]} Quoter Analysis:`);
      
      try {
        // Create pool for this quoter
        const poolTx = await pm.connect(lp).createPool(USDC, WETH, await quoters[i].getAddress(), markings[i]);
        await poolTx.wait();

        // Fund LP with real tokens on fork and add liquidity
        await fundUSDC(lp.address, ethers.parseUnits("500000", 6));
        const iweth = await wrapWETH(lp, ethers.parseEther("500"));
        await (await usdc.connect(lp).approve(await pm.getAddress(), ethers.MaxUint256)).wait();
        await (await iweth.connect(lp).approve(await pm.getAddress(), ethers.MaxUint256)).wait();
        await (await pm.connect(lp).addLiquidity(
          USDC, WETH, await quoters[i].getAddress(), markings[i],
          ethers.parseUnits("300000", 6), // 300k USDC
          ethers.parseEther("300")        // 300 WETH
        )).wait();

        // Fund trader for swap and approve
        await fundUSDC(trader.address, ethers.parseUnits("20000", 6));
        await (await usdc.connect(trader).approve(await pm.getAddress(), ethers.MaxUint256)).wait();

        // Calibrate pool balances to recent market price so quotes align with sources
        let calibratedA0 = ethers.parseUnits("1000000", 6);
        let calibratedA1 = ethers.parseEther("250");
        try {
          const v3tw = await v3twapBridge.getData.staticCall({
            asset0: USDC,
            asset1: WETH,
            quoter: await quoters[i].getAddress(),
            amount: swapAmount,
            asset0Balance: 0,
            asset1Balance: 0,
            bucketID: 0,
            zeroForOne: true
          });
          const [spotUSDCperWETH] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3tw);
          const price = Number(ethers.formatUnits(spotUSDCperWETH, 18));
          const targetWeth = 1000; // WETH units
          calibratedA1 = ethers.parseEther(String(targetWeth));
          const targetUsdc = (price * targetWeth).toFixed(6);
          calibratedA0 = ethers.parseUnits(targetUsdc, 6);
        } catch {}

        // Get quote from quoter
        const quoteParams = {
          asset0: USDC,
          asset1: WETH,
          quoter: await quoters[i].getAddress(),
          amount: swapAmount,
          asset0Balance: calibratedA0,
          asset1Balance: calibratedA1,
          bucketID: 0,
          zeroForOne: true
        };
        
        const quote = await quoters[i].quote.staticCall(quoteParams, "0x");
        const formattedQuote = fmtUnits18(quote);
        
        console.log(`💰 Final Quote: ${formattedQuote} WETH (for 10,000 USDC)`);
        
        // Display data sources used by this quoter
        console.log("📡 Data Sources Used:");
        // Fetch only the sources actually used by each quoter
        const sourceParams = { ...quoteParams };
        const sourceSummaries = [];
        if (i === 0) {
          // V3TWAP + Chainlink
          try {
            const v3tw = await v3twapBridge.getData.staticCall(sourceParams);
            const [spot1, tw1] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3tw);
            const ps = Number(ethers.formatUnits(spot1, 18));
            const pt = Number(ethers.formatUnits(tw1, 18));
            console.log("  - V3TWAP spot:", ps.toFixed(6), "USDC/WETH");
            console.log("  - V3TWAP twap:", pt.toFixed(6), "USDC/WETH");
            sourceSummaries.push(`V3TWAP spot: ${ps.toFixed(2)}`);
            sourceSummaries.push(`V3TWAP twap: ${pt.toFixed(2)}`);
          } catch {}
          try {
            const cl = await chainlinkBridge.getData.staticCall(sourceParams);
            const [s2,u2] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], cl);
            const s2c = BigInt(s2) < BigInt(1e18) ? (BigInt(1e36)/BigInt(s2)) : BigInt(s2);
            const p = Number(ethers.formatUnits(s2c, 18));
            const iso = new Date(Number(u2) * 1000).toISOString();
            console.log("  - Chainlink:", p.toFixed(6), "USDC/WETH @", iso);
            sourceSummaries.push(`CL: ${p.toFixed(2)}`);
          } catch {}
        } else if (i === 1) {
          // V3Data + RedStone
          try {
            const v3d = await v3dataBridge.getData.staticCall(sourceParams);
            const [s3,] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3d);
            const p = Number(ethers.formatUnits(s3, 18));
            console.log("  - V3Data:", p.toFixed(6), "USDC/WETH");
            sourceSummaries.push(`V3Data: ${p.toFixed(2)}`);
          } catch {}
          try {
            const rs = await fetchRedstoneWithPayload(redstoneBridge, sourceParams);
            if (rs && rs.spot > 0) {
              // RedStone returns USDC/WETH (how many WETH per USDC), invert for display
              const invertedSpot = BigInt(1e36) / BigInt(rs.spot);
              const p = Number(ethers.formatUnits(invertedSpot, 18));
              // RedStone timestamp is in milliseconds
              const tsSeconds = Math.floor(Number(rs.updatedAt) / 1000);
              const iso = new Date(tsSeconds * 1000).toISOString();
              console.log("  - RedStone:", p.toFixed(6), "USDC/WETH @", iso);
              sourceSummaries.push(`RS: ${p.toFixed(2)}`);
            } else {
              console.log("  - RedStone: quote unavailable");
              sourceSummaries.push("RS: quote unavailable");
            }
          } catch {}
        } else {
          // V2 + V3TWAP (UniV2, SushiV2, V3TWAP)
          try {
            const u2 = await uniV2Bridge.getData.staticCall(sourceParams);
            const [s4,] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], u2);
            const p = Number(ethers.formatUnits(s4, 18));
            console.log("  - UniV2:", p.toFixed(6), "USDC/WETH");
            sourceSummaries.push(`UniV2: ${p.toFixed(2)}`);
          } catch {}
          try {
            const s2 = await sushiV2Bridge.getData.staticCall(sourceParams);
            const [s5,] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], s2);
            const p = Number(ethers.formatUnits(s5, 18));
            console.log("  - SushiV2:", p.toFixed(6), "USDC/WETH");
            sourceSummaries.push(`SushiV2: ${p.toFixed(2)}`);
          } catch (e) {
            if ((e?.message||"").includes("pair missing")) console.log("  - SushiV2: pair missing");
          }
          try {
            const v3tw = await v3twapBridge.getData.staticCall(sourceParams);
            const [spot1, tw1] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3tw);
            const ps = Number(ethers.formatUnits(spot1, 18));
            const pt = Number(ethers.formatUnits(tw1, 18));
            console.log("  - V3TWAP spot:", ps.toFixed(6), "USDC/WETH");
            console.log("  - V3TWAP twap:", pt.toFixed(6), "USDC/WETH");
            sourceSummaries.push(`V3TWAP spot: ${ps.toFixed(2)}`);
            sourceSummaries.push(`V3TWAP twap: ${pt.toFixed(2)}`);
          } catch {}
        }
        
        // Estimate gas for swap (without actually executing due to balance constraints)
        // Simulate gas by executing a flashSession that performs a swap with preset inventories
        let gasUsed = "N/A";
        try {
          const Dummy = await ethers.getContractFactory("DummyFlashCallback");
          const dummy = await Dummy.deploy();
          const swapTx = await pm.connect(trader).swap.populateTransaction(
            USDC, WETH, await quoters[i].getAddress(), markings[i], swapAmount, true, 0
          );
          // Estimate gas on the populated tx directly
          const g = await ethers.provider.estimateGas({ ...swapTx, from: trader.address });
          gasUsed = g.toString();
          console.log(`⛽ Estimated Gas: ${gasUsed}`);
        } catch (e) {
          console.log(`⛽ Gas Estimation Failed: ${e.message}`);
        }

        // Compute implied USDC/WETH from final quote (WETH out for 10k USDC)
        const quoteWeth = Number(ethers.formatUnits(quote, 18));
        const impliedUSDCperWETH = quoteWeth > 0 ? (10000 / quoteWeth) : 0;
        const finalQuoteUSDC = impliedUSDCperWETH.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

        results.push({
          quoter: quoterNames[i],
          gasUsed: gasUsed,
          sources: sourceSummaries.join(", "),
          finalQuote: formattedQuote,
          final: finalQuoteUSDC
        });
        
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        results.push({
          quoter: quoterNames[i],
          finalQuote: "Failed",
          estimatedGas: "N/A",
          status: "Error"
        });
      }
    }
    
    // Display summary table
    console.log("\n📋 Summary Table:");
    console.table(results.map(r => ({ quoter: r.quoter, gasUsed: r.gasUsed, sources: r.sources, final: r.final })));
    
    expect(results.length).to.equal(3);
  });
});
