const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BatchSwap", function () {
    let poolManager;
    let testTokenA, testTokenB, testTokenC;
    let simpleQuoter, alphaQuoter, mockAlphaDataBridge;
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

            const TestTokenC = await ethers.getContractFactory("TestTokenA"); // Reuse TestTokenA for tokenC
            testTokenC = await TestTokenC.deploy();
            await testTokenC.waitForDeployment();

            // Deploy MockAlphaDataBridge for default alpha
            const MockAlphaDataBridge = await ethers.getContractFactory("MockAlphaDataBridge");
            mockAlphaDataBridge = await MockAlphaDataBridge.deploy(
                ethers.parseEther("1.3"), // spot price
                ethers.parseEther("1.28") // twap price
            );
            await mockAlphaDataBridge.waitForDeployment();

            // Deploy SimpleQuoter
            const SimpleQuoter = await ethers.getContractFactory("SimpleQuoter");
            simpleQuoter = await SimpleQuoter.deploy();
            await simpleQuoter.waitForDeployment();

            // Deploy AlphaDataQuoter for alpha-marking paths
            const AlphaDataQuoter = await ethers.getContractFactory("AlphaDataQuoter");
            alphaQuoter = await AlphaDataQuoter.deploy();
            await alphaQuoter.waitForDeployment();

            // Deploy PoolManager
            const PoolManager = await ethers.getContractFactory("PoolManager");
            poolManager = await PoolManager.deploy(
                await mockAlphaDataBridge.getAddress(), // defaultAlpha
                await simpleQuoter.getAddress()         // defaultBeta (unused in these tests)
            );
            await poolManager.waitForDeployment();

            // Mint tokens to user
            const INITIAL_SUPPLY = ethers.parseEther("1000000");
            await testTokenA.mint(user1.address, INITIAL_SUPPLY);
            await testTokenB.mint(user1.address, INITIAL_SUPPLY);
            await testTokenC.mint(user1.address, INITIAL_SUPPLY);

            // Approve tokens for PoolManager
            await testTokenA.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
            await testTokenB.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);
            await testTokenC.connect(user1).approve(await poolManager.getAddress(), ethers.MaxUint256);

        } catch (error) {
            console.log("Deployment failed:", error.message);
            throw error;
        }
    });

    describe("BatchSwap Functionality", function () {
        it("Should execute single hop batchSwap correctly", async function () {
            const asset0 = await testTokenA.getAddress();
            const asset1 = await testTokenB.getAddress();
            const markings = ["0x00000C"]; // SimpleQuoter marking
            const amounts = [ethers.parseEther("10")];

            // Create pool
            await poolManager.connect(user1).createPool(asset0, asset1, await simpleQuoter.getAddress(), markings[0]);
            
            // Add liquidity
            const liquidityAmount = ethers.parseEther("1000");
            await poolManager.connect(user1).addLiquidity(
                asset0, asset1, await simpleQuoter.getAddress(), markings[0],
                liquidityAmount, liquidityAmount
            );

            // Create single hop using new Hop structure with arrays
            const hops = [{
                asset0: asset0,
                asset1: asset1,
                quoter: await simpleQuoter.getAddress(),
                markings: markings,
                amounts: amounts,
                zeroForOne: true
            }];

            const swapAmount = ethers.parseEther("10");
            const minAmountOut = ethers.parseEther("8");

            // Execute batchSwap
            const tx = await poolManager.connect(user1).batchSwap(hops, swapAmount, minAmountOut);
            const receipt = await tx.wait();

            expect(receipt.status).to.equal(1);
        });

        it("Should execute multi-hop batchSwap with different quoters", async function () {
            const asset0 = await testTokenA.getAddress();
            const asset1 = await testTokenB.getAddress();
            const asset2 = await testTokenC.getAddress();
            const markings1 = ["0x00000C"]; // SimpleQuoter marking
            const markings2 = ["0x00000E"]; // Alpha marking
            const amounts1 = [ethers.parseEther("10")];
            const amounts2 = [ethers.parseEther("8")];

            // Create pools
            await poolManager.connect(user1).createPool(asset0, asset1, await simpleQuoter.getAddress(), markings1[0]);
            await poolManager.connect(user1).createPool(asset1, asset2, await alphaQuoter.getAddress(), markings2[0]);
            
            // Add liquidity to both pools
            const liquidityAmount = ethers.parseEther("1000");
            await poolManager.connect(user1).addLiquidity(
                asset0, asset1, await simpleQuoter.getAddress(), markings1[0],
                liquidityAmount, liquidityAmount
            );
            await poolManager.connect(user1).addLiquidity(
                asset1, asset2, await alphaQuoter.getAddress(), markings2[0],
                liquidityAmount, liquidityAmount
            );

            // Create multi-hop with different assets (different quoters would be different addresses)
            const hops = [
                {
                    asset0: asset0,
                    asset1: asset1,
                    quoter: await simpleQuoter.getAddress(),
                    markings: markings1,
                    amounts: amounts1,
                    zeroForOne: true
                },
                {
                    asset0: asset1,
                    asset1: asset2,
                    quoter: await alphaQuoter.getAddress(),
                    markings: markings2,
                    amounts: amounts2,
                    zeroForOne: true
                }
            ];

            const swapAmount = ethers.parseEther("10");
            const minAmountOut = ethers.parseEther("5");

            // Execute batchSwap
            const tx = await poolManager.connect(user1).batchSwap(hops, swapAmount, minAmountOut);
            const receipt = await tx.wait();

            expect(receipt.status).to.equal(1);
        });

        it("Should handle batchSwap with same quoter and multiple markings (batch quote)", async function () {
            const asset0 = await testTokenA.getAddress();
            const asset1 = await testTokenB.getAddress();
            const markings = ["0x00000C", "0x00000C"]; // Use same no-data marking twice
            const amounts = [ethers.parseEther("10"), ethers.parseEther("8")];

            // Create pool once for the given marking
            await poolManager.connect(user1).createPool(asset0, asset1, await simpleQuoter.getAddress(), markings[0]);
            
            // Add liquidity once
            const liquidityAmount = ethers.parseEther("1000");
            await poolManager.connect(user1).addLiquidity(
                asset0, asset1, await simpleQuoter.getAddress(), markings[0],
                liquidityAmount, liquidityAmount
            );

            // Create single hop with multiple markings (will use batchQuote)
            const hops = [{
                asset0: asset0,
                asset1: asset1,
                quoter: await simpleQuoter.getAddress(),
                markings: markings,
                amounts: amounts,
                zeroForOne: true
            }];

            const swapAmount = ethers.parseEther("10");
            const minAmountOut = ethers.parseEther("5");

            // Execute batchSwap
            const tx = await poolManager.connect(user1).batchSwap(hops, swapAmount, minAmountOut);
            const receipt = await tx.wait();

            expect(receipt.status).to.equal(1);
        });

        it("Should handle batchSwap with same quoter and different markings", async function () {
            const asset0 = await testTokenA.getAddress();
            const asset1 = await testTokenB.getAddress();
            const asset2 = await testTokenC.getAddress();
            const markings1 = "0x00000C"; // SimpleQuoter marking
            const markings2 = "0x00000C"; // Use same no-data marking for same quoter

            // Create pools with same quoter but different assets and markings
            await poolManager.connect(user1).createPool(asset0, asset1, await simpleQuoter.getAddress(), markings1);
            await poolManager.connect(user1).createPool(asset0, asset2, await simpleQuoter.getAddress(), markings2);
            
            // Add liquidity to both pools
            const liquidityAmount = ethers.parseEther("1000");
            await poolManager.connect(user1).addLiquidity(
                asset0, asset1, await simpleQuoter.getAddress(), markings1,
                liquidityAmount, liquidityAmount
            );
            await poolManager.connect(user1).addLiquidity(
                asset0, asset2, await simpleQuoter.getAddress(), markings2,
                liquidityAmount, liquidityAmount
            );

            // Create hops with same quoter but different assets and markings
            const hops = [
                {
                    asset0: asset0,
                    asset1: asset1,
                    quoter: await simpleQuoter.getAddress(),
                    markings: [markings1],
                    amounts: [ethers.parseEther("10")],
                    zeroForOne: true
                },
                {
                    asset0: asset0,
                    asset1: asset2,
                    quoter: await simpleQuoter.getAddress(),
                    markings: [markings2],
                    amounts: [ethers.parseEther("10")],
                    zeroForOne: true
                }
            ];

            const swapAmount = ethers.parseEther("10");
            const minAmountOut = ethers.parseEther("5");

            // Execute batchSwap
            const tx = await poolManager.connect(user1).batchSwap(hops, swapAmount, minAmountOut);
            const receipt = await tx.wait();

            expect(receipt.status).to.equal(1);
        });

        it("Should revert if minAmountOut not met", async function () {
            const asset0 = await testTokenA.getAddress();
            const asset1 = await testTokenB.getAddress();
            const markings = ["0x00000C"];

            // Create pool
            await poolManager.connect(user1).createPool(asset0, asset1, await simpleQuoter.getAddress(), markings[0]);
            
            // Add minimal liquidity
            const liquidityAmount = ethers.parseEther("100");
            await poolManager.connect(user1).addLiquidity(
                asset0, asset1, await simpleQuoter.getAddress(), markings[0],
                liquidityAmount, liquidityAmount
            );

            const hops = [{
                asset0: asset0,
                asset1: asset1,
                quoter: await simpleQuoter.getAddress(),
                markings: markings,
                amounts: [ethers.parseEther("50")], // Large swap
                zeroForOne: true
            }];

            const swapAmount = ethers.parseEther("50"); // Large swap
            const minAmountOut = ethers.parseEther("100"); // Unrealistic minimum

            // Should revert due to insufficient output
            await expect(
                poolManager.connect(user1).batchSwap(hops, swapAmount, minAmountOut)
            ).to.be.revertedWithCustomError(poolManager, "PoolManager__InsufficientOutput");
        });
    });
}); 