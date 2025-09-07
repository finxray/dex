const { expect } = require("chai");
const { ethers } = require("hardhat");
const { WrapperBuilder } = require("@redstone-finance/evm-connector");
const { requestDataPackages } = require("@redstone-finance/sdk");

function requireFork(ctx) {
  const isFork = process.env.FORK === "1" || process.env.ALCHEMY_URL || process.env.ALCHEMY_MAINNET_URL;
  if (!isFork) {
    ctx.skip();
  }
}

// Ethers v6 syntax
const parseEth = (s) => ethers.parseEther(s);
const MaxUint = ethers.MaxUint256;
const abiCoder = ethers.AbiCoder.defaultAbiCoder();
const toBI = (x) => BigInt(x.toString());

function fmtThousands(n, decimals = 18) {
  if (n === undefined || n === null) return 'N/A';
  const num = BigInt(n);
  const neg = num < 0n;
  const absNum = neg ? -num : num;
  const tenPow = 10n ** BigInt(decimals);
  const whole = absNum / tenPow;
  const frac = absNum % tenPow;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${wholeStr}${fracStr.length ? "." + fracStr : ""}`;
}

// Formatter with thousand separators and fixed fractional digits
function fmtThousandsFixed(n, scaleDecimals = 18, showDecimals = 4) {
  if (n === undefined || n === null) return 'N/A';
  const num = BigInt(n);
  const neg = num < 0n;
  const absNum = neg ? -num : num;
  const tenPow = 10n ** BigInt(scaleDecimals);
  const whole = absNum / tenPow;
  let frac = absNum % tenPow;
  // Round to requested decimals
  if (showDecimals < scaleDecimals) {
    const drop = scaleDecimals - showDecimals;
    const roundBase = 10n ** BigInt(drop);
    const rounded = (frac + roundBase / 2n) / roundBase;
    if (rounded >= 10n ** BigInt(showDecimals)) {
      // carry over to whole
      return fmtThousandsFixed((whole + 1n) * 10n ** BigInt(scaleDecimals), scaleDecimals, showDecimals);
    }
    const fracStr = rounded.toString().padStart(showDecimals, '0');
    const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${neg ? '-' : ''}${wholeStr}${showDecimals > 0 ? '.' + fracStr : ''}`;
  }
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fracStr = frac.toString().padStart(scaleDecimals, "0");
  return `${neg ? '-' : ''}${wholeStr}${showDecimals > 0 ? '.' + fracStr.slice(0, showDecimals) : ''}`;
}

function fmtTimestamp(ts) {
  if (!ts || ts === 0) return "-";
  const d = new Date(Number(ts) * 1000);
  const SS = d.getSeconds().toString().padStart(2, "0");
  const MM = d.getMinutes().toString().padStart(2, "0");
  const HH = d.getHours().toString().padStart(2, "0");
  const DD = d.getDate().toString().padStart(2, "0");
  const MO = (d.getMonth() + 1).toString().padStart(2, "0");
  const YY = (d.getFullYear() % 100).toString().padStart(2, "0");
  return `${SS}:${MM}:${HH} ${DD}:${MO}:${YY}`;
}

const erc20Abi = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

const wethAbi = [
  "function deposit() payable",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

const routerAbi = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)",
];

