const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Direct swaps vs flash session swaps", function () {
  it("should complete two swaps outside a session and two swaps inside a session; session should leave zero deltas", async function () {
    const [deployer, user] = await ethers.getSigners();

    // Deploy tokens
    const TokenA = await ethers.getContractFactory("TestTokenA");
    const TokenB = await ethers.getContractFactory("TestTokenB");
    const tokenA = await TokenA.deploy();
    await tokenA.waitForDeployment();
    const tokenB = await TokenB.deploy();
    await tokenB.waitForDeployment();

    // Deploy quoter and pool manager
    const SimpleQuoter = await ethers.getContractFactory("SimpleQuoter");
    const simpleQuoter = await SimpleQuoter.deploy();
    await simpleQuoter.waitForDeployment();
    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(await user.getAddress(), await simpleQuoter.getAddress());
    await poolManager.waitForDeployment();

    // Mint and approve
    await tokenA.mint(await user.getAddress(), ethers.parseEther("1000"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("1000"));
    await tokenA.connect(user).approve(await poolManager.getAddress(), ethers.parseEther("1000"));
    await tokenB.connect(user).approve(await poolManager.getAddress(), ethers.parseEther("1000"));

    // Create pool and add liquidity
    const MARK = "0x00000C";
    await poolManager.createPool(await tokenA.getAddress(), await tokenB.getAddress(), await simpleQuoter.getAddress(), MARK);
    await poolManager.connect(user).addLiquidity(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await simpleQuoter.getAddress(),
      MARK,
      ethers.parseEther("500"),
      ethers.parseEther("650")
    );

    // Two direct swaps
    const tx1 = await poolManager.connect(user).swap(
      await tokenA.getAddress(), await tokenB.getAddress(), await simpleQuoter.getAddress(), MARK, ethers.parseEther("10"), true, 1
    );
    const r1 = await tx1.wait();
    const tx2 = await poolManager.connect(user).swap(
      await tokenA.getAddress(), await tokenB.getAddress(), await simpleQuoter.getAddress(), MARK, ethers.parseEther("10"), true, 1
    );
    const r2 = await tx2.wait();

    // Two swaps inside a session
    const Callback = await ethers.getContractFactory("FlashTwoSwapsCallback");
    const cb = await Callback.deploy(
      await poolManager.getAddress(),
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await simpleQuoter.getAddress(),
      MARK,
      ethers.parseEther("10")
    );
    await cb.waitForDeployment();

    const tx3 = await poolManager.connect(user).flashSession(
      await cb.getAddress(), "0x", [await tokenA.getAddress(), await tokenB.getAddress()]
    );
    const r3 = await tx3.wait();

    // Verify zero deltas after session
    const deltas = await poolManager.getUserDeltas(
      await user.getAddress(), [await tokenA.getAddress(), await tokenB.getAddress()]
    );
    expect(deltas[0]).to.equal(0n);
    expect(deltas[1]).to.equal(0n);

    console.table([
      ["Scenario", "Gas Used"],
      ["Direct swap #1", r1.gasUsed.toString()],
      ["Direct swap #2", r2.gasUsed.toString()],
      ["Session: two swaps", r3.gasUsed.toString()],
      ["Direct total", (r1.gasUsed + r2.gasUsed).toString()],
    ]);
  });
});


