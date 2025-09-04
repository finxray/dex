const { expect } = require("chai");
const { ethers } = require("hardhat");

function requireFork(ctx) {
  const isFork = process.env.FORK === "1" || process.env.ALCHEMY_URL || process.env.ALCHEMY_MAINNET_URL;
  if (!isFork) {
    ctx.skip();
  }
}

describe("Real Quoters (fork)", function () {
  it("smoke: environment is forked (noop on non-fork)", async function () {
    const isFork = process.env.FORK === "1" || process.env.ALCHEMY_URL || process.env.ALCHEMY_MAINNET_URL;
    if (!isFork) {
      expect(true).to.equal(true);
      return;
    }
    const chainId = await ethers.provider.send("eth_chainId", []);
    expect(chainId).to.be.a("string");
  });

  it("placeholder: V3TWAP+Chainlink on mainnet fork (noop on non-fork)", async function () {
    const isFork = process.env.FORK === "1" || process.env.ALCHEMY_URL || process.env.ALCHEMY_MAINNET_URL;
    if (!isFork) {
      expect(true).to.equal(true);
      return;
    }
    requireFork(this);
  });
});


