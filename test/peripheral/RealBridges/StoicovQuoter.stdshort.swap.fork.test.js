const { ethers, network } = require("hardhat");

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, "0x1000000000000000000"]);
  return await ethers.getSigner(addr);
}

describe("StoicovQuoter swap - 30bps, gamma high, stddev short only (real bridge)", function () {
  let pm, lm, stoicov, stoicovHarness, bridge, weth, usdc, user;

  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const ETH_USD_CHAINLINK = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const USDC_WETH_V3_3000_POOL = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";

  function buildBucketId(kIdx, invMode, gammaSelHigh, sigmaFixed, gammaZero) {
    let id = 0;
    id |= (kIdx & 0x0F);
    id |= (invMode & 0x03) << 4;
    if (gammaSelHigh) id |= 0x40;
    if (sigmaFixed) id |= 0x80;
    if (gammaZero) id |= 0x100;
    return id;
  }

  function createMarkings(bucketID, extraSlot) {
    let v = 0x1; // data0 flag enabled
    v |= (bucketID & 0xFFF) << 4;
    v |= (extraSlot & 0xF) << 20;
    return ethers.toBeHex(v, 3);
  }

  beforeEach(async function () {
    [user] = await ethers.getSigners();

    weth = await ethers.getContractAt(["function deposit() payable","function approve(address,uint256)","function balanceOf(address) view returns (uint256)"], WETH);
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);

    const poolSigner = await impersonate(USDC_WETH_V3_3000_POOL);
    await usdc.connect(poolSigner).transfer(await user.getAddress(), 1_000_000n * 10n ** 6n);
    await weth.deposit({ value: ethers.parseEther("20") });

    const StoixDB = await ethers.getContractFactory("StoixDataBridge");
    bridge = await StoixDB.deploy(UNISWAP_V2_FACTORY, UNISWAP_V3_FACTORY, ETH_USD_CHAINLINK, WETH, USDC);
    await bridge.waitForDeployment();

    const Stoicov = await ethers.getContractFactory("StoicovQuoter");
    stoicov = await Stoicov.deploy();
    await stoicov.waitForDeployment();
    const StoicovHarness = await ethers.getContractFactory("StoicovQuoterHarness");
    stoicovHarness = await StoicovHarness.deploy();
    await stoicovHarness.waitForDeployment();

    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(await bridge.getAddress());
    await pm.waitForDeployment();

    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    lm = await LiquidityManager.deploy(await pm.getAddress());
    await lm.waitForDeployment();
    await pm.setLiquidityManager(await lm.getAddress());

    await weth.approve(await pm.getAddress(), ethers.MaxUint256);
    await usdc.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
  });

  it("executes swap and prints gas breakdown", async function () {
    // 30bps (kIdx=8), gamma high, RISKY1 (WETH is asset1 in canonical USDC<WETH)
    const bucketID = buildBucketId(8, 2, 1, 0, 0);
    const markings = createMarkings(bucketID, 15);

    await pm.createPool(USDC, WETH, await stoicov.getAddress(), markings);
    await lm.addLiquidity(USDC, WETH, await stoicov.getAddress(), markings, 20_000n * 10n ** 6n, ethers.parseEther("10"));

    // Request stddev short only at bridge level to measure real short-window cost
    const paramsBase = {
      asset0: USDC,
      asset1: WETH,
      quoter: await stoicov.getAddress(),
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: bucketID,
      zeroForOne: false, // selling WETH->USDC means oneForZero in canonical (USDC<WETH)
      functionFlags: 0x20 // std dev short ONLY
    };

    const bridgeGas = await bridge.getData.estimateGas(paramsBase);
    const bridgeData = await bridge.getData.staticCall(paramsBase);
    const [mask, v2Q, v3Q, twQ, clQ, clTs, sdShort, sdLong] = ethers.AbiCoder.defaultAbiCoder().decode([
      "uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"
    ], bridgeData);

    console.log("\n=== BRIDGE (short stddev only) ===");
    console.log("Bridge gas:            " + bridgeGas.toString());
    console.log("Mask:                  0x" + Number(mask).toString(16).padStart(2,'0'));
    console.log("Sources:               " + [
      (Number(mask)&1)?"V2":"",
      (Number(mask)&2)?"V3":"",
      (Number(mask)&4)?"TWAP":"",
      (Number(mask)&0x20)?"stdShort":"",
      (Number(mask)&0x40)?"stdLong":""
    ].filter(Boolean).join("+"));
    if ((Number(mask)&0x20)!==0) console.log("Std dev short (bps):   " + (Number(sdShort)/100).toFixed(2));

    const swapParams = {
      asset0: USDC,
      asset1: WETH,
      quoter: await stoicov.getAddress(),
      amount: [ethers.parseEther("1")], // sell 1 WETH
      zeroForOne: false, // oneForZero in canonical
      marking: [markings],
      traderProtection: "0x00000000"
    };

    const [pmQuote] = await pm.getQuote.staticCall(swapParams, 0n, 0n);
    console.log("\n=== QUOTE ===");
    console.log("Quote (USDC):          " + Number(ethers.formatUnits(pmQuote,6)).toFixed(2));

    const swapGas = await pm.swap.estimateGas(USDC, WETH, await stoicov.getAddress(), markings, ethers.parseEther("1"), false, 0n);
    const tx = await pm.swap(USDC, WETH, await stoicov.getAddress(), markings, ethers.parseEther("1"), false, 0n);
    const rc = await tx.wait();

    console.log("\n=== SWAP GAS ===");
    console.log("Estimate:              " + swapGas.toString());
    console.log("Actual:                " + rc.gasUsed.toString());

    const BASELINE = 81263;
    const totalOverhead = Number(rc.gasUsed) - BASELINE;
    const v2v3Approx = 55000;
    const quoterApprox = 6000;
    const stdShortApprox = Math.max(0, Number(bridgeGas) - v2v3Approx);

    console.log("\n=== BREAKDOWN (approx) ===");
    console.log("Baseline:              " + BASELINE);
    console.log("Data: V2+V3            ~" + v2v3Approx.toLocaleString());
    console.log("Data: stddev short     ~" + stdShortApprox.toLocaleString());
    console.log("Quoter compute         ~" + quoterApprox.toLocaleString());
    console.log("Other PM overhead      ~" + (totalOverhead - v2v3Approx - stdShortApprox - quoterApprox).toLocaleString());
    console.log("Total overhead         ~" + totalOverhead.toLocaleString());

    // Compute mid/bid/ask using harness's debug function
    const routed = ethers.AbiCoder.defaultAbiCoder().encode(["bytes","bytes","bytes","bytes","bytes"],["0x","0x","0x","0x", bridgeData]);
    const quoteParams = {
      asset0: USDC,
      asset1: WETH,
      quoter: await stoicov.getAddress(),
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: bucketID,
      zeroForOne: false,
      functionFlags: 0x20
    };
    const [midQ, reservationQ, bidQ, askQ] = await stoicovHarness.debugPrices.staticCall(quoteParams, routed);
    function fmtQ(q) { const big = BigInt(q.toString()); const intPart = big >> 64n; const frac = big & ((1n<<64n)-1n); const fracStr = (frac * 10000n / (1n<<64n)).toString().padStart(4,'0'); return `${intPart}.${fracStr}`; }
    console.log("\n=== PRICES (Q64.64) ===");
    console.log("Mid:                   " + fmtQ(midQ));
    console.log("Reservation:           " + fmtQ(reservationQ));
    console.log("Bid:                   " + fmtQ(bidQ));
    console.log("Ask:                   " + fmtQ(askQ));
  });
});


