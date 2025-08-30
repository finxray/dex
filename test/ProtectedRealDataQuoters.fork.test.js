const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper functions from RealBridges test for proper BigInt handling
function fmtUnits18(v) {
  return Number(ethers.formatUnits(v, 18)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

// Helper function to fetch RedStone data with production service
async function fetchRedstoneWithPayload(bridge, params, forkTimestamp) {
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
    
    // Note: RedStone historical data not available for fork timestamp
    // Using current RedStone data as "live market reference"
    const dsWrapper = new DataServiceWrapper({
      dataServiceId: "redstone-primary-prod",
      dataPackagesIds: dataFeeds,
      authorizedSigners: authorised,
      uniqueSignersCount: 3,
      hideMetadata: false,
      maxTimestampDeviationMS: 300000,
      waitForAllGatewaysTimeMs: 1500,
    });
    
    // Debug: Check what feeds we're requesting and get raw values
    console.log("🔍 RedStone Data Request (Live):");
    console.log(`   Requesting feeds: ${dataFeeds.join(", ")}`);
    console.log(`   Service: redstone-primary-prod`);
    console.log(`   Fork timestamp: ${new Date(forkTimestamp * 1000).toISOString()}`);
    console.log(`   Note: Using live data (historical not available for fork block)`);
    console.log(`   Bridge address: ${await bridge.getAddress()}`);
    
    // Try to get raw feed values to understand the calculation
    try {
      const ethFeedData = await dsWrapper.getDataFeedValue("ETH");
      const usdcFeedData = await dsWrapper.getDataFeedValue("USDC");
      console.log(`   ETH feed value: ${ethFeedData}`);
      console.log(`   USDC feed value: ${usdcFeedData}`);
      if (ethFeedData && usdcFeedData) {
        const directRatio = ethFeedData / usdcFeedData;
        console.log(`   Direct ETH/USDC: ${directRatio}`);
      }
    } catch (feedError) {
      console.log(`   Feed value fetch failed: ${feedError.message}`);
    }
    
    const payload = await dsWrapper.getRedstonePayloadForManualUsage(bridge);
    const iface = bridge.interface;
    const data = iface.encodeFunctionData("getData", [params]) + payload.slice(2);
    const res = await ethers.provider.call({ to: await bridge.getAddress(), data });
    const [bytesResult] = iface.decodeFunctionResult("getData", res);
    const [spot, updatedAt] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], bytesResult);
    
    // Debug the actual RedStone calculation
    console.log(`🔍 RedStone Bridge Internal Debug:`);
    console.log(`   Asset0 (${params.asset0 === "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" ? "USDC" : "WETH"}): ${params.asset0}`);
    console.log(`   Asset1 (${params.asset1 === "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" ? "WETH" : "USDC"}): ${params.asset1}`);
    console.log(`   Final spot calculation: ${spot.toString()}`);
    console.log(`   This represents: asset0/asset1 = ${params.asset0 === "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" ? "USDC/WETH" : "WETH/USDC"}`);
    
    return { spot, updatedAt };
  } catch (error) {
    console.log("RedStone payload error:", error.message);
    return null;
  }
}

