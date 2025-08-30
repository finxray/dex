const { ethers } = require("hardhat");

async function debugRedStone() {
  console.log("🔍 RedStone Price Debug");
  
  try {
    // Deploy TokenAliasRegistry
    const TokenAliasRegistry = await ethers.getContractFactory("TokenAliasRegistry");
    const aliasRegistry = await TokenAliasRegistry.deploy();
    
    // Deploy RedStone bridge
    const RedstoneOnDemandBridge = await ethers.getContractFactory("RedstoneOnDemandBridgeImpl");
    const bridge = await RedstoneOnDemandBridge.deploy(await aliasRegistry.getAddress());
    
    console.log("✅ RedStone bridge deployed");
    
    // Try to get individual feed data
    const { DataServiceWrapper } = require("@redstone-finance/evm-connector");
    
    const dsWrapper = new DataServiceWrapper({
      dataServiceId: "redstone-primary-prod",
      dataPackagesIds: ["ETH", "USDC"],
      authorizedSigners: [
        "0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774",
        "0xdEB22f54738d54976C4c0fe5ce6d408E40d88499",
        "0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202"
      ],
      uniqueSignersCount: 3,
      hideMetadata: false,
      maxTimestampDeviationMS: 300000,
      waitForAllGatewaysTimeMs: 1500,
    });
    
    console.log("📡 Fetching RedStone data...");
    
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    
    const params = {
      asset0: USDC,  // USDC
      asset1: WETH,  // WETH
      quoter: ethers.ZeroAddress,
      amount: 0,
      asset0Balance: 0,
      asset1Balance: 0,
      bucketID: 0,
      zeroForOne: true
    };
    
    const payload = await dsWrapper.getRedstonePayloadForManualUsage(bridge);
    const iface = bridge.interface;
    const data = iface.encodeFunctionData("getData", [params]) + payload.slice(2);
    
    console.log("🔍 Calling RedStone bridge with payload...");
    const res = await ethers.provider.call({ to: await bridge.getAddress(), data });
    const [bytesResult] = iface.decodeFunctionResult("getData", res);
    const [spot, updatedAt] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], bytesResult);
    
    console.log("\n📊 RedStone Results:");
    console.log(`   Raw spot: ${spot.toString()}`);
    console.log(`   As decimal: ${ethers.formatUnits(spot, 18)}`);
    console.log(`   Timestamp: ${updatedAt} (${new Date(Number(updatedAt)).toISOString()})`);
    
    // This should be USDC/WETH (how many WETH per USDC)
    // To get USDC per WETH (price of WETH in USDC), we invert
    const invertedSpot = BigInt(1e36) / BigInt(spot);
    const priceUSDCperWETH = Number(ethers.formatUnits(invertedSpot, 18));
    
    console.log("\n💰 Price Analysis:");
    console.log(`   USDC/WETH ratio: ${ethers.formatUnits(spot, 18)}`);
    console.log(`   USDC per WETH: ${priceUSDCperWETH.toFixed(2)}`);
    
    // Compare with expected range
    const expectedRange = [4500, 5000];
    if (priceUSDCperWETH < expectedRange[0] || priceUSDCperWETH > expectedRange[1]) {
      console.log(`❌ Price ${priceUSDCperWETH} is outside expected range ${expectedRange[0]}-${expectedRange[1]}`);
    } else {
      console.log(`✅ Price ${priceUSDCperWETH} is within expected range`);
    }
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

debugRedStone();
