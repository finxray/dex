const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PoolInfo", function () {
    let poolManager;
    let testTokenA, testTokenB;
    let simpleQuoter, mockAlphaDataBridge;
    let owner;

    beforeEach(async function () {
        [owner] = await ethers.getSigners();

        try {
            // Deploy test tokens
            const TestTokenA = await ethers.getContractFactory("TestTokenA");
            testTokenA = await TestTokenA.deploy();
            await testTokenA.waitForDeployment();

            const TestTokenB = await ethers.getContractFactory("TestTokenB");
            testTokenB = await TestTokenB.deploy();
            await testTokenB.waitForDeployment();

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

            // Deploy PoolManager
            const PoolManager = await ethers.getContractFactory("PoolManager");
            poolManager = await PoolManager.deploy(
                await mockAlphaDataBridge.getAddress(), // defaultAlpha
                await simpleQuoter.getAddress()         // defaultBeta
            );
            await poolManager.waitForDeployment();
        } catch (error) {
            console.log("Deployment failed:", error.message);
            throw error;
        }
    });

    describe("Pool Creation and Info Retrieval", function () {
        it("Should create a pool and store pool info correctly", async function () {
            const asset0 = await testTokenA.getAddress();
            const asset1 = await testTokenB.getAddress();
            const markings = "0x00000C"; // SimpleQuoter marking

            // Create pool
            const tx = await poolManager.createPool(asset0, asset1, await simpleQuoter.getAddress(), markings);
            const receipt = await tx.wait();

            // Find the PoolCreated event - handle both old and new event formats
            let poolCreatedEvent;
            if (receipt.logs) {
                // Try to find the event in logs
                for (const log of receipt.logs) {
                    try {
                        const event = poolManager.interface.parseLog(log);
                        if (event && event.name === 'PoolCreated') {
                            poolCreatedEvent = event;
                            break;
                        }
                    } catch (e) {
                        // Skip logs that can't be parsed
                    }
                }
            }

            // If we can't find the event, calculate the poolID manually
            let poolID;
            if (poolCreatedEvent) {
                poolID = poolCreatedEvent.args.poolID;
            } else {
                // Calculate poolID manually using the same logic as PoolIDAssembly
                const [sortedAsset0, sortedAsset1] = asset0 < asset1 ? [asset0, asset1] : [asset1, asset0];
                const poolIDData = ethers.solidityPackedKeccak256(
                    ["address", "address", "address", "bytes3"],
                    [sortedAsset0, sortedAsset1, await simpleQuoter.getAddress(), markings]
                );
                poolID = ethers.getBigInt(poolIDData);
            }

            // Retrieve pool info
            const poolInfo = await poolManager.getPoolInfo(poolID);

            // Verify the info is correct (assets should be in canonical order)
            const [smallerAsset, largerAsset] = asset0 < asset1 ? [asset0, asset1] : [asset1, asset0];
            
            expect(poolInfo.asset0).to.equal(smallerAsset);
            expect(poolInfo.asset1).to.equal(largerAsset);
            expect(poolInfo.quoter).to.equal(await simpleQuoter.getAddress());
            expect(poolInfo.markings.toLowerCase()).to.equal(markings.toLowerCase());
        });

        it("Should handle asset ordering correctly", async function () {
            const asset0 = await testTokenB.getAddress(); // Larger address
            const asset1 = await testTokenA.getAddress(); // Smaller address
            const markings = "0x00000C"; // SimpleQuoter marking

            // Create pool with assets in reverse order
            const tx = await poolManager.createPool(asset0, asset1, await simpleQuoter.getAddress(), markings);
            const receipt = await tx.wait();

            // Calculate poolID manually since event parsing might fail
            const [sortedAsset0, sortedAsset1] = asset0 < asset1 ? [asset0, asset1] : [asset1, asset0];
            const poolIDData = ethers.solidityPackedKeccak256(
                ["address", "address", "address", "bytes3"],
                [sortedAsset0, sortedAsset1, await simpleQuoter.getAddress(), markings]
            );
            const poolID = ethers.getBigInt(poolIDData);

            // Retrieve pool info
            const poolInfo = await poolManager.getPoolInfo(poolID);

            // Assets should be stored in canonical order (smaller first)
            const [smallerAsset, largerAsset] = (await testTokenA.getAddress()) < (await testTokenB.getAddress())
                ? [await testTokenA.getAddress(), await testTokenB.getAddress()]
                : [await testTokenB.getAddress(), await testTokenA.getAddress()];
            expect(poolInfo.asset0).to.equal(smallerAsset);
            expect(poolInfo.asset1).to.equal(largerAsset);
            expect(poolInfo.quoter).to.equal(await simpleQuoter.getAddress());
            expect(poolInfo.markings.toLowerCase()).to.equal(markings.toLowerCase());
        });

        it("Should return zero addresses for non-existent pool", async function () {
            // Generate a random poolID that doesn't exist
            const nonExistentPoolID = ethers.keccak256(ethers.toUtf8Bytes("non-existent-pool"));
            
            const poolInfo = await poolManager.getPoolInfo(nonExistentPoolID);
            
            expect(poolInfo.asset0).to.equal(ethers.ZeroAddress);
            expect(poolInfo.asset1).to.equal(ethers.ZeroAddress);
            expect(poolInfo.quoter).to.equal(ethers.ZeroAddress);
            expect(poolInfo.markings).to.equal("0x000000");
        });

        it("Should prevent creating duplicate pools", async function () {
            const asset0 = await testTokenA.getAddress();
            const asset1 = await testTokenB.getAddress();
            const markings = "0x00000C"; // SimpleQuoter marking

            // Create pool first time - should succeed
            const tx1 = await poolManager.createPool(asset0, asset1, await simpleQuoter.getAddress(), markings);
            await tx1.wait();

            // Try to create the same pool again - should fail
            await expect(
                poolManager.createPool(asset0, asset1, await simpleQuoter.getAddress(), markings)
            ).to.be.revertedWithCustomError(poolManager, "PoolManager__PoolAlreadyExists");
        });
    });
}); 