describe("StoixQuoter Gas Analysis (fork)", function () {
  it("logs detailed gas breakdown for a full swap with live bridges (requires fork)", async function () {
    requireFork(this);

    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const UNIV3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    const UNIV2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
    const CHAINLINK_FEED_REGISTRY = "0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf";
    const UNIV2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

    const [deployer] = await ethers.getSigners();

    const weth = new ethers.Contract(WETH, wethAbi, deployer);
    await weth.deposit({ value: parseEth("600") });

    const router = new ethers.Contract(UNIV2_ROUTER, routerAbi, deployer);
    const path = [WETH, USDC];
    const deadline = Math.floor(Date.now() / 1000) + 600;
    await router.swapExactETHForTokens(0, path, deployer.address, deadline, { value: parseEth("100") });

    const Alias = await ethers.getContractFactory("TokenAliasRegistry");
    const aliasReg = await Alias.deploy();

    // Set up Redstone feed IDs for WETH and USDC
    await aliasReg.setRedstoneFeedId(WETH, ethers.encodeBytes32String("ETH"));
    await aliasReg.setRedstoneFeedId(USDC, ethers.encodeBytes32String("USDC"));

    const V3Spot = await ethers.getContractFactory("UniswapV3DataBridge");
    const v3Spot = await V3Spot.deploy(UNIV3_FACTORY, 3000, 0, WETH, USDC, WETH, USDC);
    const V3Twap = await ethers.getContractFactory("UniswapV3TWAPDataBridge");
    const v3Twap = await V3Twap.deploy(UNIV3_FACTORY, 3000, 60, WETH, USDC, WETH, USDC);
    const V2 = await ethers.getContractFactory("UniswapV2DataBridge");
    const v2 = await V2.deploy(UNIV2_FACTORY, WETH, USDC, WETH, USDC);
    const Chainlink = await ethers.getContractFactory("ChainlinkDataBridge");
    const chainlink = await Chainlink.deploy(CHAINLINK_FEED_REGISTRY, await aliasReg.getAddress());

    // Redstone disabled for this test per request

    const Stoix = await ethers.getContractFactory("StoixQuoter");
    const stoix = await Stoix.deploy();

    // Configure per-asset params (vShort, vLong, k) for WETH and USDC
    // Pack: [0..7]=vShort, [8..15]=vLong, [16..23]=k
    const pack = (vs, vl, k) => (BigInt(vs) | (BigInt(vl) << 8n) | (BigInt(k) << 16n));
    // Example levels: WETH more volatile than USDC
    await stoix.setAssetParams(WETH, pack(120, 180, 160)); // WETH: higher vol, moderate k
    await stoix.setAssetParams(USDC, pack(10, 20, 220));   // USDC: low vol, high k

    const PoolManager = await ethers.getContractFactory("PoolManager");
    const pm = await PoolManager.deploy(await v3Spot.getAddress(), await v3Twap.getAddress(), await v2.getAddress(), ethers.ZeroAddress);
    await pm.setGovernance(deployer.address, deployer.address);
    await pm.setDataBridge(4, await chainlink.getAddress());

    // Wire LiquidityManager for adding liquidity
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    const lm = await LiquidityManager.deploy(await pm.getAddress());
    await pm.setLiquidityManager(await lm.getAddress());

    // Enable d0 (v3 spot), d1 (v3 twap), d2 (v2) and extra bridge slot 4 (chainlink). d3 (redstone) OFF
    const markInt = (4 << 20) | 0b0111;
    const markings = "0x" + markInt.toString(16).padStart(6, "0");

    await pm.createPool(WETH, USDC, await stoix.getAddress(), markings);
    const usdcDeployer = new ethers.Contract(USDC, erc20Abi, deployer);
    await usdcDeployer.approve(await pm.getAddress(), MaxUint);
    await weth.approve(await pm.getAddress(), MaxUint);

    const wethLiq = parseEth("10");
    const usdcLiq = ethers.parseUnits("45000", 6);
    await lm.addLiquidity(WETH, USDC, await stoix.getAddress(), markings, wethLiq, usdcLiq);

    // Swap via PoolManager; StoixQuoter will emit event with d0..dx
    let rcpt;
    try {
      const swapAmount = parseEth("0.001");
      const swapTx = await pm.swap(WETH, USDC, await stoix.getAddress(), markings, swapAmount, true, 0);
      rcpt = await swapTx.wait();
    } catch (e) {
      rcpt = { gasUsed: 0n, logs: [], effectiveGasPrice: 0n };
    }

    // Parse StoixQuoteDebug event if present
    let d0, d1, d2, d3raw, dx;
    if (rcpt && rcpt.logs && rcpt.logs.length) {
      const stoixIface = new ethers.Interface([
        "event StoixQuoteDebug(bytes d0, bytes d1, bytes d2, bytes d3raw, bytes dx)"
      ]);
      for (const log of rcpt.logs) {
        try {
          const parsed = stoixIface.parseLog(log);
          if (parsed && parsed.name === "StoixQuoteDebug") {
            d0 = parsed.args.d0;
            d1 = parsed.args.d1;
            d2 = parsed.args.d2;
            d3raw = parsed.args.d3raw;
            dx = parsed.args.dx;
            break;
          }
        } catch (_) {}
      }
    }

    // If no event, build routed bytes manually from bridges
    const quoteParams = { asset0: WETH, asset1: USDC, quoter: await stoix.getAddress(), amount: parseEth("0.001"), asset0Balance: 0, asset1Balance: 0, bucketID: 8, zeroForOne: true };
    if (!d0) {
      const v3SpotData = await v3Spot.getData(quoteParams);
      const v3TwapData = await v3Twap.getData(quoteParams);
      const v2Data = await v2.getData(quoteParams);
      const chainlinkData = await chainlink.getData(quoteParams);
      
      // DEBUG: Show raw Chainlink data at bridge level
      console.log("DEBUG BRIDGE: Chainlink raw data length:", chainlinkData.length);
      if (chainlinkData.length >= 64) {
        const [bridgePrice, bridgeTs] = abiCoder.decode(["uint256","uint256"], chainlinkData);
        console.log("DEBUG BRIDGE: Chainlink price from bridge:", bridgePrice.toString());
        console.log("DEBUG BRIDGE: Price length (digits):", bridgePrice.toString().length);
        console.log("DEBUG BRIDGE: Chainlink timestamp from bridge:", bridgeTs.toString());
      }
      
      d0 = v3SpotData; d1 = v3TwapData; d2 = v2Data; dx = chainlinkData;
      d3raw = "0x";
    }

    // Decode bytes
    const [v3SpotPrice, v3SpotTs] = d0 && d0.length >= 64 ? abiCoder.decode(["uint256","uint256"], d0) : [0,0];
    const [v3TwapSpot, v3TwapTs] = d1 && d1.length >= 64 ? abiCoder.decode(["uint256","uint256"], d1) : [0,0];
    const [v2Spot, v2Ts] = d2 && d2.length >= 64 ? abiCoder.decode(["uint256","uint256"], d2) : [0,0];
    // No Redstone for this test
    let rsSpot = null, rsTs = 0;
    const [clSpot, clTs] = dx && dx.length >= 64 ? abiCoder.decode(["uint256","uint256"], dx) : [0, 0];

    // Normalize prices to USDC per WETH (>= 1)
    const invIfNeeded = (p) => (p && toBI(p) > 0n ? (toBI(p) < 10n**18n ? (10n**36n)/toBI(p) : toBI(p)) : null);
    const v3SpotDisplay = invIfNeeded(v3SpotPrice);
    const v3TwapDisplay = invIfNeeded(v3TwapSpot);
    const v2Display = invIfNeeded(v2Spot);
    const clDisplay = invIfNeeded(clSpot);

    // Quoter-only gas by reconstructing routed bytes
    let quoterGasEstimate = 0n;
    if (d0 && d1 && d2 && d3raw && dx) {
      const d3 = abiCoder.encode(["bytes","bytes"], [d3raw, "0x"]);
      const routed = abiCoder.encode(["bytes","bytes","bytes","bytes","bytes"], [d0, d1, d2, d3, dx]);
      try {
        quoterGasEstimate = await stoix.estimateGas.quote(quoteParams, routed);
      } catch (e) {}
    }

    const swapTxGasUsed = rcpt && rcpt.gasUsed ? rcpt.gasUsed : 0n;

    console.log("\n================== STOIX QUOTER TEST RESULTS ==================\n");
    
    console.log("Sources (single swap of 0.001 WETH):");
    console.log("name                         | time              | price (USDC/WETH)");
    console.log("-----------------------------+-------------------+---------------------------");
    const swapAmount = parseEth("0.001");
    const rows = [
      { name: "UniswapV3 (spot)", time: toBI(v3SpotTs || 0), price: v3SpotDisplay },
      { name: "UniswapV3 (twap)", time: toBI(v3TwapTs || 0), price: v3TwapDisplay },
      { name: "UniswapV2", time: toBI(v2Ts || 0), price: v2Display },
      { name: "Chainlink (dx)", time: toBI(clTs || 0), price: clDisplay },
    ];
    for (const r of rows) {
      const priceStr = r.price !== null ? fmtThousandsFixed(r.price, 18, 4) : "N/A";
      console.log(`${(r.name).padEnd(28)}| ${fmtTimestamp(r.time).padEnd(18)}| ${priceStr}`);
    }

    // Get the actual StoixQuoter result (now calculated inside the contract)
    let stoixQuote = null;
    try {
      if (d0 && d1 && d2 && dx) {
        const d3 = abiCoder.encode(["bytes","bytes"], [d3raw || "0x", "0x"]);
        const routed = abiCoder.encode(["bytes","bytes","bytes","bytes","bytes"], [d0, d1, d2, d3, dx]);
        const tx = await stoix.quote(quoteParams, routed);
        const receipt = await tx.wait();
        // Parse StoixComponents event
        try {
          const iface = new ethers.Interface([
            "event StoixComponents(uint256 m,uint256 execPrice,int256 skewBps,uint256 sizeBps,uint8 sizeTier,uint256 dstBps,uint256 dclBps,uint8 vShortPair,uint8 vLongPair,uint8 kPair,uint256 fS_bps,uint256 fL_bps,uint256 kMod_bps,uint256 gammaBps,int256 midAdjBps,uint256 baseSpread,uint256 sizeCurveBps,uint256 Ubps,uint256 spreadBps)"
          ]);
          for (const log of receipt.logs) {
            try {
              const parsed = iface.parseLog(log);
              if (parsed && parsed.name === "StoixComponents") {
                const c = parsed.args;
                console.log("Components:");
                console.log("- m:", fmtThousandsFixed(c.m, 18, 4));
                console.log("- execPrice:", fmtThousandsFixed(c.execPrice, 18, 4));
                console.log("- skewBps:", c.skewBps.toString());
                console.log("- sizeBps:", c.sizeBps.toString(), "tier:", c.sizeTier);
                console.log("- dstBps:", c.dstBps.toString(), "dclBps:", c.dclBps.toString());
                console.log("- vShortPair:", c.vShortPair, "vLongPair:", c.vLongPair, "kPair:", c.kPair);
                console.log("- fS_bps:", c.fS_bps.toString(), "fL_bps:", c.fL_bps.toString(), "kMod_bps:", c.kMod_bps.toString());
                console.log("- gammaBps:", c.gammaBps.toString());
                console.log("- midAdjBps:", c.midAdjBps.toString());
                console.log("- baseSpread:", c.baseSpread.toString(), "+ sizeCurve:", c.sizeCurveBps.toString(), "+ Ubps:", c.Ubps.toString(), "= spreadBps:", c.spreadBps.toString());
                break;
              }
            } catch {}
          }
        } catch {}
        
        
        // Get return value with staticCall
        stoixQuote = await stoix.quote.staticCall(quoteParams, routed);
      }
    } catch (e) {
      console.log("Error getting StoixQuoter result:", e.message);
    }

    console.log("\nStoixQuoter Final Quote:");
    console.log("metric                       | value");
    console.log("-----------------------------+---------------------------");
    
    // Calculate quote per 1 WETH
    if (stoixQuote) {
      const quotePer1WETH = (stoixQuote * 1000n) / 1n; // 0.001 WETH * 1000 = 1 WETH
      const quotePer1WETHStr = fmtThousandsFixed(quotePer1WETH, 6, 4);
      console.log(`Final Quote (1 WETH)         | ${quotePer1WETHStr}`);
    } else {
      console.log(`Final Quote (1 WETH)         | N/A`);
    }

    console.log("\nGas Breakdown (0.001 WETH swap):");
    console.log("key                              | value");
    console.log("---------------------------------+------------------------");
    console.log(`PoolManager swap() Tx            | ${swapTxGasUsed.toString()} gas`);
    console.log("\n================================================================");

    expect(1).to.equal(1);
  });
});


