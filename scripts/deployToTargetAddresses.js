#!/usr/bin/env node

/**
 * This script deploys contracts to get the specific addresses you want:
 * sWETH: 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
 * sUSDC: 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0
 * 
 * These addresses require deploying with nonce 1 and 2 (after deploying something else first).
 */

const { ethers } = require("hardhat");

const TARGET_ADDRESSES = {
  sWETH: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
  sUSDC: "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying to get target addresses...");
  console.log("Deployer:", deployer.address);
  
  const nonce = await deployer.provider.getTransactionCount(deployer.address);
  console.log("Current nonce:", nonce);
  
  if (nonce !== 0) {
    console.error("❌ Nonce must be 0. Please restart Hardhat node first!");
    process.exit(1);
  }

  // Deploy a dummy contract first to shift nonce to 1
  console.log("\nDeploying dummy contract to shift nonce...");
  const Dummy = await ethers.getContractFactory("TestERC20");
  const dummy = await Dummy.deploy("Dummy", "DUMMY", 18, 0, deployer.address);
  await dummy.waitForDeployment();
  console.log("Dummy deployed at:", await dummy.getAddress());
  console.log("Nonce should now be 1");

  const initialEth = ethers.parseUnits("1000", 18);
  const initialUsdc = ethers.parseUnits("3000000", 6);

  console.log("\nDeploying sWETH (should be at nonce 1)...");
  const weth = await Dummy.deploy("Stoix Wrapped ETH", "sWETH", 18, initialEth, deployer.address);
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();
  console.log("sWETH deployed:", wethAddress);
  
  if (wethAddress.toLowerCase() === TARGET_ADDRESSES.sWETH.toLowerCase()) {
    console.log("✅ sWETH address matches!");
  } else {
    console.warn(`⚠️  Expected ${TARGET_ADDRESSES.sWETH}, got ${wethAddress}`);
  }

  console.log("\nDeploying sUSDC (should be at nonce 2)...");
  const usdc = await Dummy.deploy("Stoix USD Coin", "sUSDC", 6, initialUsdc, deployer.address);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("sUSDC deployed:", usdcAddress);
  
  if (usdcAddress.toLowerCase() === TARGET_ADDRESSES.sUSDC.toLowerCase()) {
    console.log("✅ sUSDC address matches!");
  } else {
    console.warn(`⚠️  Expected ${TARGET_ADDRESSES.sUSDC}, got ${usdcAddress}`);
  }

  console.log("\n--- Update .env.local with these addresses ---");
  console.log(`NEXT_PUBLIC_ASSET0_ADDRESS=${wethAddress}`);
  console.log(`NEXT_PUBLIC_ASSET1_ADDRESS=${usdcAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

