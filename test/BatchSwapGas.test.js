const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BatchSwap Gas Test", function () {
    let poolManager;
    let testTokenA, testTokenB, testTokenC, testTokenD, testTokenE;
    let simpleQuoter, alphaQuoter, dualQuoter;
    let mockAlphaDataBridge, mockBetaDataBridge;
    let owner, user1;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();

        try {
            // Deploy test tokens
            const TestTokenA = await ethers.getContractFactory("TestTokenA");
            testTokenA = await TestTokenA.deploy();
            await testTokenA.waitForDeployment();

            const TestTokenB = await ethers.getContractFactory("TestTokenB");
            testTokenB = await TestTokenB.deploy();
            await testTokenB.waitForDeployment();

            const TestTokenC = await ethers.getContractFactory("TestTokenA"); // Reuse for tokenC
            testTokenC = await TestTokenC.deploy();
            await testTokenC.waitForDeployment();

            const TestTokenD = await ethers.getContractFactory("TestTokenA"); // Reuse for tokenD
            testTokenD = await TestTokenD.deploy();
            await testTokenD.waitForDeployment();

            const TestTokenE = await ethers.getContractFactory("TestTokenA"); // Reuse for tokenE
            testTokenE = await TestTokenE.deploy();
            await testTokenE.waitForDeployment();

            // Deploy MockAlphaDataBridge for default alpha
            const MockAlphaDataBridge = await ethers.getContractFactory("MockAlphaDataBridge");
            mockAlphaDataBridge = await MockAlphaDataBridge.deploy(
                ethers.parseEther("1.3"), // spot price
                ethers.parseEther("1.28") // twap price
            );
            await mockAlphaDataBridge.waitForDeployment();

            // Deploy MockBetaDataBridge for beta
            const MockBetaDataBridge = await ethers.getContractFactory("MockBetaDataBridge");
            mockBetaDataBridge = await MockBetaDataBridge.deploy(
                ethers.parseEther("1.25") // spot price only
            );
            await mockBetaDataBridge.waitForDeployment();

            // Deploy SimpleQuoter (no external data)
            const SimpleQuoter = await ethers.getContractFactory("SimpleQuoter");
            simpleQuoter = await SimpleQuoter.deploy();
            await simpleQuoter.waitForDeployment();

            // Deploy AlphaDataQuoter (single data - default alpha)
            const AlphaDataQuoter = await ethers.getContractFactory("AlphaDataQuoter");
            alphaQuoter = await AlphaDataQuoter.deploy();
            await alphaQuoter.waitForDeployment();

            // Deploy DualDataQuoter (dual data - alpha default, beta not)
            const DualDataQuoter = await ethers.getContractFactory("DualDataQuoter");
            dualQuoter = await DualDataQuoter.deploy();
            await dualQuoter.waitForDeployment();

            // Deploy PoolManager
            const PoolManager = await ethers.getContractFactory("PoolManager");
            poolManager = await PoolManager.deploy(
                await mockAlphaDataBridge.getAddress(), // defaultAlpha
                await mockBetaDataBridge.getAddress()  // defaultBeta
            );
            await poolManager.waitForDeployment();

            // Mint tokens to user
            const INITIAL_SUPPLY = ethers.parseEther("1000000");
            await testTokenA.mint(user1.address, INITIAL_SUPPLY);
            await testTokenB.mint(user1.address, INITIAL_SUPPLY);
            await testTokenC.mint(user1.address, INITIAL_SUPPLY);
            await testTokenD.mint(user1.address, INITIAL_SUPPLY);
            await testTokenE.mint(user1.address, INITIAL_SUPPLY);

            // Approve tokens for PoolManager
            await testTokenA.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
            await testTokenB.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
            await testTokenC.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
            await testTokenD.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
            await testTokenE.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);

        } catch (error) {
            console.log("Deployment failed:", error.message);
            throw error;
        }
    });

    describe("BatchSwap Gas Measurement", function () {
        it("Should execute simple batchSwap for baseline gas measurement", async function () {
            // Simple test with just one hop to establish baseline
            const SIMPLE_MARKING = "0x00000C";

            // Create pool
            await poolManager.connect(user1).createPool(
                await testTokenA.getAddress(), 
                await testTokenB.getAddress(), 
                await simpleQuoter.getAddress(), 
                SIMPLE_MARKING
            );
            
            // Add liquidity
            const liquidityAmount = ethers.parseEther("10000");
            await poolManager.connect(user1).addLiquidity(
                await testTokenA.getAddress(), 
                await testTokenB.getAddress(), 
                await simpleQuoter.getAddress(), 
                SIMPLE_MARKING,
                liquidityAmount, liquidityAmount
            );

            // Simple single hop
            const hops = [{
                asset0: await testTokenA.getAddress(),
                asset1: await testTokenB.getAddress(),
                quoter: await simpleQuoter.getAddress(),
                markings: [SIMPLE_MARKING],
                amounts: [ethers.parseEther("100")],
                zeroForOne: true
            }];

            const swapAmount = ethers.parseEther("100");
            const minAmountOut = ethers.parseEther("50");

            console.log("🚀 Executing simple batchSwap for baseline...");

            // Execute batchSwap and measure gas
            const tx = await poolManager.connect(user1).batchSwap(hops, swapAmount, minAmountOut);
            const receipt = await tx.wait();

            // Calculate gas costs
            const gasUsed = receipt.gasUsed;
            const gasPrice = receipt.gasPrice;
            const totalCost = (BigInt(gasUsed) * BigInt(gasPrice)).toString();
            const gasCostInEth = ethers.formatEther(totalCost);

            console.log("\n📊 Baseline Gas Analysis:");
            console.log(`   - Gas Used: ${gasUsed.toLocaleString()}`);
            console.log(`   - Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
            console.log(`   - Total Cost: ${gasCostInEth} ETH`);
            console.log(`   - Transaction Status: ${receipt.status === 1 ? "✅ Success" : "❌ Failed"}`);

            // Verify the transaction was successful
            expect(receipt.status).to.equal(1);

            console.log("\n📈 Baseline Gas Cost:");
            console.log(`   - Simple batchSwap: ${gasUsed.toString()} gas`);
            const gasUsedNum = Number(gasUsed);
            console.log(`   - Expected 4-hop cost: ~${Math.round(gasUsedNum * 3.5).toLocaleString()} gas`);

            console.log(`\n✅ Baseline gas usage (${gasUsed.toString()}) established!`);
        });

        it("Should execute 4-hop batchSwap and measure gas costs", async function () {
            // Define markings for different quoter types
            const SIMPLE_MARKING = "0x00000C";  // SimpleQuoter: no external data
            const ALPHA_MARKING = "0x00000E";   // AlphaQuoter: uses default alpha
            const DUAL_MARKING = "0x00000F";    // DualQuoter: uses default alpha + beta

            // Create pools for all hops
            await poolManager.connect(user1).createPool(
                await testTokenA.getAddress(), 
                await testTokenB.getAddress(), 
                await dualQuoter.getAddress(), 
                DUAL_MARKING
            );

            await poolManager.connect(user1).createPool(
                await testTokenB.getAddress(), 
                await testTokenC.getAddress(), 
                await alphaQuoter.getAddress(), 
                ALPHA_MARKING
            );

            await poolManager.connect(user1).createPool(
                await testTokenC.getAddress(), 
                await testTokenD.getAddress(), 
                await alphaQuoter.getAddress(), 
                ALPHA_MARKING
            );

            await poolManager.connect(user1).createPool(
                await testTokenD.getAddress(), 
                await testTokenE.getAddress(), 
                await alphaQuoter.getAddress(), 
                ALPHA_MARKING
            );
            
            // Add liquidity to all pools
            const liquidityAmount = ethers.parseEther("10000");
            await poolManager.connect(user1).addLiquidity(
                await testTokenA.getAddress(), 
                await testTokenB.getAddress(), 
                await dualQuoter.getAddress(), 
                DUAL_MARKING,
                liquidityAmount, liquidityAmount
            );

            await poolManager.connect(user1).addLiquidity(
                await testTokenB.getAddress(), 
                await testTokenC.getAddress(), 
                await alphaQuoter.getAddress(), 
                ALPHA_MARKING,
                liquidityAmount, liquidityAmount
            );

            await poolManager.connect(user1).addLiquidity(
                await testTokenC.getAddress(), 
                await testTokenD.getAddress(), 
                await alphaQuoter.getAddress(), 
                ALPHA_MARKING,
                liquidityAmount, liquidityAmount
            );

            await poolManager.connect(user1).addLiquidity(
                await testTokenD.getAddress(), 
                await testTokenE.getAddress(), 
                await alphaQuoter.getAddress(), 
                ALPHA_MARKING,
                liquidityAmount, liquidityAmount
            );

            // Create 4-hop batchSwap:
            // 1. Dual quoter (alpha default, beta not) - individual quote
            // 2-4. Same single data quoter (default alpha) - batch quote
            const hops = [
                {
                    // Hop 1: Dual quoter (individual quote)
                    asset0: await testTokenA.getAddress(),
                    asset1: await testTokenB.getAddress(),
                    quoter: await dualQuoter.getAddress(),
                    markings: [DUAL_MARKING],
                    amounts: [ethers.parseEther("100")],
                    zeroForOne: true
                },
                {
                    // Hops 2-4: Same single data quoter (batch quote)
                    asset0: await testTokenB.getAddress(),
                    asset1: await testTokenC.getAddress(),
                    quoter: await alphaQuoter.getAddress(),
                    markings: [ALPHA_MARKING, ALPHA_MARKING, ALPHA_MARKING],
                    amounts: [
                        ethers.parseEther("80"),  // B->C
                        ethers.parseEther("60"),  // C->D  
                        ethers.parseEther("40")   // D->E
                    ],
                    zeroForOne: true
                }
            ];

            const swapAmount = ethers.parseEther("100");
            const minAmountOut = ethers.parseEther("20");

            console.log("🚀 Executing 4-hop batchSwap...");
            console.log("   - Hop 1: Dual quoter (A->B)");
            console.log("   - Hops 2-4: Single data quoter (B->C->D->E)");

            // Execute batchSwap and measure gas
            const tx = await poolManager.connect(user1).batchSwap(hops, swapAmount, minAmountOut);
            const receipt = await tx.wait();

            // Calculate gas costs
            const gasUsed = receipt.gasUsed;
            const gasPrice = receipt.gasPrice;
            const totalCost = (BigInt(gasUsed) * BigInt(gasPrice)).toString();
            const gasCostInEth = ethers.formatEther(totalCost);

            console.log("\n📊 Gas Analysis:");
            console.log(`   - Gas Used: ${gasUsed.toLocaleString()}`);
            console.log(`   - Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
            console.log(`   - Total Cost: ${gasCostInEth} ETH`);
            console.log(`   - Transaction Status: ${receipt.status === 1 ? "✅ Success" : "❌ Failed"}`);

            // Verify the transaction was successful
            expect(receipt.status).to.equal(1);

            // Additional gas breakdown
            console.log("\n🔍 Gas Breakdown:");
            console.log(`   - Base Cost: ~21,000 gas`);
            const gasUsedNum2 = Number(gasUsed);
            console.log(`   - Data Cost: ~${(gasUsedNum2 - 21000).toLocaleString()} gas`);
            console.log(`   - Per Hop Cost: ~${Math.round((gasUsedNum2 - 21000) / 4).toLocaleString()} gas`);

            // Expected gas ranges based on complexity
            console.log("\n📈 Expected Gas Ranges:");
            console.log("   - Simple swap: ~50,000-80,000 gas");
            console.log("   - 4-hop batchSwap: ~150,000-300,000 gas");
            console.log("   - With external data: +20,000-50,000 gas per hop");

            // Verify gas usage is reasonable
            expect(gasUsedNum2).to.be.gt(50000); // Should be more than simple swap
            expect(gasUsedNum2).to.be.lt(500000); // Should be less than very expensive operations

            console.log(`\n✅ Gas usage (${gasUsedNum2.toLocaleString()}) is within expected range!`);
        });

        it("Should compare 4-hop batchSwap gas: normal vs session", async function () {
            const SIMPLE_MARKING = "0x00000C";
            const ALPHA_MARKING = "0x00000E";
            const DUAL_MARKING = "0x00000F";

            // Re-create the pools and liquidity as above
            await poolManager.connect(user1).createPool(
                await testTokenA.getAddress(), await testTokenB.getAddress(), await dualQuoter.getAddress(), DUAL_MARKING
            );
            await poolManager.connect(user1).createPool(
                await testTokenB.getAddress(), await testTokenC.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARKING
            );
            await poolManager.connect(user1).createPool(
                await testTokenC.getAddress(), await testTokenD.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARKING
            );
            await poolManager.connect(user1).createPool(
                await testTokenD.getAddress(), await testTokenE.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARKING
            );

            const liquidityAmount = ethers.parseEther("10000");
            await poolManager.connect(user1).addLiquidity(
                await testTokenA.getAddress(), await testTokenB.getAddress(), await dualQuoter.getAddress(), DUAL_MARKING, liquidityAmount, liquidityAmount
            );
            await poolManager.connect(user1).addLiquidity(
                await testTokenB.getAddress(), await testTokenC.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARKING, liquidityAmount, liquidityAmount
            );
            await poolManager.connect(user1).addLiquidity(
                await testTokenC.getAddress(), await testTokenD.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARKING, liquidityAmount, liquidityAmount
            );
            await poolManager.connect(user1).addLiquidity(
                await testTokenD.getAddress(), await testTokenE.getAddress(), await alphaQuoter.getAddress(), ALPHA_MARKING, liquidityAmount, liquidityAmount
            );

            const hops = [
                {
                    asset0: await testTokenA.getAddress(), asset1: await testTokenB.getAddress(), quoter: await dualQuoter.getAddress(),
                    markings: [DUAL_MARKING], amounts: [ethers.parseEther("100")], zeroForOne: true
                },
                {
                    asset0: await testTokenB.getAddress(), asset1: await testTokenC.getAddress(), quoter: await alphaQuoter.getAddress(),
                    markings: [ALPHA_MARKING, ALPHA_MARKING, ALPHA_MARKING], amounts: [ethers.parseEther("80"), ethers.parseEther("60"), ethers.parseEther("40")], zeroForOne: true
                }
            ];
            const swapAmount = ethers.parseEther("100");
            const minAmountOut = ethers.parseEther("20");

            // Normal (non-session) gas
            const txNormal = await poolManager.connect(user1).batchSwap(hops, swapAmount, minAmountOut);
            const rcNormal = await txNormal.wait();

            // Session-based: wrap in a trivial callback that calls batchSwap once
            const SessionWrapper = await ethers.getContractFactory("FlashSessionBatchSwapWrapper");
            const wrapper = await SessionWrapper.deploy(await poolManager.getAddress(), hops, swapAmount, minAmountOut);
            await wrapper.waitForDeployment();
            const txSession = await poolManager.connect(user1).flashSession(await wrapper.getAddress(), "0x", [await testTokenA.getAddress(), await testTokenE.getAddress()]);
            const rcSession = await txSession.wait();

            // Print a concise table
            const table = [
                ["Scenario", "Gas Used"],
                ["Normal 4-hop", rcNormal.gasUsed.toString()],
                ["Session 4-hop", rcSession.gasUsed.toString()],
            ];
            console.table(table);

            expect(rcNormal.status).to.equal(1);
            expect(rcSession.status).to.equal(1);
        });
    });
}); 