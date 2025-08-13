const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Quoter System Tests", function () {
  let tokenA, tokenB;
  let simpleQuoter, alphaQuoter, betaQuoter, dualQuoter;
  let mockAlphaDataBridge, mockBetaDataBridge;
  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const ASSET0_BALANCE = ethers.parseEther("1000");
  const ASSET1_BALANCE = ethers.parseEther("1300");
  const SWAP_AMOUNT = ethers.parseEther("100");
  const ALPHA_SPOT_PRICE = ethers.parseEther("1.3");
  const ALPHA_TWAP_PRICE = ethers.parseEther("1.28");
  const BETA_SPOT_PRICE = ethers.parseEther("1.32");

  beforeEach(async function () {
    const TestTokenA = await ethers.getContractFactory("TestTokenA");
    tokenA = await TestTokenA.deploy();
    await tokenA.waitForDeployment();

    const TestTokenB = await ethers.getContractFactory("TestTokenB");
    tokenB = await TestTokenB.deploy();
    await tokenB.waitForDeployment();

    const MockAlphaDataBridge = await ethers.getContractFactory("MockAlphaDataBridge");
    mockAlphaDataBridge = await MockAlphaDataBridge.deploy(ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE);
    await mockAlphaDataBridge.waitForDeployment();

    const MockBetaDataBridge = await ethers.getContractFactory("MockBetaDataBridge");
    mockBetaDataBridge = await MockBetaDataBridge.deploy(BETA_SPOT_PRICE);
    await mockBetaDataBridge.waitForDeployment();

    const SimpleQuoter = await ethers.getContractFactory("SimpleQuoter");
    simpleQuoter = await SimpleQuoter.deploy();
    await simpleQuoter.waitForDeployment();

    const AlphaDataQuoter = await ethers.getContractFactory("AlphaDataQuoter");
    alphaQuoter = await AlphaDataQuoter.deploy();
    await alphaQuoter.waitForDeployment();

    const BetaDataQuoter = await ethers.getContractFactory("BetaDataQuoter");
    betaQuoter = await BetaDataQuoter.deploy();
    await betaQuoter.waitForDeployment();

    const DualDataQuoter = await ethers.getContractFactory("DualDataQuoter");
    dualQuoter = await DualDataQuoter.deploy();
    await dualQuoter.waitForDeployment();
  });

  it("SimpleQuoter: zeroForOne and oneForZero", async function () {
    const paramsZero = {
      asset0: await tokenA.getAddress(),
      asset1: await tokenB.getAddress(),
      quoter: await simpleQuoter.getAddress(),
      amount: SWAP_AMOUNT,
      asset0Balance: ASSET0_BALANCE,
      asset1Balance: ASSET1_BALANCE,
      bucketID: 0,
      zeroForOne: true,
    };
    const q0 = await simpleQuoter.quote(paramsZero);
    const expected0 = (SWAP_AMOUNT * ASSET1_BALANCE) / (ASSET0_BALANCE + SWAP_AMOUNT) * 997n / 1000n;
    expect(q0).to.be.closeTo(expected0, ethers.parseEther("0.1"));

    const paramsOne = { ...paramsZero, zeroForOne: false };
    const q1 = await simpleQuoter.quote(paramsOne);
    const expected1 = (SWAP_AMOUNT * ASSET0_BALANCE) / (ASSET1_BALANCE + SWAP_AMOUNT) * 997n / 1000n;
    expect(q1).to.be.closeTo(expected1, ethers.parseEther("0.1"));
  });

  it("AlphaDataQuoter: weighted spot/TWAP and slippage", async function () {
    const alphaData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE]);
    const params = {
      asset0: await tokenA.getAddress(),
      asset1: await tokenB.getAddress(),
      quoter: await alphaQuoter.getAddress(),
      amount: SWAP_AMOUNT,
      asset0Balance: ASSET0_BALANCE,
      asset1Balance: ASSET1_BALANCE,
      bucketID: 0,
      zeroForOne: true,
    };
    const quote = await alphaQuoter.quote(params, alphaData);
    const weighted = (ALPHA_SPOT_PRICE * 70n + ALPHA_TWAP_PRICE * 30n) / 100n;
    const expected = (SWAP_AMOUNT * weighted) / ethers.parseEther("1") * 998n / 1000n;
    expect(quote).to.be.closeTo(expected, ethers.parseEther("0.1"));
  });

  it("BetaDataQuoter: spot with volatility and fee", async function () {
    const betaData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [BETA_SPOT_PRICE]);
    const params = {
      asset0: await tokenA.getAddress(),
      asset1: await tokenB.getAddress(),
      quoter: await betaQuoter.getAddress(),
      amount: SWAP_AMOUNT,
      asset0Balance: ASSET0_BALANCE,
      asset1Balance: ASSET1_BALANCE,
      bucketID: 5,
      zeroForOne: true,
    };
    const quote = await betaQuoter.quote(params, betaData);
    const base = (SWAP_AMOUNT * BETA_SPOT_PRICE) / ethers.parseEther("1");
    const vol = 1000n - (5n % 10n);
    const expected = base * vol / 1000n * 997n / 1000n;
    expect(quote).to.be.closeTo(expected, ethers.parseEther("0.1"));
  });

  it("DualDataQuoter: combined data returns sane value", async function () {
    const alphaData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE]);
    const betaData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [BETA_SPOT_PRICE]);
    const params = {
      asset0: await tokenA.getAddress(),
      asset1: await tokenB.getAddress(),
      quoter: await dualQuoter.getAddress(),
      amount: SWAP_AMOUNT,
      asset0Balance: ASSET0_BALANCE,
      asset1Balance: ASSET1_BALANCE,
      bucketID: 0,
      zeroForOne: true,
    };
    const quote = await dualQuoter.quote(params, alphaData, betaData);
    expect(quote).to.be.gt(0);
    expect(quote).to.be.lt(SWAP_AMOUNT * 2n);
  });
});