const { expect } = require("chai");
const { ethers } = require("hardhat");

function requireFork(ctx) {
  const isFork = process.env.FORK === "1" || process.env.ALCHEMY_URL || process.env.ALCHEMY_MAINNET_URL;
  if (!isFork) {
    ctx.skip();
  }
}

describe("Real DataBridges (fork)", function () {
  it("smoke: environment is forked (noop on non-fork)", async function () {
    const isFork = process.env.FORK === "1" || process.env.ALCHEMY_URL || process.env.ALCHEMY_MAINNET_URL;
    if (!isFork) {
      expect(true).to.equal(true);
      return;
    }
    const block = await ethers.provider.getBlock("latest");
    expect(block).to.have.property("number");
  });

  it("placeholder: UniswapV3 TWAP fetch (noop on non-fork)", async function () {
    const isFork = process.env.FORK === "1" || process.env.ALCHEMY_URL || process.env.ALCHEMY_MAINNET_URL;
    if (!isFork) {
      expect(true).to.equal(true);
      return;
    }
    requireFork(this);
  });
});


