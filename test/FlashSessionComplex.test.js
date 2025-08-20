const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FlashSession complex flow", function () {
  it("should add liquidity, batch swap across pools, and remove liquidity with single net settlement", async function () {
    const [deployer, user] = await ethers.getSigners();

    // Deploy three tokens
    const TokenA = await ethers.getContractFactory("TestTokenA");
    const TokenB = await ethers.getContractFactory("TestTokenB");
    const TokenC = await ethers.getContractFactory("TestTokenB"); // reuse interface for a third ERC20
    const tokenA = await TokenA.deploy();
    await tokenA.waitForDeployment();
    const tokenB = await TokenB.deploy();
    await tokenB.waitForDeployment();
    const tokenC = await TokenC.deploy();
    await tokenC.waitForDeployment();

    // Deploy quoters and data bridge
    const SimpleQuoter = await ethers.getContractFactory("SimpleQuoter");
    const AlphaDataQuoter = await ethers.getContractFactory("AlphaDataQuoter");
    const MockAlphaDataBridge = await ethers.getContractFactory("MockAlphaDataBridge");
    const simpleQuoter = await SimpleQuoter.deploy();
    await simpleQuoter.waitForDeployment();
    const alphaBridge = await MockAlphaDataBridge.deploy(ethers.parseEther("1.3"), ethers.parseEther("1.28"));
    await alphaBridge.waitForDeployment();
    const alphaQuoter = await AlphaDataQuoter.deploy();
    await alphaQuoter.waitForDeployment();

    // Deploy PoolManager
    const PoolManager = await ethers.getContractFactory("PoolManager");
    const poolManager = await PoolManager.deploy(await alphaBridge.getAddress(), await simpleQuoter.getAddress());
    await poolManager.waitForDeployment();

    // Mint and approve balances
    await tokenA.mint(await user.getAddress(), ethers.parseEther("1000"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("1000"));
    await tokenC.mint(await user.getAddress(), ethers.parseEther("1000"));
    await tokenA.connect(user).approve(await poolManager.getAddress(), ethers.parseEther("1000"));
    await tokenB.connect(user).approve(await poolManager.getAddress(), ethers.parseEther("1000"));
    await tokenC.connect(user).approve(await poolManager.getAddress(), ethers.parseEther("1000"));

    // Create pools: A-B (simple), B-C (alpha)
    const SIMPLE = "0x00000C"; // No-data
    const ALPHA = "0x00000E";  // Alpha default
    await poolManager.createPool(await tokenA.getAddress(), await tokenB.getAddress(), await simpleQuoter.getAddress(), SIMPLE);
    await poolManager.createPool(await tokenB.getAddress(), await tokenC.getAddress(), await alphaQuoter.getAddress(), ALPHA);

    // Build a callback contract for the flow
    const Complex = await ethers.getContractFactory("FlashSessionComplexCallback");
    const cb = await Complex.deploy(
      await poolManager.getAddress(),
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      await tokenC.getAddress(),
      await simpleQuoter.getAddress(),
      await alphaQuoter.getAddress(),
      SIMPLE,
      ALPHA,
      ethers.parseEther("50"), // add amounts (keep ratio 1:1 to avoid net debt)
      ethers.parseEther("50"),
      ethers.parseEther("20")  // swap amount A->B then B->C
    );
    await cb.waitForDeployment();

    // Provide generous buffers for settlement safety
    await tokenA.mint(await user.getAddress(), ethers.parseEther("50"));
    await tokenB.mint(await user.getAddress(), ethers.parseEther("50"));
    await tokenC.mint(await user.getAddress(), ethers.parseEther("50"));
    await tokenA.connect(user).approve(await poolManager.getAddress(), ethers.MaxUint256);
    await tokenB.connect(user).approve(await poolManager.getAddress(), ethers.MaxUint256);
    await tokenC.connect(user).approve(await poolManager.getAddress(), ethers.MaxUint256);
    
    // Snapshot user balances before (after buffer mint)
    const beforeA = await tokenA.balanceOf(await user.getAddress());
    const beforeB = await tokenB.balanceOf(await user.getAddress());
    const beforeC = await tokenC.balanceOf(await user.getAddress());
    // Run session
    // Execute the session
    await poolManager.connect(user).flashSession(
      await cb.getAddress(),
      "0x",
      [await tokenA.getAddress(), await tokenB.getAddress(), await tokenC.getAddress()]
    );
    // Verify all deltas are zero after settlement
    const deltas = await poolManager.getUserDeltas(
      await user.getAddress(),
      [await tokenA.getAddress(), await tokenB.getAddress(), await tokenC.getAddress()]
    );

    const afterA = await tokenA.balanceOf(await user.getAddress());
    const afterB = await tokenB.balanceOf(await user.getAddress());
    const afterC = await tokenC.balanceOf(await user.getAddress());

    expect(afterA).to.be.lte(beforeA);
    expect(afterB).to.be.lte(beforeB);
    expect(afterC).to.be.gte(0);
    // All deltas should be zero after settlement
    expect(deltas[0]).to.equal(0n);
    expect(deltas[1]).to.equal(0n);
    expect(deltas[2]).to.equal(0n);
  });
});


