const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Enhanced Context Routing", function () {
  let deployer, lp, trader, pm, weth, usdc, liquidityManager;

  const WETH_AMOUNT = ethers.parseEther("100");
  const USDC_AMOUNT = ethers.parseUnits("450000", 6);
  const SWAP_AMOUNT = ethers.parseEther("1");

  before(async function () {
    [deployer, lp, trader] = await ethers.getSigners();

    const TokenA = await ethers.getContractFactory("TestTokenA");
    const TokenB = await ethers.getContractFactory("TestTokenB");
    weth = await TokenA.deploy();
    usdc = await TokenB.deploy();

    const D0 = await ethers.getContractFactory("DummyData0");
    const D1 = await ethers.getContractFactory("DummyData1");
    const D2 = await ethers.getContractFactory("DummyData2");
    const D3 = await ethers.getContractFactory("DummyData3");
    const priceBytes = ethers.AbiCoder.defaultAbiCoder().encode(["uint256","uint256"],[ethers.parseUnits("4500",18), BigInt(Math.floor(Date.now()/1000))]);
    const d0 = await D0.deploy(priceBytes);
    const d1 = await D1.deploy(priceBytes);
    const d2 = await D2.deploy(priceBytes);
    const d3 = await D3.deploy(priceBytes);

    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(
      await d0.getAddress(),
      await d1.getAddress(),
      await d2.getAddress(),
      await d3.getAddress()
    );

    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    liquidityManager = await LiquidityManager.deploy(await pm.getAddress());
    await pm.setLiquidityManager(await liquidityManager.getAddress());

    for (const u of [lp, trader]) {
      await weth.mint(u.address, ethers.parseEther("1000"));
      await usdc.mint(u.address, ethers.parseUnits("4500000", 6));
      await weth.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
      await usdc.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
    }
  });

  it("Base quoter: no context overhead", async function () {
    const Q = await ethers.getContractFactory("Quoter0000");
    const quoter = await Q.deploy();
    const marking = "0x000001"; // d0

    await pm.connect(lp).createPool(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking);
    await liquidityManager.connect(lp).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking, WETH_AMOUNT, USDC_AMOUNT);

    const tx = await pm.connect(trader).swap(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking, SWAP_AMOUNT, true, 0);
    const rc = await tx.wait();
    expect(rc.gasUsed).to.be.gt(0n);
  });

  it("Context quoter: decodes context and shows overhead", async function () {
    const Q = await ethers.getContractFactory("QuoterCtxLogger");
    const quoter = await Q.deploy();
    const marking = "0x000001"; // d0

    await pm.connect(lp).createPool(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking);
    await liquidityManager.connect(lp).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking, WETH_AMOUNT, USDC_AMOUNT);

    const tx = await pm.connect(trader).swap(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking, SWAP_AMOUNT, true, 0);
    const rc = await tx.wait();
    expect(rc.gasUsed).to.be.gt(0n);
  });

  it("Context decode (no emit): measures pure routing+decode overhead", async function () {
    const Q = await ethers.getContractFactory("QuoterCtxDecode");
    const quoter = await Q.deploy();
    const marking = "0x000001"; // d0

    await pm.connect(lp).createPool(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking);
    await liquidityManager.connect(lp).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking, WETH_AMOUNT, USDC_AMOUNT);

    const tx = await pm.connect(trader).swap(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking, SWAP_AMOUNT, true, 0);
    const rc = await tx.wait();
    expect(rc.gasUsed).to.be.gt(0n);
  });
});


