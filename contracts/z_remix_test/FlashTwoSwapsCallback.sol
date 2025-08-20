// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IPoolManager} from "../interfaces/external/IPoolManager.sol";

contract FlashTwoSwapsCallback {
    IPoolManager public immutable poolManager;
    address public immutable asset0;
    address public immutable asset1;
    address public immutable quoter;
    bytes3 public immutable markings;
    uint256 public immutable amountIn;

    constructor(
        address _pm,
        address _asset0,
        address _asset1,
        address _quoter,
        bytes3 _markings,
        uint256 _amountIn
    ) {
        poolManager = IPoolManager(_pm);
        asset0 = _asset0;
        asset1 = _asset1;
        quoter = _quoter;
        markings = _markings;
        amountIn = _amountIn;
    }

    function flashCallback(bytes calldata) external {
        // Perform two swaps in a single session
        poolManager.swap(asset0, asset1, quoter, markings, amountIn, true, 1);
        poolManager.swap(asset0, asset1, quoter, markings, amountIn, true, 1);
    }
}


