const { ethers, network } = require("hardhat");

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, "0x1000000000000000000"]);
  return await ethers.getSigner(addr);
}

describe("StoicovQuoter swap - fixed sigma (no std dev), full sources (V2,V3,TWAP,CL)", function () {
  let pm, lm, stoicov, stoicovHarness, bridge, weth, usdc, user;

  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const ETH_USD_CHAINLINK = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const USDC_WETH_V3_3000_POOL = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";

  function buildBucketId(kIdx, invMode, gammaSelHigh, sigmaFixed, gammaZero) {
    let id = 0; id |= (kIdx & 0x0F); id |= (invMode & 0x03) << 4; if (gammaSelHigh) id |= 0x40; if (sigmaFixed) id |= 0x80; if (gammaZero) id |= 0x100; return id;
  }
  function createMarkings(bucketID, extraSlot) {
    let v = 0x1; v |= (bucketID & 0xFFF) << 4; v |= (extraSlot & 0xF) << 20; return ethers.toBeHex(v, 3);
  }

  beforeEach(async function () {
    [user] = await ethers.getSigners();
    weth = await ethers.getContractAt(["function deposit() payable","function approve(address,uint256)"], WETH);
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

  it("executes fixed-sigma swap and prints bridge/quoter prices", async function () {
    // 30bps, RISKY1 (ETH risky), gamma high, sigma fixed
    const bucketID = buildBucketId(8, 2, 1, 1, 0);
    const markings = createMarkings(bucketID, 15);

    await pm.createPool(USDC, WETH, await stoicov.getAddress(), markings);
    await lm.addLiquidity(USDC, WETH, await stoicov.getAddress(), markings, 20_000n * 10n ** 6n, ethers.parseEther("10"));

    // Bridge: request V2|V3|TWAP|CL only (no stddev bits)
    const params = {
      asset0: USDC,
      asset1: WETH,
      quoter: await stoicov.getAddress(),
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: bucketID,
      zeroForOne: false,
      functionFlags: 0x0F
    };

    const gas = await bridge.getData.estimateGas(params);
    const data = await bridge.getData.staticCall(params);
    const [mask, v2Q, v3Q, twQ, clQ, ts, sdShort, sdLong] = ethers.AbiCoder.defaultAbiCoder().decode([
      "uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"
    ], data);

    console.log("\n=== BRIDGE (no stddev flags) ===");
    console.log("Gas:                   " + gas.toString());
    console.log("Mask:                  0x" + Number(mask).toString(16).padStart(2,'0'));
    console.log("V2:                    " + v2Q.toString());
    console.log("V3:                    " + v3Q.toString());
    console.log("TWAP:                  " + twQ.toString());
    console.log("CL:                    " + clQ.toString());
    console.log("Std short:             " + sdShort.toString());
    console.log("Std long:              " + sdLong.toString());
    // Human-readable formatting from Q64.64
    function fmtQ(q) { const big = BigInt(q.toString()); const intPart = big >> 64n; const frac = big & ((1n<<64n)-1n); const fracStr = (frac * 10000n / (1n<<64n)).toString().padStart(4,'0'); return `${intPart}.${fracStr}`; }
    console.log("\n=== BRIDGE PRICES (formatted) ===");
    if (Number(mask)&0x01) console.log("V2 (fmt):              " + fmtQ(v2Q));
    if (Number(mask)&0x02) console.log("V3 (fmt):              " + fmtQ(v3Q));
    if (Number(mask)&0x04) console.log("TWAP (fmt):            " + fmtQ(twQ));
    if (Number(mask)&0x08) console.log("Chainlink (fmt):       " + fmtQ(clQ));

    // Swap via PM
    const swapParams = {
      asset0: USDC,
      asset1: WETH,
      quoter: await stoicov.getAddress(),
      amount: [ethers.parseEther("1")],
      zeroForOne: false,
      marking: [markings],
      traderProtection: "0x00000000"
    };
    const [pmQuote] = await pm.getQuote.staticCall(swapParams, 0n, 0n);
    const swapGas = await pm.swap.estimateGas(USDC, WETH, await stoicov.getAddress(), markings, ethers.parseEther("1"), false, 0n);
    const tx = await pm.swap(USDC, WETH, await stoicov.getAddress(), markings, ethers.parseEther("1"), false, 0n);
    const rc = await tx.wait();

    console.log("\n=== SWAP ===");
    console.log("Quote (USDC):          " + Number(ethers.formatUnits(pmQuote,6)).toFixed(2));
    console.log("Gas estimate:          " + swapGas.toString());
    console.log("Gas actual:            " + rc.gasUsed.toString());

    // Quoter prices (mid/res/bid/ask)
    const routed = ethers.AbiCoder.defaultAbiCoder().encode(["bytes","bytes","bytes","bytes","bytes"],["0x","0x","0x","0x", data]);
    const qp = {
      asset0: USDC,
      asset1: WETH,
      quoter: await stoicov.getAddress(),
      amount: ethers.parseEther("1"),
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: bucketID,
      zeroForOne: false,
      functionFlags: 0
    };
    const [midQ, reservationQ, bidQ, askQ] = await stoicovHarness.debugPrices.staticCall(qp, routed);
    function fmtQ(q) { const big = BigInt(q.toString()); const intPart = big >> 64n; const frac = big & ((1n<<64n)-1n); const fracStr = (frac * 10000n / (1n<<64n)).toString().padStart(4,'0'); return `${intPart}.${fracStr}`; }
    console.log("\n=== QUOTER PRICES ===");
    console.log("Mid:                   " + fmtQ(midQ));
    console.log("Reservation:           " + fmtQ(reservationQ));
    console.log("Bid:                   " + fmtQ(bidQ));
    console.log("Ask:                   " + fmtQ(askQ));
  });
});


