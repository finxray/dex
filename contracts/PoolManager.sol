// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC6909Claims} from "./ERC6909Claims.sol";
import {QuoteRequester} from "./QuoteRequester.sol";
import {PoolManagerLib} from "./libraries/PoolManagerLib.sol";

// Using library for clean storage access
using PoolManagerLib for PoolManagerLib.PoolManagerStorage;

contract PoolManager is ERC6909Claims, QuoteRequester {
    constructor(address _defaultAlpha, address _defaultBeta) QuoteRequester(_defaultAlpha, _defaultBeta) {}

    // Library storage for total liquidity tracking
    PoolManagerLib.PoolManagerStorage private _storage;
    
    /// @notice Creates a new pool using library logic
    function createPool(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) external returns (uint256 poolID) {
        return PoolManagerLib.createPool(asset0, asset1, quoter, markings);
    }
    
    /// @notice Get total liquidity for a pool
    function totalLiquidity(uint256 poolID) external view returns (uint256) {
        return _storage.totalLiquidity[poolID];
    }

    /*//////////////////////////////////////////////////////////////
                            POOL INVENTORY MANAGEMENT
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Get current pool inventory - PUBLIC INTERFACE
    function getInventory(uint256 poolId) public view returns (uint128 asset0, uint128 asset1) {
        return PoolManagerLib.getInventory(_storage, poolId);
    }


    /// @notice Add liquidity to a pool - OPTIMAL IMPLEMENTATION
    function addLiquidity(
        uint256 poolID,
        address asset0,
        address asset1,
        uint256 amount0,
        uint256 amount1
    ) external payable returns (uint256 liquidity) {
        // Get current pool balances
        (uint128 poolAsset0, uint128 poolAsset1) = PoolManagerLib.getInventory(_storage, poolID);
        
        // Calculate liquidity using library - only for complex calculation
        uint256 rate = dummyQuoter(asset0, asset1, poolAsset0, poolAsset1);
        liquidity = PoolManagerLib.calculateLiquidityToMint(
            _storage, amount0, amount1, poolAsset0, poolAsset1, poolID, rate
        );

        // Handle transfers using library
        PoolManagerLib.handleAssetTransfers(
            asset0, asset1, amount0, amount1, msg.value, true, msg.sender
        );

        // Update inventory via library
        PoolManagerLib.updateInventory(_storage, poolID, int128(uint128(amount0)), int128(uint128(amount1)));

        // Mint shares and update total directly
        _mint(msg.sender, poolID, liquidity);
        _storage.totalLiquidity[poolID] += liquidity;
    }

    /// @notice Remove liquidity from a pool - OPTIMAL IMPLEMENTATION
    function removeLiquidity(
        uint256 poolID,
        address asset0,
        address asset1,
        uint256 liquidity
    ) external returns (uint256 amount0, uint256 amount1) {
        require(liquidity > 0, "Invalid liquidity amount");
        
        // Get current pool balances
        (uint128 poolAsset0, uint128 poolAsset1) = PoolManagerLib.getInventory(_storage, poolID);
        require(_storage.totalLiquidity[poolID] > 0, "No liquidity in pool");
        
        // Calculate proportional amounts - simple math, inline
        amount0 = (liquidity * poolAsset0) / _storage.totalLiquidity[poolID];
        amount1 = (liquidity * poolAsset1) / _storage.totalLiquidity[poolID];
        require(amount0 > 0 || amount1 > 0, "Insufficient assets to withdraw");
        
        // Burn shares and update total directly
        _burn(msg.sender, poolID, liquidity);
        _storage.totalLiquidity[poolID] -= liquidity;
        
        // Update inventory via library
        PoolManagerLib.updateInventory(_storage, poolID, -int128(uint128(amount0)), -int128(uint128(amount1)));

        // Transfer assets using library
        PoolManagerLib.handleAssetTransfers(
            asset0, asset1, amount0, amount1, 0, false, msg.sender
        );
    }

    /// @notice Swap assets in a pool - lean implementation
    function swap(
        uint256 poolID,
        address asset0,
        address asset1,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut
    ) external payable returns (uint256 amountOut) {
        // Transfer in input asset - inline asset determination
        PoolManagerLib.handleAssetTransfers(
            zeroForOne ? asset0 : asset1, address(0), amountIn, 0, msg.value, true, msg.sender
        );
        
        // Get inventory and calculate output in one flow
        (uint128 poolAsset0, uint128 poolAsset1) = PoolManagerLib.getInventory(_storage, poolID);
        uint256 rate = dummyQuoter(asset0, asset1, poolAsset0, poolAsset1);
        amountOut = zeroForOne ? (amountIn * rate) / 1e18 : (amountIn * 1e18) / rate;
        
        // Validate and check minimums
        PoolManagerLib.validateSwapInventory(poolAsset0, poolAsset1, amountOut, zeroForOne);
        require(amountOut >= minAmountOut, "Insufficient output amount");

        // Update inventory - inline delta calculation
        PoolManagerLib.updateInventory(
            _storage, 
            poolID, 
            zeroForOne ? int128(uint128(amountIn)) : -int128(uint128(amountOut)),
            zeroForOne ? -int128(uint128(amountOut)) : int128(uint128(amountIn))
        );
        
        // Transfer out output asset - inline asset determination
        PoolManagerLib.handleAssetTransfers(
            zeroForOne ? asset1 : asset0, address(0), amountOut, 0, 0, false, msg.sender
        );
    }
}