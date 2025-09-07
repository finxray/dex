// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SwapParams} from "../../structs/SwapParams.sol";

/// @title IPoolManager
/// @notice Interface for PoolManager to support external contracts like LiquidityManager
interface IPoolManager {
    /// @notice Get current pool inventory
    function getInventory(uint256 poolId) external view returns (uint128 asset0, uint128 asset1);
    
    /// @notice Get total liquidity for a pool
    function totalLiquidity(uint256 poolID) external view returns (uint256);
    
    /// @notice Get quote from router (exposed for external contracts)
    function routerGetQuote(
        SwapParams memory p,
        uint128 asset0Balance,
        uint128 asset1Balance
    ) external returns (uint256 quote, uint256 poolID);
    
    /// @notice Execute liquidity addition (called by LiquidityManager)
    function executeLiquidityAdd(
        uint256 poolID,
        address asset0,
        address asset1,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity,
        address user,
        uint256 msgValue
    ) external returns (uint256 actualLiquidity);
    
    /// @notice Execute liquidity removal (called by LiquidityManager)
    function executeLiquidityRemove(
        uint256 poolID,
        address asset0,
        address asset1,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity,
        address user
    ) external returns (uint256 actualAmount0, uint256 actualAmount1);
}
