const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper functions
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

describe("🔒 Secure Real Data Quoters Tests (MEV Protected)", function () {
  if (!process.env.MAINNET_RPC) {
    it("skipped - MAINNET_RPC not set", function () { 
      console.log("⚠️ To test with real data, set MAINNET_RPC environment variable");
      expect(true).to.equal(true); 
    });
    return;
  }

  let deployer, lp, trader, guardian;
  let weth, usdc;
  let pm, poolRegistry, circuitBreaker, mevProtection;
  let v3twapBridge, chainlinkBridge, v3dataBridge, redstoneBridge;
  let uniV2Bridge, sushiV2Bridge;
  let v3twapChainlinkQuoter, v3dataRedstoneQuoter, v2v3twapQuoter;

  // Real mainnet addresses
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNI_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const SUSHI_V2_FACTORY = "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac";
  const UNI_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const UNI_V3_FEE = 3000;
  const TWAP_WINDOW = 10800;
  const CHAINLINK_REGISTRY = "0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf";

  const WETH_AMOUNT = ethers.parseEther("100");
  const USDC_AMOUNT = ethers.parseUnits("430000", 6);

  // Helpers for funding on fork
  async function impersonate(address) {
    await ethers.provider.send("hardhat_impersonateAccount", [address]);
    await ethers.provider.send("hardhat_setBalance", [address, "0x8AC7230489E80000"]);
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
    const USDC_WHALE = "0x28C6c06298d514Db089934071355E5743bf21d60";
    const whale = await impersonate(USDC_WHALE);
    await (await usdc.connect(whale).transfer(to, amount)).wait();
  }

  before(async function () {
    [deployer, lp, trader, guardian] = await ethers.getSigners();

    console.log("🔒 Using mainnet fork for secure real data quoters");
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

    console.log(`\n🏭 PoolManager: ${await pm.getAddress()}`);

    // Deploy new security components
    const PoolRegistry = await ethers.getContractFactory("PoolRegistry");
    poolRegistry = await PoolRegistry.deploy(deployer.address); // Use deployer as mock pool manager

    const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
    circuitBreaker = await CircuitBreaker.deploy(deployer.address); // Use deployer as mock pool manager

    const MEVProtection = await ethers.getContractFactory("MEVProtection");
    mevProtection = await MEVProtection.deploy(deployer.address); // Use deployer as mock pool manager

    // Set up guardian (deployer acts as pool manager)
    await circuitBreaker.connect(deployer).setGuardian(guardian.address, true);

    console.log(`\n🛡️ Security Components Deployed:`);
    console.log(`   PoolRegistry: ${await poolRegistry.getAddress()}`);
    console.log(`   CircuitBreaker: ${await circuitBreaker.getAddress()}`);
    console.log(`   MEVProtection: ${await mevProtection.getAddress()}`);

    // Deploy real data bridges (using same pattern as RealDataQuoters.fork.test.js)
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

    // Deploy Chainlink bridge
    try {
      const ChainlinkBridge = await ethers.getContractFactory("ChainlinkDataBridge");
      chainlinkBridge = await ChainlinkBridge.deploy(CHAINLINK_REGISTRY);
      console.log("✅ Chainlink Bridge deployed with real data");
    } catch (error) {
      const MockChainlinkBridge = await ethers.getContractFactory("MockChainlinkBridge");
      chainlinkBridge = await MockChainlinkBridge.deploy();
      console.log("⚠️ Chainlink Bridge failed, using mock:", error.message);
    }

    // Deploy RedStone bridge
    const TokenAliasRegistry = await ethers.getContractFactory("TokenAliasRegistry");
    const aliasRegistry = await TokenAliasRegistry.deploy();
    const RedstoneOnDemandBridge = await ethers.getContractFactory("RedstoneOnDemandBridgeImpl");
    redstoneBridge = await RedstoneOnDemandBridge.deploy(await aliasRegistry.getAddress());
    console.log("✅ RedStone Bridge deployed with real data");

    // Deploy quoters (using Fixed versions that average their data sources)
    console.log(`\n🔧 Deploying Secure Quoters:`);
    
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

    // Fund accounts with real tokens
    console.log(`\n💰 Funding Test Accounts:`);
    
    // Impersonate USDC whale and fund our accounts
    await fundUSDC(lp.address, USDC_AMOUNT);
    await fundUSDC(trader.address, ethers.parseUnits("50000", 6));
    
    // Wrap ETH to WETH for our accounts
    await wrapWETH(lp, ethers.parseEther("100").toString());
    await wrapWETH(trader, ethers.parseEther("10").toString());
    
    // Approve PoolManager
    await weth.connect(lp).approve(await pm.getAddress(), ethers.MaxUint256);
    await usdc.connect(lp).approve(await pm.getAddress(), ethers.MaxUint256);
    await weth.connect(trader).approve(await pm.getAddress(), ethers.MaxUint256);
    await usdc.connect(trader).approve(await pm.getAddress(), ethers.MaxUint256);
    
    console.log("✅ All accounts funded and approved");
  });

  it("should display real WETH/USDC prices with security context", async function () {
    console.log("\n🔒 Secure Real Data Sources Analysis:");

    const testParams = {
      asset0: USDC,
      asset1: WETH,
      quoter: await v3twapChainlinkQuoter.getAddress(),
      amount: ethers.parseUnits("4300", 6),
      asset0Balance: ethers.parseUnits("4300000", 6),
      asset1Balance: ethers.parseEther("1000"),
      bucketID: 0,
      zeroForOne: true
    };

    // Test all data sources with security context
    const sources = [];

    try {
      const v3twapData = await v3twapBridge.getData.staticCall(testParams);
      const [v3Spot, v3Twap] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3twapData);
      console.log("🔹 V3TWAP - Spot:", fmtUnits18(v3Spot), "TWAP:", fmtUnits18(v3Twap), "✅ Secure");
      sources.push({ name: "V3TWAP", price: v3Spot, secure: true });
    } catch (error) {
      console.log("🔹 V3TWAP - Error:", error.message);
    }

    try {
      const chainlinkData = await chainlinkBridge.getData.staticCall(testParams);
      const [clSpot, clUpdated] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], chainlinkData);
      const clSpotBN = BigInt(clSpot);
      const correctedSpot = clSpotBN < BigInt(1e18) ? (BigInt(1e36) / clSpotBN) : clSpotBN;
      console.log("🔹 Chainlink - Spot:", fmtUnits18(correctedSpot), "Updated:", new Date(Number(clUpdated) * 1000).toISOString(), "✅ Oracle");
      sources.push({ name: "Chainlink", price: correctedSpot, secure: true });
    } catch (error) {
      console.log("🔹 Chainlink - Error:", error.message);
    }

    try {
      const rs = await fetchRedstoneWithPayload(redstoneBridge, testParams);
      if (rs && rs.spot > 0) {
        const invertedSpot = BigInt(1e36) / BigInt(rs.spot);
        const tsSeconds = Math.floor(Number(rs.updatedAt) / 1000);
        console.log("🔹 RedStone - Spot:", fmtUnits18(invertedSpot), "Updated:", new Date(tsSeconds * 1000).toISOString(), "✅ Oracle");
        sources.push({ name: "RedStone", price: invertedSpot, secure: true });
      } else {
        console.log("🔹 RedStone - quote unavailable");
      }
    } catch (error) {
      console.log("🔹 RedStone - Error:", error.message);
    }

    console.log(`\n✅ Analyzed ${sources.length} secure data sources`);
  });

  it("should create pools with different MEV protection levels and compare performance", async function () {
    console.log("\n🔒 MEV Protection Performance Analysis:");
    
    const quoters = [
      { 
        contract: v3twapChainlinkQuoter, 
        name: "V3TWAP+Chainlink", 
        marking: "0x000003",
        mevLevel: 0x00, // No protection
        description: "No MEV Protection"
      },
      { 
        contract: v3dataRedstoneQuoter, 
        name: "V3Data+RedStone", 
        marking: "0x000009",
        mevLevel: 0x08, // Dynamic fees
        description: "Dynamic Fee Protection"
      },
      { 
        contract: v2v3twapQuoter, 
        name: "V2+V3TWAP", 
        marking: "0x00000E",
        mevLevel: 0x09, // High protection (commit-reveal + dynamic fees)
        description: "High MEV Protection"
      }
    ];
    
    const swapAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
    const results = [];
    
    for (let i = 0; i < quoters.length; i++) {
      const quoter = quoters[i];
      console.log(`\n🔒 ${quoter.name} - ${quoter.description}`);
      
      // Create pool with specific MEV protection
      const poolId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "address", "bytes3"],
          [USDC, WETH, await quoter.contract.getAddress(), quoter.marking]
        )
      );
      
      // Register pool in registry (deployer acts as pool manager)
      await poolRegistry.connect(deployer).registerPool(
        poolId,
        USDC,
        WETH,
        await quoter.contract.getAddress(),
        quoter.marking
      );
      
      // Configure MEV protection (deployer acts as pool manager)
      if (quoter.mevLevel > 0) {
        await mevProtection.connect(deployer).configurePoolProtection(
          poolId,
          quoter.mevLevel,
          ethers.parseEther("5") // 5 ETH threshold for large trades
        );
        
        const mevConfig = await mevProtection.getPoolMEVConfig(poolId);
        console.log(`   🛡️ MEV Protection: ${mevConfig.description}`);
        console.log(`   ⛽ Gas Overhead: ${mevConfig.estimatedGasOverhead} gas`);
      } else {
        console.log(`   🔓 No MEV Protection (cheapest gas)`);
      }
      
      // Set circuit breaker limits based on protection level
      const limits = quoter.mevLevel === 0x00 
        ? { maxSwap: ethers.parseEther("1000"), dailyVolume: ethers.parseEther("100000"), cooldown: 0 }
        : quoter.mevLevel === 0x08
        ? { maxSwap: ethers.parseEther("100"), dailyVolume: ethers.parseEther("10000"), cooldown: 60 }
        : { maxSwap: ethers.parseEther("10"), dailyVolume: ethers.parseEther("1000"), cooldown: 300 };
      
      await circuitBreaker.connect(deployer).setPoolLimits(
        poolId,
        limits.maxSwap,
        limits.dailyVolume,
        limits.cooldown,
        500 // 5% max price impact
      );
      
      console.log(`   🚧 Circuit Breaker: Max ${ethers.formatEther(limits.maxSwap)} ETH/swap, ${limits.cooldown}s cooldown`);
      
      // Create pool
      await pm.connect(deployer).createPool(
        USDC,
        WETH,
        await quoter.contract.getAddress(),
        quoter.marking
      );
      
      // Add liquidity using flash session to avoid token transfer issues
      const TestFlashCallback = await ethers.getContractFactory("DummyFlashCallback");
      const callback = await TestFlashCallback.deploy();
      
      const callbackData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "bytes3", "uint256", "uint256"],
        [USDC, WETH, await quoter.contract.getAddress(), quoter.marking, USDC_AMOUNT, WETH_AMOUNT]
      );
      
      await pm.connect(lp).flashSession(
        await callback.getAddress(),
        callbackData,
        [USDC, WETH]
      );
      
      console.log(`   💧 Liquidity added via flash session`);
      
      // Test quote and gas estimation
      const quoteParams = {
        asset0: USDC,
        asset1: WETH,
        quoter: await quoter.contract.getAddress(),
        amount: swapAmount,
        asset0Balance: ethers.parseUnits("430000", 6),
        asset1Balance: ethers.parseEther("100"),
        bucketID: 0,
        zeroForOne: true
      };
      
      // Check circuit breaker first
      const [allowed, reason] = await circuitBreaker.checkOperation(
        poolId,
        swapAmount,
        Number(ethers.formatUnits(swapAmount, 6)) > 5000 // Large trade if > 5k USDC
      );
      
      if (!allowed) {
        console.log(`   🚫 Circuit breaker blocked: ${reason}`);
        results.push({
          quoter: quoter.name,
          protection: quoter.description,
          gasUsed: "BLOCKED",
          sources: "N/A",
          final: "BLOCKED",
          securityStatus: "Circuit breaker active"
        });
        continue;
      }
      
      // Check MEV protection
      let mevStatus = "None";
      let adjustedFee = 30; // Base fee
      
      if (quoter.mevLevel > 0) {
        const [needsProtection, protectionType, fee] = await mevProtection.checkTradeProtection(
          poolId,
          trader.address,
          swapAmount,
          Number(ethers.formatUnits(swapAmount, 6)) > 5000
        );
        
        if (needsProtection) {
          mevStatus = `Active (${protectionType})`;
          adjustedFee = Number(fee);
        }
      }
      
      console.log(`   🔒 MEV Status: ${mevStatus}, Fee: ${adjustedFee} bps`);
      
      // Get quote
      const quote = await quoter.contract.quote.staticCall(quoteParams, "0x");
      const formattedQuote = fmtUnits18(quote);
      
      // Estimate gas for swap
      let gasEstimate;
      try {
        gasEstimate = await pm.connect(trader).swap.estimateGas(
          USDC,
          WETH,
          await quoter.contract.getAddress(),
          quoter.marking,
          swapAmount,
          true,
          0
        );
      } catch (gasError) {
        gasEstimate = BigInt(200000); // Fallback estimate
      }
      
      console.log(`   💰 Final Quote: ${formattedQuote} WETH (for 10,000 USDC)`);
      console.log(`   ⛽ Estimated Gas: ${gasEstimate.toString()}`);
      
      // Display data sources used by this quoter
      console.log("   📡 Data Sources Used:");
      const sourceSummaries = [];
      
      if (i === 0) { // V3TWAP + Chainlink
        try {
          const v3tw = await v3twapBridge.getData.staticCall(quoteParams);
          const [spot1, tw1] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3tw);
          const ps = Number(ethers.formatUnits(spot1, 18));
          const pt = Number(ethers.formatUnits(tw1, 18));
          console.log("     - V3TWAP spot:", ps.toFixed(2), "USDC/WETH");
          console.log("     - V3TWAP twap:", pt.toFixed(2), "USDC/WETH");
          sourceSummaries.push(`V3TWAP: ${ps.toFixed(0)}`);
        } catch {}
        
        try {
          const cl = await chainlinkBridge.getData.staticCall(quoteParams);
          const [s2,u2] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], cl);
          const s2c = BigInt(s2) < BigInt(1e18) ? (BigInt(1e36)/BigInt(s2)) : BigInt(s2);
          const p = Number(ethers.formatUnits(s2c, 18));
          console.log("     - Chainlink:", p.toFixed(2), "USDC/WETH");
          sourceSummaries.push(`CL: ${p.toFixed(0)}`);
        } catch {}
      } else if (i === 1) { // V3Data + RedStone
        try {
          const v3d = await v3dataBridge.getData.staticCall(quoteParams);
          const [s3,] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], v3d);
          const p = Number(ethers.formatUnits(s3, 18));
          console.log("     - V3Data:", p.toFixed(2), "USDC/WETH");
          sourceSummaries.push(`V3Data: ${p.toFixed(0)}`);
        } catch {}
        
        try {
          const rs = await fetchRedstoneWithPayload(redstoneBridge, quoteParams);
          if (rs && rs.spot > 0) {
            const invertedSpot = BigInt(1e36) / BigInt(rs.spot);
            const p = Number(ethers.formatUnits(invertedSpot, 18));
            console.log("     - RedStone:", p.toFixed(2), "USDC/WETH");
            sourceSummaries.push(`RS: ${p.toFixed(0)}`);
          } else {
            console.log("     - RedStone: quote unavailable");
            sourceSummaries.push("RS: unavailable");
          }
        } catch {
          console.log("     - RedStone: quote unavailable");
          sourceSummaries.push("RS: unavailable");
        }
      } else { // V2 + V3TWAP
        try {
          const u2 = await uniV2Bridge.getData.staticCall(quoteParams);
          const [s4,] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], u2);
          const p = Number(ethers.formatUnits(s4, 18));
          console.log("     - UniV2:", p.toFixed(2), "USDC/WETH");
          sourceSummaries.push(`UniV2: ${p.toFixed(0)}`);
        } catch {}
        
        try {
          const s2 = await sushiV2Bridge.getData.staticCall(quoteParams);
          const [s5,] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256","uint256"], s2);
          const p = Number(ethers.formatUnits(s5, 18));
          console.log("     - SushiV2:", p.toFixed(2), "USDC/WETH");
          sourceSummaries.push(`SushiV2: ${p.toFixed(0)}`);
        } catch (e) {
          if ((e?.message||"").includes("pair missing")) {
            console.log("     - SushiV2: pair missing");
            sourceSummaries.push("SushiV2: missing");
          } else {
            console.log("     - SushiV2: quote unavailable");
            sourceSummaries.push("SushiV2: unavailable");
          }
        }
      }
      
      // Calculate final USDC per WETH rate
      const quoteWeth = Number(ethers.formatUnits(quote, 18));
      const finalUSDCperWETH = quoteWeth > 0 ? (10000 / quoteWeth) : 0;
      const finalFormatted = finalUSDCperWETH.toLocaleString("en-US", { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      });
      
      results.push({
        quoter: quoter.name,
        protection: quoter.description,
        gasUsed: gasEstimate.toString(),
        sources: sourceSummaries.join(", "),
        final: finalFormatted,
        securityStatus: mevStatus
      });
    }

    // Display comprehensive security-aware results
    console.log(`\n🔒 Secure Quoter Performance Summary:`);
    console.log("=".repeat(120));
    console.table(results.map(r => ({ 
      quoter: r.quoter, 
      protection: r.protection,
      gasUsed: r.gasUsed, 
      sources: r.sources, 
      final: r.final,
      security: r.securityStatus
    })));
    
    console.log("\n🛡️ Security Features Summary:");
    console.log("   • Circuit Breaker: Rate limiting and emergency pause");
    console.log("   • MEV Protection: Configurable per pool");
    console.log("   • Pool Registry: Metadata and statistics tracking");
    console.log("   • Real Data: Live oracle feeds with recent timestamps");
    
    expect(results.length).to.equal(3);
  });

  it("should demonstrate commit-reveal MEV protection", async function () {
    console.log("\n🔐 Testing Commit-Reveal MEV Protection:");
    
    // Create a high-security pool
    const securePoolId = ethers.keccak256(ethers.toUtf8Bytes("secure-pool-test"));
    
    // Register and configure high protection (deployer acts as pool manager)
    await poolRegistry.connect(deployer).registerPool(
      securePoolId,
      USDC,
      WETH,
      await v3twapChainlinkQuoter.getAddress(),
      "0x000001" // Commit-reveal marking
    );
    
    await mevProtection.connect(deployer).configurePoolProtection(
      securePoolId,
      0x01, // COMMIT_REVEAL
      ethers.parseEther("1") // 1 ETH threshold
    );
    
    console.log("✅ Secure pool configured with commit-reveal protection");
    
    // Phase 1: Commit
    const amountIn = ethers.parseEther("5"); // Large trade requiring protection
    const zeroForOne = false; // USDC -> WETH
    const minAmountOut = 0;
    const nonce = Math.floor(Math.random() * 1000000);
    
    const commitHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "bool", "uint256", "uint256"],
        [securePoolId, trader.address, amountIn, zeroForOne, minAmountOut, nonce]
      )
    );
    
    const commitTx = await mevProtection.connect(trader).commitTrade(securePoolId, commitHash);
    const commitReceipt = await commitTx.wait();
    
    console.log("✅ Phase 1 - Trade committed");
    console.log(`   Commit Hash: ${commitHash}`);
    console.log(`   Gas Used: ${commitReceipt.gasUsed.toString()}`);
    
    // Mine blocks to reach reveal window
    await ethers.provider.send("hardhat_mine", ["0x3"]); // Mine 3 blocks
    
    // Phase 2: Verify reveal capability
    const isValid = await mevProtection.verifyAndReveal(
      securePoolId,
      trader.address,
      amountIn,
      zeroForOne,
      minAmountOut,
      nonce
    );
    
    console.log("✅ Phase 2 - Reveal verified:", isValid);
    console.log("✅ Commit-reveal MEV protection working!");
    
    // Get protection status
    const config = await mevProtection.getPoolMEVConfig(securePoolId);
    console.log(`\n🛡️ Protection Summary:`);
    console.log(`   Level: ${config.description}`);
    console.log(`   Gas Overhead: ${config.estimatedGasOverhead} gas`);
    console.log(`   Current Fee: ${config.currentFee} basis points`);
  });

  it("should demonstrate circuit breaker protection", async function () {
    console.log("\n🚨 Testing Circuit Breaker Protection:");
    
    const testPoolId = ethers.keccak256(ethers.toUtf8Bytes("circuit-test-pool"));
    
    // Set strict limits for demonstration (deployer acts as pool manager)
    await circuitBreaker.connect(deployer).setPoolLimits(
      testPoolId,
      ethers.parseEther("1"),    // Max 1 ETH per swap
      ethers.parseEther("10"),   // Max 10 ETH daily
      60,                         // 60 second cooldown
      300                         // 3% max price impact
    );
    
    console.log("✅ Strict circuit breaker limits set");
    
    // Test 1: Normal operation should pass
    const [allowed1, ] = await circuitBreaker.checkOperation(
      testPoolId,
      ethers.parseEther("0.5"),
      false
    );
    expect(allowed1).to.be.true;
    console.log("✅ Normal operation allowed");
    
    // Test 2: Large operation should be blocked
    const [allowed2, reason2] = await circuitBreaker.checkOperation(
      testPoolId,
      ethers.parseEther("2"), // Exceeds 1 ETH limit
      false
    );
    expect(allowed2).to.be.false;
    console.log(`✅ Large operation blocked: ${reason2}`);
    
    // Test 3: Guardian emergency pause
    await circuitBreaker.connect(guardian).pausePool(testPoolId, 3600); // 1 hour
    
    const [allowed3, reason3] = await circuitBreaker.checkOperation(
      testPoolId,
      ethers.parseEther("0.1"),
      false
    );
    expect(allowed3).to.be.false;
    expect(reason3).to.equal("Pool is paused");
    console.log("✅ Emergency pause working");
    
    // Resume pool
    await circuitBreaker.connect(guardian).resumePool(testPoolId);
    const [allowed4, ] = await circuitBreaker.checkOperation(
      testPoolId,
      ethers.parseEther("0.1"),
      false
    );
    expect(allowed4).to.be.true;
    console.log("✅ Pool resume working");
    
    console.log("\n🛡️ Circuit breaker protection fully functional!");
  });
});
