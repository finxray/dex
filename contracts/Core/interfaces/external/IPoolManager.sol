// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Hop} from "../../structs/Hop.sol";
import {SwapParams} from "../../structs/SwapParams.sol";

interface IPoolManager {
    // Events
    event PoolCreated(uint256 indexed poolID, address asset0, address asset1, address quoter, bytes3 markings);

    // Errors
    error PoolManager__InsufficientWithdrawal(uint256 amount0, uint256 amount1);
    error PoolManager__InsufficientOutput(uint256 minOut, uint256 actual);
    error PoolManager__InvalidQuote();

    // Pool lifecycle and queries
    function createPool(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) external returns (uint256 poolID);

    function getPoolInfo(uint256 poolID) external view returns (
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    );

    function totalLiquidity(uint256 poolID) external view returns (uint256);

    function getInventory(uint256 poolId) external view returns (uint128 asset0, uint128 asset1);

    // Liquidity
    function addLiquidity(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amount0,
        uint256 amount1
    ) external payable returns (uint256 liquidity);

    function removeLiquidity(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 liquidity
    ) external returns (uint256 amount0, uint256 amount1);

    // Swaps
    function swap(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut
    ) external payable returns (uint256 amountOut);

    function batchSwap(
        Hop[] calldata hops,
        uint256 amountIn,
        uint256 minAmountOut
    ) external payable returns (uint256 amountOut);

    // Quoting (exposed via inheritance from QuoteRouter)
    function getQuote(
        SwapParams memory p,
        uint128 asset0Balance,
        uint128 asset1Balance
    ) external returns (uint256 quote, uint256 poolID);

    function getQuoteBatch(
        SwapParams memory p,
        uint128[] memory asset0Balances,
        uint128[] memory asset1Balances
    ) external returns (uint256[] memory quote, uint256[] memory poolID);
}

