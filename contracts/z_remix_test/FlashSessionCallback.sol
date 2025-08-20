// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IPoolManager} from "../interfaces/external/IPoolManager.sol";

contract FlashSessionCallback {
    IPoolManager public immutable poolManager;
    address public immutable asset0;
    address public immutable asset1;
    address public immutable quoter;
    bytes3 public immutable markings;
    uint256 public immutable amount0;
    uint256 public immutable amount1;

    constructor(
        address _poolManager,
        address _asset0,
        address _asset1,
        address _quoter,
        bytes3 _markings,
        uint256 _amount0,
        uint256 _amount1
    ) {
        poolManager = IPoolManager(_poolManager);
        asset0 = _asset0;
        asset1 = _asset1;
        quoter = _quoter;
        markings = _markings;
        amount0 = _amount0;
        amount1 = _amount1;
    }

    function flashCallback(bytes calldata) external {
        // Add liquidity, then remove the exact same amount to net to zero.
        // The session will net deltas, but ensure user has sufficient approvals/mint pre-session.
        uint256 liquidity = poolManager.addLiquidity(asset0, asset1, quoter, markings, amount0, amount1);
        poolManager.removeLiquidity(asset0, asset1, quoter, markings, liquidity);
    }
}


