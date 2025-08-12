// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
// ssssssss
// Custom errors for gas-efficient reverts
error PoolManager__InsufficientWithdrawal(uint256 amount0, uint256 amount1);
error PoolManager__InsufficientOutput(uint256 minOut, uint256 actual);

import {ERC6909Claims} from "./ERC6909Claims.sol";
import {QuoteRequester} from "./QuoteRequester.sol";
import {PoolManagerLib} from "./libraries/PoolManagerLib.sol";
import {PoolIDAssembly} from "./libraries/PoolIDAssembly.sol";
import {SwapParams} from "./structs/SwapParams.sol";

// Using library for clean storage access
using PoolManagerLib for PoolManagerLib.PoolManagerStorage;

contract PoolManager is ERC6909Claims, QuoteRequester {
    constructor(address _defaultAlpha, address _defaultBeta) QuoteRequester(_defaultAlpha, _defaultBeta) {}

    // Library storage for total liquidity tracking
    PoolManagerLib.PoolManagerStorage private _storage;
    
    // PoolID: 42955307580170980946467815337668002166680498660974576864971747189779899351040
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
    function getInventory(uint256 poolId) external view returns (uint128 asset0, uint128 asset1) {
        return PoolManagerLib.getInventory(_storage, poolId);
    }

    // Execution cost: 147,458
    // Transactin cost:  170, 158
    /// @notice Add liquidity to a pool - OPTIMAL IMPLEMENTATION
    function addLiquidity(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amount0,
        uint256 amount1
    ) external payable returns (uint256 liquidity) {
        // Calculate poolID on-the-fly
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        // Get current pool balances
        (uint128 poolAsset0, uint128 poolAsset1) = PoolManagerLib.getInventory(_storage, poolID);
        
        // Get quote using the quoter system with current pool balances
        SwapParams memory swapParams = SwapParams({
            asset0: asset0,
            asset1: asset1,
            quoter: quoter,
            amount: new uint256[](1),
            zeroForOne: true, // For liquidity calculation, direction doesn't matter much
            marking: new bytes3[](1)
        });
        swapParams.amount[0] = uint256(poolAsset0); // Use current balance as amount for rate calculation
        swapParams.marking[0] = markings;
        
        (uint256 rate, ) = getQuote(swapParams, poolAsset0, poolAsset1);
        if (rate == 0) rate = 1300000000000000000; // Fallback to 1.3 rate if quoter fails
        
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
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 liquidity
    ) external returns (uint256 amount0, uint256 amount1) {
        require(liquidity > 0, "Invalid liquidity amount");
        
        // Calculate poolID on-the-fly
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        // Get current pool balances
        (uint128 poolAsset0, uint128 poolAsset1) = PoolManagerLib.getInventory(_storage, poolID);
        require(_storage.totalLiquidity[poolID] > 0, "No liquidity in pool");
        
        // Calculate proportional amounts - simple math, inline
        amount0 = (liquidity * poolAsset0) / _storage.totalLiquidity[poolID];
        amount1 = (liquidity * poolAsset1) / _storage.totalLiquidity[poolID];
        if (amount0 == 0 && amount1 == 0) revert PoolManager__InsufficientWithdrawal(amount0, amount1);
        
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

    // Execution cost: 67,670
    // Transaction cost: 77,821
    /// @notice Swap assets in a pool - lean implementation
    function swap(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut
    ) external payable returns (uint256 amountOut) {
        // Calculate poolID on-the-fly
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        // Transfer in input asset - inline asset determination
        PoolManagerLib.handleAssetTransfers(
            zeroForOne ? asset0 : asset1, address(0), amountIn, 0, msg.value, true, msg.sender
        );
        
        // Get inventory and calculate output using quoter system
        (uint128 poolAsset0, uint128 poolAsset1) = PoolManagerLib.getInventory(_storage, poolID);
        
        // Create swap params for quoter
        SwapParams memory swapParams = SwapParams({
            asset0: asset0,
            asset1: asset1,
            quoter: quoter,
            amount: new uint256[](1),
            zeroForOne: zeroForOne,
            marking: new bytes3[](1)
        });
        swapParams.amount[0] = amountIn;
        swapParams.marking[0] = markings;
        
        (uint256 quote, ) = getQuote(swapParams, poolAsset0, poolAsset1);
        amountOut = quote > 0 ? quote : ((zeroForOne ? (amountIn * 1300000000000000000) / 1e18 : (amountIn * 1e18) / 1300000000000000000));
        
        // Validate and check minimums
        PoolManagerLib.validateSwapInventory(poolAsset0, poolAsset1, amountOut, zeroForOne);
        if (amountOut < minAmountOut) revert PoolManager__InsufficientOutput(minAmountOut, amountOut);

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