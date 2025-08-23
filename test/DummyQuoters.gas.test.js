const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Dummy quoters - single swap gas", function () {
  it("measures gas for Quoter0000, Quoter1000, Quoter1100, Quoter1110, Quoter1111", async function () {
    const [deployer, lp, trader] = await ethers.getSigners();

    // Tokens
    const TokenA = await ethers.getContractFactory("TestTokenA");
    const TokenB = await ethers.getContractFactory("TestTokenB");
    const tokenA = await TokenA.deploy();
    const tokenB = await TokenB.deploy();
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();

    // Dummy data bridges
    const D0 = await ethers.getContractFactory("DummyData0");
    const D1 = await ethers.getContractFactory("DummyData1");
    const D2 = await ethers.getContractFactory("DummyData2");
    const D3 = await ethers.getContractFactory("DummyData3");
    const d0 = await D0.deploy(ethers.hexlify(ethers.randomBytes(16)));
    const d1 = await D1.deploy(ethers.hexlify(ethers.randomBytes(16)));
    const d2 = await D2.deploy(ethers.hexlify(ethers.randomBytes(16)));
    const d3 = await D3.deploy(ethers.hexlify(ethers.randomBytes(16)));

    // PoolManager with four default bridges
    const PoolManager = await ethers.getContractFactory("PoolManager");
    const pm = await PoolManager.deploy(
      await d0.getAddress(),
      await d1.getAddress(),
      await d2.getAddress(),
      await d3.getAddress()
    );
    await pm.waitForDeployment();

    // Mint and approve tokens
    for (const u of [lp, trader]) {
      await tokenA.mint(u.address, ethers.parseEther("1000000"));
      await tokenB.mint(u.address, ethers.parseEther("1000000"));
      await tokenA.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
      await tokenB.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
    }

    // Deploy quoters
    const Q0000 = await ethers.getContractFactory("Quoter0000");
    const Q1000 = await ethers.getContractFactory("Quoter1000");
    const Q1100 = await ethers.getContractFactory("Quoter1100");
    const Q1110 = await ethers.getContractFactory("Quoter1110");
    const Q1111 = await ethers.getContractFactory("Quoter1111");
    const q0000 = await Q0000.deploy();
    const q1000 = await Q1000.deploy();
    const q1100 = await Q1100.deploy();
    const q1110 = await Q1110.deploy();
    const q1111 = await Q1111.deploy();

    // Markings
    const M0000 = "0x000000"; // no data
    const M1000 = "0x000001"; // data0
    const M1100 = "0x000003"; // data0+data1
    const M1110 = "0x000007"; // data0+data1+data2
    const M1111 = "0x00000F"; // all four

    const L0 = ethers.parseEther("1000");
    const L1 = ethers.parseEther("1300");
    const SWAP = ethers.parseEther("10");

    async function setupPool(quoter, mark) {
      await pm.connect(lp).createPool(await tokenA.getAddress(), await tokenB.getAddress(), await quoter.getAddress(), mark);
      await pm.connect(lp).addLiquidity(await tokenA.getAddress(), await tokenB.getAddress(), await quoter.getAddress(), mark, L0, L1);
    }

    await setupPool(q0000, M0000);
    await setupPool(q1000, M1000);
    await setupPool(q1100, M1100);
    await setupPool(q1110, M1110);
    await setupPool(q1111, M1111);

    async function measure(quoter, mark) {
      const tx = await pm.connect(trader).swap(
        await tokenA.getAddress(), await tokenB.getAddress(), await quoter.getAddress(), mark, SWAP, true, 0
      );
      const rc = await tx.wait();
      return rc.gasUsed;
    }

    const gas0000 = await measure(q0000, M0000);
    const gas1000 = await measure(q1000, M1000);
    const gas1100 = await measure(q1100, M1100);
    const gas1110 = await measure(q1110, M1110);
    const gas1111 = await measure(q1111, M1111);

    console.log("Single swap gas (A->B):");
    console.table([
      { quoter: "0000", gas: gas0000.toString() },
      { quoter: "1000", gas: gas1000.toString() },
      { quoter: "1100", gas: gas1100.toString() },
      { quoter: "1110", gas: gas1110.toString() },
      { quoter: "1111", gas: gas1111.toString() },
    ]);

    expect(true).to.equal(true);
  });
});

describe("Dummy quoters - batchSwap with buckets gas", function () {
  it("executes Quoter1110Batch with 10 buckets and logs gas", async function () {
    const [deployer, lp, trader] = await ethers.getSigners();

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
      await d0.getAddress(), await d1.getAddress(), await d2.getAddress(), await d3.getAddress()
    );
    await pm.waitForDeployment();

    for (const u of [lp, trader]) {
      await tokenA.mint(u.address, ethers.parseEther("1000000"));
      await tokenB.mint(u.address, ethers.parseEther("1000000"));
      await tokenA.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
      await tokenB.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
    }

    const QBatch = await ethers.getContractFactory("Quoter1110Batch");
    const q = await QBatch.deploy();
    function markForBucket(b) { return ethers.hexlify(ethers.toBeHex((b & 0xFFF) << 4 | 0x7, 3)); }

    await pm.connect(lp).createPool(await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), markForBucket(0));
    await pm.connect(lp).addLiquidity(await tokenA.getAddress(), await tokenB.getAddress(), await q.getAddress(), markForBucket(0), ethers.parseEther("3000"), ethers.parseEther("4000"));

    const markings = Array.from({ length: 10 }, (_, i) => markForBucket(i));
    const amounts = markings.map(() => ethers.parseEther("1"));
    const Hop = {
      asset0: await tokenA.getAddress(),
      asset1: await tokenB.getAddress(),
      quoter: await q.getAddress(),
      markings,
      amounts,
      zeroForOne: true
    };

    const tx = await pm.connect(trader).batchSwap([Hop], ethers.parseEther("1"), 0);
    const rc = await tx.wait();
    console.log("batchSwap with 10 buckets gas:", rc.gasUsed.toString());
    expect(true).to.equal(true);
  });
});
