const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Real DataBridge: UniswapV3TWAPDataBridge (sanity)", function () {
  it("encodes spot/twap from mock pool interface (requires fork or mock)", async function () {
    // This is a placeholder sanity test verifying constructor & address wiring.
    // Full integration requires a fork with a real V3 factory and pool; here we just deploy with zero addresses.
    const Bridge = await ethers.getContractFactory("UniswapV3TWAPDataBridge");
    const bridge = await Bridge.deploy(
      ethers.ZeroAddress,
      3000,
      60,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await bridge.waitForDeployment();
    expect(await bridge.getAddress()).to.properAddress;
  });
});


