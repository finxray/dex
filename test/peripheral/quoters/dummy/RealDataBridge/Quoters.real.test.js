const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Real Quoters (fixed) wiring", function () {
  it("Deploys V3TWAP+Chainlink and V2+V3TWAP fixed quoters", async function () {
    const MockV3TWAPBridge = await ethers.getContractFactory("MockV3TWAPBridge");
    const v3twap = await MockV3TWAPBridge.deploy();
    const MockChainlinkBridge = await ethers.getContractFactory("MockChainlinkBridge");
    const chainlink = await MockChainlinkBridge.deploy();
    const V3TWAPChainlinkQuoter = await ethers.getContractFactory("V3TWAPChainlinkQuoterFixed");
    const q1 = await V3TWAPChainlinkQuoter.deploy(
      await v3twap.getAddress(),
      await chainlink.getAddress()
    );

    const MockUniV2Bridge = await ethers.getContractFactory("MockUniV2Bridge");
    const u = await MockUniV2Bridge.deploy();
    const MockSushiV2Bridge = await ethers.getContractFactory("MockSushiV2Bridge");
    const s = await MockSushiV2Bridge.deploy();
    const V2V3TWAPQuoter = await ethers.getContractFactory("V2V3TWAPQuoterFixed");
    const q2 = await V2V3TWAPQuoter.deploy(
      await u.getAddress(),
      await s.getAddress(),
      await v3twap.getAddress()
    );
    await q1.waitForDeployment();
    await q2.waitForDeployment();
    expect(await q1.getAddress()).to.properAddress;
    expect(await q2.getAddress()).to.properAddress;
  });
});


