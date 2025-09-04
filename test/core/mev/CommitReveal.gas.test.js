const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Commit-Reveal Gas Comparison", function () {
  let deployer, trader;
  let weth, usdc, pm, quoter;

  const WETH_AMOUNT = ethers.parseEther("1000");
  const USDC_AMOUNT = ethers.parseEther("130000");
  const SWAP_AMOUNT = ethers.parseEther("1");
  const marking = "0x000001";

  before(async function () {
    [deployer, trader] = await ethers.getSigners();

    const MockWETH = await ethers.getContractFactory("TestTokenA");
    const MockUSDC = await ethers.getContractFactory("TestTokenB");
    weth = await MockWETH.deploy();
    usdc = await MockUSDC.deploy();

    const D0 = await ethers.getContractFactory("DummyData0");
    const d0 = await D0.deploy(ethers.hexlify(ethers.randomBytes(8)));

    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(await d0.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);

    const Q1100 = await ethers.getContractFactory("Quoter1100");
    quoter = await Q1100.deploy();

    // Setup tokens and approvals
    await weth.mint(deployer.address, ethers.parseEther("10000"));
    await usdc.mint(deployer.address, ethers.parseEther("1300000"));
    await weth.mint(trader.address, ethers.parseEther("10000"));
    await usdc.mint(trader.address, ethers.parseEther("1300000"));
    
    await weth.connect(deployer).approve(await pm.getAddress(), ethers.MaxUint256);
    await usdc.connect(deployer).approve(await pm.getAddress(), ethers.MaxUint256);
    await weth.connect(trader).approve(await pm.getAddress(), ethers.MaxUint256);
    await usdc.connect(trader).approve(await pm.getAddress(), ethers.MaxUint256);

    // Create and fund pool
    await pm.createPool(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking);
    await pm.addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking, WETH_AMOUNT, USDC_AMOUNT);
  });

  it("measures gas: normal swap vs commit-reveal", async function () {
    // Baseline: Normal swap
    const normalTx = await pm.connect(trader).swap(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      SWAP_AMOUNT,
      true,
      0
    );
    const normalReceipt = await normalTx.wait();
    const normalGas = normalReceipt.gasUsed;

    // Commit-Reveal: Phase 1 - Commit
    const nonce = await pm.getCommitNonce(trader.address);
    const salt = ethers.randomBytes(32);
    
    const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "bytes3", "uint256", "bool", "uint256", "uint64", "address", "bytes32"],
      [await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), marking, SWAP_AMOUNT, true, 0, nonce, trader.address, salt]
    ));

    const commitTx = await pm.connect(trader).commitSwap(commitment);
    const commitReceipt = await commitTx.wait();
    const commitGas = commitReceipt.gasUsed;

    // Wait for next block
    await ethers.provider.send("evm_mine", []);

    // Commit-Reveal: Phase 2 - Execute
    const executeTx = await pm.connect(trader).executeCommittedSwap(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      SWAP_AMOUNT,
      true,
      0,
      nonce,
      salt
    );
    const executeReceipt = await executeTx.wait();
    const executeGas = executeReceipt.gasUsed;

    // Results
    const totalCommitRevealGas = commitGas + executeGas;
    const overhead = totalCommitRevealGas - normalGas;
    const overheadPercent = (overhead * 100n) / normalGas;

    console.log("\n=== Gas Comparison Results ===");
    console.log("Normal swap gas:", normalGas.toString());
    console.log("Commit gas:", commitGas.toString());
    console.log("Execute gas:", executeGas.toString());
    console.log("Total commit-reveal gas:", totalCommitRevealGas.toString());
    console.log("Overhead:", overhead.toString(), `(+${overheadPercent}%)`);
    console.log("================================");

    // Verify functionality
    expect(normalGas).to.be.gt(0n);
    expect(commitGas).to.be.gt(0n);
    expect(executeGas).to.be.gt(0n);
    expect(totalCommitRevealGas).to.be.gt(normalGas);
  });

  it("measures gas: disabled trader protection overhead", async function () {
    // This tests the overhead of the trader protection flag check when disabled
    // Should be minimal (just a bit check)
    
    const tx1 = await pm.connect(trader).swap(
      await weth.getAddress(),
      await usdc.getAddress(),
      await quoter.getAddress(),
      marking,
      SWAP_AMOUNT,
      true,
      0
    );
    const receipt1 = await tx1.wait();
    
    console.log("\nNormal swap gas (with trader protection field):", receipt1.gasUsed.toString());
    console.log("Note: This includes the new traderProtection field overhead");
    
    expect(receipt1.gasUsed).to.be.gt(0n);
  });
});
