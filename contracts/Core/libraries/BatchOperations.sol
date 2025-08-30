// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PoolIDAssembly} from "./PoolIDAssembly.sol";
import {FlashAccounting} from "./FlashAccounting.sol";

/**
 * @title BatchOperations
 * @notice Library for executing batch liquidity and pool operations
 * @dev Gas-optimized batch processing with transient storage
 */
library BatchOperations {
    
    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    struct BatchLiquidityParams {
        address asset0;
        address asset1;
        address quoter;
        bytes3[] markings;      // Multiple pools with different markings
        uint256[] amounts0;     // Amount of asset0 for each pool
        uint256[] amounts1;     // Amount of asset1 for each pool
    }
    
    struct BatchRemovalParams {
        address asset0;
        address asset1;
        address quoter;
        bytes3[] markings;      // Multiple pools with different markings
        uint256[] liquidities;  // Liquidity to remove from each pool
    }
    
    struct BatchPoolCreation {
        address[] asset0s;
        address[] asset1s;
        address[] quoters;
        bytes3[] markings;
        bool skipExisting;      // Skip if pool already exists
    }
    
    struct BatchResult {
        bool[] success;
        uint256[] values;       // Could be poolIds, liquidity amounts, etc.
        string[] errors;        // Error messages for failed operations
    }
    
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event BatchLiquidityAdded(
        address indexed provider,
        uint256[] poolIds,
        uint256[] liquidities,
        uint256 totalAsset0,
        uint256 totalAsset1
    );
    
    event BatchLiquidityRemoved(
        address indexed provider,
        uint256[] poolIds,
        uint256[] amounts0,
        uint256[] amounts1
    );
    
    event BatchPoolsCreated(
        address indexed creator,
        uint256[] poolIds,
        uint256 successCount,
        uint256 failCount
    );
    
    event BatchOperationFailed(
        uint256 indexed index,
        string operation,
        string reason
    );
    
    /*//////////////////////////////////////////////////////////////
                            BATCH LIQUIDITY FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Add liquidity to multiple pools in a single transaction
     * @dev Uses flash accounting for efficient token transfers
     * @param totalLiquidity Reference to total liquidity storage
     * @param poolInventories Reference to pool inventories storage
     * @param params Batch liquidity parameters
     * @param sender Address providing liquidity
     * @return poolIds Array of pool IDs
     * @return liquidities Array of liquidity shares minted
     */
    function batchAddLiquidity(
        mapping(uint256 => uint256) storage totalLiquidity,
        mapping(uint256 => uint256) storage poolInventories,
        BatchLiquidityParams memory params,
        address sender
    ) internal returns (
        uint256[] memory poolIds,
        uint256[] memory liquidities
    ) {
        require(
            params.markings.length == params.amounts0.length &&
            params.markings.length == params.amounts1.length,
            "BatchOps: Length mismatch"
        );
        
        uint256 length = params.markings.length;
        poolIds = new uint256[](length);
        liquidities = new uint256[](length);
        
        // Track total amounts for efficient settlement
        uint256 totalAmount0;
        uint256 totalAmount1;
        
        for (uint256 i = 0; i < length; ) {
            // Calculate pool ID
            poolIds[i] = PoolIDAssembly.assemblePoolID(
                params.asset0,
                params.asset1,
                params.quoter,
                params.markings[i]
            );
            
            // Get current pool state
            uint256 packed = poolInventories[poolIds[i]];
            uint128 poolAsset0 = uint128(packed);
            uint128 poolAsset1 = uint128(packed >> 128);
            uint256 totalLiq = totalLiquidity[poolIds[i]];
            
            // Calculate liquidity to mint
            if (totalLiq == 0) {
                // First liquidity provider
                liquidities[i] = params.amounts0[i] + params.amounts1[i];
            } else {
                // Proportional liquidity
                uint256 liq0 = (params.amounts0[i] * totalLiq) / poolAsset0;
                uint256 liq1 = (params.amounts1[i] * totalLiq) / poolAsset1;
                liquidities[i] = liq0 < liq1 ? liq0 : liq1;
            }
            
            // Update pool state
            poolAsset0 += uint128(params.amounts0[i]);
            poolAsset1 += uint128(params.amounts1[i]);
            poolInventories[poolIds[i]] = uint256(poolAsset0) | (uint256(poolAsset1) << 128);
            totalLiquidity[poolIds[i]] += liquidities[i];
            
            // Track totals
            totalAmount0 += params.amounts0[i];
            totalAmount1 += params.amounts1[i];
            
            unchecked { ++i; }
        }
        
        // Update flash accounting for batch settlement
        FlashAccounting.addDelta(sender, params.asset0, -int256(totalAmount0));
        FlashAccounting.addDelta(sender, params.asset1, -int256(totalAmount1));
        
        emit BatchLiquidityAdded(sender, poolIds, liquidities, totalAmount0, totalAmount1);
    }
    
    /**
     * @notice Remove liquidity from multiple pools in a single transaction
     * @dev Uses flash accounting for efficient token transfers
     */
    function batchRemoveLiquidity(
        mapping(uint256 => uint256) storage totalLiquidity,
        mapping(uint256 => uint256) storage poolInventories,
        BatchRemovalParams memory params,
        address sender
    ) internal returns (
        uint256[] memory amounts0,
        uint256[] memory amounts1
    ) {
        require(
            params.markings.length == params.liquidities.length,
            "BatchOps: Length mismatch"
        );
        
        uint256 length = params.markings.length;
        amounts0 = new uint256[](length);
        amounts1 = new uint256[](length);
        uint256[] memory poolIds = new uint256[](length);
        
        // Track total amounts for efficient settlement
        uint256 totalAmount0;
        uint256 totalAmount1;
        
        for (uint256 i = 0; i < length; ) {
            // Calculate pool ID
            poolIds[i] = PoolIDAssembly.assemblePoolID(
                params.asset0,
                params.asset1,
                params.quoter,
                params.markings[i]
            );
            
            // Get current pool state
            uint256 packed = poolInventories[poolIds[i]];
            uint128 poolAsset0 = uint128(packed);
            uint128 poolAsset1 = uint128(packed >> 128);
            uint256 totalLiq = totalLiquidity[poolIds[i]];
            
            require(totalLiq > 0, "BatchOps: No liquidity");
            require(params.liquidities[i] <= totalLiq, "BatchOps: Insufficient liquidity");
            
            // Calculate proportional amounts
            amounts0[i] = (params.liquidities[i] * poolAsset0) / totalLiq;
            amounts1[i] = (params.liquidities[i] * poolAsset1) / totalLiq;
            
            // Update pool state
            poolAsset0 -= uint128(amounts0[i]);
            poolAsset1 -= uint128(amounts1[i]);
            poolInventories[poolIds[i]] = uint256(poolAsset0) | (uint256(poolAsset1) << 128);
            totalLiquidity[poolIds[i]] -= params.liquidities[i];
            
            // Track totals
            totalAmount0 += amounts0[i];
            totalAmount1 += amounts1[i];
            
            unchecked { ++i; }
        }
        
        // Update flash accounting for batch settlement
        FlashAccounting.addDelta(sender, params.asset0, int256(totalAmount0));
        FlashAccounting.addDelta(sender, params.asset1, int256(totalAmount1));
        
        emit BatchLiquidityRemoved(sender, poolIds, amounts0, amounts1);
    }
    
    /*//////////////////////////////////////////////////////////////
                            BATCH POOL CREATION
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Create multiple pools in a single transaction
     * @dev Useful for deploying multiple related pools at once
     */
    function batchCreatePools(
        mapping(uint256 => PoolInfo) storage poolInfos,
        BatchPoolCreation memory params
    ) internal returns (BatchResult memory result) {
        require(
            params.asset0s.length == params.asset1s.length &&
            params.asset0s.length == params.quoters.length &&
            params.asset0s.length == params.markings.length,
            "BatchOps: Length mismatch"
        );
        
        uint256 length = params.asset0s.length;
        result.success = new bool[](length);
        result.values = new uint256[](length);
        result.errors = new string[](length);
        
        uint256 successCount;
        uint256 failCount;
        
        for (uint256 i = 0; i < length; ) {
            // Canonicalize asset order
            (address a0, address a1) = params.asset0s[i] < params.asset1s[i] 
                ? (params.asset0s[i], params.asset1s[i]) 
                : (params.asset1s[i], params.asset0s[i]);
            
            // Calculate pool ID
            uint256 poolId = PoolIDAssembly.assemblePoolID(
                a0,
                a1,
                params.quoters[i],
                params.markings[i]
            );
            
            // Check if pool exists
            if (poolInfos[poolId].quoter != address(0)) {
                if (params.skipExisting) {
                    result.success[i] = true;
                    result.values[i] = poolId;
                    result.errors[i] = "Already exists (skipped)";
                    successCount++;
                } else {
                    result.success[i] = false;
                    result.values[i] = 0;
                    result.errors[i] = "Pool already exists";
                    failCount++;
                    emit BatchOperationFailed(i, "createPool", "Already exists");
                }
            } else {
                // Create new pool
                poolInfos[poolId] = PoolInfo({
                    asset0: a0,
                    asset1: a1,
                    quoter: params.quoters[i],
                    markings: params.markings[i]
                });
                
                result.success[i] = true;
                result.values[i] = poolId;
                result.errors[i] = "";
                successCount++;
            }
            
            unchecked { ++i; }
        }
        
        uint256[] memory createdPoolIds = new uint256[](successCount);
        uint256 index;
        for (uint256 i = 0; i < length; i++) {
            if (result.success[i] && bytes(result.errors[i]).length == 0) {
                createdPoolIds[index++] = result.values[i];
            }
        }
        
        emit BatchPoolsCreated(msg.sender, createdPoolIds, successCount, failCount);
    }
    
    /*//////////////////////////////////////////////////////////////
                            BATCH REBALANCING
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Rebalance liquidity across multiple pools
     * @dev Removes from some pools and adds to others atomically
     */
    function batchRebalance(
        mapping(uint256 => uint256) storage totalLiquidity,
        mapping(uint256 => uint256) storage poolInventories,
        uint256[] memory removeFromPools,
        uint256[] memory removeAmounts,
        uint256[] memory addToPools,
        uint256[] memory addAmounts0,
        uint256[] memory addAmounts1,
        address sender
    ) internal {
        // First, remove liquidity from specified pools
        for (uint256 i = 0; i < removeFromPools.length; ) {
            _removeLiquidityInternal(
                totalLiquidity,
                poolInventories,
                removeFromPools[i],
                removeAmounts[i],
                sender
            );
            unchecked { ++i; }
        }
        
        // Then add liquidity to target pools
        for (uint256 i = 0; i < addToPools.length; ) {
            _addLiquidityInternal(
                totalLiquidity,
                poolInventories,
                addToPools[i],
                addAmounts0[i],
                addAmounts1[i],
                sender
            );
            unchecked { ++i; }
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                            INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/
    
    function _removeLiquidityInternal(
        mapping(uint256 => uint256) storage totalLiquidity,
        mapping(uint256 => uint256) storage poolInventories,
        uint256 poolId,
        uint256 liquidity,
        address sender
    ) private returns (uint256 amount0, uint256 amount1) {
        uint256 packed = poolInventories[poolId];
        uint128 poolAsset0 = uint128(packed);
        uint128 poolAsset1 = uint128(packed >> 128);
        uint256 totalLiq = totalLiquidity[poolId];
        
        amount0 = (liquidity * poolAsset0) / totalLiq;
        amount1 = (liquidity * poolAsset1) / totalLiq;
        
        poolAsset0 -= uint128(amount0);
        poolAsset1 -= uint128(amount1);
        poolInventories[poolId] = uint256(poolAsset0) | (uint256(poolAsset1) << 128);
        totalLiquidity[poolId] -= liquidity;
    }
    
    function _addLiquidityInternal(
        mapping(uint256 => uint256) storage totalLiquidity,
        mapping(uint256 => uint256) storage poolInventories,
        uint256 poolId,
        uint256 amount0,
        uint256 amount1,
        address sender
    ) private returns (uint256 liquidity) {
        uint256 packed = poolInventories[poolId];
        uint128 poolAsset0 = uint128(packed);
        uint128 poolAsset1 = uint128(packed >> 128);
        uint256 totalLiq = totalLiquidity[poolId];
        
        if (totalLiq == 0) {
            liquidity = amount0 + amount1;
        } else {
            uint256 liq0 = (amount0 * totalLiq) / poolAsset0;
            uint256 liq1 = (amount1 * totalLiq) / poolAsset1;
            liquidity = liq0 < liq1 ? liq0 : liq1;
        }
        
        poolAsset0 += uint128(amount0);
        poolAsset1 += uint128(amount1);
        poolInventories[poolId] = uint256(poolAsset0) | (uint256(poolAsset1) << 128);
        totalLiquidity[poolId] += liquidity;
    }
}

// Import after library definition to avoid circular dependency
import {PoolInfo} from "../structs/PoolInfo.sol";
