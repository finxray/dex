// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
// ssssssss
// Custom errors for gas-efficient reverts
error PoolManager__InsufficientWithdrawal(uint256 amount0, uint256 amount1);
error PoolManager__InsufficientOutput(uint256 minOut, uint256 actual);
error PoolManager__InvalidQuote();
error PoolManager__Reentrancy();

import {ERC6909Claims} from "./ERC6909Claims.sol";
import {QuoteRouter} from "./QuoteRouter.sol";
import {PoolManagerLib} from "./libraries/PoolManagerLib.sol";
import {PoolIDAssembly} from "./libraries/PoolIDAssembly.sol";
import {SwapParams} from "./structs/SwapParams.sol";
import {Hop} from "./structs/Hop.sol";
import {PoolInfo} from "./structs/PoolInfo.sol";
import {ReentrancyGuard} from "./security/ReentrancyGuard.sol";

// Using library for clean storage access
using PoolManagerLib for PoolManagerLib.PoolManagerStorage;

contract PoolManager is ERC6909Claims, QuoteRouter, ReentrancyGuard {
    constructor(address _defaultAlpha, address _defaultBeta) QuoteRouter(_defaultAlpha, _defaultBeta) {}

    // Library storage for total liquidity tracking
    PoolManagerLib.PoolManagerStorage private _storage;


    
    // PoolID: 42955307580170980946467815337668002166680498660974576864971747189779899351040
    /// @notice Creates a new pool using library logic
    function createPool(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) external nonReentrant returns (uint256 poolID) {
        return PoolManagerLib.createPool(_storage, asset0, asset1, quoter, markings);
    }
    
    /// @notice Get pool information by poolID
    /// @param poolID Pool identifier
    /// @return asset0 First asset address (canonical order)
    /// @return asset1 Second asset address (canonical order)
    /// @return quoter Quoter contract address
    /// @return markings Pool configuration markings
    function getPoolInfo(uint256 poolID) external view returns (
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) {
        PoolInfo memory poolInfo = PoolManagerLib.getPoolInfo(_storage, poolID);
        return (poolInfo.asset0, poolInfo.asset1, poolInfo.quoter, poolInfo.markings);
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
        return _getInventory(poolId);
    }

    // Internal helpers to avoid Remix parser issues with using-for dot calls
    function _getInventory(uint256 poolId) internal view returns (uint128 asset0, uint128 asset1) {
        uint256 packed = _storage.poolInventories[poolId];
        asset0 = uint128(packed);
        asset1 = uint128(packed >> 128);
    }

    function _updateInventory(
        uint256 poolId,
        int128 asset0Delta,
        int128 asset1Delta
    ) internal {
        uint256 packed = _storage.poolInventories[poolId];
        uint128 a0 = uint128(packed);
        uint128 a1 = uint128(packed >> 128);
        a0 = uint128(int128(a0) + asset0Delta);
        a1 = uint128(int128(a1) + asset1Delta);
        uint256 newPacked = uint256(a0) | (uint256(a1) << 128);
        if (newPacked != packed) {
            _storage.poolInventories[poolId] = newPacked;
        }
    }

    // Execution cost: 147,458..
    // Transactin cost:  170, 158
    /// @notice Add liquidity to a pool - SIMPLIFIED IMPLEMENTATION
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
        
        // Canonicalize amounts to match asset ordering used in poolID
        (address a0, address a1) = asset0 < asset1 ? (asset0, asset1) : (asset1, asset0);
        (uint256 amt0, uint256 amt1) = asset0 < asset1 ? (amount0, amount1) : (amount1, amount0);
        
        // Get current pool balances (canonical order)
        (uint128 poolAsset0, uint128 poolAsset1) = _getInventory(poolID);
        
        // Determine rate: if first liquidity, derive from provided amounts; otherwise, request via router
        // Define rate as asset0 per 1e18 units of asset1 (1e18 fixed point)
        uint256 rate;
        if (_storage.totalLiquidity[poolID] == 0) {
            require(amt0 > 0 && amt1 > 0, "Invalid initial amounts");
            rate = (amt0 * 1e18) / amt1;
        } else {
            SwapParams memory p = SwapParams({
                asset0: a0,
                asset1: a1,
                quoter: quoter,
                amount: new uint256[](1),
                zeroForOne: false, // quote asset1 -> asset0
                marking: new bytes3[](1)
            });
            p.amount[0] = 1e18; // 1 token (18 decimals)
            p.marking[0] = markings;
            (uint256 quoteAmount, ) = getQuote(p, poolAsset0, poolAsset1);
            if (quoteAmount == 0) revert PoolManager__InvalidQuote();
            rate = quoteAmount;
        }
        
        liquidity = PoolManagerLib.calculateLiquidityToMint(
            _storage, amt0, amt1, poolAsset0, poolAsset1, poolID, rate
        );

        // Handle transfers using canonical order
        PoolManagerLib.handleAssetTransfers(a0, a1, amt0, amt1, msg.value, true, msg.sender);

        // Update inventory with canonical amounts
        _updateInventory(poolID, int128(uint128(amt0)), int128(uint128(amt1)));

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
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        require(liquidity > 0, "Invalid liquidity amount");
        
        // Calculate poolID on-the-fly
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        // Get current pool balances
        (uint128 poolAsset0, uint128 poolAsset1) = _getInventory(poolID);
        require(_storage.totalLiquidity[poolID] > 0, "No liquidity in pool");
        
        // Calculate proportional amounts - simple math, inline
        amount0 = (liquidity * poolAsset0) / _storage.totalLiquidity[poolID];
        amount1 = (liquidity * poolAsset1) / _storage.totalLiquidity[poolID];
        if (amount0 == 0 && amount1 == 0) revert PoolManager__InsufficientWithdrawal(amount0, amount1);
        
        // Burn shares and update total directly
        _burn(msg.sender, poolID, liquidity);
        _storage.totalLiquidity[poolID] -= liquidity;
        
        // Update inventory via helper
        _updateInventory(poolID, -int128(uint128(amount0)), -int128(uint128(amount1)));

        // Transfer assets using library
        bool canonicalOrder = asset0 < asset1;
        (uint256 out0, uint256 out1) = canonicalOrder ? (amount0, amount1) : (amount1, amount0);
        PoolManagerLib.handleAssetTransfers(asset0, asset1, out0, out1, 0, false, msg.sender);
    }

    // Execution (without market) cost: 67,670 
    // Execution cost (DualQuoter): 96,785
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
    ) external payable nonReentrant returns (uint256 amountOut) {
        
        // Calculate poolID on-the-fly
        uint256 poolID = PoolIDAssembly.assemblePoolID(asset0, asset1, quoter, markings);
        
        // Transfer in input asset - inline asset determination (as provided)
        PoolManagerLib.handleAssetTransfers(zeroForOne ? asset0 : asset1, address(0), amountIn, 0, msg.value, true, msg.sender);
        
        
        // Get inventory and calculate output using quoter system
        (uint128 poolAsset0, uint128 poolAsset1) = _getInventory(poolID);
        
        
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
        
        // Restore external quoter now that transient storage replaced with sstore
        (uint256 quote, ) = getQuote(swapParams, poolAsset0, poolAsset1);
        if (quote == 0) revert PoolManager__InvalidQuote();
        amountOut = quote;
        
        
        // Validate and check minimums
        PoolManagerLib.validateSwapInventory(poolAsset0, poolAsset1, amountOut, zeroForOne);
        if (amountOut < minAmountOut) revert PoolManager__InsufficientOutput(minAmountOut, amountOut);
        

        // Update inventory - inline delta calculation
        // Update inventory in canonical asset order
        bool canonicalOrder = asset0 < asset1;
        bool canonicalZeroForOne = canonicalOrder ? zeroForOne : !zeroForOne;
        _updateInventory(
            poolID,
            canonicalZeroForOne ? int128(uint128(amountIn)) : -int128(uint128(amountOut)),
            canonicalZeroForOne ? -int128(uint128(amountOut)) : int128(uint128(amountIn))
        );
        
        
        // Transfer out output asset - inline asset determination
        PoolManagerLib.handleAssetTransfers(zeroForOne ? asset1 : asset0, address(0), amountOut, 0, 0, false, msg.sender);
        
    }

    /// @notice Multi-hop batch swap within a single transaction. Outputs of each hop feed into the next.
    /// @dev Uses gas-optimized Hop structure with arrays for markings and amounts
    /// @param hops Array of hops, each containing arrays of markings and amounts
    /// @param amountIn Input amount for the first hop
    /// @param minAmountOut Minimum acceptable final output amount
    /// @return amountOut Final output amount after the last hop
    function batchSwap(
        Hop[] calldata hops,
        uint256 amountIn,
        uint256 minAmountOut
    ) external payable nonReentrant returns (uint256 amountOut) {
        amountOut = PoolManagerLib.executeBatchSwap(
            _storage,
            hops,
            amountIn,
            msg.value,
            msg.sender,
            address(this)
        );
        
        if (amountOut < minAmountOut) revert PoolManager__InsufficientOutput(minAmountOut, amountOut);
    }

    // Expose QuoterRouter's internal quote functions for library calls
    function routerGetQuote(
        SwapParams memory p,
        uint128 asset0Balance,
        uint128 asset1Balance
    ) public returns (uint256 quote, uint256 poolID) {
        return QuoteRouter.getQuote(p, asset0Balance, asset1Balance);
    }

    function routerGetQuoteBatch(
        SwapParams memory p,
        uint128[] memory asset0Balances,
        uint128[] memory asset1Balances
    ) public returns (uint256[] memory quote, uint256[] memory poolID) {
        return QuoteRouter.getQuoteBatch(p, asset0Balances, asset1Balances);
    }
}