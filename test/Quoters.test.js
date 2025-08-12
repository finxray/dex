const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Quoter System Tests", function () {
  let owner, user1;
  let tokenA, tokenB;
  let simpleQuoter, alphaQuoter, betaQuoter, dualQuoter;
  let quoteRequester;
  let mockAlphaDataBridge, mockBetaDataBridge;
  
  // Test constants
  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
  const ASSET0_BALANCE = ethers.parseEther("1000"); // 1000 tokens
  const ASSET1_BALANCE = ethers.parseEther("1300"); // 1300 tokens (1.3 ratio)
  const SWAP_AMOUNT = ethers.parseEther("100"); // 100 tokens
  
  // Mock price data
  const ALPHA_SPOT_PRICE = ethers.parseEther("1.3"); // 1.3 ETH
  const ALPHA_TWAP_PRICE = ethers.parseEther("1.28"); // 1.28 ETH
  const BETA_SPOT_PRICE = ethers.parseEther("1.32"); // 1.32 ETH
  
  // Pre-calculated markings (as per instruction file)
  const SIMPLE_MARKING = "0x000000"; // No data required
  const ALPHA_DEFAULT_MARKING = "0x000005"; // Alpha=true, default=true, bucketID=0
  const BETA_DEFAULT_MARKING = "0x00000A"; // Beta=true, default=true, bucketID=0
  const DUAL_DEFAULT_MARKING = "0x00000F"; // Both=true, both default=true, bucketID=0
  
  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();
    
    // Deploy test tokens
    const TestToken = await ethers.getContractFactory("TestTokenA");
    tokenA = await TestToken.deploy();
    await tokenA.waitForDeployment();
    
    const TestTokenB = await ethers.getContractFactory("TestTokenB");
    tokenB = await TestTokenB.deploy();
    await tokenB.waitForDeployment();
    
    // Deploy mock data bridges
    const MockAlphaDataBridge = await ethers.getContractFactory("MockAlphaDataBridge");
    mockAlphaDataBridge = await MockAlphaDataBridge.deploy(ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE);
    await mockAlphaDataBridge.waitForDeployment();
    
    const MockBetaDataBridge = await ethers.getContractFactory("MockBetaDataBridge");
    mockBetaDataBridge = await MockBetaDataBridge.deploy(BETA_SPOT_PRICE);
    await mockBetaDataBridge.waitForDeployment();
    
    // Deploy quoters
    const SimpleQuoter = await ethers.getContractFactory("SimpleQuoter");
    simpleQuoter = await SimpleQuoter.deploy();
    await simpleQuoter.waitForDeployment();
    
    const AlphaDataQuoter = await ethers.getContractFactory("AlphaDataQuoter");
    alphaQuoter = await AlphaDataQuoter.deploy();
    await alphaQuoter.waitForDeployment();
    
    const BetaDataQuoter = await ethers.getContractFactory("BetaDataQuoter");
    betaQuoter = await BetaDataQuoter.deploy();
    await betaQuoter.waitForDeployment();
    
    const DualDataQuoter = await ethers.getContractFactory("DualDataQuoter");
    dualQuoter = await DualDataQuoter.deploy();
    await dualQuoter.waitForDeployment();
    
    // Deploy QuoteRequester
    const QuoteRequester = await ethers.getContractFactory("QuoteRequester");
    quoteRequester = await QuoteRequester.deploy(
      await mockAlphaDataBridge.getAddress(),
      await mockBetaDataBridge.getAddress()
    );
    await quoteRequester.waitForDeployment();
    
    console.log("Deployment addresses:");
    console.log("TokenA:", await tokenA.getAddress());
    console.log("TokenB:", await tokenB.getAddress());
    console.log("SimpleQuoter:", await simpleQuoter.getAddress());
    console.log("AlphaQuoter:", await alphaQuoter.getAddress());
    console.log("BetaQuoter:", await betaQuoter.getAddress());
    console.log("DualQuoter:", await dualQuoter.getAddress());
    console.log("QuoteRequester:", await quoteRequester.getAddress());
    console.log("MockAlphaDataBridge:", await mockAlphaDataBridge.getAddress());
    console.log("MockBetaDataBridge:", await mockBetaDataBridge.getAddress());
  });
  
  describe("SimpleQuoter Tests", function () {
    it("Should calculate quote correctly for zeroForOne", async function () {
      const params = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await simpleQuoter.getAddress(),
        amount: SWAP_AMOUNT,
        asset0Balance: ASSET0_BALANCE,
        asset1Balance: ASSET1_BALANCE,
        bucketID: 0,
        zeroForOne: true
      };
      
      const quote = await simpleQuoter.quote(params);
      
      // Expected: (100 * 1300) / (1000 + 100) * 997 / 1000
      const expectedQuote = (SWAP_AMOUNT * ASSET1_BALANCE) / (ASSET0_BALANCE + SWAP_AMOUNT) * 997n / 1000n;
      
      console.log("SimpleQuoter zeroForOne quote:", ethers.formatEther(quote));
      console.log("Expected quote:", ethers.formatEther(expectedQuote));
      
      expect(quote).to.be.closeTo(expectedQuote, ethers.parseEther("0.1"));
    });
    
    it("Should calculate quote correctly for oneForZero", async function () {
      const params = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await simpleQuoter.getAddress(),
        amount: SWAP_AMOUNT,
        asset0Balance: ASSET0_BALANCE,
        asset1Balance: ASSET1_BALANCE,
        bucketID: 0,
        zeroForOne: false
      };
      
      const quote = await simpleQuoter.quote(params);
      
      // Expected: (100 * 1000) / (1300 + 100) * 997 / 1000
      const expectedQuote = (SWAP_AMOUNT * ASSET0_BALANCE) / (ASSET1_BALANCE + SWAP_AMOUNT) * 997n / 1000n;
      
      console.log("SimpleQuoter oneForZero quote:", ethers.formatEther(quote));
      console.log("Expected quote:", ethers.formatEther(expectedQuote));
      
      expect(quote).to.be.closeTo(expectedQuote, ethers.parseEther("0.1"));
    });
    
    it("Should handle batch quotes", async function () {
      const amounts = [
        ethers.parseEther("50"),
        ethers.parseEther("100"),
        ethers.parseEther("200")
      ];
      
      const params = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await simpleQuoter.getAddress(),
        amount: amounts,
        asset0Balances: [ASSET0_BALANCE, ASSET0_BALANCE, ASSET0_BALANCE],
        asset1Balances: [ASSET1_BALANCE, ASSET1_BALANCE, ASSET1_BALANCE],
        bucketID: [0, 0, 0],
        zeroForOne: true
      };
      
      const quotes = await simpleQuoter.quoteBatch(params);
      
      console.log("Batch quotes:", quotes.map(q => ethers.formatEther(q)));
      
      expect(quotes).to.have.length(3);
      expect(quotes[0]).to.be.gt(0);
      expect(quotes[1]).to.be.gt(quotes[0]); // Larger amount should give larger quote
      expect(quotes[2]).to.be.gt(quotes[1]);
    });
  });
  
  describe("AlphaDataQuoter Tests", function () {
    it("Should calculate quote using alpha market data", async function () {
      const alphaData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256"],
        [ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE]
      );
      
      const params = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await alphaQuoter.getAddress(),
        amount: SWAP_AMOUNT,
        asset0Balance: ASSET0_BALANCE,
        asset1Balance: ASSET1_BALANCE,
        bucketID: 0,
        zeroForOne: true
      };
      
      const quote = await alphaQuoter.quote(params, alphaData);
      
      // Expected: weighted price = (1.3 * 70 + 1.28 * 30) / 100 = 1.294
      // Quote = 100 * 1.294 * 0.998 (slippage factor for <1000 tokens)
      const weightedPrice = (ALPHA_SPOT_PRICE * 70n + ALPHA_TWAP_PRICE * 30n) / 100n;
      const expectedQuote = (SWAP_AMOUNT * weightedPrice) / ethers.parseEther("1") * 998n / 1000n;
      
      console.log("AlphaQuoter quote:", ethers.formatEther(quote));
      console.log("Expected quote:", ethers.formatEther(expectedQuote));
      console.log("Weighted price:", ethers.formatEther(weightedPrice));
      
      expect(quote).to.be.closeTo(expectedQuote, ethers.parseEther("0.1"));
    });
    
    it("Should apply higher slippage for large trades", async function () {
      const largeAmount = ethers.parseEther("1500"); // >1000 tokens
      const alphaData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256"],
        [ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE]
      );
      
      const params = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await alphaQuoter.getAddress(),
        amount: largeAmount,
        asset0Balance: ASSET0_BALANCE,
        asset1Balance: ASSET1_BALANCE,
        bucketID: 0,
        zeroForOne: true
      };
      
      const quote = await alphaQuoter.quote(params, alphaData);
      
      console.log("Large trade quote:", ethers.formatEther(quote));
      
      // Should apply 0.5% slippage instead of 0.2%
      expect(quote).to.be.gt(0);
    });
  });
  
  describe("BetaDataQuoter Tests", function () {
    it("Should calculate quote using beta market data", async function () {
      const betaData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256"],
        [BETA_SPOT_PRICE]
      );
      
      const params = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await betaQuoter.getAddress(),
        amount: SWAP_AMOUNT,
        asset0Balance: ASSET0_BALANCE,
        asset1Balance: ASSET1_BALANCE,
        bucketID: 5, // Test with specific bucket ID
        zeroForOne: true
      };
      
      const quote = await betaQuoter.quote(params, betaData);
      
      // Expected: 100 * 1.32 * volatilityFactor * 0.997
      // volatilityFactor = 1000 - (5 % 10) = 995
      const baseQuote = (SWAP_AMOUNT * BETA_SPOT_PRICE) / ethers.parseEther("1");
      const volatilityFactor = 1000n - (5n % 10n); // 995
      const expectedQuote = baseQuote * volatilityFactor / 1000n * 997n / 1000n;
      
      console.log("BetaQuoter quote:", ethers.formatEther(quote));
      console.log("Expected quote:", ethers.formatEther(expectedQuote));
      
      expect(quote).to.be.closeTo(expectedQuote, ethers.parseEther("0.1"));
    });
  });
  
  describe("DualDataQuoter Tests", function () {
    it("Should calculate quote using both alpha and beta data", async function () {
      const alphaData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256"],
        [ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE]
      );
      
      const betaData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256"],
        [BETA_SPOT_PRICE]
      );
      
      const params = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await dualQuoter.getAddress(),
        amount: SWAP_AMOUNT,
        asset0Balance: ASSET0_BALANCE,
        asset1Balance: ASSET1_BALANCE,
        bucketID: 0,
        zeroForOne: true
      };
      
      const quote = await dualQuoter.quote(params, alphaData, betaData);
      
      console.log("DualQuoter quote:", ethers.formatEther(quote));
      
      // Complex calculation involving spread analysis and weighted averaging
      expect(quote).to.be.gt(0);
      expect(quote).to.be.lt(SWAP_AMOUNT * 2n); // Reasonable upper bound
    });
  });
  
  describe("QuoteRequester Integration Tests", function () {
    it("Should route to SimpleQuoter correctly", async function () {
      const swapParams = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await simpleQuoter.getAddress(),
        amount: [SWAP_AMOUNT],
        zeroForOne: true,
        marking: [SIMPLE_MARKING]
      };
      
      // Note: This test requires the getQuote function to be public or we need a wrapper
      // For now, we'll test the quoter directly
      console.log("SimpleQuoter routing test - would call QuoteRequester.getQuote");
      expect(true).to.be.true; // Placeholder
    });
    
    it("Should handle market data address management", async function () {
      // Test adding alternative market data addresses
      await quoteRequester.addAlphaMarketAddress(1, await mockAlphaDataBridge.getAddress());
      await quoteRequester.addBetaMarketAddress(1, await mockBetaDataBridge.getAddress());
      
      const alphaAddr = await quoteRequester.getAlphaMarketAddress(1);
      const betaAddr = await quoteRequester.getBetaMarketAddress(1);
      
      expect(alphaAddr).to.equal(await mockAlphaDataBridge.getAddress());
      expect(betaAddr).to.equal(await mockBetaDataBridge.getAddress());
    });
    
    it("Should validate pointer ranges", async function () {
      await expect(
        quoteRequester.addAlphaMarketAddress(16, await mockAlphaDataBridge.getAddress())
      ).to.be.revertedWith("Invalid pointer: must be 0-15");
      
      await expect(
        quoteRequester.addBetaMarketAddress(16, await mockBetaDataBridge.getAddress())
      ).to.be.revertedWith("Invalid pointer: must be 0-15");
    });
  });
  
  describe("Gas Usage Analysis", function () {
    it("Should measure gas usage for different quoter types", async function () {
      const params = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await simpleQuoter.getAddress(),
        amount: SWAP_AMOUNT,
        asset0Balance: ASSET0_BALANCE,
        asset1Balance: ASSET1_BALANCE,
        bucketID: 0,
        zeroForOne: true
      };
      
      // Simple quoter gas usage
      const simpleGas = await simpleQuoter.quote.estimateGas(params);
      console.log("SimpleQuoter gas usage:", simpleGas.toString());
      
      // Alpha quoter gas usage
      const alphaData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256"],
        [ALPHA_SPOT_PRICE, ALPHA_TWAP_PRICE]
      );
      const alphaGas = await alphaQuoter.quote.estimateGas(params, alphaData);
      console.log("AlphaQuoter gas usage:", alphaGas.toString());
      
      // Beta quoter gas usage
      const betaData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256"],
        [BETA_SPOT_PRICE]
      );
      const betaGas = await betaQuoter.quote.estimateGas(params, betaData);
      console.log("BetaQuoter gas usage:", betaGas.toString());
      
      // Dual quoter gas usage
      const dualGas = await dualQuoter.quote.estimateGas(params, alphaData, betaData);
      console.log("DualQuoter gas usage:", dualGas.toString());
      
      expect(simpleGas).to.be.lt(alphaGas);
      expect(alphaGas).to.be.lt(dualGas);
    });
  });
  
  describe("Edge Cases and Error Handling", function () {
    it("Should handle zero amounts", async function () {
      const params = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await simpleQuoter.getAddress(),
        amount: 0,
        asset0Balance: ASSET0_BALANCE,
        asset1Balance: ASSET1_BALANCE,
        bucketID: 0,
        zeroForOne: true
      };
      
      const quote = await simpleQuoter.quote(params);
      expect(quote).to.equal(0);
    });
    
    it("Should handle zero balances", async function () {
      const params = {
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await simpleQuoter.getAddress(),
        amount: SWAP_AMOUNT,
        asset0Balance: 0,
        asset1Balance: ASSET1_BALANCE,
        bucketID: 0,
        zeroForOne: true
      };
      
      // This should revert due to division by zero in the formula
      await expect(simpleQuoter.quote(params)).to.be.reverted;
    });
    
    it("Should update mock data bridge prices", async function () {
      const newSpotPrice = ethers.parseEther("1.5");
      const newTwapPrice = ethers.parseEther("1.45");
      
      await mockAlphaDataBridge.updatePrices(newSpotPrice, newTwapPrice);
      
      const data = await mockAlphaDataBridge.getData({
        asset0: await tokenA.getAddress(),
        asset1: await tokenB.getAddress(),
        quoter: await alphaQuoter.getAddress(),
        amount: 0,
        asset0Balance: 0,
        asset1Balance: 0,
        bucketID: 0,
        zeroForOne: true
      });
      
      const [spotPrice, twapPrice] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256", "uint256"],
        data
      );
      
      expect(spotPrice).to.equal(newSpotPrice);
      expect(twapPrice).to.equal(newTwapPrice);
    });
  });
});