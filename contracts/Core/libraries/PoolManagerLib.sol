// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Custom errors for gas-efficient reverts
error PoolManager__InsufficientLiquidityMinted();
error PoolManager__InsufficientAsset0(uint256 required, uint256 available);
error PoolManager__InsufficientAsset1(uint256 required, uint256 available);
error PoolManager__PoolAlreadyExists(uint256 poolID);
error PoolManager__NoHops();
error PoolManager__NoMarkings();
error PoolManager__MismatchedArrays();

import {PoolIDAssembly} from "./PoolIDAssembly.sol";
import {AssetTransferLib} from "./AssetTransferLib.sol";
import {FlashAccounting} from "./FlashAccounting.sol";
import {SwapParams} from "../structs/SwapParams.sol";
import {IQuoteRouter} from "../interfaces/internal/IQuoteRouter.sol";
import {Hop} from "../structs/Hop.sol";
import {PoolInfo} from "../structs/PoolInfo.sol";

// (interface moved to contracts/interfaces/internal/IQuoteRouter.sol)

/// @notice Library containing core calculation logic for PoolManager
/// @dev Pure calculation functions and simple storage management
library PoolManagerLib {
    
    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    // PoolInfo and Hop moved to structs folder
    
    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/
    
    struct PoolManagerStorage {
        // Total liquidity (shares) issued per pool
        mapping(uint256 => uint256) totalLiquidity;
        // Pool asset balances (poolID -> packed uint256) - BOTH ASSETS IN SINGLE SLOT!
        // Lower 128 bits = asset0, Upper 128 bits = asset1
        mapping(uint256 => uint256) poolInventories;
        // Pool information for external queries (poolID -> PoolInfo)
        mapping(uint256 => PoolInfo) poolInfos;
    }
    
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event PoolCreated(uint256 indexed poolID, address asset0, address asset1, address quoter, bytes3 markings);

    /*//////////////////////////////////////////////////////////////
                            POOL CREATION
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Creates a new pool with canonical asset ordering (asset0 < asset1)
    /// @param self Storage reference
    /// @param asset0 First asset address
    /// @param asset1 Second asset address  
    /// @param quoter Quoter contract address
    /// @param markings Pool configuration markings
    /// @return poolID The unique identifier for the created pool
    function createPool(
        PoolManagerStorage storage self,
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) internal returns (uint256 poolID) {
        // PoolIDAssembly will canonicalize the order internally
        poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        // Check if pool already exists by checking if quoter is non-zero
        if (self.poolInfos[poolID].quoter != address(0)) {
            revert PoolManager__PoolAlreadyExists(poolID);
        }
        
        // Store pool information with canonical asset order
        (address sortedAsset0, address sortedAsset1) = asset0 < asset1 ? (asset0, asset1) : (asset1, asset0);
        self.poolInfos[poolID] = PoolInfo({
            asset0: sortedAsset0,
            asset1: sortedAsset1,
            quoter: quoter,
            markings: markings
        });
        
        // Emit with canonical order for consistency
        emit PoolCreated(poolID, sortedAsset0, sortedAsset1, quoter, markings);
    }

    /// @notice Get pool information by poolID
    /// @param self Storage reference
    /// @param poolID Pool identifier
    /// @return poolInfo Pool information structure
    function getPoolInfo(
        PoolManagerStorage storage self,
        uint256 poolID
    ) internal view returns (PoolInfo memory poolInfo) {
        return self.poolInfos[poolID];
    }

    /*//////////////////////////////////////////////////////////////
                            LIQUIDITY CALCULATIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Calculates liquidity to mint for new providers
    /// @param self Storage reference
    /// @param amount0 Amount of asset0 being added
    /// @param amount1 Amount of asset1 being added
    /// @param poolAsset0 Current pool balance of asset0
    /// @param poolAsset1 Current pool balance of asset1
    /// @param poolID Pool identifier for totalLiquidity access
    /// @param rate Exchange rate (asset0/asset1) 1e18 fixed point
    /// @return liquidity Amount of liquidity shares to mint
    function calculateLiquidityToMint(
        PoolManagerStorage storage self,
        uint256 amount0,
        uint256 amount1,
        uint128 poolAsset0,
        uint128 poolAsset1,
        uint256 poolID,
        uint256 rate
    ) internal view returns (uint256 liquidity) {
        // For first liquidity provision, use simple geometric mean
        if (self.totalLiquidity[poolID] == 0) {
            // Simple approach: use the sum of both amounts as initial liquidity
            liquidity = amount0 + amount1;
        } else {
            // Convert amount1 to amount0 equivalent using rate: amount1 * 1e18 / rate
            uint256 valueAdded = amount0 + (amount1 * 1e18) / rate;
            uint256 poolValue = poolAsset0 + (poolAsset1 * 1e18) / rate;
            
            // Proportional to pool
            liquidity = (valueAdded * self.totalLiquidity[poolID]) / poolValue;
        }
        
        if (liquidity == 0) revert PoolManager__InsufficientLiquidityMinted();
    }

    /*//////////////////////////////////////////////////////////////
                            STORAGE ACCESS FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Get current pool inventory - SINGLE STORAGE READ!
    /// @param self Storage reference
    /// @param poolId Pool identifier
    /// @return asset0 Asset0 balance
    /// @return asset1 Asset1 balance
    function getInventory(
        PoolManagerStorage storage self,
        uint256 poolId
    ) internal view returns (uint128 asset0, uint128 asset1) {
        uint256 packed = self.poolInventories[poolId]; // Single SLOAD!
        asset0 = uint128(packed);              // Lower 128 bits
        asset1 = uint128(packed >> 128);       // Upper 128 bits
    }

    /// @notice Update pool inventory - SINGLE STORAGE OPERATION!
    /// @param self Storage reference
    /// @param poolId Pool identifier
    /// @param asset0Delta Change for asset0 (positive = add, negative = subtract)
    /// @param asset1Delta Change for asset1 (positive = add, negative = subtract)
    function updateInventory(
        PoolManagerStorage storage self,
        uint256 poolId,
        int128 asset0Delta,
        int128 asset1Delta
    ) internal {
        uint256 packed = self.poolInventories[poolId]; // Single SLOAD
        uint128 asset0 = uint128(packed);         // Lower 128 bits
        uint128 asset1 = uint128(packed >> 128);  // Upper 128 bits
        
        // Apply delta changes
        asset0 = uint128(int128(asset0) + asset0Delta);
        asset1 = uint128(int128(asset1) + asset1Delta);
        
        // Pack and store only if changed - saves gas on no-op updates
        uint256 newPacked = uint256(asset0) | (uint256(asset1) << 128);
        if (newPacked != packed) {
            self.poolInventories[poolId] = newPacked; // Single SSTORE when needed
        }
    }

    /*//////////////////////////////////////////////////////////////
                            SWAP VALIDATION
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Validates if a swap can be executed with given inventory
    /// @param poolAsset0 Current asset0 balance
    /// @param poolAsset1 Current asset1 balance
    /// @param amountOut Expected output amount
    /// @param zeroForOne Direction of swap (true = asset0 -> asset1, false = asset1 -> asset0)
    function validateSwapInventory(
        uint128 poolAsset0,
        uint128 poolAsset1,
        uint256 amountOut,
        bool zeroForOne
    ) internal pure {
        // Check if pool has enough of the output asset
        if (zeroForOne) {
            // Swapping asset0 for asset1 - need enough asset1
            if (poolAsset1 < amountOut) revert PoolManager__InsufficientAsset1(amountOut, poolAsset1);
        } else {
            // Swapping asset1 for asset0 - need enough asset0
            if (poolAsset0 < amountOut) revert PoolManager__InsufficientAsset0(amountOut, poolAsset0);
        }
    }

    /*//////////////////////////////////////////////////////////////
                            ASSET TRANSFERS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Handles asset transfers for liquidity operations
    /// @param asset0 Asset0 address
    /// @param asset1 Asset1 address
    /// @param amount0 Amount of asset0 to transfer
    /// @param amount1 Amount of asset1 to transfer
    /// @param msgValue ETH value sent with transaction
    /// @param transferIn True for transferIn, false for transferOut
    /// @param recipient Recipient address (for transferOut)
    function handleAssetTransfers(
        address asset0,
        address asset1,
        uint256 amount0,
        uint256 amount1,
        uint256 msgValue,
        bool transferIn,
        address recipient
    ) internal {
        if (transferIn) {
            // Transfer assets in
            if (amount0 > 0) {
                AssetTransferLib.transferIn(asset0, recipient, amount0, msgValue);
            }
            if (amount1 > 0) {
                AssetTransferLib.transferIn(asset1, recipient, amount1, 0); // No ETH for asset1
            }
        } else {
            // Transfer assets out
            if (amount0 > 0) {
                AssetTransferLib.transferOut(asset0, recipient, amount0);
            }
            if (amount1 > 0) {
                AssetTransferLib.transferOut(asset1, recipient, amount1);
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                            BATCH SWAP PROCESSING
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Execute batch swap with automatic quoter selection
    /// @param self Storage reference
    /// @param hops Array of hops to execute
    /// @param amountIn Initial input amount
    /// @param msgValue ETH value for first hop
    /// @param recipient Recipient address
    /// @param quoterRouter QuoterRouter contract for quote calls
    /// @return amountOut Final output amount
    function executeBatchSwap(
        PoolManagerStorage storage self,
        Hop[] calldata hops,
        uint256 amountIn,
        uint256 msgValue,
        address recipient,
        address quoterRouter
    ) internal returns (uint256 amountOut) {
        uint256 numHops = hops.length;
        if (numHops == 0) revert PoolManager__NoHops();

        uint256 intermediateAmount = amountIn;
        // Determine user-facing input and output assets once
        address inputAsset = hops[0].zeroForOne ? hops[0].asset0 : hops[0].asset1;
        address outputAsset = hops[numHops - 1].zeroForOne ? hops[numHops - 1].asset1 : hops[numHops - 1].asset0;

        for (uint256 i = 0; i < numHops; ) {
            Hop calldata hop = hops[i];
            bool isFirstHop = i == 0;
            bool isLastHop = i == numHops - 1;
            
            intermediateAmount = executeHop(
                self,
                hop,
                intermediateAmount,
                isFirstHop ? msgValue : 0,
                isFirstHop,
                isLastHop,
                recipient,
                quoterRouter
            );
            unchecked { ++i; }
        }

        // Perform settlement only if a session is not active; otherwise defer to final session settle
        if (!FlashAccounting.isSessionActive(recipient)) {
            _settleUserDeltas(recipient, inputAsset, outputAsset, amountIn, intermediateAmount, msgValue);
        }

        return intermediateAmount;
    }

    /// @notice Execute a single hop (individual or batch based on array length)
    /// @param self Storage reference
    /// @param hop Hop to execute
    /// @param inputAmount Input amount for this hop
    /// @param msgValue ETH value for first hop
    /// @param isFirstHop Whether this is the first hop
    /// @param isLastHop Whether this is the last hop
    /// @param recipient Recipient address
    /// @param quoterRouter QuoterRouter contract for quote calls
    /// @return outputAmount Output amount from this hop
    function executeHop(
        PoolManagerStorage storage self,
        Hop calldata hop,
        uint256 inputAmount,
        uint256 msgValue,
        bool isFirstHop,
        bool isLastHop,
        address recipient,
        address quoterRouter
    ) internal returns (uint256 outputAmount) {
        if (hop.markings.length == 0) revert PoolManager__NoMarkings();
        if (hop.amounts.length != hop.markings.length) revert PoolManager__MismatchedArrays();
        
        if (hop.markings.length == 1) {
            // Single hop - use individual quote
            return executeSingleHop(
                self,
                hop.asset0,
                hop.asset1,
                hop.quoter,
                hop.markings[0],
                hop.zeroForOne,
                inputAmount,
                msgValue,
                isFirstHop,
                isLastHop,
                recipient,
                quoterRouter
            );
        } else {
            // Multiple hops with same quoter - use batch quote
            return executeBatchHopsWithQuoter(
                self,
                hop,
                inputAmount,
                isFirstHop,
                isLastHop,
                recipient,
                quoterRouter
            );
        }
    }

    /// @notice Execute multiple hops with the same quoter using batch quote
    /// @param self Storage reference
    /// @param hop Batch hop with multiple markings/amounts
    /// @param inputAmount Input amount for this batch
    /// @param isFirstHop Whether this is the first hop
    /// @param isLastHop Whether this is the last hop
    /// @param recipient Recipient address
    /// @param quoterRouter QuoterRouter contract for quote calls
    /// @return outputAmount Output amount from this batch
    function executeBatchHopsWithQuoter(
        PoolManagerStorage storage self,
        Hop calldata hop,
        uint256 inputAmount,
        bool isFirstHop,
        bool isLastHop,
        address recipient,
        address quoterRouter
    ) internal returns (uint256 outputAmount) {
        uint256 batchSize = hop.markings.length;
        
        // Flash accounting: record user owes input for first hop, defer transfer to settlement
        if (isFirstHop) {
            address inAsset = hop.zeroForOne ? hop.asset0 : hop.asset1;
            FlashAccounting.addDelta(recipient, inAsset, -int256(inputAmount));
        }
        
        // Prepare batch parameters for quoter
        uint128[] memory asset0Balances = new uint128[](batchSize);
        uint128[] memory asset1Balances = new uint128[](batchSize);
        
        // Get pool balances for all hops in the batch
        for (uint256 i = 0; i < batchSize; ) {
            uint256 poolID = PoolIDAssembly.assemblePoolID(hop.asset0, hop.asset1, hop.quoter, hop.markings[i]);
            (asset0Balances[i], asset1Balances[i]) = getInventory(self, poolID);
            unchecked { ++i; }
        }
        
        // Create SwapParams for batch quote
        SwapParams memory swapParams = SwapParams({
            asset0: hop.asset0,
            asset1: hop.asset1,
            quoter: hop.quoter,
            amount: hop.amounts,
            zeroForOne: hop.zeroForOne,
            marking: hop.markings
        });
        
        // Get batch quotes using QuoteRouter
        (uint256[] memory quotes, uint256[] memory poolIDs) = IQuoteRouter(quoterRouter).getQuoteBatch(swapParams, asset0Balances, asset1Balances);
        
        // Execute all hops in the batch
        for (uint256 i = 0; i < batchSize; ) {
            uint256 hopAmountIn = hop.amounts[i];
            uint256 hopAmountOut = quotes[i];
            
            // Validate swap inventory
            validateSwapInventory(
                asset0Balances[i], 
                asset1Balances[i], 
                hopAmountOut, 
                hop.zeroForOne
            );
            
            // Update inventory
            updateInventory(
                self,
                poolIDs[i],
                hop.zeroForOne ? int128(uint128(hopAmountIn)) : -int128(uint128(hopAmountOut)),
                hop.zeroForOne ? -int128(uint128(hopAmountOut)) : int128(uint128(hopAmountIn))
            );
            unchecked { ++i; }
        }
        
        // Flash accounting: record user is owed output for last hop, defer transfer to settlement
        if (isLastHop) {
            address outAsset = hop.zeroForOne ? hop.asset1 : hop.asset0;
            FlashAccounting.addDelta(recipient, outAsset, int256(quotes[batchSize - 1]));
        }
        
        return quotes[batchSize - 1];
    }

    /// @notice Execute a single hop
    /// @param self Storage reference
    /// @param asset0 First asset address
    /// @param asset1 Second asset address
    /// @param quoter Quoter contract address
    /// @param marking Pool marking
    /// @param zeroForOne Swap direction
    /// @param inputAmount Input amount
    /// @param msgValue ETH value
    /// @param isFirstHop Whether this is the first hop
    /// @param isLastHop Whether this is the last hop
    /// @param recipient Recipient address
    /// @param quoterRouter QuoterRouter contract for quote calls
    /// @return outputAmount Output amount
    function executeSingleHop(
        PoolManagerStorage storage self,
        address asset0,
        address asset1,
        address quoter,
        bytes3 marking,
        bool zeroForOne,
        uint256 inputAmount,
        uint256 msgValue,
        bool isFirstHop,
        bool isLastHop,
        address recipient,
        address quoterRouter
    ) internal returns (uint256 outputAmount) {
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, marking);

        // Flash accounting: record user owes input for first hop, defer transfer to settlement
        if (isFirstHop) {
            address inAsset = zeroForOne ? asset0 : asset1;
            FlashAccounting.addDelta(recipient, inAsset, -int256(inputAmount));
        }

        (uint128 poolAsset0, uint128 poolAsset1) = getInventory(self, poolID);

        outputAmount = getHopQuote(
            self,
            asset0,
            asset1,
            quoter,
            marking,
            zeroForOne,
            inputAmount,
            poolAsset0,
            poolAsset1,
            quoterRouter
        );

        validateSwapInventory(poolAsset0, poolAsset1, outputAmount, zeroForOne);

        updateInventory(
            self,
            poolID,
            zeroForOne ? int128(uint128(inputAmount)) : -int128(uint128(outputAmount)),
            zeroForOne ? -int128(uint128(outputAmount)) : int128(uint128(inputAmount))
        );

        if (isLastHop) {
            // Flash accounting: record user is owed output for last hop, defer transfer to settlement
            address outAsset = zeroForOne ? asset1 : asset0;
            FlashAccounting.addDelta(recipient, outAsset, int256(outputAmount));
        }
        // For intermediate hops, the output asset stays in the contract for the next hop
    }

    /// @notice Get quote for a single hop
    /// @param self_ Storage reference (unused)
    /// @param asset0 First asset address
    /// @param asset1 Second asset address
    /// @param quoter Quoter contract address
    /// @param marking Pool marking
    /// @param zeroForOne Swap direction
    /// @param amountIn Input amount
    /// @param poolAsset0 Pool asset0 balance
    /// @param poolAsset1 Pool asset1 balance
    /// @param quoterRouter QuoterRouter contract for quote calls
    /// @return amountOut Output amount
    function getHopQuote(
        PoolManagerStorage storage self_,
        address asset0,
        address asset1,
        address quoter,
        bytes3 marking,
        bool zeroForOne,
        uint256 amountIn,
        uint128 poolAsset0,
        uint128 poolAsset1,
        address quoterRouter
    ) internal returns (uint256 amountOut) {
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amountIn;
        bytes3[] memory marks = new bytes3[](1);
        marks[0] = marking;
        SwapParams memory p = SwapParams({
            asset0: asset0,
            asset1: asset1,
            quoter: quoter,
            amount: amounts,
            zeroForOne: zeroForOne,
            marking: marks
        });
        (uint256 quote, ) = IQuoteRouter(quoterRouter).getQuote(p, poolAsset0, poolAsset1);
        amountOut = quote > 0
            ? quote
            : (zeroForOne ? (amountIn * 1300000000000000000) / 1e18 : (amountIn * 1e18) / 1300000000000000000);
    }

    /*//////////////////////////////////////////////////////////////
                            FLASH SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Settle user's net deltas for two tokens (input/output) with minimal transfers
    function _settleUserDeltas(
        address user,
        address inputAsset,
        address outputAsset,
        uint256 /*amountIn*/,
        uint256 /*amountOut*/,
        uint256 msgValue
    ) internal {
        // Read deltas
        int256 inDelta = FlashAccounting.getDelta(user, inputAsset);
        int256 outDelta = FlashAccounting.getDelta(user, outputAsset);

        // If both assets are the same token, merge deltas
        if (inputAsset == outputAsset) {
            int256 net = inDelta + outDelta; // could be positive (pay user) or negative (collect from user)
            if (net < 0) {
                // collect from user
                uint256 collect = uint256(-net);
                AssetTransferLib.transferIn(inputAsset, user, collect, inputAsset == address(0) ? msgValue : 0);
            } else if (net > 0) {
                // pay user
                uint256 pay = uint256(net);
                AssetTransferLib.transferOut(outputAsset, user, pay);
            }
            // clear
            FlashAccounting.clearDelta(user, inputAsset);
            return;
        }

        // Different tokens: settle separately
        if (inDelta < 0) {
            uint256 collectIn = uint256(-inDelta);
            AssetTransferLib.transferIn(inputAsset, user, collectIn, inputAsset == address(0) ? msgValue : 0);
        } else if (inDelta > 0) {
            // Should not happen in this flow; clear defensively by paying out
            AssetTransferLib.transferOut(inputAsset, user, uint256(inDelta));
        }

        if (outDelta > 0) {
            AssetTransferLib.transferOut(outputAsset, user, uint256(outDelta));
        } else if (outDelta < 0) {
            // Should not happen in this flow; collect from user
            AssetTransferLib.transferIn(outputAsset, user, uint256(-outDelta), outputAsset == address(0) ? msgValue : 0);
        }

        // clear
        FlashAccounting.clearDelta(user, inputAsset);
        FlashAccounting.clearDelta(user, outputAsset);
    }

    /// @notice Settle an arbitrary list of tokens for a user (session settle)
    /// @dev Positive delta => pay user; Negative delta => collect from user
    function settleUserTokens(
        address user,
        address[] memory tokens,
        uint256 msgValue
    ) internal {
        uint256 length = tokens.length;
        for (uint256 i = 0; i < length; ) {
            address token = tokens[i];
            int256 delta = FlashAccounting.getDelta(user, token);
            if (delta != 0) {
                if (delta > 0) {
                    AssetTransferLib.transferOut(token, user, uint256(delta));
                } else {
                    AssetTransferLib.transferIn(token, user, uint256(-delta), token == address(0) ? msgValue : 0);
                }
                FlashAccounting.clearDelta(user, token);
            }
            unchecked { ++i; }
        }
    }
}