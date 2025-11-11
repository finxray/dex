const { ethers } = require("hardhat");

// These are the addresses you want to use consistently
const TARGET_ADDRESSES = {
  sWETH: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
  sUSDC: "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0",
};

async function main() {
  console.log("⚠️  IMPORTANT: To get consistent addresses, restart Hardhat node first!");
  console.log("   Then deploy contracts in the exact same order every time.\n");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  // Check current nonce to understand deployment order
  const nonce = await deployer.provider.getTransactionCount(deployer.address);
  console.log("Current nonce:", nonce);
  
  if (nonce > 0) {
    console.warn("⚠️  WARNING: Nonce is not 0. Addresses may not match expected addresses.");
    console.warn("   Restart Hardhat node to reset nonce for consistent addresses.\n");
  }

  const initialEth = ethers.parseUnits("1000", 18);
  const initialUsdc = ethers.parseUnits("3000000", 6);

  const TestERC20 = await ethers.getContractFactory("TestERC20");
  
  console.log("\nDeploying sWETH...");
  const weth = await TestERC20.deploy("Stoix Wrapped ETH", "sWETH", 18, initialEth, deployer.address);
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();
  console.log("sWETH deployed to:", wethAddress);
  
  if (wethAddress.toLowerCase() === TARGET_ADDRESSES.sWETH.toLowerCase()) {
    console.log("✅ sWETH address matches expected!");
  } else {
    console.warn(`⚠️  sWETH address mismatch! Expected: ${TARGET_ADDRESSES.sWETH}`);
    console.warn("   Update .env.local with:", wethAddress);
  }

  console.log("\nDeploying sUSDC...");
  const usdc = await TestERC20.deploy("Stoix USD Coin", "sUSDC", 6, initialUsdc, deployer.address);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("sUSDC deployed to:", usdcAddress);
  
  if (usdcAddress.toLowerCase() === TARGET_ADDRESSES.sUSDC.toLowerCase()) {
    console.log("✅ sUSDC address matches expected!");
  } else {
    console.warn(`⚠️  sUSDC address mismatch! Expected: ${TARGET_ADDRESSES.sUSDC}`);
    console.warn("   Update .env.local with:", usdcAddress);
  }

  // Continue with rest of deployment...
  console.log("\nContinuing with other contracts...");
  
  const MockDataBridge = await ethers.getContractFactory("MockStoixDataBridge");
  const dataBridge = await MockDataBridge.deploy();
  await dataBridge.waitForDeployment();
  console.log("Mock data bridge:", await dataBridge.getAddress());

  const DummyQuoter = await ethers.getContractFactory("MinimalDummyQuoter");
  const quoter = await DummyQuoter.deploy();
  await quoter.waitForDeployment();
  console.log("Dummy quoter:", await quoter.getAddress());

  const PoolManager = await ethers.getContractFactory("PoolManager");
  const poolManager = await PoolManager.deploy(await dataBridge.getAddress());
  await poolManager.waitForDeployment();
  console.log("PoolManager:", await poolManager.getAddress());

  const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
  const liquidityManager = await LiquidityManager.deploy(await poolManager.getAddress());
  await liquidityManager.waitForDeployment();
  console.log("LiquidityManager:", await liquidityManager.getAddress());

  const setTx = await poolManager.setLiquidityManager(await liquidityManager.getAddress());
  await setTx.wait();

  const markings = "0x000000";
  const wethAddr = await weth.getAddress();
  const usdcAddr = await usdc.getAddress();
  const quoterAddr = await quoter.getAddress();
  
  let poolId;
  try {
    poolId = await poolManager.getPoolID(wethAddr, usdcAddr, quoterAddr, markings);
    console.log("Pool already exists. ID:", poolId.toString());
  } catch {
    const createTx = await poolManager.createPool(wethAddr, usdcAddr, quoterAddr, markings);
    const receipt = await createTx.wait();
    const eventTopic = ethers.id("PoolCreated(uint256,address,address,address,bytes3)");
    for (const log of receipt.logs) {
      if (log.topics[0] === eventTopic) {
        poolId = BigInt(log.topics[1]);
        break;
      }
    }
    console.log("Pool created. ID:", poolId ? poolId.toString() : "unknown");
  }

  const amount0 = ethers.parseUnits("100", 18);
  const amount1 = ethers.parseUnits("300000", 6);

  await weth.approve(await poolManager.getAddress(), amount0);
  await usdc.approve(await poolManager.getAddress(), amount1);

  const addTx = await liquidityManager.addLiquidity(
    wethAddr,
    usdcAddr,
    quoterAddr,
    markings,
    amount0,
    amount1
  );
  await addTx.wait();
  console.log("Initial liquidity added.");

  console.log("\n--- Deployment Summary ---");
  console.log("NEXT_PUBLIC_POOL_MANAGER_ADDRESS=" + (await poolManager.getAddress()));
  console.log("NEXT_PUBLIC_QUOTER_ADDRESS=" + (await quoter.getAddress()));
  console.log("NEXT_PUBLIC_POOL_MARKINGS=" + markings);
  console.log("NEXT_PUBLIC_ASSET0_ADDRESS=" + wethAddr);
  console.log("NEXT_PUBLIC_ASSET0_SYMBOL=sWETH");
  console.log("NEXT_PUBLIC_ASSET0_DECIMALS=18");
  console.log("NEXT_PUBLIC_ASSET1_ADDRESS=" + usdcAddr);
  console.log("NEXT_PUBLIC_ASSET1_SYMBOL=sUSDC");
  console.log("NEXT_PUBLIC_ASSET1_DECIMALS=6");
  console.log("Pool ID:", poolId ? poolId.toString() : "check events");
  
  if (wethAddr.toLowerCase() !== TARGET_ADDRESSES.sWETH.toLowerCase() || 
      usdcAddr.toLowerCase() !== TARGET_ADDRESSES.sUSDC.toLowerCase()) {
    console.log("\n⚠️  Addresses don't match expected. To fix:");
    console.log("   1. Stop Hardhat node (Ctrl+C)");
    console.log("   2. Restart: MAINNET_RPC=\"\" npx hardhat node");
    console.log("   3. Run this script again");
    console.log("   4. If still different, update .env.local with the addresses above");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
