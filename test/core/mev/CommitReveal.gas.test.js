const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Commit-Reveal Gas Comparison", function () {
  let deployer, trader, lp;
  let weth, usdc, pm, quoter;

  const WETH_AMOUNT = ethers.parseEther("1000");
  const USDC_AMOUNT = ethers.parseEther("130000");
  const SWAP_AMOUNT = ethers.parseEther("1");
  const marking = "0x000001";
  const MARKING = "0x000001";
  const LIQ_WETH = ethers.parseEther("1000");
  const LIQ_USDC = ethers.parseEther("130000");

  before(async function () {
    [deployer, trader, lp] = await ethers.getSigners();

    const TokenA = await ethers.getContractFactory("TestTokenA");
    const TokenB = await ethers.getContractFactory("TestTokenA");
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
    const liquidityManager = await LiquidityManager.deploy(await pm.getAddress());
    await pm.setLiquidityManager(await liquidityManager.getAddress());

    const DummyQuoter = await ethers.getContractFactory("Quoter0000");
    quoter = await DummyQuoter.deploy();

    for (const u of [trader, lp]) {
      await weth.mint(u.address, ethers.parseEther("10000"));
      await usdc.mint(u.address, ethers.parseEther("13000000"));
      await weth.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
      await usdc.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
    }

    await pm.connect(lp).createPool(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), MARKING);
    await liquidityManager.connect(lp).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), MARKING, LIQ_WETH, LIQ_USDC);
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
