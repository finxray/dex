// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IFlashCallback} from "../../Core/interfaces/internal/IFlashCallback.sol";

interface IPoolManagerLike {
    function swap(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut
    ) external payable returns (uint256 amountOut);
}

contract FlashSwapTwiceCallback is IFlashCallback {
    function flashCallback(bytes calldata data) external override {
        (
            address pm,
            address asset0,
            address asset1,
            address quoter,
            bytes3 mark,
            uint256 amt1,
            uint256 amt2
        ) = abi.decode(data, (address, address, address, address, bytes3, uint256, uint256));
        IPoolManagerLike(pm).swap(asset0, asset1, quoter, mark, amt1, true, 0);
        IPoolManagerLike(pm).swap(asset0, asset1, quoter, mark, amt2, true, 0);
    }
}


