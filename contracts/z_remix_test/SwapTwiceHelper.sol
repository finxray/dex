// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PoolManager} from "../../contracts/PoolManager.sol";

contract SwapTwiceHelper {
    function swapTwice(
        PoolManager pm,
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minOut
    ) external returns (uint256 firstOut, uint256 secondOut) {
        firstOut = pm.swap(asset0, asset1, quoter, markings, amountIn, zeroForOne, minOut);
        secondOut = pm.swap(asset0, asset1, quoter, markings, amountIn, zeroForOne, minOut);
    }
}

