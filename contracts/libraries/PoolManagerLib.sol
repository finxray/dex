// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Custom errors for gas-efficient reverts
error PoolManager__InsufficientLiquidityMinted();
error PoolManager__InsufficientAsset0(uint256 required, uint256 available);
error PoolManager__InsufficientAsset1(uint256 required, uint256 available);

import {PoolIDAssembly} from "./PoolIDAssembly.sol";
import {AssetTransferLib} from "./AssetTransferLib.sol";

/// @notice Library containing core calculation logic for PoolManager
/// @dev Pure calculation functions and simple storage management
library PoolManagerLib {
    
    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/
    
    struct PoolManagerStorage {
        // Total liquidity (shares) issued per pool
        mapping(uint256 => uint256) totalLiquidity;
        // Pool asset balances (poolID -> packed uint256) - BOTH ASSETS IN SINGLE SLOT!
        // Lower 128 bits = asset0, Upper 128 bits = asset1
        mapping(uint256 => uint256) poolInventories;
    }
    
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event PoolCreated(uint256 indexed poolID, address asset0, address asset1, address quoter, bytes3 markings);

    /*//////////////////////////////////////////////////////////////
                            POOL CREATION
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Creates a new pool with canonical asset ordering (asset0 < asset1)
    /// @param asset0 First asset address
    /// @param asset1 Second asset address  
    /// @param quoter Quoter contract address
    /// @param markings Pool configuration markings
    /// @return poolID The unique identifier for the created pool
    function createPool(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) internal returns (uint256 poolID) {
        // PoolIDAssembly will canonicalize the order internally
        poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        // Emit with canonical order for consistency
        (address sortedAsset0, address sortedAsset1) = asset0 < asset1 ? (asset0, asset1) : (asset1, asset0);
        emit PoolCreated(poolID, sortedAsset0, sortedAsset1, quoter, markings);
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
}