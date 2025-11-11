const { ethers } = require("hardhat");

// Fixed addresses for consistent deployments
const EXPECTED_ADDRESSES = {
  sWETH: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
  sUSDC: "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0",
};

async function isContract(address, provider) {
  try {
    const code = await provider.getCode(address);
    return code !== "0x" && code.length > 2;
  } catch {
    return false;
  }
}

async function checkGasPrice(provider) {
  try {
    const block = await provider.getBlock('latest');
    if (block && block.baseFeePerGas) {
      const baseFee = block.baseFeePerGas;
      // If base fee is above 5 gwei, it's too high
      const threshold = ethers.parseUnits('5', 'gwei');
      if (baseFee > threshold) {
        console.warn(`⚠️  WARNING: Base fee is very high (${ethers.formatUnits(baseFee, 'gwei')} gwei)`);
        console.warn('   This may cause deployment failures. Consider restarting Hardhat node.');
        return false;
      }
    }
    return true;
  } catch {
    return true; // Assume OK if we can't check
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  // Check gas price before deploying
  const gasOk = await checkGasPrice(deployer.provider);
  if (!gasOk) {
    console.error('\n❌ Gas prices are too high. Please restart Hardhat node:');
    console.error('   1. Stop node (Ctrl+C)');
    console.error('   2. Run: MAINNET_RPC="" npx hardhat node');
    console.error('   3. Run this script again\n');
    process.exit(1);
  }

  // Mint different amounts so user can verify tokens were imported correctly
  const initialEth = ethers.parseUnits("5000", 18);  // 5000 sWETH (not 900)
  const initialUsdc = ethers.parseUnits("15000000", 6);  // 15,000,000 sUSDC (not 2.7M)

  // Check if contracts already exist at expected addresses
  const wethExists = await isContract(EXPECTED_ADDRESSES.sWETH, deployer.provider);
  const usdcExists = await isContract(EXPECTED_ADDRESSES.sUSDC, deployer.provider);

  let weth, usdc;

  if (wethExists) {
    console.log("sWETH already deployed at:", EXPECTED_ADDRESSES.sWETH);
    weth = await ethers.getContractAt("TestERC20", EXPECTED_ADDRESSES.sWETH);
  } else {
    const TestERC20 = await ethers.getContractFactory("TestERC20");
    weth = await TestERC20.deploy("Stoix Wrapped ETH", "sWETH", 18, initialEth, deployer.address);
    await weth.waitForDeployment();
    const wethAddress = await weth.getAddress();
    console.log("sWETH deployed:", wethAddress);
    if (wethAddress.toLowerCase() !== EXPECTED_ADDRESSES.sWETH.toLowerCase()) {
      console.warn(`⚠️  WARNING: sWETH deployed to ${wethAddress}, expected ${EXPECTED_ADDRESSES.sWETH}`);
      console.warn("   Restart Hardhat node and redeploy to get consistent addresses.");
    }
  }

  if (usdcExists) {
    console.log("sUSDC already deployed at:", EXPECTED_ADDRESSES.sUSDC);
    usdc = await ethers.getContractAt("TestERC20", EXPECTED_ADDRESSES.sUSDC);
  } else {
    const TestERC20 = await ethers.getContractFactory("TestERC20");
    usdc = await TestERC20.deploy("Stoix USD Coin", "sUSDC", 6, initialUsdc, deployer.address);
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();
    console.log("sUSDC deployed:", usdcAddress);
    if (usdcAddress.toLowerCase() !== EXPECTED_ADDRESSES.sUSDC.toLowerCase()) {
      console.warn(`⚠️  WARNING: sUSDC deployed to ${usdcAddress}, expected ${EXPECTED_ADDRESSES.sUSDC}`);
      console.warn("   Restart Hardhat node and redeploy to get consistent addresses.");
    }
  }

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
  
  // Check if pool already exists
  const wethAddress = await weth.getAddress();
  const usdcAddress = await usdc.getAddress();
  const quoterAddress = await quoter.getAddress();
  
  // Try to get pool ID (this will fail if pool doesn't exist, which is fine)
  let poolId;
  try {
    poolId = await poolManager.getPoolID(wethAddress, usdcAddress, quoterAddress, markings);
    console.log("Pool already exists. ID:", poolId.toString());
  } catch {
    // Pool doesn't exist, create it
    const createTx = await poolManager.createPool(wethAddress, usdcAddress, quoterAddress, markings);
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
    await weth.getAddress(),
    await usdc.getAddress(),
    await quoter.getAddress(),
    markings,
    amount0,
    amount1
  );
  await addTx.wait();
  console.log("Initial liquidity added.");

  // Calculate and display exchange rate
  const wethAmount = parseFloat(ethers.formatUnits(amount0, 18));
  const usdcAmount = parseFloat(ethers.formatUnits(amount1, 6));
  const exchangeRate = usdcAmount / wethAmount; // USDC per sWETH
  
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("📊 EXCHANGE RATE INFORMATION");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Initial Pool Liquidity:`);
  console.log(`  ${wethAmount} sWETH`);
  console.log(`  ${usdcAmount.toLocaleString()} sUSDC`);
  console.log(`\n💱 Exchange Rate: 1 sWETH = ${exchangeRate.toLocaleString()} sUSDC`);
  console.log(`   (or 1 sUSDC = ${(1/exchangeRate).toFixed(6)} sWETH)`);
  console.log(`\n⚠️  Compare this rate with the UI displayed rate!`);
  console.log("═══════════════════════════════════════════════════════\n");
  
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("🦊 METAMASK TOKEN IMPORT ADDRESSES");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`\nsWETH Token Address:`);
  console.log(`  ${wethAddress}`);
  console.log(`  Symbol: sWETH`);
  console.log(`  Decimals: 18`);
  console.log(`  Your Balance: ${parseFloat(ethers.formatUnits(initialEth, 18)).toLocaleString()} sWETH`);
  console.log(`\nsUSDC Token Address:`);
  console.log(`  ${usdcAddress}`);
  console.log(`  Symbol: sUSDC`);
  console.log(`  Decimals: 6`);
  console.log(`  Your Balance: ${parseFloat(ethers.formatUnits(initialUsdc, 6)).toLocaleString()} sUSDC`);
  console.log(`\n📝 To import in MetaMask:`);
  console.log(`  1. Open MetaMask`);
  console.log(`  2. Go to Assets tab`);
  console.log(`  3. Click "Import tokens"`);
  console.log(`  4. Paste the address above`);
  console.log(`  5. Token symbol and decimals should auto-fill`);
  console.log(`  6. Click "Add Custom Token"`);
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("\n--- Deployment Summary ---");
  console.log("NEXT_PUBLIC_POOL_MANAGER_ADDRESS=" + (await poolManager.getAddress()));
  console.log("NEXT_PUBLIC_QUOTER_ADDRESS=" + (await quoter.getAddress()));
  console.log("NEXT_PUBLIC_POOL_MARKINGS=" + markings);
  console.log("NEXT_PUBLIC_ASSET0_ADDRESS=" + wethAddress);
  console.log("NEXT_PUBLIC_ASSET0_SYMBOL=sWETH");
  console.log("NEXT_PUBLIC_ASSET0_DECIMALS=18");
  console.log("NEXT_PUBLIC_ASSET1_ADDRESS=" + usdcAddress);
  console.log("NEXT_PUBLIC_ASSET1_SYMBOL=sUSDC");
  console.log("NEXT_PUBLIC_ASSET1_DECIMALS=6");
  console.log("Pool ID:", poolId ? poolId.toString() : "check events");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

