const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Extra Bridge Slot (dx) routing", function () {
  let deployer, protocol, trader, lp;
  let weth, usdc, pm, dxQuoter, extraBridge, liquidityManager;

  const WETH_AMOUNT = ethers.parseEther("1000");
  const USDC_AMOUNT = ethers.parseUnits("130000", 6);
  const SWAP_AMOUNT = ethers.parseEther("10");

  // Use overall slot 10 (in range 4..15) → internal index 6
  const OVERALL_SLOT = 10;

  // Helper to compose markings: data0..3 off, bucketID=0, extra=slot
  function markingsWithExtra(extraSlot) {
    const value = (BigInt(extraSlot & 0xF) << 20n);
    const hex = '0x' + value.toString(16).padStart(6, '0');
    return hex;
  }

  it("routes dx from configurable slot 10 and quoter sees it", async function () {
    [deployer, protocol, trader, lp] = await ethers.getSigners();

    const A = await ethers.getContractFactory("TestTokenA");
    const B = await ethers.getContractFactory("TestTokenB");
    weth = await A.deploy();
    usdc = await B.deploy();
    await weth.waitForDeployment();
    await usdc.waitForDeployment();

    // Dummy bridges
    const D0 = await ethers.getContractFactory("DummyData0");
    const D1 = await ethers.getContractFactory("DummyData1");
    const D2 = await ethers.getContractFactory("DummyData2");
    const D3 = await ethers.getContractFactory("DummyData3");
    const d0 = await D0.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d1 = await D1.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d2 = await D2.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d3 = await D3.deploy(ethers.hexlify(ethers.randomBytes(8)));

    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(
      await d0.getAddress(),
      await d1.getAddress(),
      await d2.getAddress(),
      await d3.getAddress()
    );
    await pm.waitForDeployment();

    // Wire LiquidityManager
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    liquidityManager = await LiquidityManager.deploy(await pm.getAddress());
    await pm.setLiquidityManager(await liquidityManager.getAddress());

    // Set protocol/ emergency multisigs to allow setDataBridge
    await pm.setGovernance(protocol.address, protocol.address);

    // Deploy extra data bridge and set into slot 10
    const Dextra = await ethers.getContractFactory("DummyData0");
    extraBridge = await Dextra.deploy(ethers.hexlify(ethers.randomBytes(8)));
    await pm.connect(protocol).setDataBridge(OVERALL_SLOT, await extraBridge.getAddress());

    const QDX = await ethers.getContractFactory("QuoterDXLogger");
    dxQuoter = await QDX.deploy();

    // Setup balances and approvals
    for (const user of [trader, lp, protocol]) {
      await weth.mint(user.address, ethers.parseEther("20000"));
      await usdc.mint(user.address, ethers.parseUnits("26000000", 6));
      await weth.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
      await usdc.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
    }

    // Create pool with markings that set extra bridge slot 10
    const markings = markingsWithExtra(OVERALL_SLOT);
    await pm.connect(lp).createPool(await weth.getAddress(), await usdc.getAddress(), await dxQuoter.getAddress(), markings);
    await liquidityManager.connect(lp).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await dxQuoter.getAddress(), markings, WETH_AMOUNT, USDC_AMOUNT);

    // Swap and assert DXSeen event indicates non-zero dx length
    const tx = await pm.connect(trader).swap(await weth.getAddress(), await usdc.getAddress(), await dxQuoter.getAddress(), markings, SWAP_AMOUNT, true, 0);
    const receipt = await tx.wait();
    const qaddr = await dxQuoter.getAddress();
    const topic = (await dxQuoter.interface.getEvent("DXSeen")).topicHash;
    const logs = receipt.logs.filter(l => l.address.toLowerCase() === qaddr.toLowerCase() && l.topics[0] === topic);
    expect(logs.length).to.be.greaterThan(0);
    const parsed = dxQuoter.interface.parseLog(logs[0]);
    expect(parsed.args.dxLen).to.be.greaterThan(0n);
  });
});


