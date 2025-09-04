const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Dummy Quoters basic quotes", function () {
  let asset0Bal = 1_000_000n * 10n ** 18n;
  let asset1Bal = 130_000_000n * 10n ** 18n;
  const amountIn = 1n * 10n ** 18n;

  async function quoteWith(contractName) {
    const Q = await ethers.getContractFactory(contractName);
    const q = await Q.deploy();
    await q.waitForDeployment();
    const routed = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes","bytes","bytes","bytes"],
      [ethers.hexlify(ethers.randomBytes(2)), ethers.hexlify(ethers.randomBytes(2)), "0x", "0x"]
    );
    const params = {
      asset0: ethers.ZeroAddress,
      asset1: ethers.ZeroAddress,
      quoter: await q.getAddress(),
      amount: amountIn,
      asset0Balance: asset0Bal,
      asset1Balance: asset1Bal,
      bucketID: 0,
      zeroForOne: true
    };
    const out = await q.quote.staticCall(params, routed);
    return out;
  }

  it("Quoter0000 returns value", async function () {
    const out = await quoteWith("Quoter0000");
    expect(out).to.be.gt(0n);
  });

  it("Quoter1100 returns value (with 2 data flags)", async function () {
    const out = await quoteWith("Quoter1100");
    expect(out).to.be.gt(0n);
  });

  it("Quoter1110Batch batch returns values", async function () {
    const Q = await ethers.getContractFactory("Quoter1110Batch");
    const q = await Q.deploy();
    await q.waitForDeployment();
    const routed = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes","bytes","bytes","bytes"],
      [ethers.hexlify(ethers.randomBytes(2)), ethers.hexlify(ethers.randomBytes(2)), "0x", "0x"]
    );
    const params = {
      asset0: ethers.ZeroAddress,
      asset1: ethers.ZeroAddress,
      quoter: await q.getAddress(),
      amount: [amountIn, amountIn],
      asset0Balances: [asset0Bal, asset0Bal],
      asset1Balances: [asset1Bal, asset1Bal],
      bucketID: [0, 1],
      zeroForOne: true
    };
    const out = await q.quoteBatch.staticCall(params, routed);
    expect(out.length).to.equal(2);
    expect(out[0]).to.be.gt(0n);
    expect(out[1]).to.be.gt(0n);
  });
});


