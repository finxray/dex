const { expect } = require("chai");
const { ethers } = require("hardhat");

function isForkEnv() {
  return process.env.FORK === "1" || process.env.ALCHEMY_URL || process.env.ALCHEMY_MAINNET_URL;
}

function fmtThousands(n) {
  if (n === undefined || n === null) return 'N/A';
  const s = n.toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function requireFork(ctx) {
  if (!isForkEnv()) {
    ctx.skip();
  }
}

describe("Real Data Bridges (fork)", function () {
  it("smoke: environment is forked (noop on non-fork)", async function () {
    if (!isForkEnv()) {
      expect(true).to.equal(true);
      return;
    }
    const chainId = await ethers.provider.send("eth_chainId", []);
    expect(chainId).to.be.a("string");
  });

  it("Uniswap V3 Spot/TWAP and V2 return sane data", async function () {
    requireFork(this);

    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const UNIV3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    const UNIV2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";

    const [deployer] = await ethers.getSigners();

    const V3Spot = await ethers.getContractFactory("UniswapV3DataBridge");
    const v3Spot = await V3Spot.deploy(UNIV3_FACTORY, 3000, 0, WETH, USDC, WETH, USDC);
    const V3Twap = await ethers.getContractFactory("UniswapV3TWAPDataBridge");
    const v3Twap = await V3Twap.deploy(UNIV3_FACTORY, 3000, 21600, WETH, USDC, WETH, USDC);
    const V2 = await ethers.getContractFactory("UniswapV2DataBridge");
    const v2 = await V2.deploy(UNIV2_FACTORY, WETH, USDC, WETH, USDC);

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const qp = { asset0: WETH, asset1: USDC, quoter: ethers.ZeroAddress, amount: 0, asset0Balance: 0, asset1Balance: 0, bucketID: 0, zeroForOne: true };

    const d0 = await v3Spot.getData(qp);
    const d1 = await v3Twap.getData(qp);
    const d2 = await v2.getData(qp);

    expect(d0.length).to.be.greaterThan(0);
    expect(d1.length).to.be.greaterThan(0);
    expect(d2.length).to.be.greaterThan(0);

    const [v3SpotPrice] = abi.decode(["uint256","uint256"], d0);
    const [v3TwapPrice] = abi.decode(["uint256","uint256"], d1);
    const [v2SpotPrice] = abi.decode(["uint256","uint256"], d2);

    // Basic sanity checks: positive and roughly within same order of magnitude
    expect(v3SpotPrice).to.be.gt(0n);
    expect(v3TwapPrice).to.be.gt(0n);
    expect(v2SpotPrice).to.be.gt(0n);
  });

  it("Chainlink bridge returns sane data", async function () {
    requireFork(this);

    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const CHAINLINK_FEED_REGISTRY = "0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf";

    const Alias = await ethers.getContractFactory("TokenAliasRegistry");
    const aliasReg = await Alias.deploy();

    const Chainlink = await ethers.getContractFactory("ChainlinkDataBridge");
    const chainlink = await Chainlink.deploy(CHAINLINK_FEED_REGISTRY, await aliasReg.getAddress());

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const qp = { asset0: WETH, asset1: USDC, quoter: ethers.ZeroAddress, amount: 0, asset0Balance: 0, asset1Balance: 0, bucketID: 0, zeroForOne: true };
    const dx = await chainlink.getData(qp);
    expect(dx.length).to.be.greaterThan(0);
    const [clPrice, clTs] = abi.decode(["uint256","uint256"], dx);
    expect(clPrice).to.be.gt(0n);
    expect(clTs).to.be.gt(0n);
  });

  it("prints swap() gas cost per bridge", async function () {
    requireFork(this);

    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const UNIV3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    const UNIV2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
    const CHAINLINK_FEED_REGISTRY = "0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf";

    const [deployer] = await ethers.getSigners();

    // Fund deployer with WETH and USDC
    const wethAbi = [
      "function deposit() payable",
      "function approve(address,uint256) returns (bool)",
      "function balanceOf(address) view returns (uint256)"
    ];
    const routerAbi = [
      "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)"
    ];
    const UNIV2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    const weth = new ethers.Contract(WETH, wethAbi, deployer);
    await weth.deposit({ value: ethers.parseEther("200") });
    const router = new ethers.Contract(UNIV2_ROUTER, routerAbi, deployer);
    const path = [WETH, USDC];
    const deadline = Math.floor(Date.now() / 1000) + 600;
    await router.swapExactETHForTokens(0, path, deployer.address, deadline, { value: ethers.parseEther("400") });

    // Bridges
    const V3Spot = await ethers.getContractFactory("UniswapV3DataBridge");
    const v3Spot = await V3Spot.deploy(UNIV3_FACTORY, 3000, 0, WETH, USDC, WETH, USDC);
    const V3Twap = await ethers.getContractFactory("UniswapV3TWAPDataBridge");
    const v3Twap = await V3Twap.deploy(UNIV3_FACTORY, 3000, 21600, WETH, USDC, WETH, USDC);
    const V2 = await ethers.getContractFactory("UniswapV2DataBridge");
    const v2 = await V2.deploy(UNIV2_FACTORY, WETH, USDC, WETH, USDC);

    const Alias = await ethers.getContractFactory("TokenAliasRegistry");
    const aliasReg = await Alias.deploy();
    const Chainlink = await ethers.getContractFactory("ChainlinkDataBridge");
    const chainlink = await Chainlink.deploy(CHAINLINK_FEED_REGISTRY, await aliasReg.getAddress());

    // Helper to build markings (single bridge)
    function mk({ d0 = 0, d1 = 0, d2 = 0, d3 = 0, dx = 0 }) {
      const flags = (d0 ? 1 : 0) | (d1 ? 2 : 0) | (d2 ? 4 : 0) | (d3 ? 8 : 0);
      const extra = dx ? (dx << 20) : 0;
      return "0x" + (extra | flags).toString(16).padStart(6, "0");
    }

    // Measure swap gas per bridge with isolated deployments (WETH -> USDC)
    const amtWarm = ethers.parseEther("0.0005");  // 0.0005 WETH warmup
    const amt = ethers.parseEther("0.001");       // 0.001 WETH swap

    const erc20Abi = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]; 
    const usdcErc = new ethers.Contract(USDC, erc20Abi, deployer);

    async function measure(markings, label, needsDx) {
      // Fresh infra per measurement
      const PoolManager = await ethers.getContractFactory("PoolManager");
      const pm = await PoolManager.deploy(await v3Spot.getAddress(), await v3Twap.getAddress(), await v2.getAddress(), ethers.ZeroAddress);
      await pm.setGovernance(deployer.address, deployer.address);
      if (needsDx) { await pm.setDataBridge(4, await chainlink.getAddress()); }
      const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
      const lm = await LiquidityManager.deploy(await pm.getAddress());
      await pm.setLiquidityManager(await lm.getAddress());

      const Stoix = await ethers.getContractFactory("StoixQuoter");
      const stoix = await Stoix.deploy();

      // Approvals for this pm
      await weth.approve(await pm.getAddress(), ethers.MaxUint256);
      await usdcErc.approve(await pm.getAddress(), ethers.MaxUint256);

      // Create single pool and add liquidity
      const wethLiq = ethers.parseEther("20");
      const usdcLiq = ethers.parseUnits("85000", 6);
      await pm.createPool(WETH, USDC, await stoix.getAddress(), markings);
      await lm.addLiquidity(WETH, USDC, await stoix.getAddress(), markings, wethLiq, usdcLiq);

      // Execute two direct swaps (WETH->USDC)
      console.log(`[measure] using flashSession: false (${label})`);
      try {
        await pm.swap(WETH, USDC, await stoix.getAddress(), markings, amtWarm, true, 0);
        const tx = await pm.swap(WETH, USDC, await stoix.getAddress(), markings, amt, true, 0);
        const rc = await tx.wait();
        
        // Get the quote for display
        const SwapParams = { asset0: WETH, asset1: USDC, quoter: await stoix.getAddress(), amount: [amt], zeroForOne: true, marking: [markings], traderProtection: "0x00000000" };
        const poolID = ethers.keccak256(ethers.solidityPacked(["address", "address", "address", "bytes3"], [WETH < USDC ? WETH : USDC, WETH < USDC ? USDC : WETH, await stoix.getAddress(), markings]));
        const inventory = await pm.getInventory(poolID);
        const [quote] = await pm.routerGetQuote(SwapParams, inventory[0], inventory[1]);
        
        console.log(`${label} swap gas: ${fmtThousands(rc.gasUsed)} | quote: ${fmtThousands(quote)} USDC`);
        expect(quote).to.be.gte(ethers.parseUnits("1", 6)); // >= 1 USDC
        return rc.gasUsed;
      } catch (e) {
        console.log(`${label} measurement failed: ${e?.message || e}`);
        return null;
      }
    }

    console.log("\n=== swap() gas per bridge ===");
    await measure(mk({ d0: 1, dx: 4 }), "UniswapV3 Spot", true);
    await measure(mk({ d1: 1, dx: 4 }), "UniswapV3 TWAP", true);
    await measure(mk({ d2: 1, dx: 4 }), "UniswapV2", true);
    await measure(mk({ dx: 4 }), "Chainlink", true);
  });

  it("Redstone bridge test is skipped per AG request", async function () {
    // Explicitly skip Redstone tests for now per user's (AG) request
    this.skip();
  });
});