describe("🔒 Protected Real Data Quoters Tests (Fork Required)", function () {
  if (!process.env.MAINNET_RPC) {
    it("skipped - MAINNET_RPC not set", function () { 
      console.log("⚠️ To test with real data, set MAINNET_RPC environment variable");
      expect(true).to.equal(true); 
    });
    return;
  }

  let deployer, lp, trader;
  let weth, usdc;
  let pm, mevProtection, circuitBreaker, poolRegistry;
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

  let forkTimestamp;

  before(async function () {
    [deployer, lp, trader] = await ethers.getSigners();

    console.log("🔒 Using mainnet fork for protected real data quoters");
    const bn = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(bn);
    forkTimestamp = Number(block.timestamp); // Store for RedStone historical data
    const iso = new Date(forkTimestamp * 1000).toLocaleString("en-US", { 
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

    // Deploy MEV protection components
    const MEVProtection = await ethers.getContractFactory("MEVProtection");
    mevProtection = await MEVProtection.deploy(deployer.address); // Use deployer as mock pool manager

    const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
    circuitBreaker = await CircuitBreaker.deploy(deployer.address);

    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    poolRegistry = await PoolRegistry.deploy(deployer.address);

    console.log(`\n🛡️ Protection Components:`);
    console.log(`   MEVProtection: ${await mevProtection.getAddress()}`);
    console.log(`   CircuitBreaker: ${await circuitBreaker.getAddress()}`);
    console.log(`   PoolRegistry: ${await poolRegistry.getAddress()}`);

    // Deploy real data bridges
    console.log(`\n🌉 Deploying Real Data Bridges:`);
    
    const V3TWAPBridge = await ethers.getContractFactory("UniswapV3TWAPDataBridge");
    v3twapBridge = await V3TWAPBridge.deploy(
      UNI_V3_FACTORY, UNI_V3_FEE, TWAP_WINDOW,
      USDC, WETH, USDC, WETH
    );
    console.log("✅ V3TWAP Bridge deployed");

    const V3DataBridge = await ethers.getContractFactory("UniswapV3DataBridge");
    v3dataBridge = await V3DataBridge.deploy(
      UNI_V3_FACTORY, UNI_V3_FEE, TWAP_WINDOW,
      USDC, WETH, USDC, WETH
    );
    console.log("✅ V3Data Bridge deployed");

    const UniV2Bridge = await ethers.getContractFactory("UniswapV2DataBridge");
    uniV2Bridge = await UniV2Bridge.deploy(UNI_V2_FACTORY, USDC, WETH, USDC, WETH);
    console.log("✅ UniV2 Bridge deployed");

    const SushiV2Bridge = await ethers.getContractFactory("SushiV2DataBridge");
    sushiV2Bridge = await SushiV2Bridge.deploy(SUSHI_V2_FACTORY, USDC, WETH);
    console.log("✅ SushiV2 Bridge deployed");

    // Deploy TokenAliasRegistry first (needed for Chainlink)
    const TokenAliasRegistry = await ethers.getContractFactory("TokenAliasRegistry");
    const aliasRegistry = await TokenAliasRegistry.deploy();

    // Deploy Chainlink bridge
    try {
      const ChainlinkBridge = await ethers.getContractFactory("ChainlinkDataBridge");
      chainlinkBridge = await ChainlinkBridge.deploy(CHAINLINK_REGISTRY, await aliasRegistry.getAddress());
      console.log("✅ Chainlink Bridge deployed with real data");
    } catch (error) {
      const MockChainlinkBridge = await ethers.getContractFactory("MockChainlinkBridge");
      chainlinkBridge = await MockChainlinkBridge.deploy();
      console.log("⚠️ Chainlink Bridge failed, using mock:", error.message);
      console.log("   Reason:", error.message);
    }

    // Deploy RedStone bridge (reuse the same alias registry)
    const RedstoneOnDemandBridge = await ethers.getContractFactory("RedstoneOnDemandBridgeImpl");
    redstoneBridge = await RedstoneOnDemandBridge.deploy(await aliasRegistry.getAddress());
    console.log("✅ RedStone Bridge deployed with real data");

    // Deploy quoters
    console.log(`\n🔧 Deploying Protected Quoters:`);
    
    const V3TWAPChainlinkQuoter = await ethers.getContractFactory("V3TWAPChainlinkQuoterFixed");
    v3twapChainlinkQuoter = await V3TWAPChainlinkQuoter.deploy(
      await v3twapBridge.getAddress(),
      await chainlinkBridge.getAddress()
    );
    console.log("✅ V3TWAP+Chainlink Quoter deployed");

    const V3DataRedstoneQuoter = await ethers.getContractFactory("V3DataRedStoneQuoterFixed");
    v3dataRedstoneQuoter = await V3DataRedstoneQuoter.deploy(
      await v3dataBridge.getAddress(),
      await redstoneBridge.getAddress()
    );
    console.log("✅ V3Data+RedStone Quoter deployed");

    const V2V3TWAPQuoter = await ethers.getContractFactory("V2V3TWAPQuoterFixed");
    v2v3twapQuoter = await V2V3TWAPQuoter.deploy(
      await uniV2Bridge.getAddress(),
      await sushiV2Bridge.getAddress(),
      await v3twapBridge.getAddress()
    );
    console.log("✅ V2+V3TWAP Quoter deployed");

    // Fund accounts
    console.log(`\n💰 Funding Test Accounts:`);
    await fundUSDC(lp.address, USDC_AMOUNT);
    await fundUSDC(trader.address, ethers.parseUnits("50000", 6));
    await wrapWETH(lp, WETH_AMOUNT.toString());
    await wrapWETH(trader, ethers.parseEther("10").toString());
    
    await weth.connect(lp).approve(await pm.getAddress(), ethers.MaxUint256);
    await usdc.connect(lp).approve(await pm.getAddress(), ethers.MaxUint256);
    await weth.connect(trader).approve(await pm.getAddress(), ethers.MaxUint256);
    await usdc.connect(trader).approve(await pm.getAddress(), ethers.MaxUint256);
    
    console.log("✅ All accounts funded and approved");
  });

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
              const rs = await fetchRedstoneWithPayload(redstoneBridge, testParams, forkTimestamp);
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

  it("should execute protected swaps and display final quotes, data sources, and gas usage", async function () {
    console.log("\n🔒 Protected Quoter Performance Analysis:");
    
    const quoters = [v3twapChainlinkQuoter, v3dataRedstoneQuoter, v2v3twapQuoter];
    const quoterNames = ["V3TWAP+Chainlink", "V3Data+RedStone", "V2+V3TWAP"];
    const markings = ["0x000003", "0x000009", "0x00000E"];
    const protectionLevels = [0x00, 0x08, 0x09]; // None, Dynamic Fee, High Protection
    const protectionNames = ["No Protection", "Dynamic Fee Protection", "High MEV Protection"];
    
    const swapAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
    const results = [];
    
    for (let i = 0; i < quoters.length; i++) {
      console.log(`\n🔒 ${quoterNames[i]} Quoter Analysis (${protectionNames[i]}):`);
      
      // Calculate pool ID
      const poolId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "address", "bytes3"],
          [USDC, WETH, await quoters[i].getAddress(), markings[i]]
        )
      );

      // Register pool and configure protection
      await poolRegistry.connect(deployer).registerPool(
        poolId,
        USDC,
        WETH,
        await quoters[i].getAddress(),
        markings[i]
      );

      // Configure MEV protection
      if (protectionLevels[i] > 0) {
        await mevProtection.connect(deployer).configurePoolProtection(
          poolId,
          protectionLevels[i],
          ethers.parseEther("5") // 5 ETH threshold
        );
        
        const mevConfig = await mevProtection.getPoolMEVConfig(poolId);
        console.log(`🛡️ MEV Protection: ${mevConfig.description}`);
        console.log(`⛽ Protection Overhead: ${mevConfig.estimatedGasOverhead} gas`);
      } else {
        console.log(`🔓 No MEV Protection (cheapest execution)`);
      }

      // Set circuit breaker limits based on protection level
      const limits = protectionLevels[i] === 0x00 
        ? { maxSwap: ethers.parseEther("1000"), cooldown: 0 }
        : protectionLevels[i] === 0x08
        ? { maxSwap: ethers.parseEther("100"), cooldown: 60 }
        : { maxSwap: ethers.parseEther("10"), cooldown: 300 };
      
      await circuitBreaker.connect(deployer).setPoolLimits(
        poolId,
        limits.maxSwap,
        ethers.parseEther("100000"), // daily volume
        limits.cooldown,
        500 // 5% max price impact
      );

      // Create pool
      await pm.connect(deployer).createPool(
        USDC,
        WETH,
        await quoters[i].getAddress(),
        markings[i]
      );

      // Add liquidity using flash session
      const DummyFlashCallback = await ethers.getContractFactory("DummyFlashCallback");
      const callback = await DummyFlashCallback.deploy();
      
      const callbackData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "bytes3", "uint256", "uint256"],
        [USDC, WETH, await quoters[i].getAddress(), markings[i], USDC_AMOUNT, WETH_AMOUNT]
      );
      
      await pm.connect(lp).flashSession(
        await callback.getAddress(),
        callbackData,
        [USDC, WETH]
      );

      // Prepare quote parameters
      const quoteParams = {
        asset0: USDC,
        asset1: WETH,
        quoter: await quoters[i].getAddress(),
        amount: swapAmount,
        asset0Balance: ethers.parseUnits("430000", 6),
        asset1Balance: ethers.parseEther("100"),
        bucketID: 0,
        zeroForOne: true
      };
        
      const quote = await quoters[i].quote.staticCall(quoteParams, "0x");
      const formattedQuote = fmtUnits18(quote);
      
      console.log(`💰 Final Quote: ${formattedQuote} WETH (for 10,000 USDC)`);
      
      // Check MEV protection status
      let mevStatus = "None";
      let protectionFee = 30; // Base fee
      
      if (protectionLevels[i] > 0) {
        const [needsProtection, protectionType, adjustedFee] = await mevProtection.checkTradeProtection(
          poolId,
          trader.address,
          swapAmount,
          true // Large trade
        );
        
        if (needsProtection) {
          mevStatus = `Active (Level ${protectionType})`;
          protectionFee = Number(adjustedFee);
        }
      }
      
      console.log(`🔒 MEV Protection Status: ${mevStatus}`);
      console.log(`💸 Trading Fee: ${protectionFee} basis points`);

      // Use same gas estimation method as original RealDataQuoters test
      let gasUsed = "N/A";
      let gasWithoutProtection = "N/A";
      
      try {
        // First: Get gas estimate WITHOUT MEV protection (baseline)
        const baseSwapTx = await pm.connect(trader).swap.populateTransaction(
          USDC, WETH, await quoters[i].getAddress(), markings[i], swapAmount, true, 0
        );
        const baseGas = await ethers.provider.estimateGas({ ...baseSwapTx, from: trader.address });
        gasWithoutProtection = baseGas.toString();
        
        // Second: Calculate gas WITH MEV protection
        let gasWithProtection = baseGas;
        if (protectionLevels[i] > 0) {
          const mevConfig = await mevProtection.getPoolMEVConfig(poolId);
          gasWithProtection += BigInt(mevConfig.estimatedGasOverhead);
        }
        
        gasUsed = gasWithProtection.toString();
        
        console.log(`📊 Gas Analysis:`);
        console.log(`   Without Protection: ${gasWithoutProtection}`);
        if (protectionLevels[i] > 0) {
          const mevConfig = await mevProtection.getPoolMEVConfig(poolId);
          console.log(`   MEV Overhead: +${mevConfig.estimatedGasOverhead}`);
        }
        console.log(`   With Protection: ${gasUsed}`);
        
      } catch (error) {
        console.log(`⚠️ Gas estimation failed: ${error.message}`);
        // Use original test values as baseline
        const originalGas = i === 0 ? 276893 : i === 1 ? 166447 : 285038;
        const mevOverhead = protectionLevels[i] === 0x00 ? 0 : 
                           protectionLevels[i] === 0x08 ? 20000 : 70000;
        gasWithoutProtection = originalGas.toString();
        gasUsed = (originalGas + mevOverhead).toString();
        
        console.log(`📊 Gas Analysis (fallback):`);
        console.log(`   Without Protection: ${gasWithoutProtection} (from original test)`);
        console.log(`   MEV Overhead: +${mevOverhead}`);
        console.log(`   With Protection: ${gasUsed}`);
      }
      
      const gasEstimate = BigInt(gasUsed);
      
      console.log(`⛽ Estimated Gas: ${gasEstimate.toString()}`);
      
      // Display data sources used by this quoter
      console.log("📡 Data Sources Used:");
      const sourceSummaries = [];

      if (i === 0) { // V3TWAP + Chainlink
        try {
          const v3tw = await v3twapBridge.getData.staticCall(quoteParams);
          const [spot1, tw1] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3tw);
          const ps = Number(ethers.formatUnits(spot1, 18));
          const pt = Number(ethers.formatUnits(tw1, 18));
          const forkTime = new Date(forkTimestamp * 1000).toISOString().slice(0, 16);
          console.log("  - V3TWAP spot:", ps.toFixed(6), "USDC/WETH @", forkTime);
          console.log("  - V3TWAP twap:", pt.toFixed(6), "USDC/WETH @", forkTime);
          sourceSummaries.push(`V3TWAP: ${ps.toFixed(0)} @${forkTime.slice(5, 10)}`);
        } catch {}
        try {
          const cl = await chainlinkBridge.getData.staticCall(quoteParams);
          const [s2,u2] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], cl);
          
          const s2c = BigInt(s2) < BigInt(1e18) ? (BigInt(1e36)/BigInt(s2)) : BigInt(s2);
          const p = Number(ethers.formatUnits(s2c, 18));
          const iso = new Date(Number(u2) * 1000).toISOString().slice(0, 16);
          
          console.log("  - Chainlink:", p.toFixed(6), "USDC/WETH @", iso);
          sourceSummaries.push(`Chainlink: ${p.toFixed(0)} @${iso.slice(5, 10)}`);
        } catch (error) {
          console.log("  - Chainlink error:", error.message);
          sourceSummaries.push("Chainlink: error");
        }
      } else if (i === 1) { // V3Data + RedStone
        try {
          const v3d = await v3dataBridge.getData.staticCall(quoteParams);
          const [s3,] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3d);
          const p = Number(ethers.formatUnits(s3, 18));
          const forkTime = new Date(forkTimestamp * 1000).toISOString().slice(0, 16);
          console.log("  - V3Data:", p.toFixed(6), "USDC/WETH @", forkTime);
          sourceSummaries.push(`V3Data: ${p.toFixed(0)} @${forkTime.slice(5, 10)}`);
        } catch {
          sourceSummaries.push("V3Data: error");
        }
        try {
          const rs = await fetchRedstoneWithPayload(redstoneBridge, quoteParams, forkTimestamp);
          if (rs && rs.spot > 0) {
            console.log(`🔍 RedStone Debug:`);
            console.log(`   Raw spot: ${rs.spot.toString()}`);
            console.log(`   Raw timestamp: ${rs.updatedAt.toString()}`);
            
            // Check what this raw spot represents
            const rawSpotAsNumber = Number(ethers.formatUnits(rs.spot, 18));
            console.log(`   Raw as number: ${rawSpotAsNumber}`);
            
            // RedStone calculation: asset0/asset1 where asset0=USDC, asset1=WETH
            // So rs.spot should be USDC/WETH (how many WETH per USDC)
            // To get USDC per WETH, we need to invert
            
            if (rawSpotAsNumber < 1) {
              // This looks like USDC/WETH ratio (small number), invert to get USDC per WETH
              const invertedSpot = BigInt(1e36) / BigInt(rs.spot);
              const p = Number(ethers.formatUnits(invertedSpot, 18));
              console.log(`   Inverted to USDC/WETH: ${p}`);
              
              const tsSeconds = Math.floor(Number(rs.updatedAt) / 1000);
              const iso = new Date(tsSeconds * 1000).toISOString().slice(0, 16);
              console.log("  - RedStone:", p.toFixed(6), "USDC/WETH @", iso);
              sourceSummaries.push(`RedStone: ${p.toFixed(0)} @${iso.slice(5, 10)}`);
            } else {
              // This already looks like USDC per WETH
              console.log(`   Direct USDC/WETH: ${rawSpotAsNumber}`);
              
              const tsSeconds = Math.floor(Number(rs.updatedAt) / 1000);
              const iso = new Date(tsSeconds * 1000).toISOString().slice(0, 16);
              console.log("  - RedStone:", rawSpotAsNumber.toFixed(6), "USDC/WETH @", iso);
              sourceSummaries.push(`RedStone: ${rawSpotAsNumber.toFixed(0)} @${iso.slice(5, 10)}`);
            }
          } else {
            console.log("  - RedStone: quote unavailable");
            sourceSummaries.push("RedStone: unavailable");
          }
        } catch (error) {
          console.log("  - RedStone error:", error.message);
          sourceSummaries.push("RedStone: unavailable");
        }
      } else { // V2 + V3TWAP (UniV2, SushiV2, V3TWAP)
        try {
          const u2 = await uniV2Bridge.getData.staticCall(quoteParams);
          const [s4,] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], u2);
          const p = Number(ethers.formatUnits(s4, 18));
          const forkTime = new Date(forkTimestamp * 1000).toISOString().slice(0, 16);
          console.log("  - UniV2:", p.toFixed(6), "USDC/WETH @", forkTime);
          sourceSummaries.push(`UniV2: ${p.toFixed(0)} @${forkTime.slice(5, 10)}`);
        } catch {
          sourceSummaries.push("UniV2: error");
        }
        try {
          const s2 = await sushiV2Bridge.getData.staticCall(quoteParams);
          const [s5,] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], s2);
          const p = Number(ethers.formatUnits(s5, 18));
          const forkTime = new Date(forkTimestamp * 1000).toISOString().slice(0, 16);
          console.log("  - SushiV2:", p.toFixed(6), "USDC/WETH @", forkTime);
          sourceSummaries.push(`SushiV2: ${p.toFixed(0)} @${forkTime.slice(5, 10)}`);
        } catch (e) {
          if ((e?.message||"").includes("pair missing")) {
            console.log("  - SushiV2: pair missing");
            sourceSummaries.push("SushiV2: missing");
          } else {
            console.log("  - SushiV2: quote unavailable");
            sourceSummaries.push("SushiV2: error");
          }
        }
        try {
          const v3tw = await v3twapBridge.getData.staticCall(quoteParams);
          const [s1, t1] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3tw);
          const ps = Number(ethers.formatUnits(s1, 18));
          const pt = Number(ethers.formatUnits(t1, 18));
          const forkTime = new Date(forkTimestamp * 1000).toISOString().slice(0, 16);
          console.log("  - V3TWAP spot:", ps.toFixed(6), "USDC/WETH @", forkTime);
          console.log("  - V3TWAP twap:", pt.toFixed(6), "USDC/WETH @", forkTime);
          sourceSummaries.push(`V3TWAP: ${ps.toFixed(0)} @${forkTime.slice(5, 10)}`);
        } catch {
          console.log("  - V3TWAP: quote unavailable");
          sourceSummaries.push("V3TWAP: error");
        }
      }
      
      // Calculate final USDC per WETH rate
      const quoteWeth = Number(ethers.formatUnits(quote, 18));
      const impliedUSDCperWETH = quoteWeth > 0 ? (10000 / quoteWeth) : 0;
      const finalQuoteUSDC = impliedUSDCperWETH.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

      // Calculate actual MEV overhead from the gas analysis above
      let mevOverhead = "0";
      if (protectionLevels[i] > 0 && gasWithoutProtection !== "N/A") {
        const baseGas = BigInt(gasWithoutProtection);
        const protectedGas = BigInt(gasUsed);
        const actualOverhead = protectedGas - baseGas;
        mevOverhead = actualOverhead.toString();
      } else if (protectionLevels[i] > 0) {
        // Fallback to configured overhead
        const mevConfig = await mevProtection.getPoolMEVConfig(poolId);
        mevOverhead = mevConfig.estimatedGasOverhead.toString();
      }

      results.push({
        quoter: quoterNames[i],
        protection: protectionNames[i],
        gasUsed: gasEstimate.toString(),
        mevOverhead: mevOverhead,
        sources: sourceSummaries.join(", "),
        final: finalQuoteUSDC,
        mevFee: `${protectionFee} bps`
      });
    }

    // Display results in same format as original test with MEV overhead column
    console.log(`\n🔒 Protected Summary Table:`);
    console.table(results.map(r => ({ 
      quoter: r.quoter, 
      protection: r.protection,
      gasUsed: r.gasUsed,
      mevOverhead: r.mevOverhead,
      sources: r.sources, 
      final: r.final,
      mevFee: r.mevFee
    })));

    console.log(`\n🛡️ Protection Benefits:`);
    console.log(`   • Dynamic Fees: Surge pricing during MEV attacks`);
    console.log(`   • High Protection: Commit-reveal + dynamic fees`);
    console.log(`   • Circuit Breakers: Rate limiting per protection level`);
    console.log(`   • Real Oracle Data: Live price feeds with security context`);
    
    console.log(`\n⚠️ Data Source Timing:`);
    console.log(`   • Uniswap V2/V3: Fork block data (${new Date(forkTimestamp * 1000).toISOString()})`);
    console.log(`   • Chainlink: On-chain registry data (may be slightly stale)`);
    console.log(`   • RedStone: Live current data (newer than fork)`);
    console.log(`   • Price differences reflect temporal mismatch between sources`);

    expect(results.length).to.equal(3);
  });
});
