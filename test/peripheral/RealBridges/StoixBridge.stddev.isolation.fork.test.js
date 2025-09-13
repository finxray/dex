const { expect } = require("chai");
const { ethers, network } = require("hardhat");

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, "0x1000000000000000000"]);
  return await ethers.getSigner(addr);
}

describe("StoixBridge Standard Deviation Isolation Test (Fork)", function () {
  let bridge, user;
  
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const CHAINLINK_FEED_REGISTRY = "0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf";
  
  beforeEach(async function () {
    [user] = await ethers.getSigners();
    
    // Deploy StoixDataBridge with dummy addresses (only testing std dev functionality)
    // Since individual bridges are deleted, use dummy addresses for constructor
    const dummyAddr = ethers.ZeroAddress;
    
    const StoixDB = await ethers.getContractFactory("StoixDataBridge");
    bridge = await StoixDB.deploy(dummyAddr, dummyAddr, dummyAddr, dummyAddr);
    await bridge.waitForDeployment();
  });
  
  it("should test standard deviation functions in isolation", async function () {
    console.log("=== TESTING STANDARD DEVIATION FUNCTIONS IN ISOLATION ===\n");
    
    const params = {
      asset0: WETH,
      asset1: USDC,
      quoter: ethers.ZeroAddress, // Not used for stddev
      amount: 0n, // Not used for stddev
      asset0Balance: 0n,
      asset1Balance: 0n,
      bucketID: 0n,
      zeroForOne: true,
      functionFlags: 0 // Not used for stddev
    };
    
    console.log("Testing with WETH/USDC pair on Uniswap V3 (0.3% fee tier)");
    console.log("Using 20 data points for volatility calculation\n");
    
    // Test standard deviation short (15 minutes)
    console.log("=== STANDARD DEVIATION SHORT (15 minutes) ===");
    try {
      const stdShortGas = await bridge.getData.estimateGas({ ...params, functionFlags: 0x20 }); // Only stddev short flag
      const stdShortData = await bridge.getData.staticCall({ ...params, functionFlags: 0x20 });
      
      const [mask, , , , , , sdShort] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"], 
        stdShortData
      );
      
      console.log("Gas cost:", stdShortGas.toString());
      console.log("Data mask:", "0b" + mask.toString(2).padStart(8, '0'));
      console.log("Standard deviation (short):", sdShort.toString());
      console.log("Volatility level:", sdShort > 0 ? (Number(sdShort) / 100).toFixed(2) + " basis points" : "No data");
      
    } catch (error) {
      console.log("Error:", error.message);
    }
    
    // Test standard deviation long (1 day)
    console.log("\n=== STANDARD DEVIATION LONG (1 day) ===");
    try {
      const stdLongGas = await bridge.getData.estimateGas({ ...params, functionFlags: 0x40 }); // Only stddev long flag
      const stdLongData = await bridge.getData.staticCall({ ...params, functionFlags: 0x40 });
      
      const [mask, , , , , , , sdLong] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"], 
        stdLongData
      );
      
      console.log("Gas cost:", stdLongGas.toString());
      console.log("Data mask:", "0b" + mask.toString(2).padStart(8, '0'));
      console.log("Standard deviation (long):", sdLong.toString());
      console.log("Volatility level:", sdLong > 0 ? (Number(sdLong) / 100).toFixed(2) + " basis points" : "No data");
      
    } catch (error) {
      console.log("Error:", error.message);
    }
    
    // Test both together
    console.log("\n=== BOTH STANDARD DEVIATIONS TOGETHER ===");
    try {
      const bothGas = await bridge.getData.estimateGas({ ...params, functionFlags: 0x60 }); // Both stddev flags
      const bothData = await bridge.getData.staticCall({ ...params, functionFlags: 0x60 });
      
      const [mask, , , , , , sdShort, sdLong] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"], 
        bothData
      );
      
      console.log("Gas cost:", bothGas.toString());
      console.log("Data mask:", "0b" + mask.toString(2).padStart(8, '0'));
      console.log("Standard deviation (short):", sdShort.toString(), "->", (Number(sdShort) / 100).toFixed(2), "bp");
      console.log("Standard deviation (long):", sdLong.toString(), "->", (Number(sdLong) / 100).toFixed(2), "bp");
      
      // Verify both values are reasonable
      expect(sdShort).to.be.gte(0);
      expect(sdLong).to.be.gte(0);
      
      if (sdShort > 0 && sdLong > 0) {
        console.log("\n📊 VOLATILITY ANALYSIS:");
        console.log(`Short-term volatility: ${(Number(sdShort) / 100).toFixed(2)} basis points (15 min)`);
        console.log(`Long-term volatility:  ${(Number(sdLong) / 100).toFixed(2)} basis points (1 day)`);
        
        if (sdShort > sdLong) {
          console.log("🔥 Higher short-term volatility detected");
        } else if (sdLong > sdShort) {
          console.log("📈 Higher long-term volatility detected");
        } else {
          console.log("⚖️  Similar short and long-term volatility");
        }
      }
      
    } catch (error) {
      console.log("Error:", error.message);
    }
    
    console.log("\n=== TESTING WITH ALL DATA SOURCES ===");
    try {
      // Test with all flags including standard deviations
      const allFlags = 0x7F; // All sources + both std devs
      const allGas = await bridge.getData.estimateGas({ ...params, functionFlags: allFlags });
      const allData = await bridge.getData.staticCall({ ...params, functionFlags: allFlags });
      
      const [mask, v2Q, v3Q, twQ, clQ, ts, sdShort, sdLong] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint8","uint128","uint128","uint128","uint128","uint64","uint16","uint16"], 
        allData
      );
      
      console.log("Gas cost (all sources + std dev):", allGas.toString());
      console.log("Data mask:", "0b" + mask.toString(2).padStart(8, '0'));
      console.log("All data points retrieved successfully");
      
      function fmtQ(q) {
        const intPart = q >> 64n;
        const frac = q & ((1n << 64n) - 1n);
        const fracStr = (frac * 10000n / (1n << 64n)).toString().padStart(4, '0');
        return `${intPart}.${fracStr}`;
      }
      
      if (v2Q > 0) console.log("V2 price:", fmtQ(BigInt(v2Q.toString())));
      if (v3Q > 0) console.log("V3 price:", fmtQ(BigInt(v3Q.toString())));
      if (twQ > 0) console.log("TWAP price:", fmtQ(BigInt(twQ.toString())));
      if (clQ > 0) console.log("Chainlink price:", fmtQ(BigInt(clQ.toString())));
      if (ts > 0) console.log("Chainlink timestamp:", new Date(Number(ts) * 1000).toISOString());
      if (sdShort > 0) console.log("Std dev short:", (Number(sdShort) / 100).toFixed(2), "bp");
      if (sdLong > 0) console.log("Std dev long:", (Number(sdLong) / 100).toFixed(2), "bp");
      
    } catch (error) {
      console.log("Error with all sources:", error.message);
    }
  });
});
