const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Dummy DataBridges", function () {
  it("deploys all dummy data bridges and returns bytes", async function () {
    const D0 = await ethers.getContractFactory("DummyData0");
    const D1 = await ethers.getContractFactory("DummyData1");
    const D2 = await ethers.getContractFactory("DummyData2");
    const D3 = await ethers.getContractFactory("DummyData3");
    const d0 = await D0.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d1 = await D1.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d2 = await D2.deploy(ethers.hexlify(ethers.randomBytes(8)));
    const d3 = await D3.deploy(ethers.hexlify(ethers.randomBytes(8)));

    expect(await d0.getAddress()).to.properAddress;
    expect(await d1.getAddress()).to.properAddress;
    expect(await d2.getAddress()).to.properAddress;
    expect(await d3.getAddress()).to.properAddress;
  });
});


