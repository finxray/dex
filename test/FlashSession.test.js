const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FlashSession end-to-end", function () {
  it("should compose add/remove liquidity in one session with net settlement", async function () {
    const [deployer, user] = await ethers.getSigners();

    // Deploy tokens
    const Token = await ethers.getContractFactory("TestTokenA");
    const tokenA = await Token.deploy();
    await tokenA.waitForDeployment();
    const tokenB = await (await ethers.getContractFactory("TestTokenB")).deploy();
    await tokenB.waitForDeployment();

    // Deploy SimpleQuoter
    const SimpleQuoter = await ethers.getContractFactory("SimpleQuoter");
    const simpleQuoter = await SimpleQuoter.deploy();
    await simpleQuoter.waitForDeployment();

    // Deploy PoolManager
    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(await user.getAddress(), await simpleQuoter.getAddress());
    await poolManager.waitForDeployment();

    // Mint and approve
    await tokenA.mint(await user.getAddress(), ethers.parseEther("1000"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("1000"));
    await tokenA.connect(user).approve(await poolManager.getAddress(), ethers.parseEther("1000"));
    await tokenB.connect(user).approve(await poolManager.getAddress(), ethers.parseEther("1000"));

    // Create pool
    const markings = "0x010203";
    await poolManager.createPool(await tokenA.getAddress(), await tokenB.getAddress(), await simpleQuoter.getAddress(), markings);

    // Deploy callback
    const Callback = await ethers.getContractFactory("FlashSessionCallback");
    const cb = await Callback.deploy(
      await poolManager.getAddress(),
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await simpleQuoter.getAddress(),
      markings,
      ethers.parseEther("10"),
      ethers.parseEther("10")
    );
    await cb.waitForDeployment();

    // Provide a generous buffer right before session to cover rounding/fees
    await tokenA.mint(await user.getAddress(), ethers.parseEther("50"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("50"));
    await tokenA.connect(user).approve(await poolManager.getAddress(), ethers.MaxUint256);
    await tokenB.connect(user).approve(await poolManager.getAddress(), ethers.MaxUint256);

    // Snapshot user balances before (after buffer mint)
    const aBefore = await tokenA.balanceOf(await user.getAddress());
    const bBefore = await tokenB.balanceOf(await user.getAddress());
    // Start flash session
    await poolManager.connect(user).flashSession(await cb.getAddress(), "0x", [await tokenA.getAddress(), await tokenB.getAddress()]);

    // Snapshot after
    const aAfter = await tokenA.balanceOf(await user.getAddress());
    const bAfter = await tokenB.balanceOf(await user.getAddress());

    // After add then remove same liquidity within session, balances should be unchanged
    expect(aAfter).to.equal(aBefore);
    expect(bAfter).to.equal(bBefore);
  });
});


