const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Ultra-Efficient Governance Test", function () {
  let deployer, protocol, emergency, trader, lp;
  let weth, usdc, pm, quoter;

  const WETH_AMOUNT = ethers.parseEther("1000");
  const USDC_AMOUNT = ethers.parseEther("130000");
  const SWAP_AMOUNT = ethers.parseEther("10");

  // Updated: protocol flag uses high bit 0x010000 to avoid collisions with data bits
  const BASE_POOL = "0x000000";      // No governance flag - zero overhead
  const PROTOCOL_POOL = "0x010000";  // Protocol flag (bit 16) - minimal overhead

  before(async function () {
    [deployer, protocol, emergency, trader, lp] = await ethers.getSigners();

    // Deploy test tokens
    const MockWETH = await ethers.getContractFactory("TestTokenA");
    const MockUSDC = await ethers.getContractFactory("TestTokenB");
    weth = await MockWETH.deploy();
    usdc = await MockUSDC.deploy();
    await weth.waitForDeployment();
    await usdc.waitForDeployment();

    // Deploy dummy data bridges
    const D0 = await ethers.getContractFactory("DummyData0");
    const D1 = await ethers.getContractFactory("DummyData1");
    const D2 = await ethers.getContractFactory("DummyData2");
    const D3 = await ethers.getContractFactory("DummyData3");
    const d0 = await D0.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d1 = await D1.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d2 = await D2.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d3 = await D3.deploy(ethers.hexlify(ethers.randomBytes(8)));

    // Deploy PoolManager
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await PoolManager.deploy(
      await d0.getAddress(),
      await d1.getAddress(),
      await d2.getAddress(),
      await d3.getAddress()
    );
    await pm.waitForDeployment();

    // Set governance addresses
    await pm.setGovernance(protocol.address, emergency.address);

    // Deploy quoter
    const Q1100 = await ethers.getContractFactory("Quoter1100");
    quoter = await Q1100.deploy();
    await quoter.waitForDeployment();

    // Setup tokens
    for (const user of [trader, lp, protocol]) {
      await weth.mint(user.address, ethers.parseEther("20000"));
      await usdc.mint(user.address, ethers.parseEther("26000000"));
      await weth.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
      await usdc.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
    }

    console.log("\\n=== ULTRA-EFFICIENT GOVERNANCE TEST (HIGH-BIT FLAG) ===");
  });

  describe("Your Optimized Design Benchmark", function () {
    let baseGas, protocolGas;

    it("Base pool: Zero governance overhead (flag bypasses all logic)", async function () {
      await pm.connect(lp).createPool(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), BASE_POOL);
      await pm.connect(lp).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), BASE_POOL, WETH_AMOUNT, USDC_AMOUNT);

      const tx = await pm.connect(trader).swap(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), BASE_POOL, SWAP_AMOUNT, true, 0);
      baseGas = (await tx.wait()).gasUsed;
      console.log("Base gas:", baseGas.toString());
      expect(baseGas).to.be.greaterThan(0n);
    });

    it("Protocol pool: Minimal overhead (flag + single SLOAD)", async function () {
      await pm.connect(protocol).createPool(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), PROTOCOL_POOL);
      await pm.connect(protocol).addLiquidity(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), PROTOCOL_POOL, WETH_AMOUNT, USDC_AMOUNT);

      const tx = await pm.connect(trader).swap(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), PROTOCOL_POOL, SWAP_AMOUNT, true, 0);
      protocolGas = (await tx.wait()).gasUsed;

      const overhead = protocolGas - baseGas;
      const overheadPct = Number((Number(overhead) / Number(baseGas)) * 100).toFixed(2);
      console.log("Protocol gas:", protocolGas.toString());
      console.log("Overhead:", overhead.toString(), `(+${overheadPct}%)`);

      // Target overhead: ~= one cold SLOAD (~2100) + tiny logic
      expect(overhead).to.be.lessThan(2500n);
    });
  });
});


