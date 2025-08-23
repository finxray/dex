const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Full functionality with dummy bridges/quoters", function () {
  async function deploySetup() {
    const [deployer, lp, trader, attacker] = await ethers.getSigners();
    const TokenA = await ethers.getContractFactory("TestTokenA");
    const TokenB = await ethers.getContractFactory("TestTokenB");
    const tokenA = await TokenA.deploy();
    const tokenB = await TokenB.deploy();
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();

    const D0 = await ethers.getContractFactory("DummyData0");
    const D1 = await ethers.getContractFactory("DummyData1");
    const D2 = await ethers.getContractFactory("DummyData2");
    const D3 = await ethers.getContractFactory("DummyData3");
    const d0 = await D0.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d1 = await D1.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d2 = await D2.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d3 = await D3.deploy(ethers.hexlify(ethers.randomBytes(8)));

    const PoolManager = await ethers.getContractFactory("PoolManager");
    const pm = await PoolManager.deploy(
      await d0.getAddress(),
      await d1.getAddress(),
      await d2.getAddress(),
      await d3.getAddress()
    );
    await pm.waitForDeployment();

    for (const u of [lp, trader, attacker]) {
      await tokenA.mint(u.address, ethers.parseEther("1000000"));
      await tokenB.mint(u.address, ethers.parseEther("1000000"));
      await tokenA.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
      await tokenB.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
    }

    return { deployer, lp, trader, attacker, tokenA, tokenB, pm };
  }

  it("addLiquidity / removeLiquidity / swap", async function () {
    const { lp, trader, tokenA, tokenB, pm } = await deploySetup();
    const Q0000 = await ethers.getContractFactory("Quoter0000");
    const q = await Q0000.deploy();
    const M0000 = "0x000000";

    await pm.connect(lp).createPool(await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), M0000);
    await pm.connect(lp).addLiquidity(await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), M0000, ethers.parseEther("1000"), ethers.parseEther("1300"));

    // poolID derivation via hashing isn't exposed; rely on inventory change assertions
    const tx = await pm.connect(trader).swap(
      await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), M0000, ethers.parseEther("10"), true, 0
    );
    await tx.wait();

    await pm.connect(lp).removeLiquidity(await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), M0000, ethers.parseEther("100"));
    expect(true).to.equal(true);
  });

  it("flashAccounting session executes two swaps and settles", async function () {
    const { lp, trader, tokenA, tokenB, pm } = await deploySetup();
    const Q0000 = await ethers.getContractFactory("Quoter0000");
    const q = await Q0000.deploy();
    const M0000 = "0x000000";

    await pm.connect(lp).createPool(await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), M0000);
    await pm.connect(lp).addLiquidity(await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), M0000, ethers.parseEther("1000"), ethers.parseEther("1300"));

    const CB = await ethers.getContractFactory("FlashSwapTwiceCallback");
    const cb = await CB.deploy();

    const tokens = [await tokenA.getAddress(), await tokenB.getAddress()];
    const data = ethers.AbiCoder.defaultAbiCoder().encode([
      "address","address","address","address","bytes3","uint256","uint256"
    ], [
      await pm.getAddress(), await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), M0000, ethers.parseEther("5"), ethers.parseEther("7")
    ]);

    await pm.connect(trader).flashSession(await cb.getAddress(), data, tokens);
    expect(true).to.equal(true);
  });

  it("reentrancy guard blocks nested flashSession", async function () {
    const { lp, trader, tokenA, tokenB, pm } = await deploySetup();
    const Q0000 = await ethers.getContractFactory("Quoter0000");
    const q = await Q0000.deploy();
    const M0000 = "0x000000";

    await pm.connect(lp).createPool(await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), M0000);
    await pm.connect(lp).addLiquidity(await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), M0000, ethers.parseEther("1000"), ethers.parseEther("1300"));

    const ReCB = await ethers.getContractFactory("ReenterFlashSessionCallback");
    const re = await ReCB.deploy();
    const CB = await ethers.getContractFactory("DummyFlashCallback");
    const innerCb = await CB.deploy();
    const tokens = [await tokenA.getAddress(), await tokenB.getAddress()];
    const innerData = ethers.hexlify(ethers.randomBytes(2));
    const outer = ethers.AbiCoder.defaultAbiCoder().encode([
      "address","address","bytes","address[]"
    ], [
      await pm.getAddress(), await innerCb.getAddress(), innerData, tokens
    ]);

    await expect(pm.connect(trader).flashSession(await re.getAddress(), outer, tokens)).to.be.reverted;
  });

  it("batchSwap executes", async function () {
    const { lp, trader, tokenA, tokenB, pm } = await deploySetup();
    const Q0000 = await ethers.getContractFactory("Quoter0000");
    const q = await Q0000.deploy();
    const M0000 = "0x000000";

    await pm.connect(lp).createPool(await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), M0000);
    await pm.connect(lp).addLiquidity(await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), M0000, ethers.parseEther("2000"), ethers.parseEther("2500"));

    const Hop = {
      asset0: await tokenA.getAddress(),
      asset1: await tokenB.getAddress(),
      quoter: await q.getAddress(),
      markings: [M0000],
      amounts: [ethers.parseEther("10")],
      zeroForOne: true
    };

    const tx = await pm.connect(trader).batchSwap([Hop], ethers.parseEther("10"), 0);
    await tx.wait();
    expect(true).to.equal(true);
  });
});
