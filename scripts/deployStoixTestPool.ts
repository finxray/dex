import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const initialEth = ethers.parseUnits("1000", 18);
  const initialUsdc = ethers.parseUnits("3_000_000", 6);

  const TestERC20 = await ethers.getContractFactory("TestERC20");
  const weth = await TestERC20.deploy("Stoix Wrapped ETH", "sWETH", 18, initialEth, deployer.address);
  await weth.waitForDeployment();
  console.log("sWETH deployed:", await weth.getAddress());

  const usdc = await TestERC20.deploy("Stoix USD Coin", "sUSDC", 6, initialUsdc, deployer.address);
  await usdc.waitForDeployment();
  console.log("sUSDC deployed:", await usdc.getAddress());

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
  const createTx = await poolManager.createPool(await weth.getAddress(), await usdc.getAddress(), await quoter.getAddress(), markings);
  const receipt = await createTx.wait();
  const eventTopic = ethers.id("PoolCreated(uint256,address,address,address,bytes3)");
  let poolId: bigint | undefined;
  for (const log of receipt?.logs ?? []) {
    if (log.topics[0] === eventTopic) {
      poolId = BigInt(log.topics[1]);
      break;
    }
  }
  console.log("Pool created. ID:", poolId ? poolId.toString() : "unknown");

  const amount0 = ethers.parseUnits("100", 18);
  const amount1 = ethers.parseUnits("300_000", 6);

  await weth.approve(await liquidityManager.getAddress(), amount0);
  await usdc.approve(await liquidityManager.getAddress(), amount1);

  const addTx = await liquidityManager.addLiquidity(
    await weth.getAddress(),
    await usdc.getAddress(),
    await quoter.getAddress(),
    markings,
    amount0,
    amount1
  );
  await addTx.wait();
  console.log("Initial liquidity added.");

  console.log("--- Deployment Summary ---");
  console.log("NEXT_PUBLIC_POOL_MANAGER_ADDRESS=", await poolManager.getAddress());
  console.log("NEXT_PUBLIC_QUOTER_ADDRESS=", await quoter.getAddress());
  console.log("NEXT_PUBLIC_POOL_MARKINGS=", markings);
  console.log("NEXT_PUBLIC_ASSET0_ADDRESS=", await weth.getAddress());
  console.log("NEXT_PUBLIC_ASSET0_SYMBOL=sWETH");
  console.log("NEXT_PUBLIC_ASSET0_DECIMALS=18");
  console.log("NEXT_PUBLIC_ASSET1_ADDRESS=", await usdc.getAddress());
  console.log("NEXT_PUBLIC_ASSET1_SYMBOL=sUSDC");
  console.log("NEXT_PUBLIC_ASSET1_DECIMALS=6");
  console.log("Pool ID:", poolId?.toString() ?? "check events");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

