// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PoolManagerLib} from "./libraries/PoolManagerLib.sol";
import {PoolIDAssembly} from "./libraries/PoolIDAssembly.sol";
import {SwapParams} from "./structs/SwapParams.sol";
import {FlashAccounting} from "./libraries/FlashAccounting.sol";
import {SimpleGovernanceLib} from "./libraries/SimpleGovernanceLib.sol";
import {ReentrancyGuard} from "./security/ReentrancyGuard.sol";
import {IPoolManager} from "./interfaces/internal/IPoolManager.sol";

/// @title LiquidityManager
/// @notice External contract handling liquidity operations to reduce PoolManager size
/// @dev This contract handles add/remove liquidity operations that are less frequent
contract LiquidityManager is ReentrancyGuard {
    
    error LiquidityManager__InvalidInitialAmounts();
    error LiquidityManager__InvalidLiquidityAmount();
    error LiquidityManager__NoLiquidity();
    error LiquidityManager__InsufficientWithdrawal(uint256 amount0, uint256 amount1);
    error LiquidityManager__OperationPaused();
    error LiquidityManager__InvalidQuote();

    IPoolManager public immutable poolManager;
    
    constructor(address _poolManager) {
        poolManager = IPoolManager(_poolManager);
    }
    
    /// @notice Add liquidity to a pool
    /// @dev Moved from PoolManager to reduce contract size
    function addLiquidity(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amount0,
        uint256 amount1
    ) external payable nonReentrant returns (uint256 liquidity) {
        // Calculate poolID (canonicalizes asset order internally)
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        // Validate pool exists and get current state
        (uint128 poolAsset0, uint128 poolAsset1) = poolManager.getInventory(poolID);
        uint256 totalLiquidity = poolManager.totalLiquidity(poolID);
        
        // Canonicalize amounts to match asset ordering used in poolID
        (address a0, address a1) = asset0 < asset1 ? (asset0, asset1) : (asset1, asset0);
        (uint256 amt0, uint256 amt1) = asset0 < asset1 ? (amount0, amount1) : (amount1, amount0);
        
        // Determine rate: if first liquidity, derive from provided amounts; otherwise, use inventory ratio
        uint256 rate;
        if (totalLiquidity == 0) {
            if (!(amt0 > 0 && amt1 > 0)) revert LiquidityManager__InvalidInitialAmounts();
            rate = (amt0 * 1e18) / amt1;
        } else {
            // Use inventory-implied rate to avoid quoter bias on profit calculation
            rate = PoolManagerLib.getInventoryRateAsset0Per1e18Asset1(poolAsset0, poolAsset1);
            if (rate == 0) {
                // Fallback to quoter if inventory is unbalanced
                SwapParams memory p = SwapParams({
                    asset0: a0,
                    asset1: a1,
                    quoter: quoter,
                    amount: new uint256[](1),
                    zeroForOne: false,
                    marking: new bytes3[](1),
                    traderProtection: 0x00000000
                });
                p.amount[0] = 1e18;
                p.marking[0] = markings;
                (uint256 quoteAmount, ) = poolManager.routerGetQuote(p, poolAsset0, poolAsset1);
                if (quoteAmount == 0) revert LiquidityManager__InvalidQuote();
                rate = quoteAmount;
            }
        }

        // Calculate liquidity to mint
        if (totalLiquidity == 0) {
            liquidity = _sqrt(amt0 * amt1);
            if (liquidity <= 1000) revert LiquidityManager__InvalidInitialAmounts();
            liquidity -= 1000; // Permanent lock for first LP
        } else {
            // Proportional to existing liquidity
            uint256 liquidity0 = (amt0 * totalLiquidity) / poolAsset0;
            uint256 liquidity1 = (amt1 * totalLiquidity) / poolAsset1;
            liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
        }

        // Call PoolManager to execute the liquidity addition
        liquidity = poolManager.executeLiquidityAdd(
            poolID,
            a0,
            a1,
            amt0,
            amt1,
            liquidity,
            msg.sender,
            msg.value
        );
    }
    
    /// @notice Remove liquidity from a pool
    /// @dev Moved from PoolManager to reduce contract size
    function removeLiquidity(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 liquidity
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        if (liquidity == 0) revert LiquidityManager__InvalidLiquidityAmount();
        
        // Calculate poolID on-the-fly
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        // Get current pool state
        (uint128 poolAsset0, uint128 poolAsset1) = poolManager.getInventory(poolID);
        uint256 totalLiquidity = poolManager.totalLiquidity(poolID);
        if (totalLiquidity == 0) revert LiquidityManager__NoLiquidity();
        
        // Calculate proportional amounts
        amount0 = (liquidity * poolAsset0) / totalLiquidity;
        amount1 = (liquidity * poolAsset1) / totalLiquidity;
        if (amount0 == 0 && amount1 == 0) revert LiquidityManager__InsufficientWithdrawal(amount0, amount1);
        
        // Call PoolManager to execute the liquidity removal
        (amount0, amount1) = poolManager.executeLiquidityRemove(
            poolID,
            asset0 < asset1 ? asset0 : asset1,
            asset0 < asset1 ? asset1 : asset0,
            asset0 < asset1 ? amount0 : amount1,
            asset0 < asset1 ? amount1 : amount0,
            liquidity,
            msg.sender
        );
    }
    
    /// @notice Calculate square root for liquidity calculations
    function _sqrt(uint256 x) private pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
}
